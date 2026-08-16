# skill-system — spec

> Status: shipped v6.0.0 · [ROADMAP](../ROADMAP.md)
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
- **B-1 Fifteen skills, one shipping bucket.** The product ships exactly the
  skills under `skills/core/`: `using`, `brainstorming`, `executing`, `tdd`,
  `debugging`, `code-review`, `finishing`, `dispatching`, `looping`, `sessions`,
  `maintaining-obsidian`, `diagramming-obsidian`, `writing-skills`, `evaluating`,
  `learning`. A skill's `name` equals its directory name, carries no prefix, and
  is namespaced at install time to `/arcforge:<name>`.
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

## Decisions

- **D-002** — the skill set targets Claude Code as its only harness for 6.0.0;
  self-containment (markdown + a bare CLI on PATH) is what keeps a second
  harness cheap later. See the [ROADMAP Decision Log](../ROADMAP.md#decision-log).

The area's structural choices — black-box skills, prose-only composition, the
single shipping bucket, no name prefix — predate this log; their rationale is
inline above, and their mechanical form is frozen in
`docs/decisions/skill-schema.md` and `.claude/rules/architecture.md`.
