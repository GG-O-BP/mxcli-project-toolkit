'use strict';
// Cross-reference rules for the Spring MVC + iBATIS + WebSquare stack. The engine shape
// (link(allItems) → { linkId: { linkedTo, gaps } }) is identical to the other pipelines;
// only the rules differ. The load-bearing chain for this stack:
//   screen submission action URL → controller @RequestMapping endpoint (N1)
//   controller → service → DAO by delegate-call name (N2)
//   DAO method → iBATIS statement by string statement-id (N3)
//   SQL statement → table entity (N4), entity → entity via implicit joins (N5)

// Client-side references that live in the nbase framework (not in the migrated source) —
// they surface as explicit gaps, categorized so gaps-report reads as "known missing
// framework dependency", not as extractor noise.
const FRAMEWORK_URL_MARKERS = ['/dwr/'];

class Linker {
  link(allItems) {
    const byType = {};
    for (const item of allItems) {
      (byType[item.type] = byType[item.type] || []).push(item);
    }

    const map = {};
    for (const item of allItems) {
      map[item.linkId] = { linkedTo: [], gaps: [] };
    }

    const entities = byType['entity'] || [];
    const logics   = byType['logic']  || [];
    const screens  = byType['screen'] || [];

    const entityByName = new Map(entities.map(e => [e.name.toUpperCase(), e]));
    const screenByName = new Map(screens.map(s => [s.name, s]));
    const sqlLogics    = logics.filter(l => l.logicKind === 'dataAction' && l.statementKind !== 'fragment');
    const sqlByName    = new Map(sqlLogics.map(l => [l.name, l]));
    const fragmentIds  = new Set(logics.filter(l => l.statementKind === 'fragment').map(l => l.name));

    // Segment-wise path compare; either side may hold a placeholder. The last segment is
    // compared dot-part-wise so "get.json" matches "get.{metadataType}".
    function pathsMatch(a, b) {
      const strip = (p) => p.replace(/^\/nbase(?=\/)/, '');
      const segsA = strip(a).split('/').filter(Boolean);
      const segsB = strip(b).split('/').filter(Boolean);
      if (segsA.length !== segsB.length) return false;
      const isPh = (s) => s === '*' || /^\{.*\}$/.test(s);
      const partMatch = (x, y) => isPh(x) || isPh(y) || x === y;
      return segsA.every((segA, i) => {
        const segB = segsB[i];
        if (partMatch(segA, segB)) return true;
        const pa = segA.split('.');
        const pb = segB.split('.');
        if (pa.length !== pb.length || pa.length === 1) return false;
        return pa.every((x, j) => partMatch(x, pb[j]));
      });
    }

    // ── N1: Screen submission → controller endpoint ──
    for (const screen of screens) {
      for (const { path: apiPath, method, submissionId } of (screen.apiCalls || [])) {
        if (FRAMEWORK_URL_MARKERS.some(mk => apiPath.includes(mk))) {
          map[screen.linkId].gaps.push(`framework-endpoint:${apiPath}`);
          continue;
        }
        let matched = false;
        for (const logic of logics) {
          if (!logic.httpEndpoint) continue;
          const verbOk = logic.httpEndpoint.method === 'ANY' || logic.httpEndpoint.method === method;
          if (verbOk && pathsMatch(logic.httpEndpoint.path, apiPath)) {
            matched = true;
            map[screen.linkId].linkedTo.push({
              id: logic.linkId, confidence: 'high', matchedBy: 'submission-endpoint-match',
              via: `${submissionId} → ${method} ${apiPath}`,
            });
          }
        }
        if (!matched) map[screen.linkId].gaps.push(`endpoint-unmatched:${apiPath}`);
      }
    }

    // ── N2: Logic → logic (delegate calls: xxxService.m / xxxDAO.m / super.m / bare m) ──
    for (const logic of logics) {
      for (const call of (logic.calls || [])) {
        const dotted = /^([a-zA-Z_][\w]*)\.(\w+)$/.exec(call.name || '');
        if (dotted) {
          const [, receiver, methodName] = dotted;
          if (receiver === 'this' || receiver === 'super') continue; // framework base-class plumbing
          // Prefer a target whose class matches the receiver's layer suffix
          // (xxxService.m → *Service*/ServiceImpl, xxxDAO.m → *DAO*), else any name match.
          const layer = /service$/i.test(receiver) ? /service/i : (/dao$/i.test(receiver) ? /dao/i : null);
          const candidates = logics.filter(l => l.name === methodName && l.linkId !== logic.linkId && l.logicKind !== 'dataAction');
          const target = (layer && candidates.find(l => layer.test(l.className || ''))) || candidates[0];
          if (target) {
            map[logic.linkId].linkedTo.push({
              id: target.linkId, confidence: 'high', matchedBy: 'delegate-call-name', via: call.name,
            });
          }
        } else if (call.name && /^[a-zA-Z_]\w*$/.test(call.name)) {
          const target = logics.find(l => l.name === call.name && l.linkId !== logic.linkId
            && l.logicKind !== 'dataAction' && l.module === logic.module);
          if (target) {
            map[logic.linkId].linkedTo.push({
              id: target.linkId, confidence: 'medium', matchedBy: 'same-module-call-name', via: call.name,
            });
          }
        }
      }
    }

    // ── N3: DAO logic → iBATIS statement by statement id ──
    for (const logic of logics) {
      for (const ref of (logic.sqlStatementRefs || [])) {
        const target = sqlByName.get(ref);
        if (target) {
          map[logic.linkId].linkedTo.push({
            id: target.linkId, confidence: 'high', matchedBy: 'ibatis-statement-id', via: ref,
          });
        } else {
          map[logic.linkId].gaps.push(`sql-statement-missing:${ref}`);
        }
      }
    }

    // ── N4: SQL statement → entity (primary high / referenced medium) ──
    for (const logic of sqlLogics) {
      for (const t of (logic.tables?.primary || [])) {
        const e = entityByName.get(t.toUpperCase());
        if (e) map[logic.linkId].linkedTo.push({ id: e.linkId, confidence: 'high', matchedBy: 'sql-primary-table', via: t });
      }
      for (const t of (logic.tables?.referenced || [])) {
        const e = entityByName.get(t.toUpperCase());
        if (e) map[logic.linkId].linkedTo.push({ id: e.linkId, confidence: 'medium', matchedBy: 'sql-referenced-table', via: t });
      }
    }

    // ── N5: Entity → entity via implicit-join FK attributes ──
    for (const entity of entities) {
      for (const attr of (entity.attributes || [])) {
        if (!attr.isForeignKey || !attr.referencedEntity) continue;
        const target = entityByName.get(attr.referencedEntity.toUpperCase());
        if (target) {
          map[entity.linkId].linkedTo.push({
            id: target.linkId, confidence: 'medium', matchedBy: 'implicit-join-column', via: attr.name,
          });
        } else {
          map[entity.linkId].gaps.push(`fk-unresolved:${attr.referencedEntity}`);
        }
      }
    }

    // ── N6: Popup layer ↔ parent screen ──
    for (const screen of screens) {
      for (const openerName of (screen.launchedFrom || [])) {
        const opener = screenByName.get(openerName);
        if (opener) {
          map[screen.linkId].linkedTo.push({ id: opener.linkId, confidence: 'high', matchedBy: 'popup-launched-from', via: openerName });
          map[opener.linkId].linkedTo.push({ id: screen.linkId, confidence: 'high', matchedBy: 'popup-opens', via: screen.name });
        }
      }
    }

    // ── N7: Explicit gaps for references that leave the extracted source ──
    const screenBasenames = new Set(screens.map(s => (s.sourceRef || s._source || '').split(/[\\/]/).pop()));
    for (const logic of logics) {
      for (const inc of (logic.includes || [])) {
        if (!inc.resolved && !fragmentIds.has(inc.refid)) {
          map[logic.linkId].gaps.push(`sql-include-unresolved:${inc.refid}`);
        }
      }
      for (const seq of (logic.sequencesUsed || [])) {
        map[logic.linkId].gaps.push(`sequence-ddl-missing:${seq}`);
      }
      if (logic.externalTypes?.length) {
        map[logic.linkId].gaps.push(`framework-classes-missing:${logic.externalTypes.join(',')}`);
      }
    }
    for (const entity of entities) {
      if (entity.ddlAvailable === false) {
        map[entity.linkId].gaps.push('ddl-missing:attribute-types-inferred');
      }
    }
    for (const screen of screens) {
      for (const src of (screen.includedScreens || [])) {
        const base = src.split(/[\\/]/).pop();
        if (!screenBasenames.has(base)) map[screen.linkId].gaps.push(`included-screen-missing:${src}`);
      }
      for (const src of (screen.jsIncludes || [])) {
        map[screen.linkId].gaps.push(`js-include-missing:${src}`);
      }
      for (const ref of (screen.clientHelperRefs || [])) {
        map[screen.linkId].gaps.push(`client-helper-missing:${ref}`);
      }
      for (const fn of (screen.unresolvedFunctions || [])) {
        map[screen.linkId].gaps.push(`client-function-unresolved:${fn}`);
      }
    }

    return map;
  }
}

module.exports = { Linker };
