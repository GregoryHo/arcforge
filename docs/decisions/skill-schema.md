# Skill Schema

Specification, not tutorial. This file is the **single authority** for skill
frontmatter, the description registers, the line budget, and the composition
rules — do not redefine or restate it elsewhere; point here. The teaching
counterpart is `skills/core/writing-skills/`; the mechanical form is
`tests/skills/test_skill_structure.py`. Changing this file changes a frozen
contract: it requires a maintainer decision, never a silent edit.

## 1. Frontmatter fields

A skill's frontmatter key set must be a **subset** of this table. Any other key
fails the structure test.

| Field | Required | Type | Constraint |
|---|---|---|---|
| `name` | ✅ | string | Must equal the directory name (kebab-case, no prefix — the plugin namespace supplies `/arcforge:`) |
| `description` | ✅ | string | Register per §2; `len(name + description) < 1024` |
| `disable-model-invocation` | ❌ | bool (or string `"true"`) | `true` = user-invoked only; switches the §2 register |
| `argument-hint` | ❌ | string | Argument shape shown after `/name` in the slash UI |
| `allowed-tools` | ❌ | string | Restricts the tool surface while the skill runs |

Deliberately not part of the schema: `category`, `status`, `model`, `context`,
`agent`, `hooks`, `user-invocable`. Needing one of these is a schema change —
take it to the maintainer, don't add the key.

## 2. Invocation dichotomy

Every skill is exactly one of two kinds, decided by `disable-model-invocation`:

| | model-invoked (default) | user-invoked (`disable-model-invocation: true`) |
|---|---|---|
| Who fires it | The model, from the description | Only the user, via `/name` |
| Description grammar | `<identity>. Use when <triggers>` | A plain one-liner |
| Description length | 60–280 chars | ≤ 120 chars |
| `use when` | **Required** (case-insensitive) | **Forbidden** |
| Prose-invocable by other skills? | ✅ | ❌ (rule 2.1) |

**Rule 2.1 — user-invoked skills are not prose-invoked.** A user-invoked skill
is an explicit-intent gate; another skill's prose calling it via `/name` would
bypass that gate.

**Index exemption.** The Skill Map table in the router (`skills/core/using/`)
is an **index, not an invocation**: its `/name` rows answer "what exists and
when does it apply", and execution still requires the user to type `/name`.
The exemption is scoped to table rows inside the router's Skill Map section
(parsed as `ROUTER_INDEX` references — target existence is still checked);
`/name` anywhere else, in any skill, is judged under rule 2.1. Without this
exemption, rule 2.1 and the router bijection (every shipped skill has a row)
would be mutually exclusive for user-invoked skills. Index rows should tag
themselves `(user-invoked)` so a reader can tell an index entry from a
callable entry point.

## 3. Line budget

Counted over the **body** (frontmatter excluded — declarative metadata is not
budget-governed prose).

| Threshold | Value | Behavior |
|---|---|---|
| Soft cap | 150 | warning, does not fail |
| Hard cap | 250 | fail |

There are **no exceptions**. A skill that doesn't fit splits into
`references/` or moves behavior into the CLI.

## 4. Composition rules

| Rule | Content |
|---|---|
| 4.1 Cross-skill calls | Only prose `/<name>` invocation (or the namespaced form `/arcforge:<name>`). Backticked and bare forms both parse; the target must exist under `skills/<bucket>/<name>/` |
| 4.2 No deep links | Never read another skill's internals via paths like `../<skill>/...` or `skills/<other>/references/...`. If you want another skill's capability, call it with `/name` |
| 4.3 Supporting files | `references/` and script pointers must resolve, and must resolve **skill-locally** — a skill may only point at its own files |
| 4.4 Self-containment (D1) | Nothing executable in a skill directory may `require`/`import`/`source` outside that directory. Engine functionality is reached one way: a subprocess call to the bare `arcforge` CLI (on PATH via the plugin's `bin/`, D9). Skill prose must not name engine internals (`scripts/lib/...`) or environment variables that are not set in skill Bash (`ARCFORGE_ROOT`, `CLAUDE_PLUGIN_ROOT`) |

The deep-link guard (4.2) scans **all markdown** under a skill directory, not
just SKILL.md — cross-skill links are most likely to appear in
`references/*.md`. Pointing at your own skill (`skills/<self>/...`) is not a
violation; the rule is about crossing skill boundaries.

## 5. `/name` parser rulings

The cross-reference parser that enforces §4.1 and rule 2.1:

- Accepts backticked **and** bare `/name` — a bare-only or backtick-only
  parser silently misses half the real usage.
- Lookarounds exclude three non-invocation slash shapes: filesystem paths
  (`references/x.md`, `/usr/local/bin`), dates and or-slashes (`2026/07/31`,
  `and/or`), and XML/HTML close tags (`</reason>`).
- A sentence-final period is tolerated (`/finishing.` parses; `/foo.md` does
  not).
- `/arcforge:<name>` resolves to `<name>`.
- Claude Code built-in slash commands (`/compact`, `/resume`, … — the
  `BUILTIN_SLASH_COMMANDS` list) are not cross-references, **but only when the
  token is not also a shipped skill name** — the built-in list can never make
  a real skill invocation escape validation.

## 6. Enforcement map

| Rule | Guard | Runner |
|---|---|---|
| §1 field set frozen | `test_frontmatter_schema_frozen` (+ synthetic negatives in `test_schema_violations_rejects_v5_fields`) | pytest |
| §1 `name` == dirname / description present | `test_frontmatter_valid` | pytest |
| §2 description registers | `test_description_register` | pytest |
| Rule 2.1 + index exemption | `test_user_invoked_skills_are_not_prose_invoked` | pytest |
| §3 line budget | `test_line_budget` | pytest |
| §4.1 targets resolve (+ floor ≥3 found) | `test_cross_reference_resolves`, `test_cross_references_found` | pytest |
| §4.2 no deep links | `test_no_cross_skill_deep_links` | pytest |
| §4.3 supporting files resolve skill-locally | `test_referenced_supporting_files_exist` | pytest |
| §4.4 self-containment | `d1-skill-self-containment.test.js` | jest |
| Skill ↔ router bijection | router contract test | jest |
| Docs name only real skills (R4) | `scripts/lib/doc-refs.js` | check:docs |
| Engine/hooks never reference skills (D8) | D8 boundary test | jest |
| Scan floor (>10 skills found) | `test_skill_scan_floor` | pytest |

## 7. Coverage honesty

Rule 2.1 and §4.2 are near-vacuous against the real corpus (few user-invoked
skills, zero live deep links), so their real coverage is carried by
**synthetic-sample tests** inside `test_skill_structure.py` — positive and
negative cases that must turn red when the guard weakens. "pytest is green"
does not by itself prove these two rules are enforced; the synthetic tests
existing and failing on mutation does.
