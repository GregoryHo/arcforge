# Roadmap — arcforge

The **index + history** for the product. The table is the big picture and links to
each area's living spec in `specs/`; the **Decision Log** records every product
decision *and* every reversal. How to maintain this file: [`product/AGENTS.md`](AGENTS.md).

## Roadmap

| Version | Tag | Milestone | Status | What & why | Spec |
|---|---|---|---|---|---|
| 6.0.0 | `v6.0.0` | v6 toolkit | **shipped ← we are here** | Ground-up rebuild: 15 self-contained skills behind a prose router, a 5-group CLI reached as bare `arcforge`, 6 hooks, and the retained learning / eval / obsidian systems — Claude Code single-harness, zero runtime deps. | [skill-system](specs/skill-system.md) · [cli](specs/cli.md) · [hooks](specs/hooks.md) · [learning](specs/learning.md) · [eval](specs/eval.md) · [obsidian](specs/obsidian.md) · [worktrees-loop](specs/worktrees-loop.md) |

> Un-scheduled ideas live in the [Backlog](BACKLOG.md); a wish graduates into a
> version (row + spec + Decision Log entry) when picked.

## Decision Log

Append-only. Never renumber a `D-id`; never edit a recorded `Decision` / `Why`. To
reverse one, append a superseding entry (see AGENTS.md).

### D-001 — Product state lives in `product/`
- Date: 2026-08-15
- Version: process
- Status: Accepted
- Decision: Product intent (specs, roadmap, backlog, decisions) lives in this
  folder, maintained per `product/AGENTS.md`; it is distinct from engineering
  conventions (`.claude/rules/`), frozen mechanical contracts (`docs/decisions/`),
  and user how-to docs (`docs/guide/`).
- Why: Product "what and why" previously had no single home — it was scattered
  across plan documents that aged into noise. One folder with living specs and an
  append-only decision log keeps intent current and its history legible.

### D-002 — Claude Code single-harness now; Codex as a wrapped second harness later
- Date: 2026-08-15
- Version: 6.0.0
- Status: Accepted
- Decision: v6 ships wrapping Claude Code only. Wrapping Codex as a second harness
  is directionally decided but unscheduled (see Backlog); "Claude Code only"
  statements in the engineering rules describe the present, not a permanent stance.
- Why: The rebuild's core simplification was dropping multi-platform packaging.
  The architecture keeps the second harness cheap — skills are self-contained
  markdown plus a bare CLI on PATH — so the future work is packaging plus spike
  verification of Codex's discovery/invocation mechanics, not a redesign.

### D-003 — Backfill all seven area specs at 6.0.0
- Date: 2026-08-16
- Version: process
- Status: Accepted
- Decision: Every shipped area gets its spec now, in one pass — `specs/` covers
  skill-system, cli, hooks, learning, eval, obsidian, and worktrees-loop — and
  the earlier write-on-next-touch stance is retired.
- Why: A spec written later would be reverse-engineered from code by whoever
  next touches the area, without the context the choices were made with.
  Writing all seven while that context is at hand costs one sitting and gives
  every future change a spec to update instead of a blank to fill.

### D-004 — `product/AGENTS.md` carries the whole method, not a slimmed subset
- Date: 2026-09-03
- Version: process
- Status: Accepted
- Decision: `product/AGENTS.md` documents the full spec-driven method arcforge runs
  on — the *Build a milestone* playbook, `## Data / domain model` in the spec
  template, `Status: Proposed`, a worked supersede few-shot, and a `## Conventions`
  table of the fields this repo invented in practice — instead of the trimmed copy it
  shipped with at 6.0.0.
- Why: The trimmed copy explained how to *start* a milestone and how to *ship* one,
  and was silent about the stretch in between — which is exactly where a spec goes
  stale, because nothing in the guide said the spec moves as the code moves. The
  invented conventions (`Cost accepted:`, `Refines:`, `Symptom:`, graduation
  tombstones) were already in use with no written form, so each contributor either
  re-derived them or dropped them. Writing the method down in full costs one file and
  removes the guessing; "lightweight" was always about ceremony, never about leaving
  the method half-stated.

### D-005 — The status vocabulary and the supersede forms are pinned in a checkable shape
- Date: 2026-09-03
- Version: process
- Status: Accepted
- Decision: Three rules are pinned in `product/AGENTS.md` in the exact form a linter
  can read: (1) row status → spec header — `next`→`draft`, `building`→`building
  vX.Y.Z`, `shipped`→`shipped vX.Y.Z`; (2) the governing row is the highest-version
  row linking a spec, every row links at least one spec, every spec has a governing
  row and every row link resolves, an unshipped governing row over a shipped spec
  takes the compound form `shipped v6.0.0 · extended by 6.1.0 (building)`, and a
  shipped governing row collapses it to `shipped v<that version>`; (3) a
  supersession is two edits, in one of two forms — bare
  `Supersedes: D-NNN` flips the old entry to `Status: Superseded-by: D-MMM`,
  clause-scoped `Supersedes: D-NNN (clause 2)` flips it to `Accepted · partially
  superseded by D-MMM` — with `Refines:` and `Extends:` exempt from any flip.
- Why: A vocabulary that exists only as prose has no answer for the first hard case.
  Two rows legitimately link one spec the moment a shipped area is extended by the
  next version, and "what does the header say then" was undefined; so was "what if
  only one clause of a decision died". Both got settled by whoever hit them first,
  differently each time. Pinning the three rules gives the answer one home, and —
  more usefully — makes them mechanical, so the next reversal of this vocabulary has
  to change a rule and a check together instead of drifting apart quietly.

### D-006 — `check:product` is the sixth static gate
- Date: 2026-09-03
- Version: process
- Status: Accepted
- Decision: `npm run check:product` (`scripts/check-product.js`) joins the CI-gated
  static checks, asserting seven rules over `product/`: exactly one `← we are here`
  row (C1); a Decision Log whose ids are zero-padded, unique, ascending outside the
  folded index, and gap-free from D-001 (C2); every `Supersedes:` / `Refines:` /
  `Extends:` well-formed and naming an earlier decision that exists, with every
  `Supersedes:` carrying its flip in the matching form on a superseded entry whose
  whole `Status:` stays coherent — every clause from the closed vocabulary, at most
  one death, a total flip leaving nothing live, a partial one keeping exactly one
  live clause, and no decision both replacing an entry whole and reversing one of
  its clauses — and the pairing read back from the flip, so a `Superseded-by:` or
  `partially superseded by` clause whose named entry claims no supersession, or that
  names an id the log does not carry, is rejected too (C3); every spec carrying
  exactly one `Status:` header in its preamble and that header agreeing with its
  governing roadmap row, with the links resolving both ways —
  every row links at least one spec, every spec is linked from some row, and every
  link names a file that exists — and each version occupying exactly one row, so
  "the highest-version one" names a row rather than whichever the table lists last
  (C4); every D-id a spec cites well-formed as
  `D-NNN` and existing (C5); a sanity floor of one row, one decision, one spec,
  with the roadmap's rows sitting under a table GFM renders — a six-column header
  opening on `Version`, a delimiter row of the same width, and the rows themselves,
  all on consecutive lines, since a blank line or a fenced block between any two of
  them ends the table there, and that header either opening the section or carrying
  a blank line directly above it, with anything else directly above it reported: a
  blockquote or a list item there takes the whole table into its own paragraph and
  GFM renders none, while a plain paragraph splits and the table under it renders
  and is reported all the same — and every line from that header down to the first
  blank line written as a `|`-delimited six-column row, since GFM asks no outer pipe
  of a row and renders any line in that run as one — so neither an unframed row can
  stand in for the table nor a rendered row escape the rules that read it (C6);
  and a `Tag` cell matching its
  row's Status —
  `vX.Y.Z` when shipped, `—` otherwise (C7).
- Residual: C1 counts `← we are here` markers; it does not know which row deserves
  one, so a marker that should have moved and didn't passes green. Placement stays a
  reading task, and the prose in `product/AGENTS.md` and the `releasing` skill says
  so rather than implying the gate covers it.
- Residual: C3 is narrower than "the log is coherent". The closed status vocabulary
  is read only on an entry something supersedes; a trailing `·` is tolerated; a
  clause number is checked for shape but not for identity, so two decisions may
  claim the same clause of one victim; and a `Refines:` / `Extends:` target is not
  tested for liveness — deliberately, since the promise is existence and backward
  direction only. Each is a widening that needs its own decision, and the
  constraints on writing one are in
  [`docs/plans/check-product-deferred.md`](../docs/plans/check-product-deferred.md).
- Cost accepted: the check has to be named in seven places to be real —
  `package.json`, `.github/workflows/ci.yml`, `CLAUDE.md`, `AGENTS.md`'s verify
  block, `.claude/rules/testing.md`, `.claude/rules/git-workflow.md`, and the
  `releasing` skill's pre-flight — plus the "five static checks" counts in `README.md`
  and `CONTRIBUTING.md`. No linter scans `.claude/skills/`, so the `releasing` site
  stays a manual-memory item; it is listed here so the next person adding a gate
  knows the real price.
- Why: Every rule in `product/AGENTS.md` was prose, and prose about bookkeeping
  drifts silently — a renumbered D-id, a supersede with no flip, two markers after a
  release, a spec header still claiming to build a version that shipped. None of that
  breaks a build; it just turns the product state into a plausible-looking lie that
  the next reader trusts. `.claude/rules/architecture.md` already says a norm that
  could be a check is a drift risk until it is one, and this is the norm with the
  highest drift rate and the lowest cost to check.

### D-007 — Contributor agents live in `.claude/agents/`
- Date: 2026-09-03
- Version: process
- Status: Accepted
- Decision: Two project-local subagents ship as contributor surface in
  `.claude/agents/`, each with a `tools:` allowlist: `pm`
  (`Read, Grep, Glob, Edit, Write` — no execution) scoped to write `product/**` only,
  and `qa` (`Read, Grep, Glob, Bash` plus an explicit
  `disallowedTools: Edit, Write, NotebookEdit`), which can run every gate and edit
  nothing. They are not a plugin component type and are never installed —
  `package.json`'s `files` array does not ship `.claude/`.
- Why: "Keep `product/` straight" and "review this branch honestly" were prompts
  rewritten from scratch each time, with the scope held by good intentions. The two
  failure modes are specific and opposite: a product agent that can run and edit code
  will fix the engine instead of recording what the engine should do, and a reviewer
  that can edit the branch it reviews stops being evidence the moment it fixes
  something. Withholding execution answers the first; withholding the editing tools
  answers the second.
- Residual: `qa` holds Bash because running the gates is its job, and a shell can
  write files — the allowlist removes the editing tools, not the possibility, so
  "verify, never fix" still rests partly on the instruction in the agent body. `pm`
  has the mirror seam: a `tools:` allowlist scopes which tools an agent holds, not
  which paths they reach, so `product/**` rests on the instruction too and the tool
  set contributes only the absence of execution — which in turn means `pm` cannot run
  `npm run check:product` and hands that step to the human or to `qa`.
  `disallowedTools:` was not verified against the installed Claude Code (2.1.258)
  subagent frontmatter; it is a second statement of intent, and the `tools:`
  allowlist is what actually holds. `.claude/rules/plugin.md` says there is no
  agents directory, meaning the plugin root; the README states the distinction
  rather than the rule being reworded, so a careless reading still looks like a
  contradiction.

### D-008 — `releasing` owns the product-state flip
- Date: 2026-09-03
- Version: process
- Status: Accepted
- Decision: Flipping the product state at a release — the roadmap row to `shipped`,
  its `Tag` cell, the `Status:` header of every spec that row governs, and the
  `← we are here` marker — is step 5 of the `releasing` checklist, between the
  CHANGELOG and the version bump, committed on its own ahead of the release commit
  (which stays exactly the 9 version files), with `npm run check:product` as its
  proof for three of its four edits.
- Why: The flip is four edits across four files, and the 8-location version bump
  touches none of them, so it survived only as memory in whoever cut the release.
  Giving it a numbered step attaches it to the one workflow that always runs at a
  release. Keeping it a separate commit means reverting a bad bump does not drag the
  product history back with it. The gate is honest about what it proves: it is green
  before the flip and green after — a `building` row with `building` headers agrees
  as well as a `shipped` row with `shipped` headers — and red only on a *half-done*
  flip, which is the failure that actually happens. It gates three of the four edits
  (row Status, `Tag` cell, spec headers); where the marker ends up is C1's blind spot
  and stays a reading task.
- Verification: `npm run check:product` red on a partial flip, green on a complete
  one; the negative fixtures in `tests/scripts/check-product.test.js` cover both.
