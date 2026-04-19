---
name: arc-planning
description: Use when breaking down a structured spec into an executable DAG, when a spec has been refined and epics need to be defined, or when planning feature and epic structure for implementation
---

# Planner

## Overview

Convert a spec into an executable DAG with epic/feature breakdown. The DAG is a derived view, rebuilt from scratch each sprint, never archived. The planner is a **pure function**:

```
(spec + delta) → (dag.yaml + epics/)
```

No state preservation. No archive. No gate. No side effects beyond the output paths. The DAG is disposable per sprint — historical traceability lives in the spec's accumulated `<delta>` elements and in `docs/plans/<spec-id>/<iteration>/design.md` folders, not in archived DAGs.

**R2 Unidirectional:** Planner MUST NOT write to `specs/<spec-id>/spec.xml` or `specs/<spec-id>/details/`. Its only output paths are `specs/<spec-id>/dag.yaml` and `specs/<spec-id>/epics/`.

**Three-Layer Rule:** Planner MUST NOT read the design doc. It works from the spec only. The spec's `<delta>` metadata provides planning scope, making design doc access unnecessary (three-layer model: design doc → spec → DAG).

**No gate here.** The DAG completion gate that prevents iterating on an incomplete sprint lives in `arc-refining`, not here. By the time the planner runs, the refiner has already certified the prior sprint is complete (or this is v1). Planner trusts that and overwrites.

## When NOT to Use

- No spec.xml exists for the target spec-id (run `/arc-refining` first)
- Work fits in a single feature without cross-cutting dependencies

## Phase 0 — Locate Inputs

If the user has not provided a spec-id, scan `specs/` to present available targets and ask the user to choose.

Once you have the spec-id, all inputs come from `specs/<spec-id>/spec.xml` and the `specs/<spec-id>/details/` directory.

## Phase 1 — Input Validation and Scope Extraction

Validate the spec programmatically using sdd-utils, and extract the current sprint's scope from the latest `<delta>`:

```bash
node -e "
  const fs = require('fs');
  const { parseSpecHeader, validateSpecHeader } = require('./scripts/lib/sdd-utils');
  const xml = fs.readFileSync('specs/<spec-id>/spec.xml', 'utf-8');
  const parsed = parseSpecHeader(xml);
  const result = validateSpecHeader(parsed);
  console.log(JSON.stringify(result, null, 2));
  if (parsed && parsed.latest_delta) {
    const d = parsed.latest_delta;
    console.log('Sprint version:', d.version, 'iteration:', d.iteration);
    console.log('Added (implement epics):', d.added.map(x => x.ref));
    console.log('Modified (update epics):', d.modified.map(x => x.ref));
    console.log('Removed (teardown epics):', d.removed.map(x => x.ref));
    console.log('Renamed (mechanical refactor epics):', d.renamed.map(x => x.ref_old + '→' + x.ref_new));
  } else if (parsed) {
    console.log('No delta — v1 spec. Plan all requirements in detail files.');
  }
"
```

- If `valid` is `false` and any issue has `level: 'ERROR'` — **BLOCK**. Remediation: "Run refiner to produce a spec first." Do not proceed.
- If `valid` is `false` with only WARNINGs (e.g., broken `design_path`) — proceed but surface the warnings.
- If `valid` is `true` — proceed.

The scope-extraction snippet uses `parsed.latest_delta` (the highest-version delta — equivalent to the last child of `<overview>`). Earlier `<delta>` elements are historical record of prior sprints; the planner ignores them.

## Phase 2 — Determine Planning Scope

The DAG is rebuilt from scratch each sprint. Scope depends on whether a `<delta>` element exists in `spec.xml`:

### v1 spec (no delta anywhere in `<overview>`)

Plan all requirements from all detail files in `specs/<spec-id>/details/`. Every `<requirement>` becomes a feature.

### v2+ spec (one or more `<delta>` elements)

Read `parsed.latest_delta` — the delta whose `version` equals the current `spec_version`. Every child of that delta generates exactly one epic:

| Delta child | Epic semantics | source_requirement |
|---|---|---|
| `<added ref="X">` | Implement new requirement X | `X` (new in current detail files) |
| `<modified ref="X">` | Update existing implementation of X to match changed behavior | `X` (still in current detail files, definition changed) |
| `<removed ref="X"><reason>...</reason></removed>` | **Teardown epic.** Implementer LLM greps the codebase for X and removes tied code. The `<reason>` and optional `<migration>` from the delta inform teardown approach (security removal → strict; deprecation with consumers → leave shim). X no longer exists in current detail files; the epic references it as a removed id. | `X` (removed — flag the epic as a teardown epic so implementer skips spec lookup and works from delta context) |
| `<renamed ref_old="X" ref_new="Y">` | **Mechanical refactor epic.** Grep + replace refs from X to Y across the codebase. Body unchanged — semantic changes are forbidden in `<renamed>`. | `Y` (the new id; Y exists in current detail files) |

### Pure-teardown sprint is legal (D8)

A `<delta>` containing only `<removed>` children — a deprecation sprint, compliance teardown, or legacy cleanup — is a legitimate sprint. The planner does NOT inspect the *shape* of a delta (no "must contain at least one `<added>`" check). It enforces per-child correctness only. Emit teardown epics and proceed.

## Mapping Rules

| Spec Level | Planner Level | Ratio |
|------------|---------------|-------|
| `<detail>` | Epic | 1:1 (large detail may split into multiple epics) |
| `<requirement>` | Feature | 1:1 strict |
| `<dependency ref>` | `depends_on` | Auto-derive |

Each `<requirement>` maps to exactly one feature. The feature's `source_requirement` field MUST reference the spec requirement ID (or, for `<removed>` epics, the removed-id from the delta).

## Phase 3 — Build DAG In Memory (Two-Pass Write)

Build the complete `dag.yaml` and all `epics/` **in memory** before writing any file to disk. Build → validate → write only if valid.

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

### feature.md minimal example

```markdown
# Feature: auth-login

## Source
- Requirement: FR-AUTH-001
- Detail: authentication.xml

## Dependencies
- auth-schema (must complete first)

## Acceptance Criteria
- [ ] POST /login accepts {email, password}
- [ ] Returns 200 + JWT on valid credentials
- [ ] Returns 401 on invalid credentials
```

### Overwrite, never archive

If `specs/<spec-id>/dag.yaml` already exists, planner MUST overwrite it. Planner MUST NOT write any archive sibling file (no date-suffixed copy, no `.bak`, no `archive/` subdirectory) and MUST NOT move the previous `dag.yaml` to a backup location with `mv`. Previous epic statuses MUST NOT carry over — every epic in the new DAG starts in `"pending"`. The git history of `dag.yaml` is the only retroactive trace of prior DAGs; arcforge does not treat git as part of its contract but does not prevent inspection.

## Infrastructure Commands

**Set SKILL_ROOT** from skill loader header (`# SKILL_ROOT: ...`):
```bash
: "${SKILL_ROOT:=${ARCFORGE_ROOT:-}/skills/arc-planning}"
if [ ! -d "$SKILL_ROOT" ]; then
  echo "ERROR: SKILL_ROOT=$SKILL_ROOT does not exist. Set ARCFORGE_ROOT or SKILL_ROOT manually." >&2
  exit 1
fi
```

To view the full schema and example, run:
```bash
# View schema with field descriptions
node "${SKILL_ROOT}/scripts/planner.js" schema

# View complete example
node "${SKILL_ROOT}/scripts/planner.js" schema --example

# View as JSON (for programmatic use)
node "${SKILL_ROOT}/scripts/planner.js" schema --json
```

Example dag.yaml:
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

All epics start in `"pending"` status. Previous statuses MUST NOT carry over — the DAG is always built fresh.

## Phase 4 — Output Validation

Before writing to disk, validate the in-memory DAG:

- [ ] Every `<detail>` covered by the sprint scope maps to ≥1 epic
- [ ] Every requirement in scope maps to exactly 1 feature with a valid `source_requirement`
- [ ] All required fields present: `id`, `status`, `source_requirement` per feature
- [ ] No circular dependencies — if a cycle is found, STOP and ask user
- [ ] All `depends_on` references point to existing epic/feature IDs within the DAG
- [ ] All `source_requirement` values either correspond to real requirement IDs in `specs/<spec-id>/details/` (added/modified/renamed cases) or reference an id from the delta's `<removed>` (teardown case)

If validation finds ERRORs, report all findings with remediation and **do not write any files**.

## Done Signal

A planning round is done when all epics in `specs/<spec-id>/dag.yaml` are in `"completed"` status. This means the current sprint is fully implemented. The next refiner run will see all epics completed and unblock the next iteration. The next planner run will overwrite this DAG without preserving any prior state.

## Commit Requirements

After writing files:

```
git add specs/<spec-id>/dag.yaml specs/<spec-id>/epics/
git commit -m "docs: plan epics and features for <spec-id>"
```

**Circular dependency = STOP, ask user.** Cycles must be resolved by the user, not guessed.

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

Note: planner does not block on incomplete prior sprints. That gate lives in `arc-refining` (per fr-rf-012). If you find yourself wanting to add a completion gate here, instead fix the refiner — it should never have allowed iteration to v(N+1) while v(N)'s sprint was still running.

## Red Flags — Stop

- "I'll break the cycle arbitrarily"
- "Let implementer figure it out"
- "Close enough mapping"
- "I'll read the design doc for context"
- "I'll archive the old dag.yaml just in case"
- "I'll add a gate so we don't overwrite an in-progress DAG"

**Cycles must be resolved by user, not guessed. Planner reads spec only. No archive. No gate.**
