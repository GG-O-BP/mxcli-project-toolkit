# Non-SAP-source → Mendix Conversion Checklist

> Target: `sources/Non-SAP-source/`
> Reference: `README.md`'s stage 0–6 pipeline + `skills/migration-pipeline.md`
> This document covers **process order, skills, and prompt templates only** — it does not record the source's actual tech stack/screens/data (that content is organized separately under `analysis/Non-SAP-source/`).

---

## Self-check before starting

- [ ] Confirmed whether `sources/Non-SAP-source/` is a complete app or an excerpt
- [ ] Acknowledged that it is not yet decided whether the existing extraction pipelines (`pipelines/outsystems/`, `pipelines/java-angular/`) cover this source stack, or whether a new extractor must be built (an extractor is always stood up, regardless of app size)
- [ ] Confirmed that `analysis/`, `sources/`, `knowledge-base/` are covered by the repo's `.gitignore`, so there is no commit risk

---

## Stage 0 — TRIAGE

**Skill:** `skills/source-triage.md` + `skills/assess-migration.md`

- [ ] Run prompt

  ```
  Read skills/source-triage.md and skills/assess-migration.md, then review all of
  sources/Non-SAP-source/. Determine whether the existing extraction pipelines cover
  this source stack, and decide whether to reuse one or build a new extractor (an
  extractor is always stood up, regardless of app size). Write the coverage matrix +
  pipeline decision (reuse/build) + confirmed scope into
  analysis/Non-SAP-source/architecture.md.
  ```

- [ ] Verify deliverable: does `analysis/Non-SAP-source/architecture.md` clearly state the coverage matrix, pipeline decision (reuse/build), and confirmed scope?
- [ ] **Gate: do not proceed to Stage 2 (REQUIREMENTS) until this decision is made**

---

## Stage 1 — ANALYSIS

The two paths can proceed in either order and converge at the same merge step.

### Path A — Code → Structure

**Skill:** `skills/assess-migration.md` (already loaded in Stage 0)

- [ ] Run prompt

  ```
  Based on the confirmed scope in analysis/Non-SAP-source/architecture.md, analyze the
  relevant source files in sources/Non-SAP-source/ and add candidate entities,
  business logic, and screen structure to the same architecture.md as structured
  sections.
  ```

- [ ] Verify deliverable: candidate-entities / logic-list / screen-structure sections added to `architecture.md`

### Path B — Documents/Data → KB

**Skill:** `skills/kb-generation.md`

- [ ] Run prompt

  ```
  Following the skills/kb-generation.md template, analyze the document and data
  materials in sources/Non-SAP-source/ and write KB markdown under
  analysis/Non-SAP-source/knowledge-base/share/. Include field definitions,
  representative samples, and screen components.
  ```

- [ ] Verify deliverable: KB markdown generated under `analysis/Non-SAP-source/knowledge-base/share/`

---

## Stage 2 — REQUIREMENTS (BRD)

**Skill:** `skills/brd-generation.md` → `skills/brd-validation.md`

- [ ] Run BRD-authoring prompt

  ```
  Following the skills/brd-generation.md prompt template, merge
  analysis/Non-SAP-source/architecture.md and the knowledge-base/share/ deliverables
  to write BRD JSON under analysis/Non-SAP-source/knowledge-base/brd/. For
  source-only syntax or features not present in the migration target framework,
  document them explicitly under businessRules or openQuestions.
  ```

- [ ] Run validation prompt

  ```
  Validate the BRD JSON you just wrote against the skills/brd-validation.md
  checklist. Find and fix duplicates/conflicts/orphaned concepts/broken
  relationships, and repeat until it reaches a clean state.
  ```

- [ ] Verify deliverable: `analysis/Non-SAP-source/knowledge-base/brd/*.brd.json` is validation-clean

---

## Stage 3 — ARCHITECTURE & DESIGN (parallel)

### 3a — Module boundaries (prerequisite)

**Skill:** `skills/modularize-domain.md`

- [ ] Run prompt

  ```
  Following the skills/modularize-domain.md criteria, determine whether the
  just-validated BRD should be a separate Mendix module or should be absorbed into
  an existing app's module, and produce a rationale HTML document. Decide this on
  its own merits — don't just copy the source file structure.
  ```

- [ ] Verify deliverable: module-boundary decision + rationale HTML, user approval completed

### 3b — Architecture blueprint (after 3a completes; can run alongside 3c)

**Skill:** `skills/architecture-blueprint.md`

- [ ] Run prompt

  ```
  Following skills/architecture-blueprint.md, write the module definition document,
  structure diagram, and fit-gap analysis. For source-dependent features not
  provided by the target framework, document them explicitly as fit-gap items.
  ```

- [ ] Verify deliverable: module definitions + diagram + fit-gap document (including open issues)

### 3c — Design deliverables (after 3a completes; can run alongside 3b)

**Skill:** `skills/design-artifacts.md`

- [ ] Run prompt

  ```
  Following skills/design-artifacts.md, write Mendix Atlas-based wireframes based on
  the reference screen materials in sources/Non-SAP-source/.
  ```

- [ ] Verify deliverable: version-controlled design system + per-screen wireframes

---

## Stage 4 — BUILD PLAN

**Skill:** `skills/brd-to-build-plan.md`

- [ ] Run prompt

  ```
  Following skills/brd-to-build-plan.md, write a numbered, dependency-ordered build
  plan (entities → associations → microflows → pages) based on the BRD and the
  Stage 3 architecture deliverables.
  ```

- [ ] Verify deliverable: numbered script plan document in dependency order
- [ ] The build plan belongs in the target Mendix project's own repo, not this repo

---

## Stage 5 — BUILD

> ⚠️ Can only start once an actual Mendix `.mpr` project is open — this toolkit repo has no target app, so proceed in a separate Mendix project folder opened with mxcli.

**Skill:** `skills/iterative-build-loop.md` + `skills/mdl-cookbook-microflows.md` + `bug-logs/mxcli-bugs.md`

- [ ] Prepare the target Mendix project (.mpr) and confirm Studio Pro is running
- [ ] Run prompt

  ```
  Following the gates in skills/iterative-build-loop.md, run and validate the build
  plan starting from script 1 using mxcli. When writing MDL, follow the rules in
  skills/learned-microflow-patterns.md and skills/learned-page-patterns.md.
  ```

- [ ] Repeat each script in the plan per module/screen, confirming each gate passes
- [ ] On CE errors, check against `bug-logs/mxcli-bugs.md` to see whether it's a known issue
- [ ] Before screenshot/UI verification, follow the README's "no stale build" protocol (restart SP → Run Locally → confirm 200)

---

## Stage 6 — TEST

**Skill:** `skills/e2e-harness-base.md` + `skills/learned-db-assertions.md`

- [ ] Run prompt

  ```
  Following skills/e2e-harness-base.md, write Playwright tests for the golden path
  (view/create/update/delete), seeding with samples of the original data. Perform DB
  validation per skills/learned-db-assertions.md.
  ```

- [ ] Confirm golden path passes
- [ ] Confirm edge cases pass (empty values, duplicate keys, paging boundaries, etc.)
- [ ] Confirm DB assertions pass

---

## Reference documents to keep open throughout

- [ ] Prerequisite/constraint documents under `sources/Non-SAP-source/` (if any)
- [ ] `process/process-learnings.md` — process decisions from past similar projects
- [ ] `README.md` — relationships between stages, and how `assess-migration.md` complements the extraction pipelines
