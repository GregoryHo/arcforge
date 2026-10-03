# skill-system — spec

> Status: shipped v6.3.0 · extended by 6.4.0 (next) · [ROADMAP](../ROADMAP.md)
> Living document — keep in sync with the shipped behavior; record the *why* of any
> change in the ROADMAP Decision Log.

## Purpose

The skill set is arcforge's behavior layer: each skill is a self-contained
workflow that changes how the agent works on one kind of problem, loaded into the
session when it applies. Self-containment is the load-bearing property — a user
can read one skill and understand it completely, and can author their own without
learning how the toolkit is built inside. Composition happens in prose, not in an
engine: skills call each other by invocation, and a plain-text router maps
situations to skills.

## Scope

- **In scope:** the shipped skill inventory; the router; the invocation dichotomy
  (model- vs user-invoked); the self-containment and composition contract; the
  lifecycle buckets; the evidence bar for behavioral edits.
- **Out of scope:** the engine the skills shell out to ([cli](cli.md)); the hook
  layer ([hooks](hooks.md)); the mechanical schema itself — frontmatter fields,
  description registers, line budget, parser rulings — which is frozen in
  [`docs/decisions/skill-schema.md`](../../docs/decisions/skill-schema.md) and is
  cited here, never restated.

## Behavior

### Inventory and routing
- **B-1 One shipping bucket, and the set it holds.** The product ships exactly
  the skills under `skills/core/`: `using`, `brainstorming`, `executing`,
  `speccing`, `tdd`, `debugging`, `code-review`, `finishing`, `dispatching`,
  `looping`, `sessions`, `maintaining-obsidian`, `diagramming-obsidian`,
  `writing-skills`, `evaluating`, `learning`. A skill's `name` equals its
  directory name, carries no prefix, and is namespaced at install time —
  `/arcforge:<name>` on Claude Code, `arcforge:<name>` (no leading slash) on
  Codex CLI ([codex-harness](codex-harness.md) B-2). This clause enumerates the
  set rather than counting it: `EXPECTED_SKILL_COUNT` in
  `tests/skills/test_skill_structure.py` is the only *mechanical* pin on the
  number, and a second copy here could only drift from it. Prose counts
  elsewhere (README, guides, website) are maintained surface the release
  doc-audit re-checks.
- **B-2 The router is an index, not a gate.** `using` holds one table mapping
  situations to skills. It exists for the moment the user is unsure which
  workflow fits; it points at one skill and gets out of the way. No workflow is
  required to route through it, and when nothing matches, the honest answer is
  that no arcforge skill applies — the router MUST NOT be a mandatory layer or
  claim coverage it doesn't have.
- **B-3 The router cannot lie.** Router table ↔ shipped skill set is a
  bidirectional contract: every shipped skill except the router itself has a
  row (the router cannot route to itself), every row resolves to a shipped
  skill, and the contract is mechanically enforced (jest router-contract
  test). Adding, renaming, or removing a skill changes the router in the same
  commit — the failure mode this kills is an index that drifts from reality.

### Invocation
- **B-4 Every skill is exactly one of two kinds.** Model-invoked skills fire on
  their own when the situation matches their description; user-invoked skills
  (`learning`, `looping`, `writing-skills`) load only when the user types the
  slash command, because starting them is a deliberate act. The dichotomy, its
  description registers, and the rule that user-invoked skills are never
  prose-invoked by other skills are pinned in skill-schema §2.
- **B-5 Cross-skill composition is prose invocation only.** A skill that needs
  another skill's capability says "run `/<name>`" — it never deep-links into
  another skill's files (skill-schema §4). This keeps every skill independently
  readable, movable, and deletable.

### Self-containment
- **B-6 A skill is a black box.** Nothing in a skill directory reaches outside
  it: no imports of engine code, no reading sibling skills, no reliance on
  environment variables the harness doesn't set in skill context. Engine
  functionality is reached exactly one way — a subprocess call to the bare
  `arcforge` CLI, on PATH via the plugin's `bin/`. The mechanics are frozen in
  skill-schema §4.4 and `.claude/rules/architecture.md` (D1/D9); the payoff is
  that skills and engine can each be refactored without reading the other.
- **B-7 The dependency arrow never points back.** Engine and hooks never
  reference `skills/` (architecture D8, asserted empty by test). A skill can be
  deleted with `git rm` and nothing else breaks.

### Lifecycle
- **B-8 Buckets are shelves, not names.** `skills/core/` ships; the
  `in-progress` and `deprecated` buckets are on-disk holding areas that never
  load, created only at the moment a skill moves into one. Promotion and
  retirement are a `git mv` between buckets — the
  invocation name never changes, the plugin manifest never changes
  (`.claude/rules/plugin.md`).

### Quality bar
- **B-9 Behavioral claims need measured evidence.** A skill edit that claims to
  change agent behavior ships with an eval delta from the [eval](eval.md)
  harness, not a self-report. Form constraints (line budget, description
  registers) are enforced mechanically per skill-schema §6, so review effort
  goes to behavior, not formatting.

### The `sessions` skill
- **B-10 A handover is five sections, every one filled.** Before writing, the
  skill runs the project's test or build command in the working tree and
  labels every piece of work in flight **verified** by a run just watched,
  **written but never exercised**, or **not started** — a green suite is
  evidence only about the code it covers. The handover is `Where it stands`,
  `Done`, `Unfinished`, `Decisions` and `Next`, a slot with nothing in it
  reads `none` rather than losing its heading, `Next` is one action as a
  command or a named file, and a decision carries the alternative it rejected.
  From 6.4.0 the same five sections are the narrative of a session archive
  ([cli](cli.md) B-9), so a `.handovers/<date>-<slug>.md` file and an archive
  differ only in where they live and who reads them (D-056).
- **B-11 Resuming presents, then stops.** The skill reads the handover or
  archive whole, checks the claims that decide what happens next — the branch,
  whether `Next` already landed, whether the suite still returns what was
  recorded — against the repo as it is now, and reports the state, the next
  action and every point where the repo disagrees. Then it changes nothing
  until the user confirms the plan: a handover's plan is someone else's until
  then. From 6.4.0 it reads an archive through `arcforge session resume`
  as well as a `.handovers/` file, either one in the five sections of B-10;
  an archive in v5's section set is not supported (D-056).
- **B-12 Save, list and alias go through the CLI (6.4.0).** The skill tells
  the agent to write the five sections itself, in-session, and to hand them to
  `arcforge session save <alias> --from <path|->` — the `.handovers/` file it
  just wrote, or stdin — which adds the metrics header; to find earlier
  archives with `arcforge session list`; and to name them with
  `arcforge session alias set <name> <archive-path>`, drop a name with
  `arcforge session alias remove <name>` and see the names with
  `arcforge session alias list` ([cli](cli.md) B-9). The `.handovers/` file needs no CLI, so it still
  works on a host where `arcforge` does not resolve
  ([codex-harness](codex-harness.md) B-3). B-10 and B-11 are measured at skill
  scope in 6.4.0's round; B-12's CLI half ships on contract tests (D-055,
  D-056).

## Data / domain model

The one format is a skill's `SKILL.md` frontmatter, frozen in
`docs/decisions/skill-schema.md` and enforced mechanically per its §6. Its
invariants: `name` equals the directory name and carries no prefix (B-1), a skill
declares exactly one of the two invocation kinds (B-4), and the bucket directory it
sits in is a shelf rather than part of its identity (B-8). The router table in
`using` is the second structural artifact — a bijection with the shipped skill set,
asserted by test (B-3).

## Decisions

- **D-002** — the skill set targets Claude Code as its only harness for 6.0.0;
  self-containment (markdown + a bare CLI on PATH) is what keeps a second
  harness cheap later.
- **D-014** — the spec-driven method ships to users as a skill at 6.1.0, which
  is why the shipped set gains `speccing` (B-1).
- **D-018** — every edit under `skills/` known when 6.1.1 was planned lands
  there, so its benchmark is measured on a repaired instrument; skill text a
  later decision changes is measured in 6.2.0's round (B-9).
- **D-049** — 6.3.0 schedules the router and executing scenarios whose
  baselines sat at ceiling, each under one pre-registered redesign (B-3,
  B-9).
- **D-054** — the router's text measured +1.00 CI[1, 1] IMPROVED at skill
  scope; executing's claim is a finding, its baseline already at the
  behavior (B-3, B-9).
- **D-055** — 6.4.0 measures the `sessions` handover and present-then-stop
  behaviours at skill scope and re-runs the router scenario (B-9, B-10,
  B-11).
- **D-056** — `sessions` gains save, resume, list and alias over
  `arcforge session`, on the handover's five sections (B-10, B-11, B-12).

See the [ROADMAP Decision Log](../ROADMAP.md#decision-log).

The area's structural choices — black-box skills, prose-only composition, the
single shipping bucket, no name prefix — predate this log; their rationale is
inline above, and their mechanical form is frozen in
`docs/decisions/skill-schema.md` and `.claude/rules/architecture.md`.
