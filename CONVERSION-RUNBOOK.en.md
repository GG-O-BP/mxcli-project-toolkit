# Conversion Runbook — Source-Agnostic Mendix Conversion Checklist

> English translation of [`CONVERSION-RUNBOOK.md`](CONVERSION-RUNBOOK.md) (Korean original). If the two ever diverge, the Korean original is authoritative.

**This document is not a skill — it is a user-facing execution document.** The project lead (a human) copies each stage's prompt block **verbatim**, in order, into the agent; any source stack then passes through the same gates and ends up converted into an mxcli-based Mendix app. The conversion runs **inside the toolkit clone** — no separate project workspace is created. No variable substitution is needed — paths are referred to only by the nouns in the "Fixed Conventions" below; the agent verifies the actual paths during stage P, records them in the project context (`CLAUDE.local.md`), and resolves them on its own from then on. Prompts contain no skill paths — finding and reading the right skill for each task is the agent's own job, per the CLAUDE.md routing tables.

---

## Fixed Conventions — What the Nouns in the Prompts Mean (No Substitution Needed)

| Noun | Meaning | How the agent resolves it |
|---|---|---|
| **toolkit** | The `mxcli-project-toolkit` clone root — the current folder where the agent session starts. The entire conversion happens inside it | The session's current folder (verified to be the toolkit root in P-1) |
| **source folder** | The original source under `sources/` — read-only, never modified | The single folder under `sources/` (if there are several, the agent asks the user) |
| **analysis folder** | `analysis/<source folder name>/` — every analysis/design artifact of this project (intake, KB, BRD, `architecture/`, `design/`) | Derived from the source folder name |
| **Mendix folder** | `mendix/<source folder name>/` — where the target Mendix project lives | Derived from the source folder name. The agent checks it at the start of stage 5 and creates it with mxcli if missing — the user does not need to prepare it in advance |
| **target .mpr** | The target Mendix project file — inside the Mendix folder | Verified/created in 5-0 and recorded in the project context |
| **project context** | `CLAUDE.local.md` at the toolkit root — records this conversion's paths, tools, and project facts. The root `CLAUDE.md` is the toolkit's own committed file, so project facts never go there | Created in P-3. Claude Code auto-loads it alongside `CLAUDE.md` |

**Commit boundary:** All project artifacts (`sources/`, `analysis/`, `mendix/`, `knowledge-base/`, `*.mpr*`, `CLAUDE.local.md`, `.claude/agents/`) are excluded from commits via `.gitignore` — the only things committed to the toolkit repo are reusable assets (skills, bug logs, runbook/pipeline improvements). The single exception is the local-path edit to `pipelines/<x>/pipeline/config.json`, a tracked file that must **never be committed**. If `git status` shows any other project file, the setup is broken — go back to P-1 check #4, fix it, then continue.

**How to use:** Open an agent session at the toolkit clone root and paste the prompt blocks in order, top to bottom. There is nothing to copy-and-substitute. If you want to track progress, copy this file into the analysis folder and tick the checkboxes there (the analysis folder is a commit-excluded area — do not tick boxes in this template original). Run P-1 through P-3 in the same session — until the project context exists, a new session has no memory of the paths.

## Runbook Rules (Apply to Every Stage)

1. **No stack names** — this document names no specific source technology. Stack identification, and any branching that follows from it, is the job of the stage 0 artifacts. If you feel the urge to write a stack name into this document, that content belongs in the intake/triage artifacts (`intake.md`/`triage.md`).
2. **Prompts contain only the task, never skill paths** — a prompt describes the task, its outputs, and its gate, and the whole block is copied in unmodified. Which skills to read is not written into the prompt: the agent selects and loads skills on its own via the CLAUDE.md routing (the toolkit routing table read in P-1, plus the Baseline routing in the project context created in P-3). When skills improve or get replaced, the runbook needs no edits.
3. **Gates are judged by files and conditions** — not by "it feels done" but by "the files that must exist + the content they must contain." The ✋ mark is a hard gate: **no advancing to the next stage without user sign-off.**
4. **No mxcli during stages 0–4** — MDL/model manipulation starts at stage 5. Fixing a wrong module boundary at the diagram stage is far cheaper than fixing it after 40 scripts have assumed it.
5. **An improvised decision = a runbook defect** — if you needed a judgment call this document doesn't cover, don't just work around it in that project and move on: fix this template in the toolkit (see the wrap-up stage).
6. **Branch only where branches are declared** — apart from B1 (build a new pipeline), B2 (documents available or not), and B3 (multi-app question), skipping a stage is not allowed. In particular, "the app is small, so skip it" is forbidden — an extraction pipeline is always stood up regardless of app size.
7. **The default scope is the entire source** — the runbook never asks "what should we convert?" Everything in the source is in scope. It asks only two things: ① how to handle things the source references but does not contain (missing dependencies) — acquire / stub / declare-not-implemented; ② in what order to proceed when the source is too big for one pass (a slice is an ordering, not an exclusion).
8. **Never discard vendor code at folder granularity** — framework/vendor originals are not conversion targets (the Mendix platform replaces that layer), but vendor folders often have project customizations mixed in. Classify at file granularity with evidence (copyright headers, comparison against the distributed original, traces of project modification), and keep the originals too — not deleted, but retained as reference for interpreting screen definitions and syntax.

### Stage Map

| Order | Stage | Hard gate ✋ |
|---|---|---|
| P | Kickoff prep (toolkit/tool checks → project context & agents → intake) | — |
| 0 | TRIAGE (inventory → pipeline decision → boundary handling) | ✋ Sign-off on pipeline & boundary handling |
| 1 | ANALYSIS (A: code extraction ∥ B: document KB) | — |
| 2 | REQUIREMENTS (BRD scaffold → enrichment → validation) | — |
| 3 | ARCHITECTURE & DESIGN (module boundaries → blueprint ∥ design) | ✋ (multi-app resolution,) module boundary approval |
| 4 | BUILD PLAN | ✋ Plan approval |
| 5 | BUILD (mxcli starts here: verify/create .mpr → build loop) | Per-module build-loop gates |
| 6 | TEST | Golden path, edge cases, DB assertions |
| — | Wrap-up (feed learnings back + clean up project areas) | — |

---

## Stage P — Kickoff Prep

### P-1. Toolkit Check

- [ ] Run the prompt

  ```
  This conversion runs inside an mxcli-project-toolkit clone (the "toolkit").
  Check the 5 items below and report a pass/fail table per item.
  If any item fails, stop and let me know before going further.

  1. Confirm that this session's current folder is the toolkit clone root —
     skills/, pipelines/, and CONVERSION-RUNBOOK.md must be present. If not,
     stop and tell me. If it is, run git pull to update, record the last
     commit as a one-liner, then read the skill routing table in the toolkit
     CLAUDE.md — from here on, in every stage, you find and read the skills
     matching each task via that routing yourself.
  2. Locate the source folder under sources/ and record the total file count
     and top-level structure. If there is no source folder, or more than one,
     ask me. The original source is never modified from this point on.
  3. Create analysis/<source folder name>/ (the "analysis folder").
     Do not pre-create knowledge-base/ inside it — the pipeline creates that.
  4. Verify that project artifacts cannot be committed to the toolkit — the
     toolkit .gitignore must exclude sources/, analysis/, knowledge-base/,
     mendix/, *.mpr (+ .backup/.lock), CLAUDE.local.md, and .claude/agents/.
     Add any missing entries to .gitignore (that edit is a toolkit
     improvement, so it IS meant to be committed). If git status still shows
     project files after that, report that we must not proceed.
  5. Ask me whether there are any license or security constraints on storing
     and using the customer's original source (sources/) on this machine —
     commits are already blocked by item 4, so what you are checking here is
     storage/off-machine-transfer constraints. Record my answer.
  ```

- [ ] **Gate:** All 5 items reported as passing (item 2's file count and structure become the baseline for the P-4 intake and the 1-A extraction-coverage cross-check)

### P-2. Tool Check

- [ ] Run the prompt

  ```
  Check the tools this conversion needs and report them in a table, split
  into "required now" and "reserved". If anything required-now is missing,
  stop and tell me. Reserved items may be absent for now — just record their
  current state; they are re-checked before their stage starts.

  [Required now]
  - git --version
  - bun --version (the JS runtime and package manager for running the
    extraction pipeline — bun install runs inside the chosen pipeline/ folder
    after the pipeline is decided in stage 0)

  [Reserved — before stage 5 (BUILD) starts]
  - Mendix Studio Pro installed + version recorded (the .mpr verified/created
    in stage 5 is matched to this version)
  - mxcli --version (if it works, check the toolkit's known mxcli bug log for
    issues tied to this version)
  - The target .mpr and the local run URL are not checked here — the agent
    verifies/creates/records them at the start of stage 5

  [Reserved — before stage 6 (TEST) starts]
  - bunx playwright --version
  - A DB access path for seeding data and DB assertions
  ```

- [ ] **Gate:** Everything "required now" passes. Reserved items are re-checked in the prerequisite checks of stages 5 and 6.

### P-3. Project Context (CLAUDE.local.md) + Subagents

- [ ] Run the prompt

  ```
  Create this conversion's project context as CLAUDE.local.md at the toolkit
  root. Never modify the root CLAUDE.md — it is the toolkit's own committed
  file. CLAUDE.local.md is auto-loaded by Claude Code alongside CLAUDE.md and
  is excluded from commits via gitignore. It must include:
  ① The toolkit's Baseline routing table (the always-on discipline applied to
     every MDL-writing session — copy the table from the toolkit README
     verbatim)
  ② The instruction "per-task skill selection follows the routing table in
     the toolkit CLAUDE.md" — this is what lets agents in later sessions find
     skills on their own even though prompts contain no skill paths
  ③ Path and tool facts: the toolkit root absolute path, source folder,
     analysis folder, Mendix folder, target .mpr (its path if it already
     exists; otherwise mark it "created with mxcli in the Mendix folder at
     the start of stage 5" and update on creation), and the tool versions
     confirmed in P-2
  Leave the project-specific facts section as a placeholder since intake.md
  does not exist yet, and state explicitly that it must be updated after P-4.
  ```

- [ ] Run the prompt

  ```
  Create this project's dev-process subagents (mdl drafting / gate
  verification / test) under .claude/agents/ per the toolkit standard. Read
  the CLAUDE.local.md you just created before starting, and also verify that
  .claude/agents/ is excluded from commits.
  ```

- [ ] Verify outputs: `CLAUDE.local.md` (containing Baseline routing + the routing instruction + path/tool facts), and the 3 `.claude/agents/*.md` files

### P-4. Intake — The Standard 8 Questions

- [ ] Run the prompt

  ```
  Explore the source folder and write intake.md in the analysis folder,
  answering the 8 questions below. For anything not verifiable from the code,
  do not fill in guesses — leave it as "Unverified — how to verify: ...".

  1. Is the source a complete app or an excerpt? Can it compile/run as-is?
  2. What does the source reference that is not inside the source (missing
     dependencies — classes, shared modules, screens, tables, etc.)? What are
     the handling candidates for each? (acquire / stub / declare-not-
     implemented — finalized at the stage 0 gate. Scope itself is not in
     question: the entire source is in scope)
  3. Where does the data model come from? (DDL / ORM definitions / inferred
     from SQL and sample data / needs separate acquisition)
  4. Is there sample data for seeding/testing? Which files?
  5. What is the file-level split between the framework/vendor layer and the
     customization layer? — Separate vendor originals (not extraction
     targets; kept as reference for interpreting screen definitions and
     widget semantics) from project customizations mixed into vendor folders
     (extraction targets), and record the evidence for each call (copyright
     headers, match against the distributed original, traces of project
     modification, comments). No blanket folder-level exclusion.
  6. Is authentication/authorization model information present in the source?
     (sessions / roles / access control)
  7. Are there business documents (design docs, specifications, manuals,
     spreadsheets)? Where?
  8. Is there a source-system SME available to answer open questions?

  After writing it, update the project-specific facts section of
  CLAUDE.local.md with the intake results.
  ```

- [ ] **Gate:** `intake.md` in the analysis folder answers all 8 questions with either "an answer" or "Unverified — how to verify". No empty items. `CLAUDE.local.md` updated.

---

## Stage 0 — TRIAGE ✋

### 0-A. Manual Inventory

- [ ] Run the prompt

  ```
  Analyze the entire source folder per the migration pre-assessment
  methodology and write assessment.md in the analysis folder. Include an
  inventory summary table, the 6 investigation areas — tech stack, data
  model, business logic, screens/UI, integrations, security — and the
  migration risks, each with a Mendix-mapping column. Following the layer
  classification from intake.md item 5, exclude vendor originals from the
  inventory (but use them as reference when interpreting screen definitions)
  and include the customization layer.
  ```

- [ ] Verify output: `assessment.md` with inventory summary table + 6 sections + risk table

### 0-B. Pipeline Decision + Boundary Handling Finalized

- [ ] Run the prompt

  ```
  With intake.md and assessment.md from the analysis folder as input, perform
  the pre-extraction source triage and write triage.md in the analysis
  folder. It must include:
  ① The extraction pipeline decision — reuse an existing pipeline from the
     toolkit's pipelines/ (which one) vs build new. An extractor is always
     stood up regardless of app size.
  ② A business capability map + coverage matrix
     (Ready/Extract-only/Build/Defer/Unknown)
  ③ A proposed boundary-handling decision — the default scope is the entire
     source. For each missing dependency from intake item 2, propose a policy
     (acquire / stub / declare-not-implemented), and recommend an ordering
     slice only if the source is too big for one pass (a slice is an
     ordering, not an exclusion)
  ④ A multi-Mendix-app question flag (if applicable — flag only, do not
     decide)
  Where assessment.md's inventory and the extraction estimates disagree,
  state those points explicitly as gaps.
  ```

- [ ] **Gate ✋:** `triage.md` contains sections ①–④ + **the user signs off on the pipeline decision and the boundary handling (the policy per missing dependency, and the slice order if applicable).** No stage 2 (BRD) artifacts are produced before this approval.

### 0-C. (Branch B1) New Pipeline Build — only if 0-B decided "build new"; skip if "reuse"

- [ ] Run the prompt

  ```
  Per the decision in triage.md, build the extraction pipeline for this
  source stack following the toolkit's new-stack pipeline bootstrap
  procedure. Copy the generic files (interfaces / merger / linker engine /
  brd-mappers / run.js / report generators) from the closest existing
  pipeline that triage designated (one of the toolkit's pipelines/), and
  newly write only the per-source-format extractors and this stack's linker
  rules. Reuse the existing 5 logicKind vocabulary values, and point
  config.json's knowledgeBaseDir at the analysis folder's knowledge-base.
  Also write this stack's reference skill (source-{stack}.md) in the
  toolkit's skills/. When done, run the iterative validation loop against a
  hand-built ground truth document and repeat until extraction quality is
  actually verified — do not stop at "it runs without errors".
  ```

- [ ] **Gate:** Every item of the toolkit's new-pipeline bootstrap checklist passes + iterative validation against ground truth is complete. Report the pipeline build time separately from the migration schedule.

---

## Stage 1 — ANALYSIS (Paths A/B in either order, parallelizable)

### 1-A. Code Extraction (Path A)

- [ ] Run the prompt

  ```
  First check the pipeline's config.json — knowledgeBaseDir must point at the
  analysis folder's knowledge-base, and the source path at the source folder.
  This edit is local-only: config.json is a tracked file, but changes
  containing local paths are never committed (the one exception to the commit
  boundary). Then extract the entire source folder with the pipeline
  triage.md designated — starting from the first slice if triage set an
  ordering (bun run.js 2). When done, review gaps-report.md and
  coverage-report.md in knowledge-base/reports/ and judge each of the 4
  extraction quality checks with evidence (entity count matches the source
  inventory / cross-reference gaps under 15% / all business modules present /
  no silent failures). Verify that no file classified as a vendor original in
  intake item 5 was extracted as a business artifact, that the customization
  layer WAS included, and that the unresolved references in gaps-report match
  the missing-dependency list from intake item 2.
  ```

- [ ] **Gate:** All 4 quality checks pass. For any that fall short, fix the extractor (loop back to 0-C's validation loop) and re-run — proceeding to stage 2 with a failing check is forbidden.

### 1-B. (Branch B2) Document & Data KB (Path B) — only if intake items 7 (documents) and 4 (data) found material. If none, record one line in `triage.md` — "Path B skipped: rationale" — and skip

- [ ] Run the prompt

  ```
  Recursively scan and classify the document/data material from intake.md
  item 7 (and item 4) and produce
  knowledge-base/share/discovery-manifest.json in the analysis folder. Route
  source code and DB artifacts out of the document pipeline, and leave
  unsupported/unclassified files in Review_Later.md — throw nothing away
  silently. Compile the list of extraction candidates, then stop for my
  approval.
  ```

- [ ] After approval, run the prompt

  ```
  Extract the approved files per the toolkit's document extraction templates,
  producing KB_*.md under the analysis folder's knowledge-base/share/ and
  merging them into KB.md. Include field definitions, representative samples,
  and screen components.
  ```

- [ ] **Gate:** `discovery-manifest.json` + `KB.md` exist in `share/`; every unprocessed file is listed in `Review_Later.md` with a reason

---

## Stage 2 — REQUIREMENTS (BRD)

### 2-A. Scaffold

- [ ] Run the prompt

  ```
  Generate BRD scaffolds for everything extracted (the current slice, if
  slicing is in progress) (bun run.js 3, then generate the reports). Make
  sure missing dependencies finalized as stub/not-implemented in triage do
  not enter the BRDs as if they were implementation targets. If an existing
  BRD file shows enrichment traces (a reviewStatus: 'reviewed' useCase or
  non-empty openQuestions), do not overwrite it — write aside to
  .brd.scaffold.json instead. Verify that extraction-report.html renders in
  a browser.
  ```

### 2-B. Enrichment

- [ ] Run the prompt

  ```
  Merge share/KB.md (if it exists) into the scaffold BRDs and complete
  F{NNN}.brd.json under the analysis folder's knowledge-base/brd/ per the
  toolkit's BRD schema. Work in dependency order: master data/enumerations →
  shared components → business features → integrations. Mark source-only
  constructs and features with no Mendix counterpart as businessRules or
  openQuestions, and for modules with no KB coverage fill openQuestions with
  needs-business-confirmation items only — do not invent narratives.
  ```

### 2-C. Validation

- [ ] Run the prompt

  ```
  Validate all the BRDs just produced against the toolkit's BRD validation
  checklist — duplicates, code-vs-document conflicts, orphan concepts, broken
  relationships. Produce validation-report.md, fix the issues, and iterate
  until clean. Do not treat the gaps of modules without KB coverage as
  conflicts.
  ```

- [ ] **Gate:** Every `brd/*.brd.json` is validation-clean; the final `validation-report.md` has 0 issues

---

## Stage 3 — ARCHITECTURE & DESIGN

### 3-0. (Branch B3) Resolve the Multi-App Question ✋ — only if `triage.md` ④ raised the flag

- [ ] Decide "one Mendix app or several?" with the user and append the conclusion to `triage.md`. **Do not start 3-a before this decision** — the app-count question is upstream of the module-count question.

### 3-a. Module Boundaries ✋ (comes first)

- [ ] Run the prompt

  ```
  With the validated BRDs as input, decide this app's Mendix module count and
  boundaries per the toolkit's module boundary decision criteria. Do not copy
  the source's folder/module structure 1:1. Produce a rationale HTML
  document, get my approval, then finalize the approved boundaries as
  F{NNN}.mx-brd.json.
  ```

- [ ] **Gate ✋:** Rationale HTML + user approval + `brd/*.mx-brd.json` exist

### 3-b. Architecture Blueprint (after 3-a, parallelizable with 3-c)

- [ ] Run the prompt

  ```
  With the .mx-brd.json files as input, build the architecture blueprint —
  write the module definition documents, the architecture/dependency (wiring)
  diagrams, the fit-gap analysis, and the open-issues register to the
  analysis folder's architecture/. Raise every source-dependent capability
  that Mendix does not provide as a fit-gap item.
  ```

### 3-c. Design Artifacts (after 3-a, parallelizable with 3-b)

- [ ] Run the prompt

  ```
  From the source folder's screen material and the BRDs' pages/useCases,
  write a version-controlled design system and per-screen wireframes to the
  analysis folder's design/. Build them on the premise that stage 5's build
  screenshot verification will be checked against these wireframes.
  ```

- [ ] **Gate:** Module definitions + diagrams + fit-gap (including the open-issues register) + design system + wireframes for every target screen

---

## Stage 4 — BUILD PLAN ✋

- [ ] Run the prompt

  ```
  From the .mx-brd.json files + the stage 3 artifacts (dependency graph,
  fit-gap, open-issues register), write a numbered, dependency-ordered build
  plan to the analysis folder's architecture/build-plan.md (entities →
  associations → microflows → pages). Promote the open issues that need
  answers before script 01 runs into a pending-decisions list at the top of
  the plan.
  ```

- [ ] **Gate ✋:** The plan exists as the analysis folder's `architecture/build-plan.md` (a commit-excluded area — it must not appear in `git status`), the pending-decisions list is empty or fully answered, and the user has approved

---

## Stage 5 — BUILD (mxcli starts here)

### 5-0. Verify/Create the Target Project

- [ ] Prerequisite check: the two "reserved for stage 5" items of the P-2 tool check pass (Studio Pro, mxcli), and the project context's (`CLAUDE.local.md`) Baseline routing matches the toolkit's latest
- [ ] Run the prompt

  ```
  Verify the target Mendix project (.mpr) — if CLAUDE.local.md records a
  path, use it; otherwise look for a .mpr in the Mendix folder
  (mendix/<source folder name>/). If there still is none, create a new Mendix
  project in the Mendix folder using mxcli's project creation feature
  (compatible with the installed Studio Pro version, project name based on
  the source folder name). Before creating/opening, first check the toolkit's
  known mxcli bug log for issues around project creation/opening. After
  creation, verify the Mendix folder does not show up in git status (commit
  boundary working correctly), and record the verified/created .mpr path
  under CLAUDE.local.md's target .mpr entry. Open it in Studio Pro, confirm
  Run Locally succeeds in the empty state, then also record the local run
  URL/port in CLAUDE.local.md (used for the stale-build protocol's HTTP 200
  check).
  ```

- [ ] **Gate:** Target .mpr path + run URL recorded in `CLAUDE.local.md`, Mendix folder in commit-excluded state, empty project succeeds at Run Locally

### 5-1. Build Loop

- [ ] Run the prompt (repeat per build-plan script/module)

  ```
  Execute the next script of the analysis folder's
  architecture/build-plan.md against the target .mpr with mxcli, following
  the toolkit's iterative build loop gate order, and verify it. Before
  drafting any MDL, run the preflight the CLAUDE.local.md Baseline routing
  designates (checking against the STOP conditions) on all planned work, and
  if a CE error appears, first cross-check it against the toolkit's known
  mxcli bug log to see whether it is a known issue.
  ```

- [ ] Standing discipline (must be present in the project context `CLAUDE.local.md`'s Baseline routing; the agent applies it automatically):
  - CE error → check against the known mxcli bug log first. Record new bugs with reproduction steps
  - Before any screenshot, visual review, or UI test, the **stale-build protocol**: after `mxcli exec`, fully restart Studio Pro → Run Locally → confirm HTTP 200 → only then screenshot (the rule at the very top of the toolkit README)
  - Page verification is checked against the 3-c wireframes
- [ ] **Gate:** Every script of the build plan passes the iterative build loop's per-module gates (CE-error-free ≠ functionally correct — judged by the gate's verification items)

---

## Stage 6 — TEST

- [ ] Prerequisite check: the two "reserved for stage 6" items of the P-2 tool check pass (Playwright, DB access path)
- [ ] Run the prompt

  ```
  Stand up a Playwright test harness against the built app per the toolkit's
  E2E methodology, and write the golden-path tests (list/create/update/
  delete). Use the sample data from intake.md item 4 as seed data. Do the DB
  verification the toolkit's proven DB-assertion way, then add edge cases
  (empty values, duplicate keys, paging boundaries, unauthorized access).
  Report the run results verbatim as pass/fail.
  ```

- [ ] **Gate:** Golden path + edge cases + DB assertions all pass. Failures are fixed and re-run; declaring completion before everything passes is forbidden.

---

## Wrap-up — Feedback + Cleanup (after the conversion completes)

- [ ] Generic patterns proven in this project → promote into the toolkit's `skills/learned-*.md` and commit (leave the analysis folder's build plan and session notes in the commit-excluded area — never commit them wholesale)
- [ ] **Runbook defects** recorded along the way (points where this document's silence forced an improvised decision) → fix this template in the toolkit (`CONVERSION-RUNBOOK.md`) and commit
- [ ] Newly encountered mxcli bugs → add to the toolkit's mxcli bug log
- [ ] If a new stack pipeline was built: verify that the pipeline README and `source-{stack}.md` are in a state the next project can reuse as-is
- [ ] **Project area cleanup:** before starting the next conversion in this clone, decide with the user whether to archive/relocate/delete this conversion's source folder, analysis folder, Mendix folder, `CLAUDE.local.md`, and `.claude/agents/` — `CLAUDE.local.md` holds the facts of one conversion at a time.
