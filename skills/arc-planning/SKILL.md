---
name: arc-planning
description: Use when breaking down a structured spec into an executable DAG, when a spec has been refined and epics need to be defined, or when planning feature and epic structure for implementation
---

# Planner

## Iron Law

**PLANNER IS A PURE FUNCTION. DAG IS DISPOSABLE.**

No state preservation. No archive. No gate. No reading the design doc. Overwrite `dag.yaml` every sprint — git history is the only retroactive trace. If you find yourself wanting to add state, an archive file, or a completion check, stop and surface the underlying need to the user instead.

**REQUIRED BACKGROUND:** Read `${ARCFORGE_ROOT}/scripts/lib/sdd-schemas/spec.md` before building any `dag.yaml` — you need the `<delta>` element structure (multi-delta accumulation, four child types with epic semantics) to correctly extract sprint scope from the current `spec_version`'s delta.

## Overview

Convert a spec into an executable DAG with epic/feature breakdown. The DAG is a derived view, rebuilt from scratch each sprint, never archived:

```
(spec + delta) → (dag.yaml + epics/)
```

Historical traceability lives in the spec's accumulated `<delta>` elements and in `docs/plans/<spec-id>/<iteration>/design.md` folders, not in archived DAGs.

- **R2 Unidirectional:** Planner MUST NOT write to `specs/<spec-id>/spec.xml` or `specs/<spec-id>/details/`. Its only output paths are `specs/<spec-id>/dag.yaml` and `specs/<spec-id>/epics/`.
- **Three-Layer Rule:** Planner MUST NOT read the design doc. It works from the spec only; the spec's `<delta>` metadata provides planning scope (three-layer model: design doc → spec → DAG).
- **No gate here.** The DAG completion gate lives in `arc-refining`. By the time the planner runs, the refiner has already certified the prior sprint complete (or this is v1). Planner trusts that and overwrites.

## When NOT to Use

- No spec.xml exists for the target spec-id (run `/arc-refining` first)
- Work fits in a single feature without cross-cutting dependencies

## Phase 0 — Locate Inputs

If the user has not provided a spec-id, scan `specs/` to present available targets and ask the user to choose. Once you have the spec-id, all inputs come from `specs/<spec-id>/spec.xml` and the `specs/<spec-id>/details/` directory.

## Phase 1 — Input Validation and Scope Extraction

Validate the spec and read the current sprint's scope from the `header` gate's stable JSON (the gate parses `spec.xml` and emits both validation result and parsed header):

```bash
: "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"
node "${ARCFORGE_ROOT}/scripts/cli.js" sdd-gate header --spec-id <spec-id> \
  --draft specs/<spec-id>/spec.xml
```

- `status: "block"` (exit 1, any issue `level: "ERROR"`) — **BLOCK**. Remediation: "Run refiner to produce a spec first." Do not proceed.
- `status: "pass"` (exit 0) with WARNING issues (e.g., broken `design_path`) — proceed but surface the warnings.
- `status: "pass"` (exit 0) with no issues — proceed.

Read sprint scope from `header.latest_delta`:

| JSON field | Planner reads it as |
|---|---|
| `header.latest_delta.version` / `.iteration` | Current sprint identity |
| `header.latest_delta.added[].ref` | Implement epics |
| `header.latest_delta.modified[].ref` | Update epics |
| `header.latest_delta.removed[].ref` | Teardown epics |
| `header.latest_delta.renamed[]` (`ref_old` → `ref_new`) | Mechanical refactor epics |

`header.latest_delta` is the highest-version delta (the last child of `<overview>`). When it is `null`, the spec is v1 — plan all requirements in the detail files. Earlier `<delta>` elements are historical record; the planner ignores them.

## Phase 2 — Determine Planning Scope

Scope depends on whether a `<delta>` element exists in `spec.xml`.

### v1 spec (no delta anywhere in `<overview>`)

Plan all requirements from all detail files in `specs/<spec-id>/details/`. Every `<requirement>` becomes a feature.

### v2+ spec (one or more `<delta>` elements)

Read `header.latest_delta` — the delta whose `version` equals the current `spec_version`. Every child of that delta generates exactly one epic:

| Delta child | Epic semantics | source_requirement |
|---|---|---|
| `<added ref="X">` | Implement new requirement X | `X` (new in current detail files) |
| `<modified ref="X">` | Update existing implementation of X to match changed behavior | `X` (still in current detail files, definition changed) |
| `<removed ref="X"><reason>...</reason></removed>` | **Teardown epic.** Implementer LLM greps the codebase for X and removes tied code. The `<reason>` and optional `<migration>` inform teardown approach (security removal → strict; deprecation with consumers → leave shim). | `X` (removed — flag the epic as a teardown epic so implementer skips spec lookup and works from delta context) |
| `<renamed ref_old="X" ref_new="Y">` | **Mechanical refactor epic.** Grep + replace refs from X to Y across the codebase. Body unchanged — semantic changes are forbidden in `<renamed>`. | `Y` (the new id; Y exists in current detail files) |

**Pure-teardown sprint is legal.** A `<delta>` containing only `<removed>` children is a legitimate sprint. The planner does NOT inspect the *shape* of a delta (no "must contain at least one `<added>`" check); it enforces per-child correctness only. Emit teardown epics and proceed.

## Mapping Rules

| Spec Level | Planner Level | Ratio |
|------------|---------------|-------|
| `<detail>` | Epic | 1:1 (large detail may split into multiple epics) |
| `<requirement>` | Feature | 1:1 strict |
| `<dependency ref>` | `depends_on` | Auto-derive |

Each `<requirement>` maps to exactly one feature. The feature's `source_requirement` field MUST reference the spec requirement ID (or, for `<removed>` epics, the removed-id from the delta).

## Phase 3 — Build DAG In Memory (Two-Pass Write)

Build the complete `dag.yaml` and all `epics/` **in memory** before writing any file. Build → validate → write only if valid.

### Output Structure

```
specs/<spec-id>/
├── dag.yaml                     # Epic/Feature DAG
└── epics/
    ├── epic-auth/
    │   ├── epic.md              # Epic overview: title, description, feature list
    │   └── features/
    │       ├── auth-login.md
    │       └── auth-register.md
    └── epic-api/
        └── ...
```

### Infrastructure Commands

Set `SKILL_ROOT` (derives from `ARCFORGE_ROOT` — set by the Claude Code hook, or the fallback default below on other platforms), then view the full schema and example:

```bash
: "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"
: "${SKILL_ROOT:=$ARCFORGE_ROOT/skills/arc-planning}"
if [ ! -d "$SKILL_ROOT" ]; then
  echo "ERROR: SKILL_ROOT=$SKILL_ROOT does not exist. Set ARCFORGE_ROOT or SKILL_ROOT manually." >&2
  exit 1
fi
node "${SKILL_ROOT}/scripts/planner.js" schema            # schema with field descriptions
node "${SKILL_ROOT}/scripts/planner.js" schema --example  # complete feature.md + dag.yaml example
node "${SKILL_ROOT}/scripts/planner.js" schema --json     # JSON for programmatic use
```

Example `dag.yaml`:

```yaml
epics:
  - id: "epic-auth"
    name: "Authentication System"
    status: "pending"
    spec_path: "specs/<spec-id>/epics/epic-auth/epic.md"
    worktree: null
    depends_on: []
    features:
      - id: "auth-login"
        name: "User Login"
        status: "pending"
        source_requirement: "FR-AUTH-001"
        depends_on: []
      - id: "auth-logout"
        name: "User Logout"
        status: "pending"
        source_requirement: "FR-AUTH-002"
        depends_on: ["auth-login"]
```

### Overwrite, never archive

If `specs/<spec-id>/dag.yaml` already exists, planner MUST overwrite it. Planner MUST NOT write any archive sibling (no date-suffixed copy, no `.bak`, no `archive/` subdirectory) and MUST NOT `mv` the previous `dag.yaml` to a backup. Previous epic statuses MUST NOT carry over — every epic in the new DAG starts in `"pending"`. The git history of `dag.yaml` is the only retroactive trace of prior DAGs.

## Phase 4 — Output Validation

Before writing to disk, validate the in-memory DAG:

- [ ] Every `<detail>` covered by the sprint scope maps to ≥1 epic
- [ ] Every requirement in scope maps to exactly 1 feature with a valid `source_requirement`
- [ ] All required fields present: `id`, `status`, `source_requirement` per feature
- [ ] No circular dependencies — if a cycle is found, STOP and ask user
- [ ] All `depends_on` references point to existing epic/feature IDs within the DAG
- [ ] All `source_requirement` values correspond to real requirement IDs in `specs/<spec-id>/details/` (added/modified/renamed) or reference a `<removed>` id from the delta (teardown)

If validation finds ERRORs, report all findings with remediation and **do not write any files**.

## Done Signal

A planning round is done when all epics in `specs/<spec-id>/dag.yaml` reach `"completed"` status. The next refiner run then unblocks the next iteration; the next planner run overwrites this DAG without preserving prior state.

## Commit Requirements

After writing files:

```
git add specs/<spec-id>/dag.yaml specs/<spec-id>/epics/
git commit -m "docs: plan epics and features for <spec-id>"
```

## After This Skill

Hand off to `/arc-coordinating` (multi-epic projects requiring worktree isolation) or `/arc-implementing` (single-epic or straightforward implementation).

## Completion Format

✅ Planner complete
- spec-id: `<spec-id>`
- sprint scope: delta v`<N>` (added: N, modified: N, removed: N, renamed: N) | all requirements (v1)
- Epics: N (overwrote prior dag.yaml; no archive written)
- Features: N
- DAG validated: no cycles
- Output: `specs/<spec-id>/dag.yaml` + epics/ (committed)
- Ready for: `/arc-coordinating` or `/arc-implementing`

## Blocked Format

⚠️ Planner blocked
- spec-id: `<spec-id>`
- reason: [invalid spec header | circular dependency | output validation errors]
- details: [specific error or cycle]
- action: [remediation — e.g., run refiner | resolve cycle]

## Red Flags — Stop

- "I'll break the cycle arbitrarily" / "Let implementer figure it out" / "Close enough mapping"
- "I'll read the design doc for context"
- "I'll archive the old dag.yaml just in case"
- "I'll add a gate so we don't overwrite an in-progress DAG"

**Cycles must be resolved by the user, not guessed. Planner reads spec only. No archive. No gate** — if you want a completion gate, fix the refiner instead (it should never allow iteration to v(N+1) while v(N)'s sprint is still running).
