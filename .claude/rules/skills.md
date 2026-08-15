---
paths:
  - "skills/**"
  - "tests/skills/**"
---

# Skills (contributor quick reference)

This file holds the contributor-side conventions only; it is not the authoring
methodology.

## Where the authority lives

| Question | Canonical source |
|---|---|
| What frontmatter is legal | `docs/plans/v6/decisions/skill-schema.md` (**frozen** — do not redefine, restate, or extend it elsewhere) |
| Is my skill structurally valid | `tests/skills/test_skill_structure.py` (the mechanical form of the schema) |
| Which skills exist | `skills/core/` on disk, and the Skill Map in `skills/core/using/SKILL.md` — the two are a tested bijection |
| How to write a good skill | `skills/core/writing-skills/` — the authoring methodology. The schema doc stays authoritative for the fields themselves. |

Required frontmatter is `name` + `description`; the optional field set is
enumerated in the schema doc and nowhere else. `name` must equal the directory
name, with no prefix (D7).

## Self-containment (D1)

A skill directory is a closed unit: nothing under `skills/<bucket>/<name>/` may
require / import / source outside that directory, and skill prose must not name
engine internals (`scripts/lib/...`), `ARCFORGE_ROOT`, or `CLAUDE_PLUGIN_ROOT`
(hooks-only, unset in skill Bash). Engine functionality is reached only by a
subprocess call to the bare `arcforge` CLI — the plugin's `bin/` is on PATH (D9).
Rationale and the matching D8 rule for engine code: `.claude/rules/architecture.md`.

## There is no exemption to ask for

`docs/plans/v6/legacy-skills.json` was the single source of truth for which v5
skills the assertions skipped. It is **empty and closed** — the ratchet test
fails on any entry, so every skill gets the full rule set. If a skill cannot
satisfy the schema, fix the skill.

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

Evidence means the eval harness, not a self-report: pre-register the threshold,
run the scenario, and read the verdict out of the numbers. `.claude/rules/eval.md`
covers when to reach for it; `skills/core/evaluating/` covers how.
