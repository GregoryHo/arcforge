# Spec Structure Reference (for arc-refining)

Detailed schema material extracted from `arc-refining/SKILL.md`. Read this
when you are about to write `spec.xml` + `details/*.xml` and need the
exact field contracts. The SKILL.md body covers decision logic (gates,
delta accumulation rules, two-pass write); this file covers the
*structural* rules (what fields exist, what shape they take).

**When to load:** Phase 5 of arc-refining, just before building the
in-memory spec. The authoritative schema is still
`${ARCFORGE_ROOT}/scripts/lib/sdd-schemas/spec.md` (enforced by
`${ARCFORGE_ROOT}/scripts/lib/sdd-utils.js`); this reference is a
working subset the refiner skill needs at hand.

---

## Identity Header (always required)

Every `specs/<spec-id>/spec.xml` must have an `<overview>` identity header with:

| Field | Rule |
|---|---|
| `spec_id` | kebab-case; MUST match the folder name under `specs/` |
| `spec_version` | starts at 1 for first formalization; increments for each iteration |
| `status` | always `"active"` |
| `title` | human-readable name |
| `description` | strategic purpose — WHY this spec exists, not a scope summary |
| `source/design_path` | path to the exact design doc file |
| `source/design_iteration` | ISO date prefix (YYYY-MM-DD) matching the design doc folder |
| `supersedes` | required for v2+; format: `<spec-id>:v<previous-version>` |
| `scope` | `<includes>` with `<feature id="...">` elements; `<excludes>` recommended |

Version-increment semantics on iteration (spec_version bump, supersedes format, where source/* points) are **decision logic** and live in `arc-refining/SKILL.md` Phase 5, not here.

---

## Per-Spec Directory Structure

```
specs/
└── <spec-id>/
    ├── spec.xml              # identity header + accumulated <delta> elements + details index
    └── details/
        ├── feature-a.xml
        └── feature-b.xml
```

Each `specs/<spec-id>/` folder is self-contained. Detail files MUST NOT reference requirements from other spec folders.

---

## Detail File — Requirement Rules

Each `<requirement>` in a detail file must have:

- `id` attribute — unique across all detail files; format `fr-<domain>-NNN`
- `<title>` — short name
- `<description>` — what the system must do
- `<acceptance_criteria>` — at least one `<criterion>` with a `<trace>` element

Criterion text MUST follow Given/When/Then pattern. Use RFC 2119 keywords (MUST/SHALL/SHOULD/MAY).

---

## Unchanged Requirements (when prior spec exists)

Requirements NOT affected by the design doc's Change Intent MUST remain unchanged in the output. Only ADDED / MODIFIED / REMOVED / RENAMED requirements change. Copy every other requirement verbatim from the prior spec's detail files into the new detail files.

---

## Authoritative source

Anything this reference says is subordinate to `${ARCFORGE_ROOT}/scripts/lib/sdd-schemas/spec.md` — the canonical schema doc enforced by `validateSpecHeader` in `${ARCFORGE_ROOT}/scripts/lib/sdd-utils.js`. If this file and the schema disagree, the schema wins.
