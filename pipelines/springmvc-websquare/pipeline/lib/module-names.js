'use strict';

// Canonical module names for this stack. Module identity arrives in three different
// spellings depending on the artifact: sqlMap namespace ("LocAndItemManage"), Java package
// segment ("locitemmanage", "basecommon"), and URL path segment ("locAndItemManage",
// "basecommon"). The merger/linker/BRD mappers group items by exact module string, so every
// extractor normalizes through this one table. Add aliases here when a new artifact spelling
// appears — never normalize ad hoc inside an extractor.
const ALIASES = {
  'locanditemmanage': 'LocAndItemManage',
  'locitemmanage':    'LocAndItemManage',
  'basecommon':       'BaseCommon',
  'based':            'BaseCommon',   // com.kt.nbase.based.code.vo (typeAlias package variant)
  'code':             'BaseCommon',
  'location':         'LocAndItemManage', // com.kt.nbase.base.location.vo — location VOs ride with LocAndItemManage in this slice
  'common':           'Common',
  'cont':             'Common',
  'user':             'Common',
  'portal':           'Portal',
};

function normalizeModule(raw) {
  if (!raw) return 'Common';
  const key = String(raw).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (ALIASES[key]) return ALIASES[key];
  // Default: TitleCase the raw segment so unknown modules still merge case-stably.
  const s = String(raw);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

module.exports = { normalizeModule };
