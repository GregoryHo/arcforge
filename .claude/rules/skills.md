---
paths:
  - "skills/**"
  - "tests/skills/**"
---

# Skills (contributor quick reference)

v6 rewrite in progress — see `docs/plans/v6/PLAN.md`. This file holds the
contributor-side conventions only; it is not the authoring methodology.

## Where the authority lives

| Question | Canonical source |
|---|---|
| What frontmatter is legal | `docs/plans/v6/decisions/skill-schema.md` (**frozen** — do not redefine, restate, or extend it elsewhere) |
| Is my skill structurally valid | `tests/skills/test_skill_structure.py` (the mechanical form of the schema) |
| Which skills exist and when | `docs/plans/v6/PLAN.md` (phase table) |
| How to write a good skill | `skills/core/writing-skills/` (v6 meta skill, landed in P3) — the authoring methodology. The schema doc stays authoritative for the fields themselves. |

Required frontmatter is `name` + `description`; the optional field set is
enumerated in the schema doc and nowhere else. `name` must equal the directory
name, with no `arc-` prefix (D7).

## Self-containment (D1)

A skill directory is a closed unit: nothing under `skills/<bucket>/<name>/` may
require / import / source outside that directory, and skill prose must not name
engine internals (`scripts/lib/...`), `ARCFORGE_ROOT`, or `CLAUDE_PLUGIN_ROOT`
(hooks-only, unset in skill Bash). Engine functionality is reached only by a
subprocess call to the bare `arcforge` CLI — the plugin's `bin/` is on PATH (D9).
Rationale and the matching D8 rule for engine code: `.claude/rules/architecture.md`.

## Legacy skills are grandfathered, not exempt

`docs/plans/v6/legacy-skills.json` is the single source of truth for which v5
skills the new assertions skip. Anything not listed gets the full rule set. The
ratchet: every entry must still exist as `skills/core/<name>/`, so deleting or
rewriting a legacy skill means pruning its entry in the **same commit**. Never
add an entry.

## Test file convention

- Single generic checker: `tests/skills/test_skill_structure.py` (no per-skill file)
- Runner: pytest — discovers every `skills/core/*/SKILL.md` dynamically, so
  merges, renames, and new skills need zero test edits. Adding or removing a
  skill does need one edit: `EXPECTED_SKILL_COUNT`, which pins the scan against
  a glob that half-breaks
- Validates frontmatter against the frozen schema, `name` == dirname, the
  description register, section/body structure, referenced supporting files,
  and the line budget

The line budget is a hard cap owned by that test. Do not negotiate an exemption
for a skill that doesn't fit — split it into references or move behavior into
the CLI.

## Evaluating skill edits

The line is **behavioral footprint**, not edit size and not whether you call it
"docs": a skill IS documentation, so "just adding a section" / "small
clarification" / "documentation only" are not automatic exemptions. If an edit
changes what the skill instructs the agent to do or decide, it needs eval
evidence. Changes with no behavioral footprint (typo, reformatting,
metadata-only) are exempt. When unsure, treat it as behavioral.

During the rewrite the gate is the **phase gate**, not a skill: each phase adds
its scenarios and clears the behavioral threshold written down before the phase
started (`docs/plans/v6/PLAN.md`, `docs/plans/v6/progress.md`). The eval corpus
is rebuilt wholesale in P7.
