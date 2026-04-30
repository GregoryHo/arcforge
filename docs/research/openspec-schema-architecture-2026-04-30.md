# OpenSpec Schema Architecture — Field Verification Notes

**Date:** 2026-04-30
**Source:** `~/GitHub/AI/OpenSpec` (Fission-AI/OpenSpec, package version 1.3.0)
**Why this exists:** SDD v3 brainstorming for `spec-driven-refine` reached q3
(SoT direction for `sdd-schemas/*.md` files). The vault synthesis at
`[[arcforge-sdd-openspec-format-comparison]]` recorded a high-level convention
comparison but did not capture how OpenSpec actually maintains its schema
artifacts. Field verification was needed before re-framing q3 because the
prior option set (α/β/γ/δ) was constructed from an arcforge-internal lens
("how do we extend our auto-gen pipeline?") and missed OpenSpec's actual
architectural choice.

## File Layout (top-level OpenSpec source)

```
~/GitHub/AI/OpenSpec/
├── schemas/                              ← TOP-LEVEL, ships in npm `files`
│   └── spec-driven/
│       ├── schema.yaml                   ← Workflow contract (artifacts + deps + LLM instruction)
│       └── templates/                    ← Plain markdown starters
│           ├── proposal.md
│           ├── spec.md
│           ├── design.md
│           └── tasks.md
└── src/core/
    ├── artifact-graph/
    │   ├── schema.ts                     ← Zod parser/validator for schema.yaml (124 lines)
    │   └── types.ts                      ← Zod definitions for SchemaYaml shape
    ├── schemas/
    │   ├── base.schema.ts                ← Zod: RequirementSchema, ScenarioSchema (20 lines)
    │   ├── spec.schema.ts                ← Zod: SpecSchema (16 lines)
    │   └── change.schema.ts              ← Zod: ChangeSchema (41 lines)
    └── validation/
        ├── constants.ts                  ← VALIDATION_MESSAGES + length thresholds
        └── validator.ts                  ← Markdown parser + validator (459 lines)
```

`package.json` ships `schemas/` directory explicitly via the `files` array,
so `schemas/spec-driven/schema.yaml` reaches end users at install time. This
is the inverse of arcforge's approach where `sdd-schemas/*.md` lives under
`scripts/lib/` and ships transitively via `files: ["scripts/"]`.

## What schema.yaml Looks Like

`schemas/spec-driven/schema.yaml` defines four artifacts (proposal, specs,
design, tasks) and an `apply` phase. Each artifact carries:

- `id`: artifact identifier
- `generates`: file glob it produces
- `description`: short summary
- `template`: reference to a sibling template file
- **`instruction:`** a multi-line YAML string — **the LLM-facing prose
  contract for that artifact**
- `requires:` array of dependency artifact IDs

Excerpt from the `specs` artifact's `instruction:` field (verbatim, line
ranges 41-79 of `schema.yaml`):

```
Delta operations (use ## headers):
- **ADDED Requirements**: New capabilities
- **MODIFIED Requirements**: Changed behavior - MUST include full updated content
- **REMOVED Requirements**: Deprecated features - MUST include **Reason** and **Migration**
- **RENAMED Requirements**: Name changes only - use FROM:/TO: format

Format requirements:
- Each requirement: `### Requirement: <name>` followed by description
- Use SHALL/MUST for normative requirements (avoid should/may)
- Each scenario: `#### Scenario: <name>` with WHEN/THEN format
- **CRITICAL**: Scenarios MUST use exactly 4 hashtags (`####`).
  Using 3 hashtags or bullets will fail silently.
- Every requirement MUST have at least one scenario.
```

This prose is the contract LLMs read directly. There is no separate markdown
file derived from constants. The YAML file *is* the schema.

## How OpenSpec Validates Spec Content

A separate Zod-based pipeline parses generated markdown and structurally
validates it. From `src/core/schemas/base.schema.ts` (verbatim):

```typescript
export const RequirementSchema = z.object({
  text: z.string()
    .min(1, VALIDATION_MESSAGES.REQUIREMENT_EMPTY)
    .refine(
      (text) => text.includes('SHALL') || text.includes('MUST'),
      VALIDATION_MESSAGES.REQUIREMENT_NO_SHALL
    ),
  scenarios: z.array(ScenarioSchema)
    .min(1, VALIDATION_MESSAGES.REQUIREMENT_NO_SCENARIOS),
});
```

Notice: this Zod schema is **not generated from `schema.yaml`** and does
**not generate `schema.yaml`**. The two artifacts are independent sources,
each authoritative for its own concern:

- `schema.yaml` is authoritative for **what the LLM should produce** (prose
  guidance + workflow shape)
- Zod schemas are authoritative for **whether produced output is structurally
  valid** (post-parse runtime checks)

There is no parity test asserting these agree. The implicit contract is that
human maintainers keep both consistent when they diverge. Drift is accepted
as a tradeoff — each artifact lives in its natural form (prose for prose,
TypeScript for runtime checks).

## Multi-Tier Schema Resolver

Confirmed in `src/commands/schema.ts` (lines 53-78) and
`src/core/artifact-graph/resolver.ts`. Schema lookup walks three tiers in
priority order:

| Tier | Path |
|---|---|
| Project | `<project>/schemas/<name>/schema.yaml` |
| User | `~/.openspec/schemas/<name>/schema.yaml` |
| Package | `<install>/schemas/<name>/schema.yaml` |

This means a project can override the bundled `spec-driven` schema, and a
user can override at their global level. arcforge does not have an
equivalent mechanism — `sdd-schemas/*.md` is hardcoded inside the plugin
install with no override path.

## Templates Are Frozen Markdown

`schemas/spec-driven/templates/spec.md` and siblings are plain hand-written
markdown. They carry no `AUTO-GENERATED` header and are not derived from
any code. The LLM is instructed (via `schema.yaml`'s `instruction:` field)
to reference and adapt the template when authoring a new artifact. The
template is an example, not a parser input.

## Comparison Summary

| Dimension | OpenSpec | arcforge today |
|---|---|---|
| LLM-facing contract location | `schema.yaml`'s `instruction:` field (prose embedded in YAML) | `sdd-schemas/*.md` (separate markdown files) |
| Validator ↔ LLM-facing relationship | Independent parallel sources, no parity gate | `spec.md` and `design.md` auto-generated from JS constants; `decision-log.md` and `pending-conflict.md` hand-written (drift introduced this sprint) |
| Schema language | YAML + TypeScript Zod | JS POJO constants (`Object.freeze`'d) |
| Drift defense | None — accepted as cost | `print-schema.js` renders, contract test asserts byte-equality (proposed) |
| Multi-tier override | Project / user / package | Single tier (plugin install) |
| Template handling | Frozen markdown (`schemas/<name>/templates/`) | Embedded in skill prose |
| SHALL/MUST enforcement | Zod `.refine()` runtime check | sdd-validators mechanical check + skill prose |
| Distribution | `package.json` `files: ["schemas"]` explicit | `files: ["scripts/"]` transitive via `scripts/lib/sdd-schemas/` |

## Implication for arcforge SDD v3

OpenSpec's architecture demonstrates that **prose-as-source-of-truth** is a
viable alternative to **constants-as-source-of-truth**. The two approaches
trade different problems:

- **arcforge's current model** keeps validator and LLM-facing doc in lockstep
  (no drift), but forces narrative content (canonical paths, lifecycle
  prose) into JS constants where it sits awkwardly. The `decision-log.md`
  and `pending-conflict.md` files added this sprint are hand-written
  precisely because their prose-heavy nature resisted the constants-first
  approach — this is implementation drift from the v2.0.0 decision recorded
  at `[[arcforge-decision-spec-schema-formalization]]`.
- **OpenSpec's model** lets prose live in its natural form (markdown / YAML
  multi-line strings) but accepts validator/doc drift as the cost of
  expressiveness. The runtime Zod check is the safety net — if a generated
  spec violates structural rules, the parse fails regardless of whether the
  prose doc described that rule.

The vault decision note assumes arcforge's model is settled and v3 work is
mechanical extension. Field verification of OpenSpec changes that framing:
v3 has a real architectural choice between the two models, not a single
forward path.

## Open Questions Surfaced by This Verification

1. Whether the prose narrative in `decision-log.md` / `pending-conflict.md`
   (canonical path discussion, lifecycle semantics, deferral phrase
   listings) can be cleanly transplanted into JS constants as a `narrative`
   field, or whether forcing it would make the constants unmaintainable.
2. Whether arcforge needs a multi-tier override mechanism (project / user /
   plugin) for schemas, or if single-tier is sufficient given the plugin
   distribution model.
3. Whether the `print-schema.js` CLI is justified once the SoT direction is
   settled — under OpenSpec's model it disappears entirely; under
   constants-first model it stays as the rendering bridge.

## Sources

- `~/GitHub/AI/OpenSpec/schemas/spec-driven/schema.yaml` (full file, 154 lines)
- `~/GitHub/AI/OpenSpec/src/core/schemas/spec.schema.ts` (16 lines, full file)
- `~/GitHub/AI/OpenSpec/src/core/schemas/base.schema.ts` (20 lines, full file)
- `~/GitHub/AI/OpenSpec/src/core/validation/constants.ts` (49 lines, full file)
- `~/GitHub/AI/OpenSpec/src/core/artifact-graph/schema.ts` (124 lines, full file)
- `~/GitHub/AI/OpenSpec/src/core/artifact-graph/types.ts` (66 lines, full file)
- `~/GitHub/AI/OpenSpec/src/commands/schema.ts` (lines 1-80, multi-tier resolver)
- `~/GitHub/AI/OpenSpec/package.json` (lines 1-40, `files` array confirmation)
