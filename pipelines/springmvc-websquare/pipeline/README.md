# springmvc-websquare migration pipeline

Extraction pipeline for the **legacy Spring MVC + iBATIS SQL Map 2.0 + WebSquare5 (Inswave
XForms)** stack — KT nbase-framework flavored sources. Derived from the `java-angular`
pipeline skeleton (run.js orchestration, lib/interfaces + merger, BRD mappers,
generate-report) with three stack-specific extractors:

| Extractor | Source | Emits |
|---|---|---|
| `extractors/springmvc-extractor.js` | `*.java` (tree-sitter; tolerates package-less excerpt files) | logic (controller endpoints via `@RequestMapping`, service/DAO methods with iBATIS statement refs), structures (VO/DTO) |
| `extractors/ibatis-sqlmap-extractor.js` | sqlMap `*.xml` | logic per SQL statement (`logicKind: dataAction`) + entities reverse-engineered from table/column usage (no DDL → types inferred) |
| `extractors/websquare-extractor.js` | screen `*.xml` with `xmlns:w2` marker | screens (submissions, grid columns, form fields, popup layers, inline-JS validation facts). Skips `websquare/` vendor dirs and JSP shells. |

Cross-reference chain (lib/linker.js): screen submission URL → controller endpoint →
service → DAO (delegate-call names) → SQL statement (statement id) → table entity →
entity-entity (implicit join columns). Unresolved references (nbase framework classes,
client helper JS, missing DDL/sequence, wframe includes) become categorized gaps in
`reports/gaps-report.md` — they are the stack's known missing-dependency surface, not noise.

## Run

```bash
bun install                 # once (tree-sitter native deps)
# set config.json paths first (local-only edit — never commit real paths)
bun run.js 2                # extract + merge → knowledge-base
bun run.js 3                # BRD scaffolds → knowledge-base/brd/
bun generate-report.js      # HTML dashboard
```

`config.json` keys: `serverSourceDir` (Java), `sqlSourceDir` (sqlMap XML), `frontSourceDir`
(WebSquare screens + JSP shells), `knowledgeBaseDir` (→ `analysis/<name>/knowledge-base`).
