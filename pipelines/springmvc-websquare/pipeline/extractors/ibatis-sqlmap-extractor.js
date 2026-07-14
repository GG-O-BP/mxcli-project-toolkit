'use strict';
// iBATIS SQL Map 2.0 extractor — reverse-engineers entities (tables/columns/implicit
// associations) and per-statement logic items from sqlMap XML. There is no DDL in this
// stack's sample sources, so every column is emitted with type 'String' + inferred:true;
// the DDL gap is surfaced by the linker as an explicit gap, not silently absorbed.
const fs = require('fs');
const path = require('path');

const sourceDir = process.argv[2];
if (!sourceDir) {
  console.error('Usage: bun ibatis-sqlmap-extractor.js <sqlSourceDir> [knowledgeBaseDir]');
  process.exit(1);
}
const knowledgeBaseDir = process.argv[3] || path.join(__dirname, '..', 'knowledge-base');
const outputFile = path.join(knowledgeBaseDir, 'extracted', 'ibatis.json');
const startTime = Date.now();
const { normalizeModule } = require('../lib/module-names');

const errors = [];

// ── SQL token classification ────────────────────────────────────────────────
const SQL_KEYWORDS = new Set([
  'SELECT','FROM','WHERE','AND','OR','ON','IN','IS','NOT','NULL','LIKE','BETWEEN','ORDER',
  'BY','GROUP','HAVING','DISTINCT','UNION','ALL','CASE','WHEN','THEN','ELSE','END','AS',
  'DESC','ASC','OVER','PARTITION','INSERT','INTO','VALUES','UPDATE','SET','DELETE','MERGE',
  'USING','MATCHED','DUAL','JOIN','LEFT','RIGHT','INNER','OUTER','FULL','CROSS','EXISTS',
  'CONNECT','PRIOR','START','WITH','LEVEL','ROWNUM','ROWID','SYSDATE','LIT',
  'INDEX','ROWS','FETCH','FIRST','NEXT','ONLY','ANY','SOME','MINUS','INTERSECT','THE',
]);
const SQL_FUNCTIONS = new Set([
  'NVL','DECODE','SUBSTR','LPAD','RPAD','TO_CHAR','TO_DATE','TRIM','LTRIM','RTRIM','MAX',
  'MIN','COUNT','SUM','AVG','REPLACE','LENGTH','INSTR','REGEXP_INSTR','REGEXP_REPLACE',
  'UPPER','LOWER','SYS_CONNECT_BY_PATH','COALESCE','NEXTVAL','CURRVAL','ROW_NUMBER','RANK',
  'ABS','ROUND','TRUNC','MOD','GREATEST','LEAST','CAST','EXTRACT',
]);
const isSubqMarker = (tok) => /^SUBQV\d+$/.test(tok);
const isColumnCandidate = (tok) =>
  /^[A-Z][A-Z0-9_]{1,}$/.test(tok) && tok !== 'QREF' && !SQL_KEYWORDS.has(tok) && !SQL_FUNCTIONS.has(tok) && !isSubqMarker(tok);
const isTableCandidate = (tok) =>
  /^[A-Z][A-Z0-9_]{2,}$/.test(tok) && tok !== 'DUAL' && !SQL_KEYWORDS.has(tok) && !SQL_FUNCTIONS.has(tok) && !isSubqMarker(tok);

// ── XML statement parsing (regex-based; sqlMap statement tags never nest same-name) ──
function parseAttrs(attrText) {
  const attrs = {};
  const re = /([\w:-]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(attrText))) attrs[m[1]] = m[2];
  return attrs;
}

function parseStatements(xml) {
  const out = [];
  const re = /<(select|insert|update|delete|procedure|statement|sql)\b([^>]*)>([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = re.exec(xml))) {
    out.push({ tag: m[1], attrs: parseAttrs(m[2]), body: m[3] });
  }
  return out;
}

// ── SQL context analysis ────────────────────────────────────────────────────
// A "context" is one SELECT scope: the top level, an inline view (FROM (SELECT…)), or a
// scalar subquery ((SELECT…) in a select list / WHERE). Non-SELECT parens (function args,
// IN lists) are unwrapped in place so their column references stay visible. Columns are
// attributed via alias maps; unqualified identifiers only in single-table scopes, with
// alias-position discipline (a token right after another identifier or AS is an alias).
function tableListAfter(keywordRe, sql, { commaList = true, aliasAllowed = true } = {}) {
  const found = [];
  let m;
  while ((m = keywordRe.exec(sql))) {
    let rest = sql.slice(m.index + m[0].length);
    while (true) {
      const entry = /^\s*([A-Za-z][\w$#.]*)(?:\s+(?!WHERE\b|GROUP\b|ORDER\b|CONNECT\b|START\b|UNION\b|LEFT\b|RIGHT\b|INNER\b|OUTER\b|JOIN\b|ON\b|SET\b|USING\b|WHEN\b|SELECT\b|AND\b|OR\b|IN\b|IS\b|LIKE\b|BETWEEN\b|AS\b|VALUES\b)([A-Za-z]\w*))?/.exec(rest);
      if (!entry) break;
      found.push({ table: entry[1].toUpperCase(), alias: aliasAllowed ? (entry[2] || null) : null });
      if (!commaList) break; // INSERT/UPDATE/MERGE/DELETE target exactly one table
      rest = rest.slice(entry[0].length);
      const comma = /^\s*,/.exec(rest);
      if (!comma) break;
      rest = rest.slice(comma[0].length);
    }
  }
  return found;
}

function analyzeContext(ctxSql, outerAliasFrames, subqBaseTables, stmtAliasLower = null) {
  const rawEntries = tableListAfter(/\bFROM\s+/gi, ctxSql)
    .concat(tableListAfter(/\bJOIN\s+/gi, ctxSql))
    .concat(tableListAfter(/\bMERGE\s+INTO\s+/gi, ctxSql, { commaList: false }))
    .concat(tableListAfter(/\bUPDATE\s+/gi, ctxSql, { commaList: false }))
    .concat(tableListAfter(/\bDELETE\s+FROM\s+/gi, ctxSql, { commaList: false }))
    .concat(tableListAfter(/\bINSERT\s+INTO\s+/gi, ctxSql, { commaList: false, aliasAllowed: false }));
  const aliasMap = new Map();
  const tableSet = new Set();
  for (const { table, alias } of rawEntries) {
    const subqM = /^SUBQV(\d+)$/.exec(table);
    if (subqM) {
      // Inline view: propagate its single base table so qualified refs through the view
      // alias (T4.COSTCENTER) resolve — but do NOT count it as this scope's own table.
      const base = subqBaseTables[Number(subqM[1])];
      if (base && alias) aliasMap.set(alias.toUpperCase(), base);
      continue;
    }
    if (!isTableCandidate(table)) continue;
    tableSet.add(table);
    if (alias) aliasMap.set(alias.toUpperCase(), table);
    aliasMap.set(table, table);
  }
  const singleTable = tableSet.size === 1 ? [...tableSet][0] : null;

  const resolveQualifier = (q) => {
    const up = q.toUpperCase();
    if (aliasMap.has(up)) return { table: aliasMap.get(up), outer: false };
    for (const frame of outerAliasFrames) {
      if (frame.has(up)) return { table: frame.get(up), outer: true };
    }
    return null;
  };

  const columnsByTable = new Map();
  const addCol = (table, col) => {
    if (!table || !isColumnCandidate(col)) return;
    if (col === 'ROWID' || col === 'ROWNUM' || col === 'NEXTVAL' || col === 'CURRVAL') return;
    if (!columnsByTable.has(table)) columnsByTable.set(table, new Set());
    columnsByTable.get(table).add(col);
  };

  // Qualified references: alias.COL (correlated outer scopes included)
  const qualRe = /\b([A-Za-z][\w$#]*)\.([A-Za-z][A-Za-z0-9_]*)\b/g;
  let m;
  while ((m = qualRe.exec(ctxSql))) {
    const col = m[2].toUpperCase();
    if (col === 'NEXTVAL' || col === 'CURRVAL') continue; // sequence, handled globally
    const r = resolveQualifier(m[1]);
    if (r) addCol(r.table, col);
  }

  // Unqualified identifiers — single-table scopes only, with alias-position discipline.
  if (singleTable) {
    const noQual = ctxSql.replace(qualRe, ' QREF ');
    const tokens = noQual.match(/[\w$#:]+|[,()=<>!*+\-/|]/g) || [];
    const isIdentLike = (t) => t && /^[A-Za-z]/.test(t) && !SQL_KEYWORDS.has(t.toUpperCase()) && !SQL_FUNCTIONS.has(t.toUpperCase());
    // Pass 1: alias set — token preceded by another identifier-like token or by AS.
    // Case-sensitive on purpose: Oracle-style "COCENTER AS coCenter" must not let the
    // lowercase alias shadow the real ALL-CAPS column of the same spelling.
    const aliasSet = new Set();
    for (let i = 1; i < tokens.length; i++) {
      const prevUp = tokens[i - 1].toUpperCase();
      const cur = tokens[i];
      if (!/^[A-Za-z]/.test(cur)) continue;
      const prevIsIdent = isIdentLike(tokens[i - 1]) || tokens[i - 1] === ')';
      if (prevIsIdent || prevUp === 'AS' || prevUp === 'OVER') aliasSet.add(cur);
    }
    // Pass 2: column candidates in column positions
    const isCmpTok = (t) => t === '=' || t === '<' || t === '>' || t === '!';
    for (let i = 0; i < tokens.length; i++) {
      const cur = tokens[i];
      const curUp = cur.toUpperCase();
      let accepted = isColumnCandidate(cur); // ALL-CAPS: the stack's column convention
      if (!accepted && isColumnCandidate(curUp)) {
        // Lower/mixed-case idents are normally select-list aliases here — but an alias
        // cannot sit beside a comparison operator or as a CASE THEN/ELSE result value,
        // so in those positions a lowercase ident is a real column (e.g. `AND data2 != '-'`).
        const next = i + 1 < tokens.length ? tokens[i + 1] : null;
        const prev0 = i > 0 ? tokens[i - 1] : null;
        const prev0Up = prev0 ? prev0.toUpperCase() : null;
        accepted = (isCmpTok(next) || isCmpTok(prev0) || prev0Up === 'THEN' || prev0Up === 'ELSE')
          // …unless the spelling is a select-list alias ANYWHERE in this statement — an
          // inline view's output alias (`scd optionCd`) reappears in outer join/select
          // positions and must not be mistaken for a column of the outer scope's table.
          && !(stmtAliasLower && stmtAliasLower.has(cur.toLowerCase()));
      }
      if (!accepted) continue;
      if (aliasSet.has(cur) || aliasMap.has(curUp) || tableSet.has(curUp)) continue;
      const prev = i > 0 ? tokens[i - 1] : null;
      const prevUp = prev ? prev.toUpperCase() : null;
      const prevIsIdent = prev && (isIdentLike(prev) || prev === ')');
      if (prevIsIdent || prevUp === 'AS' || prevUp === 'OVER') continue; // alias position
      addCol(singleTable, curUp);
    }
  }

  // Implicit associations: COL = COL equality across two different tables
  const assocs = [];
  const eqRe = /\b(?:([A-Za-z][\w$#]*)\.)?([A-Za-z][A-Za-z0-9_]+)\s*=\s*(?:([A-Za-z][\w$#]*)\.)?([A-Za-z][A-Za-z0-9_]+)\b/g;
  while ((m = eqRe.exec(ctxSql))) {
    const side = (q, c) => {
      const col = c.toUpperCase();
      if (!isColumnCandidate(col)) return null;
      if (q) {
        const r = resolveQualifier(q);
        return r ? { table: r.table, col, outer: r.outer } : null;
      }
      return singleTable ? { table: singleTable, col, outer: false } : null;
    };
    const a = side(m[1], m[2]);
    const b = side(m[3], m[4]);
    if (a && b && a.table !== b.table) {
      // Owning side = the correlated outer table when present (code-lookup shape), else left.
      const [from, to] = b.outer && !a.outer ? [b, a] : [a, b];
      assocs.push({ fromTable: from.table, fromColumn: from.col, toTable: to.table, toColumn: to.col, via: 'implicit-join' });
    }
  }

  // Oracle hierarchy: CONNECT BY PRIOR X = Y → self-association (parent link)
  const cbRe = /CONNECT\s+BY\s+PRIOR\s+([A-Za-z][\w$#]*)\s*=\s*([A-Za-z][\w$#]*)/gi;
  while ((m = cbRe.exec(ctxSql))) {
    const t = singleTable || [...tableSet][0];
    if (!t) continue;
    const child = m[2].toUpperCase(), parentKey = m[1].toUpperCase();
    addCol(t, child); addCol(t, parentKey);
    assocs.push({ fromTable: t, fromColumn: child, toTable: t, toColumn: parentKey, via: 'connect-by-prior' });
  }

  return { tableSet, aliasMap, columnsByTable, assocs };
}

function analyzeSql(plainSqlWithLiterals) {
  // Capture facts that literal-stripping / paren-unwrapping would destroy.
  const insertCols = [];
  let m;
  const insRe = /INSERT\s+(?:INTO\s+([A-Za-z][\w$#]*)\s*)?\(([^()]*)\)/gi;
  while ((m = insRe.exec(plainSqlWithLiterals))) {
    const cols = m[2].split(',').map(s => s.trim().toUpperCase()).filter(isColumnCandidate);
    insertCols.push({ table: m[1] ? m[1].toUpperCase() : null, cols });
  }
  const lcdGroups = [...new Set([...plainSqlWithLiterals.matchAll(/\bLCD\s*=\s*'([^']+)'/g)].map(x => x[1]))];

  let sql = plainSqlWithLiterals.replace(/'[^']*'/g, " 'LIT' ");

  // Peel parenthesized scopes innermost-first. SELECT-bearing scopes become numbered SUBQV
  // markers (own analysis contexts); other paren groups are unwrapped in place so their
  // column references stay visible to the surrounding scope.
  const contexts = []; // index === SUBQV number
  let guard = 0;
  while (guard++ < 500) {
    const pm = /\(([^()]*)\)/.exec(sql);
    if (!pm) break;
    const inner = pm[1];
    const before = sql.slice(0, pm.index);
    if (/\bSELECT\b/i.test(inner)) {
      const kind = /\b(FROM|USING)\s*$/i.test(before) ? 'inline-view' : 'scalar';
      contexts.push({ sql: inner, kind });
      sql = before + ` SUBQV${contexts.length - 1} ` + sql.slice(pm.index + pm[0].length);
    } else {
      sql = before + ' ' + inner + ' ' + sql.slice(pm.index + pm[0].length);
    }
  }
  const topIndex = contexts.length;
  contexts.push({ sql, kind: 'top' });

  // Pass 1 (standalone): discover each subquery's base table for inline-view alias propagation.
  const subqBaseTables = [];
  const standaloneTableCounts = [];
  for (let i = 0; i < contexts.length; i++) {
    const r = analyzeContext(contexts[i].sql, [], []);
    subqBaseTables[i] = r.tableSet.size === 1 ? [...r.tableSet][0] : null;
    standaloneTableCounts[i] = r.tableSet.size;
  }
  // Transitive resolution for pure wrapper views (SELECT … FROM SUBQVn with no real table):
  // inherit the wrapped subquery's base so deeply nested org-tree style views still resolve.
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < contexts.length; i++) {
      if (subqBaseTables[i] || standaloneTableCounts[i] !== 0) continue;
      const wrapped = [...contexts[i].sql.matchAll(/\bFROM\s+SUBQV(\d+)/gi)]
        .map(x => subqBaseTables[Number(x[1])]).filter(Boolean);
      if (new Set(wrapped).size === 1) {
        subqBaseTables[i] = wrapped[0];
        changed = true;
      }
    }
  }

  // Statement-wide alias registry (lowercased): every token in select-list-alias position
  // across all contexts. Consulted only by the lowercase-column heuristic in pass 2.
  const stmtAliasLower = new Set();
  {
    const qualRe = /\b([A-Za-z][\w$#]*)\.([A-Za-z][A-Za-z0-9_]*)\b/g;
    const identLike = (t) => t && /^[A-Za-z]/.test(t) && !SQL_KEYWORDS.has(t.toUpperCase()) && !SQL_FUNCTIONS.has(t.toUpperCase());
    for (const c of contexts) {
      const tokens = (c.sql.replace(qualRe, ' QREF ').match(/[\w$#:]+|[,()=<>!*+\-/|]/g)) || [];
      for (let i = 1; i < tokens.length; i++) {
        const cur = tokens[i];
        if (!/^[A-Za-z]/.test(cur)) continue;
        const prevUp = tokens[i - 1].toUpperCase();
        if (identLike(tokens[i - 1]) || tokens[i - 1] === ')' || prevUp === 'AS' || prevUp === 'OVER') {
          stmtAliasLower.add(cur.toLowerCase());
        }
      }
    }
  }

  // Pass 2: outer frames first (top → inner), so correlated scalar subqueries resolve
  // outer aliases and inline-view aliases resolve through SUBQV base tables.
  const results = [];
  const frames = [];
  // Top context first, then subqueries outermost→innermost (creation order was innermost-first).
  const order = [topIndex, ...Array.from({ length: topIndex }, (_, i) => topIndex - 1 - i)];
  for (const i of order) {
    const r = analyzeContext(contexts[i].sql, frames.slice(), subqBaseTables, stmtAliasLower);
    results[i] = { ...r, kind: contexts[i].kind };
    frames.push(r.aliasMap);
  }

  // Merge results
  const primaryTables = new Set();
  const referencedTables = new Set();
  const columnsByTable = new Map();
  const assocs = [];
  for (const r of results) {
    if (!r) continue;
    const bucket = (r.kind === 'scalar') ? referencedTables : primaryTables;
    for (const t of r.tableSet) bucket.add(t);
    for (const [t, cols] of r.columnsByTable) {
      if (!columnsByTable.has(t)) columnsByTable.set(t, new Set());
      for (const c of cols) columnsByTable.get(t).add(c);
    }
    for (const a of r.assocs) assocs.push(a);
  }
  for (const { table, cols } of insertCols) {
    const t = table || [...primaryTables][0];
    if (!t) continue;
    if (!columnsByTable.has(t)) columnsByTable.set(t, new Set());
    for (const c of cols) columnsByTable.get(t).add(c);
  }
  for (const t of primaryTables) referencedTables.delete(t);

  return { primaryTables: [...primaryTables], referencedTables: [...referencedTables], columnsByTable, assocs, lcdGroups };
}

// ── Per-file extraction ─────────────────────────────────────────────────────
const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.xml')).map(f => path.join(sourceDir, f));

const logicItems = [];
const fragmentIds = new Set();
const tableAgg = new Map(); // TABLE -> { columns:Set, primaryNsCount:Map, statements:[], assocs:[] }

const ORACLE_FEATURES = [
  ['DECODE(', 'DECODE'], ['NVL(', 'NVL'], ['ROWNUM', 'ROWNUM'], ['CONNECT BY', 'CONNECT BY'],
  ['SYS_CONNECT_BY_PATH', 'SYS_CONNECT_BY_PATH'], ['OVER (', 'ANALYTIC-FUNCTION'], ['OVER(', 'ANALYTIC-FUNCTION'],
  ['MERGE INTO', 'MERGE'], ['REGEXP_', 'REGEXP'], ['.NEXTVAL', 'SEQUENCE'], ['TO_DATE(', 'TO_DATE'], ['TO_CHAR(', 'TO_CHAR'],
];

for (const file of files) {
  let xml;
  try {
    xml = fs.readFileSync(file, 'utf8');
  } catch (e) {
    errors.push({ file, error: e.message });
    continue;
  }
  const nsMatch = /<sqlMap\s+namespace="([^"]+)"/.exec(xml);
  const namespace = nsMatch ? nsMatch[1] : path.basename(file, '.xml');
  const module = normalizeModule(namespace);

  const typeAliases = {};
  const taRe = /<typeAlias\s+alias="([^"]+)"\s+type="([^"]+)"/g;
  let tm;
  while ((tm = taRe.exec(xml))) typeAliases[tm[1]] = tm[2];

  // Strip XML comments so commented-out statements are not extracted as live ones.
  const liveXml = xml.replace(/<!--[\s\S]*?-->/g, '');

  for (const st of parseStatements(liveXml)) {
    try {
      const id = st.attrs.id || '(anonymous)';
      if (st.tag === 'sql') fragmentIds.add(id);

      const dynamicConditions = [];
      const dynRe = /<is(NotEmpty|Empty|Equal|NotEqual|GreaterThan|GreaterEqual|LessThan|LessEqual|NotNull|Null|PropertyAvailable|NotPropertyAvailable)\b([^>]*)>/g;
      let dm;
      while ((dm = dynRe.exec(st.body))) {
        const a = parseAttrs(dm[2]);
        dynamicConditions.push({ kind: `is${dm[1]}`, property: a.property || null, compareValue: a.compareValue ?? null });
      }

      const includes = [];
      const incRe = /<include\s+refid="([^"]+)"\s*\/?>/g;
      while ((dm = incRe.exec(st.body))) includes.push({ refid: dm[1], resolved: false });

      const params = [...new Set([...st.body.matchAll(/#(\w+)(?::[^#]*)?#/g)].map(x => x[1]))];

      const plain = st.body
        .replace(/<!\[CDATA\[|\]\]>/g, ' ')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/#\w+(?::[^#]*)?#/g, ':p')
        .replace(/\s+/g, ' ')
        .trim();

      const sequencesUsed = [...new Set([...plain.matchAll(/\b([A-Z][A-Z0-9_$]*)\.NEXTVAL\b/g)].map(x => x[1]))];
      const upperPlain = plain.toUpperCase();
      const oracleFeatures = [...new Set(ORACLE_FEATURES.filter(([sig]) => upperPlain.includes(sig)).map(([, tag]) => tag))];

      const { primaryTables, referencedTables, columnsByTable, assocs, lcdGroups } = analyzeSql(plain);

      let statementKind = st.tag;
      if (st.tag === 'insert' && /\bMERGE\s+INTO\b/i.test(plain)) statementKind = 'merge';
      if (st.tag === 'sql') statementKind = 'fragment';

      logicItems.push({
        type: 'logic',
        logicKind: 'dataAction', // SQL statement = data access logic (reused vocabulary)
        linkId: `ibatis:logic:${namespace}:${id}`,
        uniqueId: `ibatis:${namespace}.${id}`,
        name: id,
        label: id,
        description: '',
        module,
        namespace,
        statementKind,
        isPublic: true,
        httpEndpoint: null,
        parameterClass: typeAliases[st.attrs.parameterClass] || st.attrs.parameterClass || null,
        resultClass: typeAliases[st.attrs.resultClass] || st.attrs.resultClass || null,
        inputParameters: params.map(p => ({ name: p, type: 'String', isMandatory: false })),
        outputParameters: st.attrs.resultClass ? [{ name: 'Result', type: typeAliases[st.attrs.resultClass] || st.attrs.resultClass }] : [],
        calls: [],
        aggregates: [],
        dynamicConditions,
        includes,
        tables: { primary: primaryTables, referenced: referencedTables },
        associationCandidates: assocs,
        lcdGroups,
        sequencesUsed,
        oracleFeatures,
        sqlText: plain.length > 4000 ? plain.slice(0, 4000) + ' …' : plain,
        _source: file,
        sourceRef: path.relative(path.join(sourceDir, '..'), file),
        _gaps: [],
        _links: [],
      });

      // Aggregate table facts (fragments too — their columns are real)
      const touch = (t) => {
        if (!tableAgg.has(t)) tableAgg.set(t, { columns: new Set(), primaryNsCount: new Map(), firstNs: namespace, statements: [], assocs: [] });
        return tableAgg.get(t);
      };
      for (const [t, cols] of columnsByTable) {
        const agg = touch(t);
        for (const c of cols) agg.columns.add(c);
        agg.statements.push(`${namespace}.${id}`);
      }
      for (const t of primaryTables) {
        const agg = touch(t);
        agg.primaryNsCount.set(namespace, (agg.primaryNsCount.get(namespace) || 0) + 1);
      }
      for (const t of referencedTables) touch(t).statements.push(`${namespace}.${id}`);
      for (const a of assocs) {
        touch(a.fromTable).assocs.push(a);
      }
    } catch (e) {
      errors.push({ file, error: `${st.attrs.id || st.tag}: ${e.message}` });
    }
  }
}

// Resolve <include refid> against fragments found across ALL sqlMap files.
for (const item of logicItems) {
  for (const inc of (item.includes || [])) inc.resolved = fragmentIds.has(inc.refid);
}

// ── Entity items from aggregated table facts ────────────────────────────────
const entityItems = [];
for (const [table, agg] of tableAgg) {
  let module;
  if (agg.primaryNsCount.size) {
    const top = [...agg.primaryNsCount.entries()].sort((a, b) => b[1] - a[1])[0][0];
    module = normalizeModule(top);
  } else {
    module = normalizeModule(agg.firstNs);
  }
  const fkByCol = new Map();
  for (const a of agg.assocs) {
    if (a.fromTable === table && !fkByCol.has(a.fromColumn)) fkByCol.set(a.fromColumn, a);
  }
  const attributes = [...agg.columns].sort().map(col => {
    const fk = fkByCol.get(col);
    return {
      name: col,
      type: fk ? `${fk.toTable} Identifier` : 'String',
      inferred: true, // no DDL in source — type/length/nullability unknown (gap G-1)
      isMandatory: false,
      isAutoNumber: false,
      isForeignKey: !!fk,
      referencedEntity: fk ? fk.toTable : '',
      deleteRule: '',
      length: '',
    };
  });
  entityItems.push({
    type: 'entity',
    linkId: `ibatis:entity:${module}:${table}`,
    uniqueId: `ibatis:table.${table}`,
    name: table,
    label: table,
    description: 'Reverse-engineered from iBATIS SQL (no DDL available — attribute types inferred)',
    module,
    isStatic: false,
    isPublic: true,
    isPersistent: true,
    ddlAvailable: false,
    deleteRule: '',
    attributes,
    associationCandidates: agg.assocs,
    referencedByStatements: [...new Set(agg.statements)],
    indexes: [],
    _source: sourceDir,
    _gaps: [],
    _links: [],
  });
}

// ── Emit ────────────────────────────────────────────────────────────────────
const result = {
  source: 'ibatis',
  items: [...entityItems, ...logicItems],
  errors,
  meta: {
    fileCount: files.length,
    duration: Date.now() - startTime,
    statementCount: logicItems.filter(i => i.statementKind !== 'fragment').length,
    fragmentCount: fragmentIds.size,
  },
};

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), 'utf8');
console.log(`Extracted ${entityItems.length} entities (reverse-engineered) + ${logicItems.length} SQL logic items from ${files.length} sqlMap files (${errors.length} errors)`);
