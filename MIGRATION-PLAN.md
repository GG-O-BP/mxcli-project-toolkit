# Toolkit Consolidation Plan

**Goal:** merge the two source-specific migration pipelines into this repo (`mxcli-project-toolkit`) so the whole migration capability — reusable skills + extraction pipelines + curated examples — lives in one reusable, shareable place.

**Status:** planned, not yet executed. Nothing is moved/committed until the owner says go.
**Owner:** MendixMau · **Drafted:** 2026-07-03

---

## Current state

| Repo / folder | Git? | Remote | Size | Real content |
|---|---|---|---|---|
| `mxcli-project-toolkit` (this repo) | ✅ repo | `MendixMau/mxcli-project-toolkit` (16 commits) | 732K | 22 skills + `bug-logs/`, `process/`, `examples/` |
| `os-migration-pipeline` | ✅ repo | `MendixMau/os-migration-pipeline` (7 commits) | 4.1M | pipeline code (292K) + 3.1M `sample-outputs/` + 2 skills |
| `java-angular-migration-skills` | ❌ no git | — | 42M | pipeline code; **42M is all `pipeline/node_modules/`**; `skills/` empty |
| `IVM-SourceCodeAnalysis/` | ❌ no git | — | 83M | a *workspace* mixing tools + `analysis/` + `sources/` (project output) |

**Key facts driving the plan:**
- No skill-name collisions across the three `skills/` dirs → merging skills is safe.
- The Java/Angular 42M is entirely `node_modules` → must be gitignored, never committed.
- OS history is worth keeping: 7 commits including the `isPersistent` mapper fix, the output-redirect feature, and the sample outputs (which double as examples).

---

## Decisions (settled)

1. **Repo name:** keep `mxcli-project-toolkit` (zero path changes in consuming projects).
2. **OS history:** preserve it via `git subtree` (brings the 7 commits + `sample-outputs/`).
3. **Consumption model:** **reference model** is the default (everyone clones the toolkit once to `~/Mendix/mxcli-project-toolkit`; projects reference it by path — no copies, so no drift). Git **submodule** is the documented option only for a self-contained handoff (e.g. a repo given to a client who won't clone the toolkit separately).
4. **Old repos:** archive `os-migration-pipeline` on GitHub *after* it is merged in; the Java/Angular folder is removed once copied.

**The one rule to enforce hard:** this repo holds **tools + skills + small curated examples only — never project output** (`analysis/`, `sources/`, extracted KBs, `*.mpr`). Enforced via `.gitignore`.

---

## Target structure

```
mxcli-project-toolkit/
  README.md                 ← what this is + how to consume (reference model)
  CLAUDE.md                 ← routing table covering ALL skills
  MIGRATION-PLAN.md         ← this file (delete after execution, or keep as record)
  .gitignore                ← node_modules, .venv, dist, target, /workspaces, *.mpr*, project output
  skills/                   ← ALL reusable skills merged (22 + OS's 2 + future)
  pipelines/
    outsystems/             ← from os-migration-pipeline (code + sample-outputs)
    java-angular/           ← from java-angular-migration-skills (code; node_modules gitignored)
  examples/                 ← small curated sample outputs
  bug-logs/   process/
```

---

## Execution steps (history-preserving; destructive actions last)

1. **Prep `.gitignore` FIRST** — add `node_modules/`, `.venv/`, `venv/`, `dist/`, `target/`, `__pycache__/`, `/workspaces/`, `*.mpr`, `*.mpr.backup`, project-output dirs. Commit. (Must land before any import so junk never enters history.)
2. **Import OutSystems with history:**
   `git subtree add --prefix=pipelines/outsystems https://github.com/MendixMau/os-migration-pipeline.git master`
3. **Import Java/Angular (no history):** copy the tree **excluding `node_modules/`** into `pipelines/java-angular/`; `git add` (commit `package.json` + lockfile so consumers run `npm install`).
4. **Merge skills:** move `pipelines/*/skills/*.md` up into top-level `skills/` (safe — no collisions). Keep source-specific names (`source-os11.md`, `source-java-spring-angular.md`, …).
5. **Reconcile meta files:** fold each pipeline's `CLAUDE.md` / `README.md` into the root routing table + README; remove the redundant nested ones.
6. **Fix cross-references:** update skill links that assumed separate repos; verify consuming projects' CLAUDE.md still resolve (path unchanged → they do).
7. **Verify:** `npm install` works in each `pipelines/*`; `grep` for dangling links; repo size sane (node_modules excluded).
8. **Cleanup (destructive — last):**
   - Archive `os-migration-pipeline` on GitHub with a README pointing here.
   - Delete the standalone `java-angular-migration-skills` folder (now under `pipelines/java-angular/`).
   - Replace the OutSystems project's **copy** of the toolkit with a path reference (kill the drift).

---

## Consumption model (for the README)

**Reference model (default):**
```
git clone https://github.com/MendixMau/mxcli-project-toolkit.git ~/Mendix/mxcli-project-toolkit
```
Every migration project's CLAUDE.md points at `~/Mendix/mxcli-project-toolkit`. One clone, one source of truth, no drift. Pull updates with `git pull`.

**Submodule (self-contained handoff only):**
```
git submodule add https://github.com/MendixMau/mxcli-project-toolkit.git toolkit
# teammates: git clone --recurse-submodules …   /   update: git submodule update --remote
```
Pins an exact version and ships it inside the project.

**Per-pipeline setup:** `cd pipelines/<x> && npm install` (node_modules stays local, gitignored).
**Project work happens in a separate workspace dir that references this repo — never inside it.**

---

## Verification checklist

- [ ] `.gitignore` committed before any import; `node_modules/` never appears in `git status`.
- [ ] OS history present (`git log` shows the 7 commits under `pipelines/outsystems/`).
- [ ] All skills in one `skills/` dir; no broken cross-references.
- [ ] `npm install` succeeds in each pipeline.
- [ ] Repo size reasonable (single-digit MB).
- [ ] `os-migration-pipeline` archived with redirect; toolkit copy in OutSystems project replaced by a reference.
```
