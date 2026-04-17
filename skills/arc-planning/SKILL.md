---
name: arc-planning
description: Use when breaking down a structured spec into an executable DAG, when a spec has been refined and epics need to be defined, or when planning feature and epic structure for implementation
---

# Planner

## Overview

Convert a spec into an executable DAG with epic/feature breakdown. The DAG is a derived view — it is rebuilt from scratch each sprint, not incrementally maintained. Maintain strict 1:1 mapping for full traceability from spec requirements to implementation tasks.

**R2 Unidirectional:** Planner MUST NOT write to `specs/<spec-id>/spec.xml` or `specs/<spec-id>/details/`. Its only output paths are `specs/<spec-id>/dag.yaml` and `specs/<spec-id>/epics/`.

**Three-Layer Rule:** Planner MUST NOT read the design doc. It works from the spec only. The spec's `<delta>` metadata provides planning scope, making design doc access unnecessary (three-layer model: design doc → spec → DAG).

## When NOT to Use

- No spec.xml exists for the target spec-id (run `/arc-refining` first)
- Work fits in a single feature without cross-cutting dependencies

## Phase 0 — Locate Inputs

If the user has not provided a spec-id, scan `specs/` to present available targets and ask the user to choose.

Once you have the spec-id, all inputs come from `specs/<spec-id>/spec.xml` and the `specs/<spec-id>/details/` directory.

## Phase 1 — Input Validation

Before any decomposition, validate the spec programmatically using sdd-utils:

```bash
node -e "
  const fs = require('fs');
  const { parseSpecHeader, validateSpecHeader } = require('./scripts/lib/sdd-utils');
  const xml = fs.readFileSync('specs/<spec-id>/spec.xml', 'utf-8');
  const parsed = parseSpecHeader(xml);
  const result = validateSpecHeader(parsed);
  console.log(JSON.stringify(result, null, 2));
  if (parsed && parsed.delta) {
    const scope = [
      ...parsed.delta.added.map(x => x.ref),
      ...parsed.delta.modified.map(x => x.ref),
    ];
    console.log('Delta scope (added + modified):', scope);
    console.log('Renamed (use ref_new):', parsed.delta.renamed.map(x => x.ref_new));
    console.log('Removed (skip — no epic generated):', parsed.delta.removed.map(x => x.ref));
  } else if (parsed) {
    console.log('No delta — v1 spec. Plan all requirements.');
  }
"
```

- If `valid` is `false` and any issue has `level: "ERROR"` — **BLOCK**. Remediation: "Run refiner to produce a spec first." Do not proceed.
- If `valid` is `false` with only WARNINGs (e.g., broken `design_path`) — proceed but surface the warnings.
- If `valid` is `true` — proceed.

## Phase 2 — DAG Completion Gate

Before building a new DAG, check whether an existing one has incomplete work:

1. **`specs/<spec-id>/dag.yaml` does not exist** → proceed normally (first sprint for this spec).

2. **`specs/<spec-id>/dag.yaml` exists and all epics are `"completed"`** → archive the existing dag.yaml:
   ```bash
   mv specs/<spec-id>/dag.yaml specs/<spec-id>/dag.yaml.archive.$(date +%Y-%m-%d)
   ```
   Then proceed with new planning round.

3. **`specs/<spec-id>/dag.yaml` exists and any epic is NOT `"completed"`** → **BLOCK**:
   > ⚠️ Complete current sprint before iterating. N of M epics still incomplete.

   Do not write anything. Return control to the user.

## Phase 3 — Determine Planning Scope (Sprint Model)

The DAG is a derived view, rebuilt from scratch each sprint. Scope depends on whether a `<delta>` element exists in spec.xml:

### v1 spec (no delta)

Plan all requirements from all detail files in `specs/<spec-id>/details/`.

### v2+ spec (delta present)

Scope = requirements in `added` + `modified` only:

```
planning scope = [...parsed.delta.added, ...parsed.delta.modified].map(x => x.ref)
```

- **Added requirements** (`<added ref="...">`) — generate epics normally.
- **Modified requirements** (`<modified ref="...">`) — generate epics for the updated behavior.
- **Removed requirements** (`<removed ref="...">`) — skip. Do NOT generate an epic.
- **Renamed requirements** (`<renamed ref_old="..." ref_new="...">`) — use `ref_new` as the feature's `source_requirement`. The requirement still exists under its new id; the rename is a semantic change, not a removal.

## Mapping Rules

| Spec Level | Planner Level | Ratio |
|------------|---------------|-------|
| `<detail>` | Epic | 1:1 (large detail may split into multiple epics) |
| `<requirement>` | Feature | 1:1 strict |
| `<dependency ref>` | `depends_on` | Auto-derive |

Each `<requirement>` maps to exactly one feature. The feature's `source_requirement` field MUST reference the spec requirement ID.

## Phase 4 — Build DAG In Memory (Two-Pass Write)

Build the complete `dag.yaml` and all `epics/` **in memory** before writing any file to disk. This is the two-pass write pattern: build in memory → validate → write only if valid.

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

### dag.yaml structure

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

## Phase 5 — Output Validation

Before writing to disk, validate the in-memory DAG:

- [ ] Every `<detail>` in the scope maps to ≥1 epic
- [ ] Every requirement in scope maps to exactly 1 feature with a valid `source_requirement`
- [ ] All required fields present: `id`, `status`, `source_requirement` per feature
- [ ] No circular dependencies — if a cycle is found, STOP and ask user
- [ ] All `depends_on` references point to existing epic/feature IDs within the DAG
- [ ] All `source_requirement` values correspond to real requirement IDs in `specs/<spec-id>/details/`

If validation finds ERRORs, report all findings with remediation and **do not write any files**.

## Done Signal

A planning round is done when all epics in `specs/<spec-id>/dag.yaml` are in `"completed"` status. This means the current sprint is fully implemented and the DAG is archivable (see Phase 2 — archive on next run).

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
- sprint scope: delta (added: N, modified: N) | all requirements (v1)
- Epics: N
- Features: N
- DAG validated: no cycles
- Output: `specs/<spec-id>/dag.yaml` + epics/ (committed)
- Ready for: `/arc-coordinating` or `/arc-implementing`

## Blocked Format

⚠️ Planner blocked
- spec-id: `<spec-id>`
- reason: [invalid spec header | incomplete sprint | circular dependency | output validation errors]
- details: [specific error or cycle]
- action: [remediation — e.g., run refiner | complete current sprint | resolve cycle]

## Red Flags — Stop

- "I'll break the cycle arbitrarily"
- "Let implementer figure it out"
- "Close enough mapping"
- "I'll read the design doc for context"

**Cycles must be resolved by user, not guessed. Planner reads spec only.**
