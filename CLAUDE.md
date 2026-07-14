# mxcli-project-toolkit — Claude Context

## What this repo is
Shared skills, prompt templates, and learnings for **Mendix migration and development projects**.
Used across all mxcli-powered projects — OS migrations, Java/Angular migrations, and other client integration work.

## Key skills and when to load them

Load skill files **on demand when the task calls for it** — not all upfront.

| Task | Read this file |
|------|---------------|
| Choosing the extraction pipeline (reuse vs build new — an extractor is always stood up, regardless of app size), checking extractor/mapper coverage, scoping a large source | `skills/source-triage.md` |
| Running or explaining the pipeline | `skills/migration-pipeline.md` |
| Deciding Mendix module boundaries (Phase 6, before `create module`) | `skills/modularize-domain.md` |
| Scanning/classifying an unstructured document folder | `skills/document-discovery.md` |
| Writing or enriching a BRD JSON | `skills/brd-generation.md` |
| Validating BRDs against code + doc KB, iterating to clean | `skills/brd-validation.md` |
| Extracting Excel/Word/PDF specs | `skills/kb-generation.md` |
| Understanding OS XML structure or concepts | `skills/source-os11.md` + `skills/os-xml-schema.md` |
| Writing MDL microflow scripts | `skills/mdl-cookbook-microflows.md` |
| Assessing a migration up front | `skills/assess-migration.md` |
| Generic (source-agnostic) migration guidance | `skills/migrate-general.md` |
| Migrating an OutSystems app | `skills/migrate-outsystems.md` |
| Diagnosing a mxcli CLI error | `bug-logs/mxcli-bugs.md` |
| Building the Playwright E2E suite after a build phase (golden path, edge cases, DB assertions) | `skills/e2e-harness-base.md` + `skills/learned-db-assertions.md` |
| Understanding past process decisions | `process/process-learnings.md` |
| Generating a conversion's project context `CLAUDE.local.md` (Baseline routing + project-specific facts) | `skills/bootstrap-project.md` |
| Setting up dev-process subagents (draft/gate/test) on a new project | `skills/agent-roles.md` |

## Conversion runbook (user-facing, not a skill)
`CONVERSION-RUNBOOK.md` (repo root) is the **user-facing** checklist of example prompts a human types into the agent, stage by stage (P → 0–6), to run any conversion end-to-end. It is not a skill — do not load it as task guidance. Runbook prompts intentionally contain **no skill paths**: when the user pastes a runbook stage prompt (a task with named outputs and gates), select and read the right skills yourself via the routing tables (the table above + Baseline routing), then execute the stage. Treat the runbook's gates (✋ = user sign-off required) as binding.

## Pipelines (extraction tooling — code lives in this repo)
The source-specific extraction pipelines now live **in this repo** under `pipelines/`:

| Source platform | Pipeline | Run |
|-----------------|----------|-----|
| OutSystems | `pipelines/outsystems/` (imported with history from the former `os-migration-pipeline` repo) | `cd pipelines/outsystems/pipeline && bun install` — see its `README.md` / `pipeline-guide.html` |
| Java + Angular / Spring Boot | `pipelines/java-angular/` | `cd pipelines/java-angular/pipeline && bun install` — see its `README.md` |

**JS toolchain is bun-only** (runtime + package manager + `bunx`) — do not assume node/npm are installed. `node_modules/` is gitignored — run `bun install` locally per pipeline. Curated sample outputs live under each pipeline (e.g. `pipelines/outsystems/sample-outputs/`).

## Running conversions (in-repo model)
Conversions run **inside this clone** — the toolkit repo itself is the working folder (see `CONVERSION-RUNBOOK.md`). Per-conversion areas are gitignored and never committed:
- `sources/<name>/` — source input, read-only
- `analysis/<name>/` — all analysis/design output (intake, KB, BRD, `architecture/` incl. build plan, `design/`, session notes)
- `mendix/<name>/` — target Mendix project (`.mpr`), created at stage 5-0 via mxcli
- `CLAUDE.local.md` (repo root) — per-conversion project context (paths, tool versions, project facts). **Never write project facts into this CLAUDE.md** — it is the toolkit's committed file; Claude Code auto-loads `CLAUDE.local.md` alongside it.
- `.claude/agents/` — per-project dev-process subagents

**Commit boundary:** only reusable assets are committed (skills, bug logs, runbook/pipeline improvements). The one tolerated local-only change to a tracked file is `pipelines/<x>/pipeline/config.json` local paths — never commit it. Any other project file showing in `git status` means the setup is broken (runbook P-1 item 4 fixes it).

**A conversion's build plan and session notes live in its `analysis/<name>/` area (gitignored), never in commits.** Promote a reusable pattern into `skills/learned-*.md` instead of committing a project's plan.

## Adding new skills
Create `skills/{topic}.md` with a `# Title`, `**Purpose:**`, and step-by-step guide.
Add it to the table above and commit. **If the skill applies on every MDL-writing session regardless of task** (universal discipline, not a phase-specific procedure), also add it to `README.md`'s "Baseline routing" table — that's the list every conversion copies into its project context `CLAUDE.local.md` (and update any in-progress conversion's `CLAUDE.local.md` too). A skill that only lives in the situational table here can go unnoticed by every conversion that isn't actively hunting for it.
