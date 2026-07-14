'use strict';
// Legacy Spring MVC extractor (nbase flavor) — tree-sitter-java based, adapted from the
// java-angular pipeline's java-extractor. Differences that justify a separate extractor:
//   * endpoints are legacy @RequestMapping(value=..., method=RequestMethod.X) on methods of
//     plain classes (no @RestController — some sample files are excerpts without package/imports)
//   * DAO methods reference iBATIS statements by string id (queryForList("selectX", ...)) —
//     captured as sqlStatementRefs, the link the linker uses to reach the SQL layer
//   * VO/DTO classes (extends CommonVO / *VO / *DTO naming) become non-persistent structures
//   * module identity comes from URL path / nbase package segment / call-receiver naming,
//     normalized through lib/module-names.js
const fs = require('fs');
const path = require('path');
const Parser = require('tree-sitter');
const Java = require('tree-sitter-java');

const sourceDir = process.argv[2];
if (!sourceDir) {
  console.error('Usage: bun springmvc-extractor.js <serverSourceDir> [knowledgeBaseDir]');
  process.exit(1);
}
const knowledgeBaseDir = process.argv[3] || path.join(__dirname, '..', 'knowledge-base');
const outputFile = path.join(knowledgeBaseDir, 'extracted', 'springmvc.json');
const startTime = Date.now();
const { normalizeModule } = require('../lib/module-names');

const parser = new Parser();
parser.setLanguage(Java);
const errors = [];

// ── File discovery ──────────────────────────────────────────────────────────
function walkDir(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results = results.concat(walkDir(full));
    else if (entry.name.endsWith('.java')) results.push(full);
  }
  return results;
}

// ── AST helpers (same conventions as java-angular's java-extractor) ─────────
function findChildOfType(node, type) {
  return node.namedChildren.find(n => n.type === type) || null;
}

function annotationsOf(modifiersNode) {
  if (!modifiersNode) return [];
  const out = [];
  for (const child of modifiersNode.namedChildren) {
    if (child.type === 'marker_annotation') {
      out.push({ name: child.childForFieldName('name').text, args: {}, value: null });
    } else if (child.type === 'annotation') {
      const name = child.childForFieldName('name').text;
      const argsList = child.childForFieldName('arguments');
      const args = {};
      let positional = null;
      if (argsList) {
        for (const arg of argsList.namedChildren) {
          if (arg.type === 'element_value_pair') {
            const key = arg.childForFieldName('key').text;
            args[key] = arg.childForFieldName('value').text.replace(/^"|"$/g, '');
          } else {
            positional = arg.text.replace(/^"|"$/g, '');
          }
        }
      }
      out.push({ name, args, value: positional });
    }
  }
  return out;
}

const DAO_STATEMENT_CALLS = new Set(['queryForList', 'queryForObject', 'queryForMap', 'insert', 'update', 'delete']);

// Collects calls, thrown exception types, and iBATIS statement-id references from a method body.
function walkBody(node, calls, throwsList, sqlRefs) {
  if (node.type === 'method_invocation') {
    const objNode = node.childForFieldName('object');
    const nameNode = node.childForFieldName('name');
    const simpleReceiver = objNode && ['identifier', 'field_access', 'this', 'super'].includes(objNode.type);
    calls.push(simpleReceiver ? `${objNode.text}.${nameNode.text}` : nameNode.text);
    if (DAO_STATEMENT_CALLS.has(nameNode.text)) {
      const argsNode = node.childForFieldName('arguments');
      const first = argsNode && argsNode.namedChildren[0];
      if (first && first.type === 'string_literal') {
        sqlRefs.push(first.text.replace(/^"|"$/g, ''));
      }
    }
  } else if (node.type === 'method_reference') {
    calls.push(node.text);
  } else if (node.type === 'throw_statement') {
    const inner = node.namedChildren[0];
    if (inner && inner.type === 'object_creation_expression') {
      const typeNode = inner.childForFieldName('type');
      if (typeNode) throwsList.push(typeNode.text);
    }
  }
  for (const child of node.namedChildren) walkBody(child, calls, throwsList, sqlRefs);
}

function packageOf(tree) {
  const pkgNode = findChildOfType(tree.rootNode, 'package_declaration');
  return pkgNode ? pkgNode.namedChildren[0].text : '';
}

// com.kt.nbase.base.locitemmanage.vo -> "locitemmanage"; com.kt.nbase.common.cont -> "common"
function moduleFromNbasePackage(pkg) {
  if (!pkg) return null;
  const parts = pkg.split('.');
  const i = parts.indexOf('nbase');
  if (i === -1) return parts[parts.length - 1];
  let seg = parts[i + 1];
  if (seg === 'base' || seg === 'based') seg = parts[i + 2] || seg;
  return seg || null;
}

// "/base/locAndItemManage/getItemInfoList/get.{metadataType}" -> "locAndItemManage"
function moduleFromUrlPath(urlPath) {
  const segs = (urlPath || '').split('/').filter(Boolean);
  if (!segs.length) return 'Portal';
  if (segs[0] === 'base' && segs.length > 1) return segs[1];
  if (segs[0].startsWith('index') || segs[0] === 'websquare') return 'Portal';
  return segs[0];
}

const JDK_TYPES = new Set([
  'String', 'Integer', 'Long', 'Short', 'Double', 'Float', 'Boolean', 'Byte', 'Character',
  'Object', 'Class', 'Void', 'Number', 'Math', 'System', 'StringBuilder', 'StringBuffer',
  'List', 'ArrayList', 'LinkedList', 'Map', 'HashMap', 'LinkedHashMap', 'TreeMap', 'Set',
  'HashSet', 'TreeSet', 'Iterator', 'Collection', 'Collections', 'Arrays', 'Optional',
  'Exception', 'RuntimeException', 'Throwable', 'Error', 'InterruptedException',
  'ModelAndView', 'HttpServletRequest', 'HttpServletResponse', 'HttpSession',
  'RequestMethod', 'RequestMapping', 'RequestParam', 'PathVariable', 'Autowired', 'Qualifier',
  'Override', 'SuppressWarnings', 'Deprecated',
]);

// ── Pass 0: declared classes across the whole file set (for external-type detection) ──
const files = walkDir(sourceDir);
const trees = new Map();
const declaredClasses = new Set();
for (const file of files) {
  try {
    const tree = parser.parse(fs.readFileSync(file, 'utf8'));
    trees.set(file, tree);
    (function collect(node) {
      if (['class_declaration', 'interface_declaration', 'enum_declaration'].includes(node.type)) {
        const n = node.childForFieldName('name');
        if (n) declaredClasses.add(n.text);
      }
      for (const c of node.namedChildren) collect(c);
    })(tree.rootNode);
  } catch (e) {
    errors.push({ file, error: e.message });
  }
}

function externalTypesOf(tree) {
  const found = new Set();
  (function collect(node) {
    if (node.type === 'type_identifier') {
      const t = node.text;
      if (t.length > 1 && !JDK_TYPES.has(t) && !declaredClasses.has(t)) found.add(t);
    }
    for (const c of node.namedChildren) collect(c);
  })(tree.rootNode);
  return [...found].sort();
}

// ── Pass 1: extract per class ───────────────────────────────────────────────
const structureItems = [];
const logicItems = [];

function extractStructure(classNode, className, module, file, externalTypes, isExcerpt) {
  const body = classNode.childForFieldName('body');
  const attributes = [];
  for (const member of body.namedChildren) {
    if (member.type !== 'field_declaration') continue;
    const modifiers = findChildOfType(member, 'modifiers');
    const modText = modifiers ? modifiers.text : '';
    if (/\bstatic\b/.test(modText)) continue; // serialVersionUID and friends
    const typeNode = member.childForFieldName('type');
    const declarator = member.childForFieldName('declarator');
    if (!typeNode || !declarator) continue;
    attributes.push({
      name: declarator.childForFieldName('name').text,
      type: typeNode.text,
      isMandatory: false,
      isAutoNumber: false,
      isForeignKey: false,
      referencedEntity: '',
      deleteRule: '',
      length: '',
    });
  }
  return {
    type: 'structure',
    linkId: `springmvc:structure:${module}:${className}`,
    uniqueId: `springmvc:${module}.${className}`,
    name: className,
    label: className,
    description: '',
    module,
    isPersistent: false,
    attributes,
    externalTypes,
    isExcerpt,
    _source: file,
    sourceRef: path.relative(path.join(sourceDir, '..'), file),
    _gaps: [],
    _links: [],
  };
}

function extractMethods(classNode, className, defaultModule, file, externalTypes, isExcerpt) {
  const body = classNode.childForFieldName('body');
  const items = [];
  for (const member of body.namedChildren) {
    if (member.type !== 'method_declaration') continue;
    const name = member.childForFieldName('name').text;
    const mAnns = annotationsOf(findChildOfType(member, 'modifiers'));
    const mapping = mAnns.find(a => a.name === 'RequestMapping');

    const returnTypeNode = member.childForFieldName('type');
    const returnType = returnTypeNode ? returnTypeNode.text : 'void';
    const params = [];
    const paramsNode = member.childForFieldName('parameters');
    if (paramsNode) {
      for (const p of paramsNode.namedChildren) {
        if (p.type !== 'formal_parameter') continue;
        params.push({ name: p.childForFieldName('name').text, type: p.childForFieldName('type').text });
      }
    }

    const calls = [];
    const throwsList = [];
    const sqlRefs = [];
    const bodyNode = member.childForFieldName('body');
    if (bodyNode) walkBody(bodyNode, calls, throwsList, sqlRefs);

    let httpEndpoint = null;
    let module = defaultModule;
    if (mapping) {
      const urlPath = mapping.value || mapping.args.value || mapping.args.path || '/';
      const verb = mapping.args.method ? mapping.args.method.split('.').pop() : 'ANY';
      httpEndpoint = { method: verb, path: urlPath };
      module = normalizeModule(moduleFromUrlPath(urlPath));
    } else if (!module) {
      // Excerpt file without a package — infer module from the delegate receiver naming
      // convention (xxxService.method / xxxDAO.method), else leave for the propagation pass.
      const recv = calls.map(c => /^([a-zA-Z][\w]*?)(Service|Dao|DAO)\./.exec(c)).find(Boolean);
      module = recv ? normalizeModule(recv[1]) : null;
    }

    items.push({
      type: 'logic',
      logicKind: 'action', // server-side business logic → Microflow (reused vocabulary)
      linkId: `springmvc:logic:${module || 'Common'}:${className}.${name}`,
      uniqueId: `springmvc:${className}.${name}`,
      name,
      label: name,
      description: '',
      module: module, // may be null here; resolved in the propagation pass below
      className,
      isPublic: true,
      httpEndpoint,
      inputParameters: params.map(p => ({ name: p.name, type: p.type, isMandatory: true })),
      outputParameters: (returnType && returnType !== 'void') ? [{ name: 'Result', type: returnType }] : [],
      calls: [...new Set(calls)].map(c => ({ name: c })),
      sqlStatementRefs: [...new Set(sqlRefs)],
      aggregates: [],
      throwsExceptions: [...new Set(throwsList)],
      externalTypes,
      isExcerpt,
      _source: file,
      sourceRef: path.relative(path.join(sourceDir, '..'), file),
      _gaps: [],
      _links: [],
    });
  }
  return items;
}

for (const [file, tree] of trees) {
  const pkg = packageOf(tree);
  const isExcerpt = !pkg; // sample sources include package-less excerpt files (triage G-3)
  const pkgModule = pkg ? normalizeModule(moduleFromNbasePackage(pkg)) : null;
  const externalTypes = externalTypesOf(tree);

  const classNodes = [];
  (function collect(node) {
    if (node.type === 'class_declaration') classNodes.push(node);
    for (const c of node.namedChildren) collect(c);
  })(tree.rootNode);

  for (const classNode of classNodes) {
    const className = classNode.childForFieldName('name').text;
    try {
      const superRaw = classNode.childForFieldName('superclass');
      const superName = superRaw ? superRaw.text.replace(/^extends\s+/, '').trim() : '';
      const isVo = /(?:VO|DTO)$/.test(className) || /(?:CommonVO|DTO)$/.test(superName);
      if (isVo) {
        structureItems.push(extractStructure(classNode, className, pkgModule || normalizeModule(className.replace(/(VO|DTO)$/, '')), file, externalTypes, isExcerpt));
      } else {
        logicItems.push(...extractMethods(classNode, className, pkgModule, file, externalTypes, isExcerpt));
      }
    } catch (e) {
      errors.push({ file, error: `${className}: ${e.message}` });
    }
  }
}

// ── Pass 2: module propagation for still-unresolved items ───────────────────
// (a) caller with a known module names the item via xxxDAO.method / xxxService.method →
//     the receiver's base name is the module; (b) same-name match with a resolved item.
for (const caller of logicItems) {
  if (!caller.module) continue;
  for (const call of caller.calls) {
    const m = /^([a-zA-Z][\w]*?)(Service|Dao|DAO)\.(\w+)$/.exec(call.name);
    if (!m) continue;
    for (const target of logicItems) {
      if (!target.module && target.name === m[3]) target.module = normalizeModule(m[1]);
    }
  }
}
for (const item of logicItems) {
  if (item.module) continue;
  const twin = logicItems.find(l => l.module && l.name === item.name && l !== item);
  item.module = twin ? twin.module : 'Common';
}
// Disambiguate Java method overloads (same class+name) so the merger's uniqueId dedup
// doesn't silently drop all but one variant — suffix 2nd+ occurrences with /2, /3, …
const overloadCount = new Map();
for (const item of logicItems) {
  const key = `${item.className}.${item.name}`;
  const n = (overloadCount.get(key) || 0) + 1;
  overloadCount.set(key, n);
  const suffix = n > 1 ? `/${n}` : '';
  item.uniqueId = `springmvc:${key}${suffix}`;
  item.linkId = `springmvc:logic:${item.module}:${key}${suffix}`;
}

// ── Emit ────────────────────────────────────────────────────────────────────
const result = {
  source: 'springmvc',
  items: [...structureItems, ...logicItems],
  errors,
  meta: {
    fileCount: files.length,
    duration: Date.now() - startTime,
    excerptFiles: [...trees.keys()].filter(f => !packageOf(trees.get(f))).map(f => path.basename(f)),
  },
};

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), 'utf8');
console.log(`Extracted ${structureItems.length} structures + ${logicItems.length} logic items from ${files.length} files (${errors.length} errors)`);
