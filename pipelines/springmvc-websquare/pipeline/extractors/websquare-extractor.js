'use strict';
// WebSquare5 (Inswave XForms) screen extractor. Parses screen-definition XML (xmlns:w2
// namespace marker) into normalized screen items: submissions (→ endpoint links), grid
// columns, form fields, buttons, popup layers, inline-JS validation facts, and unresolved
// client-side references (wframe includes, script src, client helper namespaces).
//
// Layer discipline: directories named "websquare" (the vendor engine/runtime) are skipped
// entirely — they are vendor originals, reference-only per the conversion's layer
// classification. JSP shell files are recorded as skipped, never extracted (triage: Defer).
const fs = require('fs');
const path = require('path');

const sourceDir = process.argv[2];
if (!sourceDir) {
  console.error('Usage: bun websquare-extractor.js <frontSourceDir> [knowledgeBaseDir]');
  process.exit(1);
}
const knowledgeBaseDir = process.argv[3] || path.join(__dirname, '..', 'knowledge-base');
const outputFile = path.join(knowledgeBaseDir, 'extracted', 'websquare.json');
const startTime = Date.now();
const { normalizeModule } = require('../lib/module-names');

const errors = [];
const skippedFiles = [];

const VENDOR_DIR = 'websquare';
const WEBSQUARE_MARKER = 'xmlns:w2="http://www.inswave.com/websquare"';

function walkDir(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.toLowerCase() === VENDOR_DIR) {
        skippedFiles.push({ path: full, reason: 'vendor-original (WebSquare engine dir — reference only, never extracted)' });
        continue;
      }
      results = results.concat(walkDir(full));
    } else results.push(full);
  }
  return results;
}

function parseAttrs(attrText) {
  const attrs = {};
  const re = /([\w:-]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(attrText))) attrs[m[1]] = m[2];
  return attrs;
}

const scan = (re, text, pick) => {
  const out = [];
  let m;
  while ((m = re.exec(text))) out.push(pick(m));
  return out;
};

const JS_BUILTINS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'alert', 'confirm', 'eval',
  'parseInt', 'parseFloat', 'String', 'Number', 'Boolean', 'Object', 'Array', 'Date', 'RegExp',
  'setTimeout', 'setInterval', 'console', 'typeof', 'new',
]);

function jsFacts(js) {
  return {
    submissionsExecuted: [...new Set(scan(/executeSubmission\s*\(\s*["']([^"']+)["']/g, js, m => m[1]))],
    instanceValuesSet: [...new Set(scan(/setInstanceValue\s*\(\s*["']([^"']+)["']/g, js, m => m[1]))],
    alerts: [...new Set(scan(/alert\s*\(\s*["']([^"']+)["']/g, js, m => m[1]))],
    helperRefs: [...new Set(scan(/\bcom\.kt\.nbase\.[\w.]+/g, js, m => m[0]))],
    bareCalls: [...new Set(scan(/(?:^|[^.\w])([a-zA-Z_]\w*)\s*\(/g, js, m => m[1]))]
      .filter(n => !JS_BUILTINS.has(n)),
  };
}

// Extract "function name(...) { body }" blocks with brace matching.
function parseFunctions(js) {
  const fns = [];
  const re = /function\s+(\w+)\s*\(([^)]*)\)\s*\{/g;
  let m;
  while ((m = re.exec(js))) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < js.length && depth > 0) {
      if (js[i] === '{') depth++;
      else if (js[i] === '}') depth--;
      i++;
    }
    const body = js.slice(re.lastIndex, i - 1);
    fns.push({ name: m[1], params: m[2].trim(), ...jsFacts(body) });
  }
  return fns;
}

function extractScreen(file, xml) {
  const base = path.basename(file, '.xml');
  const screenName = base.charAt(0).toUpperCase() + base.slice(1);
  const live = xml.replace(/<!--[\s\S]*?-->/g, ''); // commented-out widgets are dead code

  // ── Submissions (the screen's server contract) ──
  const submissions = scan(
    /<xf:submission\b([^>]*?)(?:\/>|>([\s\S]*?)<\/xf:submission>)/g, live,
    m => {
      const a = parseAttrs(m[1]);
      const body = m[2] || '';
      return {
        id: a.id, action: a.action, method: (a.method || 'post').toUpperCase(),
        mode: a.mode || '', ref: a.ref || '', target: a.target || '',
        onDone: jsFacts(body),
      };
    });

  // Module: majority vote over submission action paths (/nbase/base/<module>/...)
  const moduleVotes = {};
  for (const s of submissions) {
    const segs = (s.action || '').split('/').filter(Boolean); // ['nbase','base','locAndItemManage',...]
    let seg = null;
    if (segs[0] === 'nbase') {
      seg = segs[1] === 'base' ? segs[2] : segs[1];
    } else {
      seg = segs[0] === 'base' ? segs[1] : segs[0];
    }
    if (seg && seg !== 'dwr') moduleVotes[seg] = (moduleVotes[seg] || 0) + 1;
  }
  const topSeg = Object.entries(moduleVotes).sort((a, b) => b[1] - a[1])[0];
  const module = topSeg ? normalizeModule(topSeg[0]) : 'Portal';

  // ── Popup layers (index ranges partition widgets into main screen vs popup) ──
  const layerRanges = [];
  {
    const re = /<w2:floatingLayer\b([^>]*)>([\s\S]*?)<\/w2:floatingLayer>/g;
    let m;
    while ((m = re.exec(live))) {
      layerRanges.push({ attrs: parseAttrs(m[1]), start: m.index, end: re.lastIndex, inner: m[2] });
    }
  }
  const layerOf = (idx) => layerRanges.find(r => idx > r.start && idx < r.end) || null;

  // ── Widgets ──
  const selects = scan(/<xf:select1\b([^>]*)>([\s\S]*?)<\/xf:select1>/g, live, m => {
    const a = parseAttrs(m[1]);
    const inner = m[2];
    const items = scan(/<xf:item>\s*<xf:label>([^<]*)<\/xf:label>\s*<xf:value>([^<]*)<\/xf:value>/g, inner,
      x => ({ label: x[1], value: x[2] }));
    const itemset = /<xf:itemset\s+nodeset="([^"]+)"/.exec(inner);
    const onchange = scan(/<script[^>]*ev:event="onchange"[^>]*>([\s\S]*?)<\/script>/g, inner, x => x[1]).join('\n');
    return {
      widget: 'select1', id: a.id, index: m.index,
      mandatory: a.mandatory === 'true', readOnly: a.readOnly === 'true',
      staticItems: items, dataSource: itemset ? itemset[1] : null,
      onChange: onchange ? jsFacts(onchange) : null,
    };
  });

  const inputs = scan(/<xf:input\b([^>]*?)\/?>/g, live, m => {
    const a = parseAttrs(m[1]);
    return {
      widget: 'input', id: a.id, index: m.index,
      mandatory: a.mandatory === 'true', readOnly: a.readOnly === 'true',
      boundRef: a.ref || '', maxlength: a.maxlength || a.maxByteLength || '',
      hidden: /display\s*:\s*none/.test(a.style || ''),
    };
  });

  const triggers = scan(/<xf:trigger\b([^>]*)>([\s\S]*?)<\/xf:trigger>/g, live, m => {
    const a = parseAttrs(m[1]);
    const label = (/<xf:label>([^<]*)<\/xf:label>/.exec(m[2]) || [])[1] || '';
    const onclick = scan(/<script[^>]*ev:event="onclick"[^>]*>([\s\S]*?)<\/script>/g, m[2], x => x[1]).join('\n');
    return { widget: 'trigger', id: a.id, index: m.index, label: label.trim(), onClick: onclick ? jsFacts(onclick) : null };
  });

  const labels = scan(/<w2:textbox\b([^>]*?)\/?>/g, live, m => {
    const a = parseAttrs(m[1]);
    return a.label ? { id: a.id, label: a.label, index: m.index } : null;
  }).filter(Boolean);

  const grids = scan(/<w2:grid\b([^>]*)>([\s\S]*?)<\/w2:grid>/g, live, m => {
    const a = parseAttrs(m[1]);
    const inner = m[2];
    const headerBlock = (/<w2:header\b[^>]*>([\s\S]*?)<\/w2:header>/.exec(inner) || [])[1] || '';
    const bodyBlock = (/<w2:gBody\b[^>]*>([\s\S]*?)<\/w2:gBody>/.exec(inner) || [])[1] || '';
    const headers = scan(/<w2:column\b([^>]*?)\/?>/g, headerBlock, x => parseAttrs(x[1]));
    const fields = scan(/<w2:column\b([^>]*?)\/?>/g, bodyBlock, x => parseAttrs(x[1]));
    const columns = fields.map((f, i) => ({
      field: f.id || '',
      label: (headers[i] && headers[i].value) || '',
      readOnly: f.readOnly === 'true',
      inputType: f.inputType || 'text',
    }));
    const events = scan(/<script\s+([^>]*ev:event="[^"]+"[^>]*)>([\s\S]*?)<\/script>/g, inner, x => ({
      event: (parseAttrs(x[1])['ev:event'] || '').trim(),
      ...jsFacts(x[2]),
    }));
    return { widget: 'grid', id: a.id, index: m.index, baseNode: a.baseNode || '', repeatNode: a.repeatNode || '', columns, events };
  });

  const wframes = scan(/<w2:wframe\b([^>]*?)\/?>/g, live, m => {
    const a = parseAttrs(m[1]);
    return { id: a.id, src: a.src, index: m.index };
  });

  const jsIncludes = scan(/<script\s+src="([^"]+)"[^>]*\/?>/g, live, m => m[1]);

  // ── Inline JS: functions + facts ──
  const inlineJsBlocks = scan(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g, live, m => m[1]);
  const allJs = inlineJsBlocks.join('\n');
  const functions = parseFunctions(allJs);
  const definedFns = new Set(functions.map(f => f.name));
  const screenFacts = jsFacts(allJs);
  const widgetIds = new Set([...selects, ...inputs, ...triggers, ...grids].map(w => w.id).filter(Boolean));
  const unresolvedFunctions = screenFacts.bareCalls
    .filter(n => !definedFns.has(n) && !widgetIds.has(n));

  // ── Assemble: one item for the main screen, one per popup layer ──
  const inMain = (w) => !layerOf(w.index);
  const widgetsFor = (filterFn) => ({
    grids: grids.filter(filterFn),
    formFields: [
      ...selects.filter(filterFn).map(s => ({ kind: 'select', id: s.id, mandatory: s.mandatory, readOnly: s.readOnly, staticItems: s.staticItems, dataSource: s.dataSource, onChange: s.onChange })),
      ...inputs.filter(filterFn).map(i => ({ kind: 'input', id: i.id, mandatory: i.mandatory, readOnly: i.readOnly, boundRef: i.boundRef, hidden: i.hidden })),
    ],
    buttons: triggers.filter(filterFn).map(t => ({ id: t.id, label: t.label, onClick: t.onClick })),
    labels: labels.filter(filterFn).map(l => l.label),
  });

  const dataSources = [...new Set(selects.map(s => s.dataSource).filter(Boolean))];

  const mainItem = {
    type: 'screen',
    linkId: `websquare:screen:${module}:${screenName}`,
    uniqueId: `websquare:${module}.${screenName}`,
    name: screenName,
    label: screenName,
    description: '',
    module,
    screenKind: grids.some(inMain) ? 'list' : 'form',
    submissions,
    apiCalls: submissions.filter(s => s.action).map(s => ({ path: s.action, method: s.method, submissionId: s.id })),
    widgetSummary: { ...widgetsFor(inMain), dataSources },
    functions,
    unresolvedFunctions,
    clientHelperRefs: screenFacts.helperRefs,
    jsIncludes,
    includedScreens: wframes.map(w => w.src),
    launchedFrom: [],
    _source: file,
    sourceRef: path.relative(path.join(sourceDir, '..'), file),
    _gaps: [],
    _links: [],
  };

  const popupItems = layerRanges.map(layer => {
    const inLayer = (w) => layerOf(w.index) === layer;
    const layerId = layer.attrs.id || 'layer';
    return {
      type: 'screen',
      linkId: `websquare:screen:${module}:${screenName}.${layerId}`,
      uniqueId: `websquare:${module}.${screenName}.${layerId}`,
      name: `${screenName}.${layerId}`,
      label: layer.attrs.title ? `${screenName} — ${layer.attrs.title}` : `${screenName}.${layerId}`,
      description: '',
      module,
      screenKind: 'popup-form',
      submissions: [],
      apiCalls: [],
      widgetSummary: { ...widgetsFor(inLayer), dataSources: [] },
      functions: [],
      unresolvedFunctions: [],
      clientHelperRefs: [],
      jsIncludes: [],
      includedScreens: [],
      launchedFrom: [screenName],
      _source: file,
      sourceRef: path.relative(path.join(sourceDir, '..'), file),
      _gaps: [],
      _links: [],
    };
  });

  return [mainItem, ...popupItems];
}

// ── Run ─────────────────────────────────────────────────────────────────────
const allFiles = walkDir(sourceDir);
const items = [];
for (const file of allFiles) {
  const ext = path.extname(file).toLowerCase();
  try {
    if (ext === '.jsp') {
      skippedFiles.push({ path: file, reason: 'jsp-shell (portal layout/menu — Defer per triage; replaced by Mendix navigation)' });
      continue;
    }
    if (ext !== '.xml') {
      skippedFiles.push({ path: file, reason: 'not a screen definition' });
      continue;
    }
    const xml = fs.readFileSync(file, 'utf8');
    if (!xml.includes(WEBSQUARE_MARKER)) {
      skippedFiles.push({ path: file, reason: 'xml without WebSquare namespace marker' });
      continue;
    }
    items.push(...extractScreen(file, xml));
  } catch (e) {
    errors.push({ file, error: e.message });
  }
}

const result = {
  source: 'websquare',
  items,
  errors,
  meta: {
    fileCount: allFiles.length,
    screenFiles: items.filter(i => !i.launchedFrom.length).length,
    duration: Date.now() - startTime,
    skippedFiles,
  },
};

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), 'utf8');
console.log(`Extracted ${items.length} screen items from ${allFiles.length} files (${skippedFiles.length} skipped, ${errors.length} errors)`);
