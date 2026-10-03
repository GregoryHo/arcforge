# Roadmap — arcforge

The **index + history** for the product. The table is the big picture and links to
each area's living spec in `specs/`; the **Decision Log** records every product
decision *and* every reversal. How to maintain this file: [`product/AGENTS.md`](AGENTS.md).

## Roadmap

| Version | Tag | Milestone | Status | What & why | Spec |
|---|---|---|---|---|---|
| 6.0.0 | `v6.0.0` | v6 toolkit | **shipped** | Ground-up rebuild: 15 self-contained skills behind a prose router, a 5-group CLI reached as bare `arcforge`, 6 hooks, and the retained learning / eval / obsidian systems — Claude Code single-harness, zero runtime deps. | [skill-system](specs/skill-system.md) · [cli](specs/cli.md) · [hooks](specs/hooks.md) · [learning](specs/learning.md) · [eval](specs/eval.md) · [obsidian](specs/obsidian.md) · [worktrees-loop](specs/worktrees-loop.md) |
| 6.1.0 | `v6.1.0` | learning trust · spec-driven method · Codex packaging | **shipped** | Diary enrichment and user-message capture move behind the learning opt-in and the enricher loses blanket permissions; the CLI's candidate commands become a front end onto the canonical queue; the lightweight spec-driven method arcforge runs itself on ships as the `speccing` skill; arcforge installs on Codex as a skills-only plugin over the same tree. | [skill-system](specs/skill-system.md) · [learning](specs/learning.md) · [hooks](specs/hooks.md) · [codex-harness](specs/codex-harness.md) · [sdd](specs/sdd.md) |
| 6.1.1 | `v6.1.1` | eval instrument · learning trust repairs · truthful safety claims | **shipped** | The three fixes merged after `v6.1.0` — the prompt audit's engine and skill findings (#181, #182) and the hook registry's non-schema keys (#188) — plus the repairs the release benchmark depends on: trials isolated from the operator's output style and user hooks (#170), a provider refusal scored as an error trial rather than behavior, grader prompts that no longer resolve empty outside the arcforge repo, and error trials excluded from every verdict. Learning stops undoing what the user accepted: decay no longer re-applies at every SessionStart and archives instincts, the curator daemon — a second outbound path the spec never named — no longer starts after an opt-out, the dashboard's Activate and Deactivate pass their own gate, and `learn enable` stops erasing config. The secrets-guard claim is corrected to what it scans, and every edit under `skills/` lands here, so the benchmark is measured once, on a repaired instrument. | [eval](specs/eval.md) · [learning](specs/learning.md) · [hooks](specs/hooks.md) · [skill-system](specs/skill-system.md) · [obsidian](specs/obsidian.md) · [sdd](specs/sdd.md) · [worktrees-loop](specs/worktrees-loop.md) |
| 6.1.2 | `v6.1.2` | docs-are-the-contract sweep | **shipped** | Where the docs promise what the engine does not do: CLI messages and contract drift, hooks promises the engine never kept, loop state bugs, contributor tooling and repo hygiene. It touches no eval-backed path — nothing under `skills/`, `evals/scenarios/` or `evals/fixtures/` — so it ships without a benchmark regeneration. | [cli](specs/cli.md) · [hooks](specs/hooks.md) · [learning](specs/learning.md) · [worktrees-loop](specs/worktrees-loop.md) · [obsidian](specs/obsidian.md) · [codex-harness](specs/codex-harness.md) |
| 6.2.0 | `v6.2.0` | learning lifecycle · eval corpus repairs | **shipped** | Exits for candidates stuck at `approved` or `materialized`, `learn instinct deactivate` and `learn instinct restore`, a policy for candidate names, and worktree paths derived from the repo root; plus the scenario rubric fixes, measured in their own, smaller round. A minor because it adds CLI commands. | [learning](specs/learning.md) · [cli](specs/cli.md) · [worktrees-loop](specs/worktrees-loop.md) · [codex-harness](specs/codex-harness.md) · [eval](specs/eval.md) · [sdd](specs/sdd.md) |
| 6.2.1 | `v6.2.1` | instrument and state repairs, no measurement | **shipped** | Repairs to promises already shipped: same-day benchmark snapshots stop overwriting each other and `eval history` lists them all, the eval dashboard shows an instrument-failure pool instead of hiding it, loop run state is written atomically, the observe hook's lazy daemon start reclaims a dead process's lock, `check:product` rejects a relation aimed at an already-dead decision, and the `releasing` skill describes what a squash-only ruleset does to the flip commit. Nothing under `skills/`, `evals/scenarios/` or `evals/fixtures/`, so it ships without a live eval session. | [eval](specs/eval.md) · [worktrees-loop](specs/worktrees-loop.md) · [learning](specs/learning.md) |
| 6.3.0 | `v6.3.0` | ceiling redesigns · skill-local script fixes · the enable stamp | **shipped** | Two of the five scenarios whose baseline sat at ceiling on the repaired instrument are redesigned to Version 2 — router skill selection and the LINK-mode index rebuild — and the round, capped at about 80 trial sessions, spent 16 for one A/B result (router skill selection) and four findings without an A/B (D-054); the `diagramming-obsidian` helpers and `lint_vault` fixes ship in it on contract tests because they sit under `skills/`; and the stale-draft floor stops losing an overlapping opt-in, through additive `enabled_at` and `disabled_at` stamps in the learning config. | [skill-system](specs/skill-system.md) · [obsidian](specs/obsidian.md) · [sdd](specs/sdd.md) · [learning](specs/learning.md) · [hooks](specs/hooks.md) |
| 6.4.0 | `v6.4.0` | session archive returns · daemon, write and counter races · grader isolation | **shipped ← we are here** | v5's session archive, dropped at 6.0.0 without a record, returns as a sixth CLI group, `arcforge session` (`save`, `resume`, `list`, `alias`), over the engine modules that survived unexposed: an engine-written metrics header plus the handover file's five sections, written by the agent in-session, and the `sessions` skill learns to drive it (D-056). The engine fixes planned as 6.3.1 ride along — observer daemon starts and stops that can leave two daemons (#247, #252), the shared atomic-write helper's temporary-file race (#253), the diary tool counter that loses increments (#260), and code graders that can import from the trial directory (#250) — with the README naming `speccing` as the v5 pipeline's file-based replacement and two corrections to past CHANGELOG entries. A minor because it adds a CLI group; the round, capped at about 40 trial sessions, spent 29 and read the `sessions` skill's present-then-stop behaviour (B-11) at baseline 0/5 against treatment 5/5 and the router at 0/5 against 5/5 again, reproducing 6.3.0 — direction only, at k=5 on one fixture and one model each, for injected skill text — while the `diagramming-obsidian` verify-exit sentence already on `main` (#267) was found not measurable on the current engine and is recorded as a finding (D-055, D-057, D-058). | [cli](specs/cli.md) · [skill-system](specs/skill-system.md) · [learning](specs/learning.md) · [hooks](specs/hooks.md) · [eval](specs/eval.md) · [obsidian](specs/obsidian.md) |

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

### D-009 — Diary enrichment is opt-in, and the enricher loses blanket permissions
- Date: 2026-09-03
- Version: 6.1.0
- Status: Accepted
- Decision: The background diary-enrichment run fires only when learning is
  enabled in some scope, and it no longer runs the host CLI with
  `--dangerously-skip-permissions` — it carries `--tools Read,Write`,
  `--add-dir <the draft's directory>` and `--permission-mode acceptEdits`. With
  learning off the draft is still written from session counts and simply keeps
  its unfilled sections; that stub is the documented contract, and the
  stale-draft warning is suppressed in that state rather than complaining about
  intended behavior forever.
- Why: Learning's core asset is its trust design — off by default, nothing
  uninvited. An enrichment run that fires regardless of the opt-in contradicted
  that in the one place it mattered most: it is the product's single outbound
  path, and it was seeded with a summary of the user's session. Skipping every
  permission check on top made the blast radius of a prompt-injected draft the
  whole machine. A spike against the real CLI established the narrowest argv
  that still enriches, and both surviving flags are load-bearing: the draft
  lives outside the spawning cwd, so without `--add-dir` the write is refused
  outright, and a detached run has nobody to answer a permission prompt, so
  without `acceptEdits` the write hangs and the draft is never filled in. A
  per-file `--allowed-tools` allowlist was probed and deliberately left out: it
  pre-approves rather than denies, so it authorized nothing on its own and
  would have read like a confinement it does not provide. What the result is
  NOT, stated so the record does not overclaim: no `cwd` is passed to the
  spawn, so the child still inherits the hook's working directory — the user's
  project — and `--add-dir` adds the draft's directory alongside it rather than
  restricting the run to it. With `acceptEdits` that means edits are
  auto-approved across both. This is a narrowing of the blanket bypass, not a
  sandbox, and the specs and guides say so in those terms.
- Residual: the stale-draft floor is the earlier of the draft's creation and
  last-write timestamps. In-place edits and `touch` no longer lift a pre-opt-in
  stub above it; two things still do, and report it — a copy that preserves
  neither stamp (a sync re-download or a naive unzip; ordinary restore tooling
  keeps mtime and stays below the floor), and a filesystem that records no
  creation time, which leaves the floor on last-write alone. The floor also
  cuts the other way twice, and both are silences rather than false alarms: a
  draft first written before the opt-in and rewritten in place afterwards keeps
  its original creation time, so a genuine post-opt-in enrichment failure over
  it is never reported; and disabling the scope that carries the earliest
  opt-in — global on, project on, global off — advances the floor to the
  surviving scope's stamp even though any-scope authorization never lapsed,
  because a scope's `updated_at` records its latest transition and the enable it
  replaced is not recoverable. The learning config's `updated_at` is embedded and
  survives the same copy, which is what makes the first mismatch possible.
  Creation time is read from the stat call the check already makes, so the check
  stays bounded (hooks B-7).

### D-010 — Session capture depth: counts always, user prose only under the opt-in
- Date: 2026-09-03
- Version: 6.1.0
- Status: Accepted
- Decision: The durable session record stays always-on, and so does its
  metadata — duration, message and tool counts, compactions, tool names, and
  modified file paths — along with the diary draft, which renders the counts
  and the modified-file paths, plus a tool-usage aggregate whenever an
  observations log already exists for the project. That aggregate is the only
  place tool names reach a draft, and observation is itself gated, so with
  learning off it can only be residue of a period when learning was on.
  Verbatim user-message text (`userMessageContent`) is the one field that moves
  behind the learning opt-in. The transcript is still parsed unconditionally
  above the threshold, because the diary's modified-files line depends on it.
- Why: Continuity is not a learning feature and should not require opting into
  learning; a record of how long a session ran and what it touched is
  bookkeeping the user already sees. Storing what the user actually *said* is a
  different act, and it is the one that would surprise someone who never turned
  learning on. Splitting on that boundary keeps the always-on record useful
  while making the depth of it match what the user agreed to. Gating the
  transcript parse instead of the single assignment was rejected: it would have
  silently emptied the diary's "Files modified" line for every learning-off
  user.
- Residual: the opt-in governs how long verbatim prose may stay, not only
  whether it is written — the session record is reloaded and rewritten on every
  Stop and on every compaction, so the field is deleted whenever the gate reads
  off. Tool names are not: they are always-on continuity under this decision, so
  a record an earlier parse filled keeps that turn's `toolsUsed` until a later
  parse refreshes it, and the two fields have different lifetimes by design
  (hooks B-6, and the domain-model note in product/specs/hooks.md). The prose
  written before an opt-out survives until the first Stop or compaction after
  it, which is the same event that removes it.

### D-011 — The CLI's candidate read commands fail closed on `--global`
- Date: 2026-09-03
- Version: 6.1.0
- Status: Accepted
- Decision: `arcforge learn review|inbox|inspect|drafts --global` is refused by
  the engine, with an error naming `arcforge learn dashboard`; the candidate
  commands are project-scope in both directions now, reads as well as
  transitions.
- Why: `getCandidateQueuePath({ scope: 'global' })` resolved to the same file
  as the curator's canonical Layer-5 queue. The lifecycle commands already
  refused `--global`; the read commands did not, and the two halves failed as
  mirror images. `learn review --global --json` applied no scope filter, so it
  printed the raw curator event records verbatim — `scope.project_id` and the
  proposal `body` included. `inbox`, `inspect` and `drafts` compared `c.scope`
  and `c.id` against records keyed `scope.kind` and `candidate_id`, so they
  matched nothing and always reported zero. One path disclosed what it should
  not have; the other reported nothing and looked like an empty queue. The
  dashboard is the reviewed surface for that queue — sanitized wire model,
  legality matrix, audit log — and the CLI had none of it.

### D-012 — The `learn` candidate commands become a front end onto the canonical queue
- Date: 2026-09-03
- Version: 6.1.0
- Status: Accepted
- Decision: the `learn` candidate commands read the canonical Layer-5 queue
  through `readCurrentCandidates()` and dispatch every transition through
  `handleDashboardAction`, so the CLI and the dashboard work one queue under
  one Action × Status matrix, one `safety_ack` gate and one audit log. The
  project-scoped queue under `.arcforge/learning/candidates/` and the engine
  code that managed it are deleted; `--project` becomes a view filter over the
  canonical queue — this project's records in it, matched on `scope.project`
  against the project directory's own name — and `--global` stays refused per
  D-011.
- Why: the project-scoped queue had zero producers. Its writer had no shipped
  caller, so the transition commands managed a file nothing ever filled, while
  the curator filled a different file the CLI could not read. The frozen
  Layer-5 contract already required this — it types the reviewer as
  `"dashboard" | "cli"` and says CLI lifecycle actions must consult the
  canonical matrix. Two queues could not satisfy that; one can.
- Cost accepted: the CLI's artifact reach narrows to what Layer 7/8 support
  today — `instinct` only. The six-type path (`skill`, `command`, `agent`,
  `eval`, `repo_convention_patch`) had no producer either, so nothing that
  worked is lost, but the CLI now says so instead of rendering a draft for a
  candidate that could not have existed. Drafts move with it: Layer 7 writes
  them under the arcforge home tree, not into the project tree, so they no
  longer appear in `git status`. The canonical matrix is stricter than the old
  ad-hoc status check in two places — `reject` is refused after `approve`
  (`approved` has no legal `dismiss`), and `approve` is refused from
  `needs_more_evidence`. In one place it is looser: the dashboard collects the
  activation `safety_ack` from the reviewer, while the CLI treats the typed
  `learn activate <id>` as that act and supplies the ack itself after printing
  both warnings — so a scripted `learn activate --json` activates with no
  second human in the loop. That matches the pre-unification CLI, which had no
  confirmation either, and the deliberate typed command is the gate.
- Residual: a path-hostile candidate name still strands a candidate through
  the two-step path — `learn approve` then `learn materialize`, or the
  dashboard's equivalent clicks. Approve is legal, materialize refuses
  `path_policy_rejected` permanently, and the matrix allows an approved
  candidate neither dismiss nor any other exit. `accept` is guarded because it
  alone promises all-or-nothing; closing the two-step path means either
  rejecting such names at Layer-5 ingestion or normalizing the name at
  materialization, and reject-vs-normalize is a product decision this PR does
  not make. The same two-step path still names the offending name — it is
  Layer 8's own `module_failure.detail`, which every single-step command
  renders deliberately — but the CLI now renders it through the same redactor
  `sanitizeDashboardCard` applies to a card's `name`, so B-9's allowlisted-view
  promise holds on the refusal path too. `accept` remains held to not echoing
  the name in its prose; the `draft_paths` it returns still carry it in the
  basename, which is the stored-name channel below.
- Residual, second clause: the artifact-type narrowing strands a candidate at
  the same `approved` dead end, and there the CLI recommends the move that
  does it — `accept`'s type refusal names `learn approve` as the recovery, and
  from `approved` the matrix allows only `materialize` (which meets the type
  refusal), `promote` and `evolve` (both dashboard-only). The recommendation is
  deliberate and stays: the approval is a verdict on merit worth recording, the
  dashboard retains both its actions, and the obstacle lifts by itself the day
  the curator gains a renderer — unlike the name, which nothing the CLI offers
  ever changes. Recorded so the asymmetry is a decision on file rather than an
  accident of the refusal's wording.

### D-013 — Codex packaging ships at 6.1.0, skills only
- Date: 2026-09-03
- Version: 6.1.0
- Status: Accepted
- Extends: D-002
- Decision: arcforge ships as a Codex CLI plugin over the same source tree: a
  second manifest pair (`.codex-plugin/plugin.json` + `.agents/plugins/marketplace.json`),
  version parity enforced as a ninth `check:versions` row, and skills as the only
  component that loads. The Claude Code hook registry is renamed
  `hooks/claude-code.json` and named by `.claude-plugin/plugin.json`, so Codex's
  hook auto-discovery never finds it.
- Why: The rebuild left the second harness cheap on purpose — skills are portable
  markdown — so the work is packaging plus verification, not redesign. Shipping
  skills-only now gets Codex users the fifteen skills and an honest boundary,
  instead of holding the whole port hostage to the two subsystems that cannot
  cross (hooks, and anything that spawns `claude`).
- Symptom: A Codex install of the pre-rename tree ran arcforge's Claude Code
  hooks. Codex auto-discovers plugin hooks at `hooks/hooks.json` with or without <!-- doc-ref-lint: ignore R1 names the path that must NOT exist; its absence is the guard (check:hooks) -->
  a manifest key: in one `codex exec` turn a fixture whose manifest was silent
  about hooks still fired every event it declared there, and its SessionStart
  `additionalContext` reached the model.
- Verification: Same turn, four plugins installed — the declared control fired 16
  hook dumps, the silent-manifest control reproduced the leak with 6, and the
  renamed fixture (`hooks/claude-code.json`) fired 0. On the Claude Code side,
  2.1.258 with the manifest key declared wrote the session file and with the key
  removed wrote nothing, so the key is what loads the registry (loaded via
  `--plugin-dir`; see the Residual). A separate free
  fixture proved Codex ignores `.claude-plugin/plugin.json` entirely when
  `.codex-plugin/plugin.json` exists, so the new `hooks` key cannot reach Codex.
  `npm run check:hooks` fails if any of the three conditions regresses; the
  fifteen `arcforge:<name>` entries render in `codex debug prompt-input`.
- Residual: The manifest `hooks` key is now the only thing loading arcforge's
  hooks. If a future Claude Code stops honouring it, every hook goes silent and no
  static check can tell — `check:hooks` proves the wiring is self-consistent, not
  that the host reads it. Only a live session catches that. The verification loaded
  the plugin from a source tree with `--plugin-dir`; the marketplace-install path,
  which resolves components out of the version-keyed cache, could not be tested
  before push and should be confirmed on the first 6.1.0 install.
- Cost accepted: The seven CLI-backed skills report `command not found` on Codex,
  because Codex does not put a plugin's `bin/` on PATH and D1/D9 forbid a skill
  routing around the bare-CLI boundary. Documented in the README rather than
  papered over. Also accepted: the registry no longer sits at the name every
  other Claude Code plugin uses, which is a discoverability cost paid to close a
  cross-host leak.

### D-014 — Ship the spec-driven method as a user-facing skill at 6.1.0
- Date: 2026-09-03
- Version: 6.1.0
- Status: Accepted
- Decision: The lightweight spec-driven method arcforge maintains its own
  `product/` with ships to users at 6.1.0 as the `speccing` skill — living specs,
  a semver roadmap, an append-only decision log, and a backlog of wishes, taught
  as skill prose with the file shapes carried in the skill's own references.
- Why: v6.0.0 deleted the SDD skills with no replacement, so the method that
  governs this repo reached no user. It is the highest-leverage thing arcforge
  knows that it was not shipping: a project that adopts it gets documentation
  that cannot silently go stale and a decision history that survives its own
  reversals. Shipping it as one self-contained skill costs no engine surface.
- Cost accepted: A sixteenth skill sits adjacent to `brainstorming` in the
  description register, so both are in context on every turn and the model must
  tell "settle the design" from "record what was settled". The router carries an
  explicit precedence sentence and the skill's own "When this does not apply"
  section names `/brainstorming` for the open-design case. The residual risk is
  a wrong pick on a genuinely ambiguous turn, and 6.1.0 ships it **unmeasured**:
  the router run this branch carries asks a `tdd` vs `finishing` question and
  says nothing about this pair. Booked as the `speccing-router-adjacency-eval`
  wish rather than claimed as covered.

### D-015 — `speccing` is model-invoked, and never bootstraps unasked
- Date: 2026-09-03
- Version: 6.1.0
- Status: Accepted · partially superseded by D-044
- Decision: `speccing` is model-invoked (no `disable-model-invocation`), and its
  body gates creation of product state behind an explicit user request: it
  offers once and starts only on a yes, and it does not apply at all in a repo
  that keeps no `product/` state and whose user has not asked for any.
- Why: The failures the method prevents — a spec that drifted, a decision
  overwritten during a pivot — happen mid-task, when nobody would think to type
  a slash command, so a user-invoked skill would never fire when it mattered.
  The cost of model invocation is the opposite failure: an agent creating four
  markdown files in a repo that wanted none. Splitting the two — the skill fires
  on its own, bootstrapping needs a yes — takes the useful half of each.
- Verification: `evals/scenarios/eval-speccing-spec-before-code.md`, measured
  **+0.67 CI[0.67, 0.67] IMPROVED** at k=10 (baseline 0/10, treatment 10/10);
  `eval-speccing-supersede-not-overwrite.md` ships as corpus coverage, its
  baseline having measured at ceiling in the one executed sample (k=3 preflight,
  3/3 BLOCK, under the Version-3 text); the 8/8 re-score of the k=10 pool is the
  scenario's pre-registered prediction, not an executed measurement. B-6 in
  `product/specs/sdd.md`.

### D-016 — No arcforge product CLI group in 6.1.0
- Date: 2026-09-03
- Version: 6.1.0
- Status: Accepted
- Decision: 6.1.0 ships the method as skill prose only. There is no `arcforge
  product` command group, no schema file, no linter over the four artifacts, and
  no state under `.arcforge/` for them.
- Why: The artifacts are markdown a human reads and edits; a CLI would have to
  parse a format whose whole value is that it stays hand-editable, and every
  rule worth checking is project-specific (which ids exist, which spec governs
  which row). arcforge's own `check:product` is a repo-local gate over a
  repo-local corpus, not a shipped feature. Shipping the discipline before the
  tooling also keeps the tooling honest: if the wishes below never get asked
  for, the tool was never needed.
- Residual: A project adopting the method gets no mechanical check that its own
  log stays dense, its supersessions stay paired, or its spec headers agree with
  their rows. Booked as the `product-cli` wish below.

### D-017 — The per-trial ceiling is overridable per run, and a run that moves it reports the value
- Date: 2026-09-09
- Version: 6.1.1
- Status: Accepted
- Decision: The eval harness keeps 900 s as the per-trial ceiling and lets
  `ARCFORGE_EVAL_TRIAL_TIMEOUT_MS` move it for a single run — a positive integer
  of milliseconds, refused otherwise on the first trial before any session
  spawns — with the rule that a run which moved it is reported with the value it
  used.
- Why: `eval-diagramming-obsidian-unverified-save-claim`'s treatment arm runs a
  full build-and-render pipeline; on a loaded machine 4 of 5 treatment trials
  were killed at 900 s, and since a killed-incomplete trial never scores (eval
  B-10) the arm had nothing to measure. The 900 s ceiling is the standing
  instrument every other pool was measured under, so a per-run override gets
  that scenario measured without changing the instrument for the rest, and
  without editing the engine to do it. Moving the ceiling changes the conditions
  of the measurement, which is why the value used travels with the result rather
  than staying an invisible local setting — the same rule eval B-9 applies to a
  `--since`-bounded snapshot.
- Symptom: 4 of 5 treatment trials `trial_killed_incomplete` at the 900 s
  ceiling; one scorable trial in the arm.
- Residual: no result field records the ceiling a trial ran under, so a pool can
  mix trials measured under different ceilings and nothing mechanical says so —
  the reporting rule in B-10 is prose-only. The refusal of a bad value fires
  from the first trial's spawn, after that trial's fixture `Setup` has already
  run, not before the run begins.
- Verification: `tests/scripts/eval.test.js` — `resolveTrialTimeoutMs` returns
  900000 when the variable is unset or empty, `1800000` when set to it, and
  throws naming the variable on `abc`, `0`, `-5`, `1.5` and `30m`.

### D-018 — 6.1.1 repairs the instrument and learning's trust promises before anything is measured
- Date: 2026-09-30
- Version: 6.1.1
- Status: Accepted
- Decision: 6.1.1 ships as a patch carrying the three changes merged after the
  `v6.1.0` tag — the prompt audit's engine-prompt findings (#181), its skill and
  contributor findings (#182), and the hook registry's non-schema keys (#188) —
  together with the eval-instrument repairs the release benchmark depends on,
  the learning repairs that stop undoing what a user accepted, the corrected
  secrets-guard claim, and every edit under `skills/` known when the version
  was planned; the roadmap opens the row as `building` now rather than at
  release time.
- Why: Plugin code is cached by version, so a fix merged without a bump never
  reaches an installed copy. All three merged changes sat on `main` under
  `6.1.0` with no row to govern them, and `specs/eval.md` already carried
  D-017's behavior under a header that read `shipped v6.0.0`. The release is
  gated on a regenerated benchmark — #182 edited files under `skills/`, and
  `evals/benchmarks/latest.json` predates the `v6.1.0` tag — and the instrument
  that produces that benchmark is itself broken: trials inherit the operator's
  output style and user hooks (#170), a provider refusal is scored as a real
  trial, the model grader's prompt resolves to an empty string outside the
  arcforge repo and it grades anyway, and `eval run`, `list`, `report` and the
  dashboard count error trials in their verdicts. Measuring first would spend
  the quota on numbers nobody could trust, so the repairs ship first and
  6.1.1's measurement runs on the repaired instrument — which is also why every
  `skills/` edit known at planning lands here. Skill text that a later decision
  changes (D-024, D-038) is measured in 6.2.0's round (D-020). The learning
  repairs ride the same patch because
  each one undoes a choice the user already made: an activated instinct
  archived by decay that re-applies at every SessionStart, an opt-out the
  curator daemon does not honour, activation the dashboard offers and its own
  gate refuses, a hand-set config key erased by `learn enable`. Leaving them
  for a minor would leave that in place. Patch rather than minor because every
  change repairs something already shipped: no skill, CLI command, or hook is
  added, and D-017's `ARCFORGE_EVAL_TRIAL_TIMEOUT_MS` is a per-run setting on
  the eval harness, not new surface for someone using arcforge on a project.
- Cost accepted: `maintaining-obsidian` gains `references/lint_vault.py` inside
  this patch. It runs scans the skill's audit already described in prose, which
  is why it rides a patch, but it is a new file a user's session can execute.
- Residual: the row stays `building` until the scenarios D-021 names are
  re-measured on the repaired instrument; the patch does not tag before that
  run exists.

### D-019 — 6.1.2 is its own patch because it touches no eval-backed path
- Date: 2026-09-30
- Version: 6.1.2
- Status: Accepted
- Decision: The doc-versus-engine repairs — CLI messages and contract drift,
  hooks promises the engine never kept, loop state bugs, learning's smaller
  engine fixes, the website's install section, contributor tooling and repo
  hygiene — ship as 6.1.2, a patch that changes nothing under
  `skills/`, `evals/scenarios/` or `evals/fixtures/`.
- Why: `scripts/check-benchmark-freshness.js` demands a regenerated benchmark
  only when a change lands under one of those three prefixes. Keeping them out
  lets drift a user can read today be repaired without spending eval quota.
  Folding the work into 6.1.1 would lengthen the one release that already
  waits on a measurement; folding it into 6.2.0 would hold documentation fixes
  behind new CLI surface.
- Cost accepted: a 6.1.2 item whose honest repair needs a skill edit cannot
  ship in 6.1.2 — it takes a doc-side or engine-side fix there, or moves to
  6.2.0.
- Verification: at the 6.1.2 release, a `git diff --stat` from `v6.1.1` over
  those three paths is empty, and the freshness check exits 0 without a new
  snapshot.

### D-020 — 6.2.0 isolates new CLI surface and anything that moves learning state on disk
- Date: 2026-09-30
- Version: 6.2.0
- Status: Accepted
- Decision: New CLI commands (`learn instinct deactivate` and
  `learn instinct restore`), new exits in the Layer-5 Action × Status matrix,
  every change that moves or rewrites learning state already on disk, the
  dashboard's view of curator rejections, worktree paths derived from the repo
  root, and the scenario rubric fixes ship as
  6.2.0, a minor, measured in its own round of about 50 to 70 live sessions —
  the exact list is confirmed when the row is promoted to `building`.
- Why: Keeping new surface and state moves out of 6.1.1 and 6.1.2 leaves both
  patches reviewable as repairs and free of migrations. Each rubric fix bumps a
  scenario's `## Version` and empties its pool, so it needs that scenario re-run
  — which the roughly 80 sessions budgeted for 6.1.1 cannot hold. Batching the
  rubric fixes with whatever skill text the #179 decision (D-024) changes spends
  the second round once. A minor because commands are added.
- Residual: if the keyspace decision (D-037) chooses to migrate existing
  learning data rather than keep the basename key, this version becomes a major
  and is renumbered before it is built.

### D-021 — 6.1.1's benchmark reruns only the scenarios whose subject changed
- Date: 2026-09-30
- Version: 6.1.1
- Status: Accepted
- Decision: The 6.1.1 benchmark re-runs, on the repaired instrument, only the
  scenarios whose subject changed after the last snapshot or that the
  instrument repairs exist to read — router skill selection, the diagramming
  unverified-save claim (under a 1800 s ceiling, reported per D-017), executing
  verify-decides-done, finishing verify-before-options, and the two
  maintaining-obsidian scenarios (vault-only answer, audit runs the lint
  script) — about 80 live sessions together with the #179 routing run and a
  reserve for error trials.
- Why: #182 edited the `SKILL.md` of diagramming-obsidian, executing,
  finishing and maintaining-obsidian and added the lint-script scenario, and
  the router run doubles as the acceptance test for the #170 isolation fix.
  tdd and dispatching are not re-run: #182 touched only their `references/`,
  and the A/B loads a single skill file (`scripts/cli/eval-command.js`), so
  those files never reach a trial. A full rerun would spend several times the
  quota on pools whose subject did not move.
- Residual: every pool not re-run — brainstorming and tdd among them — was
  measured before the instrument repairs, under the leaking isolation and the
  refusal-as-trial scoring. The coverage ledger says so pool by pool, and no
  pool is described as re-measured that was not.
- Residual: the freshness gate compares timestamps, so a change under
  `skills/`, `evals/scenarios/` or `evals/fixtures/` that lands after the
  measurement commit still passes it. Before tagging, a `git diff --stat` from
  the measurement commit over those paths has to be empty — checked by hand.

### D-022 — Decay is idempotent, and it never archives an activated instinct
- Date: 2026-09-30
- Version: 6.1.1
- Status: Accepted
- Decision: Confidence decay charges each elapsed period once — running the
  cycle any number of times over the same interval gives the result of running
  it once — it never archives an activated instinct, and every archive it does
  perform writes an audit record.
- Why: learning B-4 says the product MUST NOT silently undo what the user
  accepted, and that retiring an instinct is its own explicit deactivation.
  Decay broke that with no opt-out involved at all: an automatic step removed
  an instinct the user had activated, reported only a count of what it archived
  and not which instinct, and left the queue claiming it was still `activated`.
  An activated instinct leaves the injected set only through the user's
  deactivation.
- Symptom: `runDecayCycle` (`scripts/lib/confidence.js`) computes the full
  weeks from `last_confirmed` to now at every SessionStart and writes back only
  `confidence`, never the timestamp, so the same weeks are charged again each
  session. An instinct at 0.50 confidence, confirmed four weeks earlier, moved
  to `archived/` on the fifth call; it stopped being injected, its queue status
  still read `activated`, and no audit line recorded the move. Verified at the
  function level only; it reaches project-scope instincts.
- Residual: instincts already over-decayed and archived are not restored by
  6.1.1. `learn instinct restore` (D-040) arrives in 6.2.0; until then the
  CHANGELOG names the manual move back.

### D-023 — The curator is a second outbound path: tool-less, under the opt-in, and named in the spec
- Date: 2026-09-30
- Version: 6.1.1
- Status: Accepted
- Decision: The curator's model run gets no tools, the observer daemon starts
  and analyzes only where learning is enabled, and learning B-1 and B-9 name
  the curator as a second outbound path beside diary enrichment.
- Why: B-9, D-009 and the learning-dashboard guide all promise that diary
  enrichment is the one outbound path. The observer daemon also sends
  observation batches to a model, with no tool restriction, while the proposal
  ingestor records that run's manifest as `tool_access: false`; and the daemon
  starts at every SessionStart whether or not learning is on. A privacy claim
  a user decides on is false in the direction that matters. Correcting the prose
  alone would make the record honest and leave an unrestricted outbound run
  that also ignores an opt-out, which B-1 does not allow.
- Symptom: `scripts/lib/learning-curator/observer-daemon.sh` sends the curator
  batch by invoking `claude --model haiku … --print` with no `--tools` or
  `--allowedTools` restriction; `checkDaemon`
  (`hooks/session-tracker/start.js`) checks only `ARCFORGE_OBSERVE_NO_SPAWN`,
  and the daemon analyzes once ten or more observations wait. Observation
  itself is gated, so the opt-out breach reaches a user who opted in, then out,
  and left unanalyzed observations behind — inferred from the code, not run.
- Residual: D-009's recorded Why calls enrichment the product's single
  outbound path. That text is immutable and is now incomplete; the correction
  lives here and in B-9, and D-009's decision itself stands.

### D-024 — `speccing` under plugin routing (#179): re-measure before deciding
- Date: 2026-09-30
- Version: 6.1.1
- Status: Accepted
- Decision: Proposed: re-measure whether `speccing` fires under real plugin
  routing on the repaired instrument; if the rate stays low, document it as
  user-invoked in practice rather than editing its description. Until
  accepted, it gates any edit to the `speccing` description and the final
  README and skills-reference wording about how it fires; disclosing the
  current measurement is not gated.
- Why: D-015's +0.67 was measured with the skill body injected
  (`--skill-file`). With the plugin loaded and the description left to route
  (`--plugin-dir`), `eval-speccing-spec-before-code` scored 0/10 across two
  k=5 runs in the release benchmark, the second after the earlier description
  was restored. Both runs were taken under the #170 isolation leak, so they
  cannot yet tell a routing defect from a contaminated instrument. Editing the
  description on them would tune the skill against noise; documenting the
  skill as user-invoked on them would retreat from D-015 on the same noise. A
  clean re-measurement settles which.
- Symptom: the README and the skills-reference guide describe a skill that
  fires on its own; only the CHANGELOG discloses the 0/10. The failing case is
  a user asking to leave product docs for later; `/speccing` typed by hand
  still works.
- Residual: if the re-measurement confirms the low rate and the documentation
  route is taken, D-015's premise no longer holds in practice. That reversal is
  recorded then, as its own entry superseding D-015, not folded into this one.

### D-025 — `claude plugin eval` measures routing and stays out of the release gate
- Date: 2026-09-30
- Version: 6.1.1
- Status: Accepted
- Decision: Proposed: use `claude plugin eval` only to measure whether a named
  skill fires under real plugin routing — first for #179 (D-024) — from an
  eval directory outside `evals/`, with `--no-publish`, an explicit `--model`
  and a `--max-cost-usd` on every run; it never produces the release snapshot
  and never enters the release gate. Until accepted, it gates the #179 routing
  run and the two-session isolation check that precedes it.
- Why: The existing harness cannot measure routing cleanly:
  `eval ab --plugin-dir` still injects the skill body in skill scope, so its
  arms are not "plugin loaded" against "plugin absent", and its trials leak the
  operator's settings (#170). `claude plugin eval` can assert that a specific
  skill was used and starts each run from a fresh home and config directory.
  It has no confidence intervals and writes no snapshot the freshness gate
  reads, so it cannot replace the benchmark. `--no-publish` is required
  because the default uploads the report to claude.ai.
- Residual: the feature sits under `experimental` with no public documentation
  page, and its isolation is inferred from the run layout, not yet observed —
  which is what the two-session check is for. If it does not isolate, #179 is
  measured on the repaired `arcforge eval` instead.

### D-026 — answering-feedback: the ledger records REGRESSED, and the cost flag is informational
- Date: 2026-09-30
- Version: 6.1.1
- Status: Accepted
- Decision: Proposed: the coverage ledger records the REGRESSED of the
  `code-review-answering-feedback` scenario as measured, and for an
  injection-type treatment the cost-regression flag is informational — it is
  reported, never counted toward the verdict. Until accepted, it gates the
  ledger correction and the rewrite of the 6.0.0 benchmark evidence note.
- Why: Under the non-regression policy (eval B-4) the verdict reads only
  whether every treatment trial passes; a treatment pass rate of 0.8 means one
  trial failed, and the cost flag never enters the verdict. The ledger and the
  6.0.0 benchmark evidence nonetheless book it as passing on score and driven
  by cost — a real REGRESSED entered as a pass. An injected skill adds tokens
  to every trial by construction, so a cost flag on it describes the
  treatment, not whether the treatment works.
- Symptom: `evals/benchmarks/latest.json` carries the REGRESSED;
  `evals/skill-eval-coverage.md` and the 6.0.0 benchmark evidence attribute it
  to cost.

### D-027 — Floor assertions keep the weight the engine gives them today
- Date: 2026-09-30
- Version: 6.1.1
- Status: Accepted
- Decision: Proposed: keep the engine's current computation of floor
  assertions in the pass bar and write that computation down in eval B-5 and
  the eval guide, settled before any 6.1.1 result is read. Until accepted, it
  gates reading the 6.1.1 results against the pass bar.
- Why: The question has no ruling on file, and it can decide a release
  verdict: `writing-skills` t1 passes on a floor score of 0.83. Settling it
  before the results are read keeps the ruling from being chosen to fit them;
  keeping the current computation keeps the pools not re-run (D-021)
  comparable with the ones that are.

### D-028 — obsidian's `index.md` rebuild is a write step of LINK mode
- Date: 2026-09-30
- Version: 6.1.1
- Status: Accepted
- Decision: Proposed: the full `index.md` rebuild is a write step of the
  audit's LINK mode, its procedure defined in the skill's
  `references/audit.md`. Until accepted, it gates that procedure and every
  reference that promises the rebuild.
- Why: Seven places — the ingest mode (twice), the bootstrap workflow, and
  the llm-wiki (twice), news and project-tracker presets — say the audit's
  LINT rebuilds `index.md`, while
  `audit.md` defines no procedure, `lint_vault.py` excludes the index, and
  obsidian B-5 says only link resolution modifies notes. After a batch ingest
  the index falls behind, and query reads it first. Placing the rebuild in
  LINK keeps B-5 true as written and gives the promise one home instead of
  seven; placing it in LINT would change B-5.

### D-029 — secrets-guard's docs say it scans the commit command, not the commit
- Date: 2026-09-30
- Version: 6.1.1
- Status: Accepted
- Decision: hooks B-4, the README and the hooks guide say that on `git commit`
  the guard scans the command string, not the content being committed;
  scanning staged content becomes the `secrets-guard-staged-scan` wish.
- Why: B-4, the README and the guide all say commit content is scanned; the
  Bash branch runs `scanForSecrets` over the command string and reads no staged
  file, so a user believes a check stands before every commit when none does.
  Either side can move. Fixing the docs costs three doc edits in this patch
  and removes a false safety claim now. Building the scan is new behavior: it
  reads the index on every `git commit` a session runs, on the synchronous path
  hooks B-7 keeps small, for a result that stays warn-only (B-3), and it needs
  its own cost measured before it ships — so it waits as a wish.
- Symptom: a credential staged in a file and committed through the session
  draws no warning; only one typed into the commit command itself does. Edits
  and writes are scanned as B-4 says. `hooks/README.md` already words it the
  way the code behaves.

### D-030 — The Claude review workflow runs on opened and ready-for-review PRs only
- Date: 2026-09-30
- Version: 6.1.1
- Status: Accepted
- Decision: The Claude code-review workflow runs only when a pull request is
  opened or marked ready for review, under a paths filter, instead of on every
  push. The workflow edit lands before 6.1.1's work-package PRs open.
- Why: Every push runs a full review, drawing on the same usage the eval
  measurements need; one branch ran it 26 times in a single day, and 6.1.1
  opens six or more PRs. No user of arcforge is affected either way.
- Cost accepted: a push after the PR is ready gets no automated review of its
  own.

### D-031 — hooks B-8 stops promising where the last session left off
- Date: 2026-09-30
- Version: 6.1.2
- Status: Accepted
- Decision: Proposed: remove "where the last session left off" from hooks B-8,
  the hooks guide, `hooks/README.md` and the README, so SessionStart promises
  what `inject-context` injects; building the carry-over becomes the
  `session-continuity-injection` wish. Until accepted, it gates the B-8 rewrite
  and the three doc edits.
- Why: `inject-context` injects activated instincts, pending reviews, the
  stale-draft warning, aliases and promotions — nothing from the previous
  session's record, which the session-tracker README itself says no hook reads
  back. Docs are the contract, so one side has to move. Removing the promise is
  a doc change that fits 6.1.2; building it adds content to every session's
  start, which is a product choice of its own.
- Cost accepted: the product stops advertising a continuity feature a user may
  have read about — one it never delivered.

### D-032 — Without a verify floor, a loop task is done on exit 0, and the loop says so
- Date: 2026-09-30
- Version: 6.1.2
- Status: Accepted
- Decision: Proposed: worktrees-loop B-6 states that a task with no `verify:`
  line, run without a run-level verify command, is done when its session exits
  0, and the loop warns at start when any task will run without a floor. Until
  accepted, it gates the B-6 rewrite and the start-up warning.
- Why: B-6 says the loop never accepts the model's self-report, but with no
  floor a clean exit is exactly that. The looping skill already says so, and a
  test pins the behavior. Refusing floor-less tasks would break task lists
  that work today; stating the rule and warning at start makes the
  self-report visible at the one moment a user can still add a floor.
- Symptom: `scripts/loop.js` marks a floor-less task done on exit 0 while B-6
  promises it cannot happen.

### D-033 — `check:product` widens by one decision: a clause convention, the C3 gaps, spec sections
- Date: 2026-09-30
- Version: 6.1.2
- Refines: D-006
- Status: Accepted
- Decision: Proposed: fix one convention for numbering a decision's clauses;
  then have C3 read the closed status vocabulary on every entry, reject a
  trailing `·`, and hold a clause number to one claimant; and add an eighth
  rule asserting that every spec carries the template's five section headings.
  Until accepted, it gates the `check:product` changes and the matching
  `product/AGENTS.md` text.
- Why: D-006's recorded text enumerates seven rules and names each C3 widening
  as needing its own decision. A clause-identity check has nothing to compare
  until clauses have one numbering convention, so the convention comes first.
  The section rule closes a fail-open: drop or indent a spec's `## Decisions`
  and C5 checks nothing in that spec, silently. None of the gaps has harmed an
  entry yet (#161, #163); closing them in a version that touches no eval-backed
  path costs no quota.
- Residual: the liveness of a `Refines:` or `Extends:` target stays untested,
  as D-006 chose deliberately. The CommonMark edge cases recorded in
  `docs/plans/check-product-deferred.md` stay open; how much CommonMark grammar
  the linter owns is a separate decision.

### D-034 — obsidian B-4's provenance pair is conditional on the vault adopting raw sources
- Date: 2026-09-30
- Version: 6.1.2
- Status: Accepted
- Decision: Proposed: obsidian B-4 follows the skill — the two-write ingest
  (the immutable original, then the typed note with `source_url` and
  `sha256`) applies in a vault whose contract declares `raw_source: adopted`,
  not in every vault. Until accepted, it gates the B-4 rewrite and the
  data-model line naming the provenance pair.
- Why: B-4 states the two writes unconditionally; the skill performs them only
  when the vault's contract adopts raw sources, and the project-tracker preset
  declares it not adopted. Under B-1 the vault's contract decides domain
  behavior, so the skill is the side that is right and the spec is the side
  that overclaims.

### D-035 — A candidate name Layer 7 cannot use is rejected at ingestion
- Date: 2026-09-30
- Version: 6.2.0
- Refines: D-012
- Status: Accepted
- Decision: Proposed: Layer 5 rejects at ingestion a candidate whose `name`
  the draft writer could not use as a filename or that the redactor would
  alter; names are not normalized at materialization. Until accepted, it gates
  the schema and ingestor changes.
- Why: D-012 left reject-versus-normalize open. Layer 5 checks a name's
  presence, type and length only, Layer 7 refuses a hostile one permanently
  with `path_policy_rejected`, and `approved` has no exit, so `approve` then
  `materialize` strands the candidate. Separately, `sanitizeRecord` leaves
  `name` untouched while `secret_scan` is marked passed unconditionally, so a
  key-shaped name reaches the queue, the draft filename, the draft body and
  the activated instinct the runtime loads (#175). Rejecting at the door closes
  both with one rule and keeps every stored name one the product can show;
  normalizing would keep two names for one candidate, the stored and the
  rendered.
- Residual: either fix moves `candidate_record_hash` (#175). Candidates
  already queued under such a name are not rewritten by this rule; they leave
  `approved` through the exit D-036 proposes.

### D-036 — Layer 5 gains two exits: dismiss from approved, materialize again from materialized
- Date: 2026-09-30
- Version: 6.2.0
- Extends: D-012
- Status: Accepted
- Decision: Proposed: the Layer-5 Action × Status matrix lets an `approved`
  candidate be dismissed and a `materialized` candidate be materialized again,
  so neither state is a dead end. Until accepted, it gates the matrix change,
  the frozen Layer-5 contract's matrix, and the dashboard and CLI actions that
  expose the two exits.
- Why: From `approved` the matrix allows only `materialize`, `promote` and
  `evolve`, so an approved candidate that materialize refuses — a non-instinct
  type or a hostile name — has no legal move (#160); D-012 recorded that dead
  end as deliberate while the curator has no renderer. A `materialized`
  candidate whose draft was edited or deleted allows only `activate`, which
  refuses on the hash mismatch, so one hand edit strands it (#165), and the
  guide's only remedy is restoring the file. Dismissing lets a reviewer retire
  a verdict that cannot proceed; materializing again rewrites the draft from
  the stored record, so the reviewed content and the file agree again.

### D-037 — The learning keyspace stays the project directory's basename
- Date: 2026-09-30
- Version: 6.2.0
- Status: Accepted
- Decision: Proposed: observations, instincts and candidates stay keyed on the
  sanitized basename of the project directory, and the collision between two
  same-named projects is recorded as a Residual and stated in the learning
  guide. Until accepted, it gates any keyspace change and that guide text.
- Why: Separating the two projects is a keyspace redesign, not a filter:
  `scope.project_id` cannot stand in, because it is taken from whichever
  observation wrote first, or a name hash, so filtering on it would hide
  candidates. Changing the key means migrating every existing user's learning
  data, which would make 6.2.0 a major (D-020), for a collision a user meets
  only with two project directories of the same name.
- Residual: two such projects share one observation store, one instincts tree
  and one candidate set, and `learn --project` cannot tell them apart (D-012).

### D-038 — Manually saved instincts are not activatable, and the product says so
- Date: 2026-09-30
- Version: 6.2.0
- Status: Accepted
- Decision: Proposed: an instinct saved by hand or from reflection is not
  activatable and is never injected; the learning guide and the save command's
  output say so. Until accepted, it gates the guide text, the command output,
  and the learning skill's "remember this" wording.
- Why: Injection takes only ids in the activation set, and activation is
  reached only through the candidate lifecycle and its three gates (learning
  B-3). A saved instinct creates no candidate, so a path to injection would
  either bypass those gates or add a second activation route beside them. What
  is broken today is the silence, not the exclusion: "remember this" reads as
  if the instinct will take effect, and nothing says it will not.
- Cost accepted: a rule the user states outright does not reach a future
  session through this path.

### D-039 — The Codex boundary stays where D-013 drew it this cycle
- Date: 2026-09-30
- Version: 6.2.0
- Status: Accepted
- Decision: Proposed: 6.2.0 leaves the Codex boundary unchanged — the seven
  CLI-backed skills keep reporting `command not found`, the hooks get no
  Codex-native implementation, cross-skill handoffs keep the slash notation,
  and the `claude`-spawning subsystems (learning's enricher and curator, eval,
  loop) get no runner seam — each stated
  as a Residual in codex-harness, its wish left in the backlog. Until
  accepted, it gates those Residual edits.
- Why: Each open item needs a maintainer decision about a boundary this cycle
  does not reopen. A skill-relative engine path breaks D1/D9; the
  SessionStart-hook route re-opens the hook-discovery guard D-013 closed; a
  Codex hook adapter is blocked on ownership and trust, not protocol;
  host-neutral handoffs reopen the frozen skill-schema §4.1/§5; and a
  harness-neutral runner is a prerequisite nobody has scheduled. None is cheap
  enough to ride a minor whose subject is learning's lifecycle.

### D-040 — `learn instinct restore` brings back a decay-archived instinct, audited
- Date: 2026-09-30
- Version: 6.2.0
- Status: Accepted
- Decision: A new command, `learn instinct restore`, moves an archived
  instinct back out of the archive — whatever archived it, decay or an earlier
  contradiction, since the user's explicit command outranks both — refuses
  rather than overwrites when an active instinct of the same name exists, and
  records the restore in the audit log with the archive reason when the file
  carries one.
- Why: 6.1.1 stops decay from re-charging and from archiving activated
  instincts (D-022), but instincts it already archived stay archived, and the
  only remedy until then is a manual file move the CHANGELOG describes.
  Hand-editing state is out of contract (learning B-5), so the way back has to
  be a command, and since it changes what may be injected it is audited like
  every other change of that kind.
- Cost accepted: new CLI surface — one of the two commands that make 6.2.0 a
  minor (D-020).

### D-041 — Rejections rotate to an archive and are never deleted
- Date: 2026-09-30
- Version: 6.2.0
- Status: Accepted
- Decision: Proposed: `rejections.jsonl` rotates to an archive file once it
  passes the Layer-5 contract's retention limits (30 days, 5,000 records,
  10 MB); no rejection record is deleted. Until accepted, it gates the
  retention code in the queue writer.
- Why: The Layer-5 contract sets those limits and nothing implements them, so
  the file only grows. Deleting would satisfy the limits and erase the only
  record of what the curator declined and why — the record the
  dashboard-rejections work in the same version shows the user. Rotation bounds
  the live file and keeps the history.
- Residual: the archive itself is unbounded, and `queue.jsonl` rotation stays
  deferred.

### D-042 — Reflection counts only enriched diaries
- Date: 2026-09-30
- Version: 6.2.0
- Status: Accepted
- Decision: Proposed: learning B-8's three-diary threshold counts only
  diaries whose sections were enriched; an unenriched draft stub does not count
  toward readiness. Until accepted, it gates the B-8 definition and the
  readiness count.
- Why: Under the opt-in, an unenriched stub is counted toward the three
  diaries, which produces a false "ready" nudge and a reflection with nothing
  to mine (#169). B-8 exists so reflection does not overclaim, and a stub is
  not evidence a pattern can be drawn from. Filtering the count directly would
  break its other readers, so B-8 defines what counts first and the code
  follows the definition.

### D-043 — Graders never execute trial output
- Date: 2026-09-30
- Version: 6.2.0
- Status: Accepted
- Decision: Proposed: an eval grader never runs code a trial produced; the A5
  floor of `eval-speccing-spec-before-code` (#156) becomes a static check over
  the trial's files instead of a `node -e` probe of the exported function.
  Until accepted, it gates the #156 repair.
- Why: The repair the backlog recorded — a grader-owned probe of
  `formatFor('csv', run)` — would have the grader execute code the agent under
  test just wrote, on the operator's machine with the operator's permissions,
  and trial isolation today is advice rather than a sandbox. A static check is
  weaker evidence that the CSV branch works, but it cannot be turned against
  the machine that grades it.
- Cost accepted: the A5 floor can still pass on code that reads right and does
  not run. The floor ships with the scenario's other three rubric repairs
  (#157, #162, #168) in one `## Version` bump and a k=10 rerun of both arms.

### D-044 — `speccing` is user-invoked in practice
- Date: 2026-10-01
- Version: 6.1.1
- Supersedes: D-015 (clause 1)
- Status: Accepted
- Decision: The README and the skills-reference guide say users invoke
  `speccing` as `/arcforge:speccing`; its description is not edited in 6.1.1,
  and a description redesign, if any, is a 6.2.0 question with its own
  measurement. D-015's second clause — the skill never bootstraps product
  state unasked — stays in force.
- Why: D-024's re-measurement ran through `claude plugin eval` on a
  verified-clean instrument: in 0 of 10 runs did the model invoke `speccing`,
  or make any Skill call at all. A control case on the same instrument invoked
  `arcforge:brainstorming` in 5 of 5 runs, so headless plugin routing works and
  the low rate is specific to `speccing`'s description, not to the instrument.
  D-024 pre-registered the default for that outcome — document the skill as
  user-invoked in practice rather than tune its description — and D-015's
  premise, that the skill fires on its own mid-task, does not hold.
- Verification: `docs/plans/v6.1/wp-e/speccing-trigger.aggregate.json` (0/10)
  and `docs/plans/v6.1/wp-e/routing-control.aggregate.json` (5/5);
  `docs/plans/v6.1/wp-e/isolation-check.aggregate.json` is the two-session
  isolation check D-025 required, passed on both runs.
- Residual: the skill's frontmatter still lacks `disable-model-invocation`, so
  the host still offers `speccing` to the model and it may still fire on its
  own, rarely. Adding the key is a `skills/` edit, left to 6.2.0.

### D-045 — The four ceiling BLOCKs in 6.1.1's round are findings about the scenarios
- Date: 2026-10-01
- Version: 6.1.1
- Status: Accepted
- Decision: The preflight BLOCKs of `eval-executing-verify-decides-done`,
  `eval-router-skill-selection`,
  `eval-maintaining-obsidian-audit-runs-lint-script` and
  `eval-maintaining-obsidian-link-rebuilds-index` are recorded as findings,
  not as failures of their skills: those skills keep their last evidence,
  marked as measured on the pre-repair instrument, and redesigning each
  scenario for the clean instrument is backlog work.
- Why: On the repaired instrument the baseline already passes these four
  scenarios, so a good skill and a useless one score the same and no delta
  could be read (eval B-3: a BLOCK is a verdict about the scenario, not the
  change). The rest of D-021's round measured: finishing +0.71, diagramming
  +0.20 and maintaining-obsidian vault-only +0.20, all IMPROVED. Calling the
  four BLOCKs regressions would blame the skills for a ceiling the instrument
  repair exposed; quietly dropping them would hide that four pools carry no
  fresh evidence.
- Residual: D-028's behavior, the `index.md` rebuild in LINK mode, ships with
  a passing structural test but without harness evidence, because the
  scenario written to measure it has its baseline at ceiling.
- Cost accepted: about 34 live sessions spent on a first batch run on an
  instrument that denied tools before #213, all discarded.
- Verification: the seven preflight readings of the round, copied out of the
  gitignored cache, are `docs/plans/v6.1/wp-f/preflight.<scenario>.json` —
  each carries its baseline pass rate, k, model, effort, turn budget, ceiling
  and timestamp. The four BLOCKs read 100% at k=3 on `opus[1m]` / `xhigh`,
  2026-09-30.

### D-046 — Restore returns an instinct without its archive stamp
- Date: 2026-10-01
- Version: 6.2.0
- Status: Accepted
- Refines: D-040
- Decision: `learn instinct restore` removes `archived_at` and `archive_reason`
  from the file it returns to the active set, and keeps
  `decay_charged_through`; it still refuses a same-name collision and audits
  the archive reason it removed (B-11).
- Why: D-040 specified the move, the collision refusal and the audit, not what
  the restored file carries. Left in place, `archive_reason` would label a
  later archive of the same instinct with the old reason, and `archived_at`
  would date it to the earlier archive, so a reader could not tell the second
  archive from the first. `decay_charged_through` is the opposite case: it
  records the weeks decay has already charged, and removing it would let the
  next cycle charge those weeks again and re-archive the instinct the user
  just restored — the loop D-022 closed. The audit record keeps the removed
  reason, so nothing is lost; only the file stops claiming it.

### D-047 — 6.2.0's round: the supersede ceiling is measured, and B-6 has evidence
- Date: 2026-10-01
- Version: 6.2.0
- Status: Accepted
- Decision: Two readings of 6.2.0's round are recorded as findings, not
  failures: `eval-speccing-supersede-not-overwrite` Version 8 BLOCKed at
  preflight (baseline 3/3), so the scenario stays corpus coverage without
  A/B evidence and its rubric redesign stays open work; and
  `eval-speccing-no-bootstrap-unasked` spent its one pre-registered redesign
  (Version 1 BLOCKed, Version 2 PASSed) and then measured **+0.20
  CI[0.06, 0.34] IMPROVED** at k=5, which is sdd B-6's first harness evidence.
- Why: The V8 reading is the first baseline taken on the V7+ grader and the
  repaired instrument, so the ceiling D-015 recorded as a prediction (the 8/8
  re-score) is now measured; eval B-3 makes that a verdict about the scenario,
  not about `speccing`. The no-bootstrap V1 baseline wrote a `## Roadmap` and
  a `## Decisions` into `README.md` while its A2 looked only for new files;
  V2's A2 diffs every doc file against the fixture, and its baseline then
  failed A2 in 5 of 5 trials. The rest of the round measured:
  `eval-learning-marker-preservation` +1.00 CI[1, 1] (D-038's sentence) and
  `eval-speccing-spec-before-code` Version 3 +0.60 CI[0.51, 0.68] at k=10
  (D-043's static A5 and the #157/#162/#168 repairs), both IMPROVED; V2's
  +0.67 is now the pre-repair reading.
- Residual: the supersede redesign is the
  `redesign-speccing-supersede-not-overwrite` wish — `supersede-v7-preflight`
  graduated into 6.2.0 (D-020) and this round spent it on the reading. Until a
  redesign is measured, B-4's append-only behavior has no A/B evidence. The
  no-bootstrap treatment passed 4 of 5, not 5 of 5.
- Cost accepted: 55 live sessions of a 70 budget, 3 of them on a no-bootstrap
  Version 1 that BLOCKed.
- Verification: `docs/plans/v6.1/wp-s/preflight.<scenario>.json`, one per
  scenario and the final reading of each, on `opus[1m]` / `xhigh` at k=3,
  2026-10-01; the A/B pools are in the snapshot
  `evals/benchmarks/2026-10-01.json` (= `latest.json`, generated
  2026-10-01T09:13:37Z).

### D-048 — 6.2.1 is its own patch because it touches no eval-backed path
- Date: 2026-10-02
- Version: 6.2.1
- Status: Accepted
- Decision: The repairs found after `v6.2.0` — the eval dashboard hiding an
  arm whose pool only failed (#212), `eval report` overwriting a same-day
  snapshot and `eval history` listing only bare-date files (#242), loop run
  state written in place (#244), the observe hook's lazy daemon start trusting
  a dead process's lock (#243), `check:product` C3 rejecting a relation aimed
  at an already-dead decision (#163, D-050), and the `releasing` skill's flip
  commit under a squash-only ruleset (D-052) — ship as 6.2.1, a patch that
  changes nothing under `skills/`, `evals/scenarios/` or `evals/fixtures/` and
  runs no live eval session.
- Why: Each item repairs a promise already made — eval B-9 says snapshots
  keep history, worktrees-loop B-4 says a run survives a crash, learning's
  domain model says a dead daemon's lock is reclaimed — or repairs the
  contributor gate and checklist themselves; none adds a command or a skill.
  Staying out of the three prefixes means `scripts/check-benchmark-freshness.js`
  demands no new benchmark, so the patch costs no quota — D-019's shape.
  Folding the items into 6.3.0 would hold them behind a measurement round,
  and #242 has to land before that round in any case: a round that reports
  more than once in a day would overwrite its own snapshots, the loss that
  forced a hand-copied `2026-10-01-v6.1.1.json`.
- Cost accepted: an item whose honest repair turns out to need a skill edit
  cannot ship in 6.2.1; it moves to 6.3.0.
- Verification: at the 6.2.1 release, a `git diff --stat` from `v6.2.0` over
  `skills/`, `evals/scenarios/` and `evals/fixtures/` is empty, and the
  freshness check exits 0 without a new snapshot.

### D-049 — 6.3.0 measures the five ceiling redesigns, and carries what re-arms the gate
- Date: 2026-10-02
- Version: 6.3.0
- Status: Accepted · partially superseded by D-054
- Decision: 6.3.0, a minor, graduates the five `redesign-*` wishes —
  `eval-executing-verify-decides-done`, `eval-router-skill-selection`,
  `eval-maintaining-obsidian-audit-runs-lint-script`,
  `eval-maintaining-obsidian-link-rebuilds-index` and
  `eval-speccing-supersede-not-overwrite` — and measures them in one round,
  launched from the maintainer's main session on `opus[1m]` / `xhigh`,
  isolated, without `--plugin-dir`, the skill injected with `--skill-file`, at
  the 900 s trial ceiling, capped at about 80 trial sessions, under a rule
  fixed before any result is read: each scenario gets a new `## Version` and
  a preflight at k=3 — so `eval-maintaining-obsidian-audit-runs-lint-script`'s
  redesign removes the `skip` its `## Preflight` section carries today; a PASS
  goes to an A/B at the scenario's own `## Trials` (k=10, 20 trial sessions,
  for `eval-executing-verify-decides-done`, whose file documents k=5 reading
  INCONCLUSIVE; k=5, 10 trial sessions, for the other four); a BLOCK gets
  exactly one redesign, written down before a second preflight, except
  `eval-speccing-supersede-not-overwrite`, which spent its redesign in 6.2.0
  (D-047), so its new Version is its last design and a BLOCK there is final;
  a second BLOCK is recorded as a finding with no A/B, and the scenario is not
  run again in this round. A scenario that an offline review, before any live
  session, finds cannot be made discriminating without an engine change may be
  recorded as a finding without spending a session. A/Bs start in this order —
  link-rebuilds-index, router-skill-selection, executing-verify-decides-done,
  supersede-not-overwrite, audit-runs-lint-script — and an A/B that would take
  the round past the cap is not started and is recorded as not measured,
  never run at a smaller k. The same version carries the `diagramming-obsidian` helpers'
  `ERROR:` lines (#228), `lint_vault`'s fence-versus-code-span fix (#210), and
  the stale-draft floor's enable stamp (#164, D-051).
- Why: None of the five has usable A/B evidence on the repaired instrument —
  four BLOCKed at ceiling in 6.1.1's round (D-045) and the supersede scenario
  in 6.2.0's (D-047) — so the claims of executing, the router,
  maintaining-obsidian's audit and LINK mode, and sdd B-4 rest on pre-repair
  numbers or on none. The cap counts trial sessions, as D-021's and D-047's
  totals did, and it is what binds: five preflights and five A/Bs come to 75,
  and each second preflight adds 3, so the round cannot fund every outcome
  and the order decides what goes unmeasured. `link-rebuilds-index` leads
  because D-028's LINK-mode rebuild has no harness evidence at all. Stopping
  at the second BLOCK is the D-045 /
  D-047 precedent: re-running a scenario until it passes turns the preflight
  into a search for a rubric the baseline happens to fail, and a BLOCK is a
  verdict about the scenario (eval B-3). #228 and #210 are skill-local scripts
  inside the two obsidian skills, under `skills/`, so they re-arm the benchmark gate and
  cannot ride 6.2.1; riding a round that runs anyway costs them nothing extra.
  Both are deterministic changes to skill-local scripts with the `SKILL.md`
  instructions untouched, and their evidence is the scripts' contract tests
  under `tests/skills/` — the form `.claude/rules/skills.md` prescribes for a
  skill-local script: for #228 the pins marked KNOWN BUG (6.2.0) flip, and #210
  gains a new case — not an A/B. #164 changes learning's
  on-disk config, which D-020 placed in a minor.
- Residual: not in 6.3.0, and staying where they are — the wishes
  **skill-body-trim**, **diagramming-headless-fallback**,
  **bound-transcript-parse**, **product-cli**, **project-keyspace-collision**,
  **speccing-spec-in-sync-eval**, **speccing-router-adjacency-eval**,
  **plugin-eval-corpus-migration**, **eval-trial-sandbox**,
  **cli-human-output**, **eval-compare-skip-analyzer** and every wish under
  Harness and Hooks; the issues #184 and #185; and whether Codex's `$`
  mention carries the `arcforge:` namespace, which stays unmeasured by the
  owner's call of 2026-10-01.
- Residual: #210 and #228 ship without harness evidence of how an agent acts
  on the new script output, and no scenario in this round can reach it: a
  skill-scope A/B injects `SKILL.md` alone, so a skill's `references/` reach a
  trial only when a fixture copies them in, where both arms see them — the
  limit that stops `eval-maintaining-obsidian-audit-runs-lint-script` from
  discriminating, and the reason #185 is still open. D-045's Residual is the
  precedent: D-028's behavior shipped on a structural test without harness
  evidence. Measuring it is the **eval-skill-files-outside-trial** wish.
- Cost accepted: up to about 80 trial sessions, plus model-grader calls the
  cap does not count — a scenario with model-graded assertions spawns one
  grader call per graded trial, preflight included. On `main` that is
  `eval-router-skill-selection` and
  `eval-maintaining-obsidian-audit-runs-lint-script` (both `mixed`); the
  other three grade by code, and a redesign that makes a scenario code-graded
  removes that cost. A scenario that BLOCKs twice, or whose A/B the cap does
  not reach, ends the round with no A/B evidence, its skill keeping the
  evidence it had — the outcome D-045 recorded for four of the same five.

### D-050 — C3 rejects a `Refines:` / `Extends:` written after its target died
- Date: 2026-10-02
- Version: 6.2.1
- Refines: D-006
- Status: Accepted
- Decision: C3 reports a `Refines:` or `Extends:` whose target's `Status:`
  carries a total flip, `Superseded-by: D-SSS`, when `D-SSS` is lower than the
  `D-id` of the entry carrying the relation — the target was already replaced
  when the relation was written; a target whose total flip names a higher
  `D-id` than the relating entry, a target that is only partially superseded,
  and a `Proposed` target all stay legal.
- Why: D-006 promised existence and backward direction only, and named
  liveness as a widening that needs its own decision. A refinement of a dead
  decision sharpens a choice no longer in force, and a reader who follows the
  relation lands on a reversed entry with nothing in the log saying so. The
  rule is order-sensitive because the log is append-only: a relation written
  while its target was live stays a correct record after a later decision
  kills the target, and it cannot be edited in hindsight. A partially
  superseded entry still governs its other clauses, which is exactly what a
  refinement sharpens, and a `Proposed` entry is still open. Every relation
  in the log when this entry was written — D-013, D-033, D-035, D-036, D-046,
  and D-050 to D-052 themselves — names a live target, so the rule lands
  green. It is a clause of C3, not an eighth rule,
  the way D-033's widenings were; the constraints are the ones recorded in
  `docs/plans/check-product-deferred.md` §1.
- Residual: the comparison is strict. An entry that both supersedes a
  decision whole and refines or extends the same decision carries an equal
  `D-id` on both sides, and this rule does not report it.
- Verification: `tests/scripts/check-product.test.js` carries the case that
  used to pin a refinement of an already-superseded entry as legal, now
  reported as two C3 errors, and a positive case for a relation written while
  its target was still live; its neighbour
  `check-product-relation-liveness.test.js`, in the same directory, carries
  the rest — negative and positive cases for `Refines:` and `Extends:`, folded
  targets, and the equal-id Residual.

### D-051 — The stale-draft floor survives a disable of an overlapping scope
- Date: 2026-10-02
- Version: 6.3.0
- Refines: D-009
- Status: Accepted
- Decision: Each scope's learning config records when its latest authorized
  period began, in an additive `enabled_at` field that an enable which changes
  the state writes, a no-op leaves alone, and a disable keeps — a disable
  that finds none writing into it the stamp of the enable it ends; the effective
  opt-in becomes the start of the unbroken stretch of any-scope authorization
  that reaches the present, so global on at T1, project on at T2 and global
  off at T3 later than T2 leaves it at T1; and a config without `enabled_at`
  reads as it does today.
- Why: D-020 graduated the **stale-draft-floor-overlapping-opt-in** wish into
  6.2.0, but 6.2.0 shipped the overlap case as an accepted cost, not the
  fix — D-009's Residual,
  hooks B-6 and the comment above `learningEnabledSince` in
  `scripts/lib/learning.js` — because a scope's `updated_at` records only its
  latest transition, so the disable overwrote the T1 it replaced. That silence
  hides a real enrichment failure from a user whose consent never lapsed,
  which is the warning the healthcheck exists to give. A separate field
  recovers T1 without changing what `updated_at` means, and an additive field
  keeps every existing config valid. D-009's Decision is untouched — enrichment
  stays gated, unprivileged, and silent about stubs written with learning off
  — so this narrows one of its Residual's silences rather than reversing a
  clause. The same instant bounds the observer daemon's analysis (learning
  B-1); that does not reach back across an opt-out, because in the overlap case
  authorization never lapsed (D-023).
- Residual: only a scope's latest period is recorded, so an overlap earlier
  than a scope's last re-enable is not recovered — global on at T1, project on
  at T2, global off at T3 and on again at T4 leaves the floor at T2. D-009's
  other floor silences and false alarms stand.

### D-052 — Under a squash-only ruleset the flip is its own commit on the branch, not on `main`
- Date: 2026-10-02
- Version: process
- Refines: D-008
- Status: Accepted
- Decision: The `releasing` skill keeps the product-state flip as its own
  commit on the release branch, ahead of the release commit, so it is reviewed
  separately, and says that the squash merge the repository ruleset requires
  lands the flip and the release commit on `main` as one commit.
- Why: The ruleset allows squash merges only, so all three releases of
  2026-10-01 reached `main` as one commit each and D-008's separate flip
  commit survived on none of them; the skill told the releaser a thing the
  repository makes impossible. The maintainer chose to make the skill follow
  the ruleset rather than open a merge-commit exception for releases. The
  review benefit of the separate commit survives on the branch.
- Cost accepted: D-008's reason for the separate commit — reverting a bad
  version bump without dragging the product history back with it — no longer
  holds on `main`. Reverting a release commit there reverts the flip too, and
  the flip has to be re-applied by hand.

### D-053 — A disabled scope's period counts only when its own disable recorded it
- Date: 2026-10-02
- Version: 6.3.0
- Refines: D-051
- Status: Accepted
- Decision: A 6.3 disable also writes `disabled_at`, equal to the
  `updated_at` it stamps, and a disabled scope contributes its period only
  while the two agree; an enabled scope's period starts at the later of
  `enabled_at` and its `updated_at`, and a disable stores that start as
  `enabled_at`; a disabled period joins the stretch only when its disable came
  strictly after the other scope's period began; and every ambiguity resolves
  the instant later, never earlier.
- Why: Review of the D-051 branch enumerated mixed 6.2/6.3 histories and found
  24 of 37,448 that read an instant earlier than the start of unbroken
  authorization. A 6.2 engine stamps `updated_at` on its own transitions and
  leaves `enabled_at` behind, so a 6.2 enable followed by a 6.2 disable
  produced a period spanning an opt-out, and the curator would analyze across
  it (B-1, D-023). The global config is machine-wide, so any older engine
  touching it is enough; no deliberate downgrade is needed. Too late only
  hides a stale-draft warning; too early breaks consent.
- Verification: with the marker, zero early readings over 37,448 mixed
  6.2/6.3 runs, 271,452 runs that also mix 6.1.0 (five events), 69,904
  including 6.0.0 (four events), 18,724 6.3-only runs with tied instants, and
  60,000 sampled six-event histories; tests in
  `tests/scripts/learning-enabled-since.test.js` and
  `tests/scripts/learning-opt-in-period.test.js`.
- Residual: within the guarantee — configs arcforge wrote itself, a clock that
  never runs backwards — errors fall on the late side only: a period an older
  engine ended or changed is not counted, so the stale-draft warning stays
  silent about drafts in it and the curator's window starts later than it
  could (2,312 vs 1,532 late readings over the 37,448 mixed runs). Outside it
  — hand edits, restored backups, a clock that ran backwards — the stamps are
  read as written and the instant can land earlier.
- Cost accepted: one more additive key per scope config.

### D-054 — 6.3.0's round: the router measures, and four scenarios are findings
- Date: 2026-10-02
- Version: 6.3.0
- Supersedes: D-049 (clause 2)
- Supersedes: D-049 (clause 3)
- Status: Accepted
- Decision: Numbering D-049's `Decision:` clauses in the order written — (1)
  scope, conditions and cap; (2) each scenario gets a new `## Version` and a
  preflight at k=3; (3) a PASS goes to an A/B at the scenario's own
  `## Trials`; (4) one redesign on a BLOCK; (5) a second BLOCK is a finding;
  (6) the offline no-session outcome; (7) the A/B order and the cap rule;
  (8) #228, #210 and #164 — clauses 2 and 3 are replaced: a scenario gets a
  new Version and a preflight unless an offline review before any session
  finds that it needs an engine change (clause 6) or that its recorded
  baselines already do the behavior; and a PASS goes to an A/B only when the
  assertions that earned it measure the behavior under test. Of D-049's five
  scenarios one was measured:
  `eval-router-skill-selection` Version 2 passed preflight (baseline 0/3) and
  read **+1.00 CI[1, 1] IMPROVED** at k=5. The other four are findings with no
  A/B: `eval-maintaining-obsidian-link-rebuilds-index` Version 2 passed
  preflight (1/3) and its A/B was not run, a departure from D-049's clause 3
  taken after the preflight was read, in the conservative direction;
  `eval-maintaining-obsidian-audit-runs-lint-script` was recorded before any
  session as needing an engine change, the outcome D-049's clause 6 permits;
  and `eval-executing-verify-decides-done` and
  `eval-speccing-supersede-not-overwrite` got no new Version and no preflight,
  a departure from clause 2, because their recorded baselines already do the
  behavior. The link-rebuilds-index and supersede
  scenarios are retired as A/B scenarios and kept as corpus coverage.
- Why: The router reading holds up under audit: every baseline noticed that
  `uniqueSlug` had no test and merged anyway, and every treatment committed a
  real passing test before the merge, so no grader blind spot handed out a
  pass. The link-rebuilds-index PASS came from A4 (note edits), whose premise
  is false: the fixture carries a plain-text relationship and the skill's LINK
  step resolves relationships. All three baselines rebuilt the index
  correctly, and a treatment that follows the skill's LINK step would edit
  notes and fail A4 — no treatment ran, so that is the rubric's prediction,
  not a reading. An A/B would have measured A4, not the rebuild, so none was spent and
  no improvement is claimed; the one further redesign D-049 allowed was not
  used, because two designs have now shown the baseline rebuilding unprompted.
  The executing claim formalizes existing behavior — 26 of 37 recorded
  baselines mark a real-work task in progress before doing it — and 8 of 8
  recorded supersede baselines supersede unprompted, with that scenario's
  redesign spent in 6.2.0 (D-047). The audit-runs-lint-script fixture must put
  the skill's `references/` inside the trial directory, where the baseline
  reads it too. A scenario whose baseline does the behavior unprompted across
  two designs measures the model, not the skill, so retiring it as an A/B
  beats designing a third trap for the same claim. Clauses 2 and 3 were not
  honored and are no longer how a result is read, so they are superseded
  rather than refined: leaving them `Accepted` beside this entry would keep
  two protocols that contradict each other, and a reader of D-049 alone could
  not tell it was departed from. Clauses 1 and 4 to 8 still govern — the
  conditions and the cap, the one-redesign rule, the second-BLOCK finding, the
  engine-change outcome, the A/B order, and #228, #210 and #164.
- Residual: the router result shows what the router's `SKILL.md` text does
  when injected at skill scope on `opus[1m]` / `xhigh`: the agent turns
  noticing an untested function into a committed test before merging. It does
  not show routing under a real plugin load (D-024, D-044), other fixtures,
  models or efforts, or red-first ordering inside `tdd`. Its CI[1, 1] is the
  engine's zero-variance interval for 0/5 against 5/5 and says nothing about
  precision: the direction is supported (Fisher's exact p ≈ 0.008), but the
  size of the effect is not established at k=5 — a Newcombe interval for the
  difference is about [0.39, 1.00]. D-028's index rebuild,
  `executing`'s verify-decides-done claim, sdd B-4's append-only behavior and
  the audit's lint pass still have no A/B evidence. #228 and #210 ship on
  contract tests (D-049's Residual), and #164 is engine-only. Instrument gaps
  the round found are wishes: preflight writes no result rows, preflight
  records carry no Node version, A/B rows carry neither the Node version nor
  the scenario hash, and the operator's `PATH` reaches trials; #250 is
  already filed.
- Cost accepted: 16 trial sessions of an 80 cap — link-rebuilds-index
  preflight 3, router preflight 3 and A/B 10 — and no model-grader calls,
  both scenarios being code-graded. The router treatment's per-trial time rose
  from 20.2 s to 39.4 s and its output tokens from 1,646 to 3,484, flagged as a
  cost regression; that is the test-writing the skill asks for.
- Verification: the preflight records
  `docs/plans/v6.3/wp-h/preflight.eval-router-skill-selection.json` and
  `docs/plans/v6.3/wp-h/preflight.eval-maintaining-obsidian-link-rebuilds-index.json`,
  each carrying its scenario hash, model, effort, turn budget, ceiling, k,
  pass rate, verdict and timestamp (`opus[1m]` / `xhigh`, k=3, 2026-10-02);
  the A/B pool is in the snapshot `evals/benchmarks/2026-10-02.json`
  (= `latest.json`, generated 2026-10-02T17:38:15Z). Neither records the Node
  version or the commit; Node v24.13.1 and commit `20edf82e` are recorded by
  hand in the 6.3.0 section of `evals/skill-eval-coverage.md`, with the
  operator audit of every row.

### D-055 — 6.4.0: the session archive returns, the 6.3.1 engine fixes ride with it, and one round measures both
- Date: 2026-10-03
- Version: 6.4.0
- Status: Accepted
- Decision: 6.4.0, a minor, carries (1) the session archive's return as a
  sixth CLI group, `arcforge session`, with the `sessions` skill instructions
  that drive it, as D-056 designs it; (2) the engine fixes planned as 6.3.1 —
  a live observer daemon read as stale without a usable `ps` (#247), a manual
  `observer-daemon.sh stop` or `status` racing a start (#252), the shared
  atomic-write helper's one temporary name for every writer (#253), the diary
  tool counter losing increments under concurrent PostToolUse hooks (#260),
  and code graders run from the trial directory, which put it on Python's
  import path — fixed by running every code grader from an empty temporary
  directory (#250); (3) the README and `docs/guide/skills-reference.md`
  saying that `speccing` replaces the v5 spec-driven pipeline, with files
  instead of an engine; (4) two corrections to past CHANGELOG entries, carried
  in the 6.4.0 entry — 6.3.0's "the line ends in the command that installs
  it" does not hold for a missing `uv`, and 6.0.0 left out that the session
  save, resume, list and alias set was dropped; and (5) one measurement round
  on `opus[1m]` / `xhigh`, capped at about 40 trial sessions, under a plan
  fixed before any result is read: (i) the `sessions` skill's handover and
  present-then-stop behaviour, at skill scope; (ii) a router regression run of
  `eval-router-skill-selection` Version 2, behind a fresh 3-session preflight,
  because #250's fix edits that scenario file and `eval ab` looks its
  preflight record up by the file's hash — a BLOCK there means the baseline
  now passes Version 2 without the skill text, contradicting 6.3.0's 0/5
  baseline (D-054), and is recorded as a finding with no A/B, the 6.3.0
  result annotated in the ledger as not reproduced on the 6.4.0 tree; and
  (iii) the `diagramming-obsidian`
  verify-exit sentence (`SKILL.md`, the paragraph after the verifier command)
  only if a scenario designer first shows that the current engine can make the
  two arms differ — otherwise it is recorded as a finding, with no session
  spent. #256, #184 and #185 stay out, and stay open.
- Why: Three things meet in one version. `skills/core/diagramming-obsidian/SKILL.md`
  changed on `main` after `v6.3.0` (#267, the verify-exit sentence for #228)
  with no harness evidence, so whatever ships next re-arms the benchmark gate
  and pays for a round — a 6.3.1 of engine fixes would have paid for one too.
  6.0.0 folded v5's `arc-managing-sessions` into `sessions` and dropped its <!-- doc-ref-lint: ignore R4 names the v5 skill 6.0.0 folded into sessions; historical, not a reference -->
  save/resume/list/alias archive with no decision and no CHANGELOG line, while
  the engine modules it ran on stayed shipped and unexposed; the owner wants it
  back. A new CLI group makes the version a minor by the 6.2.0 precedent
  (D-020), so the engine fixes ride it and one round is paid for instead of two.
  Each engine fix repairs a promise already made: learning's domain model says
  one daemon runs per machine, learning B-5 says its formats are atomically
  overwritten, hooks B-7 says the threshold fires at 50 tool calls, and eval
  B-12 says a grader never runs what a trial produced — a planted module a
  grader imports is exactly that. The CHANGELOG corrections are owed because
  the CHANGELOG is the release's record: a sentence there that does not hold,
  or a removal it never mentioned, stays wrong until a later entry says so.
  (iii) is conditional because of D-049's Residual: a skill-scope A/B injects
  `SKILL.md` alone, and the verify-exit sentence is about how the agent reads
  a skill-local script's output, which reaches a trial only through a fixture
  both arms see. Spending sessions on a scenario that cannot discriminate buys
  a BLOCK, not evidence.
- Residual: if (iii) ends as a finding, the sentence ships on its text alone,
  as #228's and #210's script changes did on contract tests (D-049); measuring
  it waits for the **eval-skill-files-outside-trial** wish. The `session` CLI
  pieces and the five engine fixes ship on contract tests, not on a live
  session. Every wish D-049's Residual kept back stays in the backlog, along
  with #256, #184 and #185.
- Cost accepted: up to about 40 trial sessions — a worst case of 39, three
  preflights of 3 and three A/Bs of 10, the third pair only if (iii)'s design
  gate passes — plus any model-grader calls the cap does not count. The engine fixes reach users later than a 6.3.1
  would have, because they wait for the round.
- Verification: the round's preflight records and A/B pools, written down the
  way D-054's were; the 6.4.0 CHANGELOG entry carries both corrections; and
  `npm run check:docs` holds the new group's documentation to the CLI manifest.

### D-056 — The session archive returns as `arcforge session`, on the handover's five sections
- Date: 2026-10-03
- Version: 6.4.0
- Status: Accepted
- Decision: (1) A sixth CLI group, `arcforge session`, with
  `save <alias> --from <path|->`, `resume <alias|path>`, `list`, and
  `alias set <name> <archive-path>`, `alias remove <name>` and
  `alias list [--json]`, exposes the engine modules that
  survived v5 unexposed — `scripts/lib/session-utils.js` and
  `scripts/lib/session-aliases.js`. (2) An archive is an engine-written
  metrics header — duration, tool calls, user messages, files modified —
  taken from the project's most recent session-tracker record (or the one
  `--session <id-prefix>` selects): the counts that record holds at its
  `lastUpdated` stamp, since its last diary capture or resume rather than
  since the session began, with a line of its own naming that stamp;
  followed by the handover file's five
  sections — `Where it stands`, `Done`, `Unfinished`, `Decisions`, `Next` —
  verbatim, which the agent writes in-session and hands to `save --from` as a
  file or on stdin; the engine refuses input that lacks one of the five, has
  them out of order or leaves one empty, and no background model call writes
  any part of it. (3) It lives under `~/.arcforge/sessions/<project>/<date>/`,
  and a per-project alias index, `aliases.json` under
  `~/.arcforge/sessions/<project>/`, points at it; aliases are scoped to the
  project, no name is reserved, and overwriting one needs `--force`. (4) `.handovers/<date>-<slug>.md` stays the committable handoff for
  other people, with the same five sections, and `resume` reads either — in
  those five sections only; an archive in v5's section set is not supported.
  (5) An archive never carries v5's Conversation Trail: it holds no text of
  the user's messages, whether or not learning is enabled.
  (6) The `sessions` skill gains the save, resume, list and alias
  instructions; its handover and present-then-stop behaviours are measured at
  skill scope in 6.4.0's round (D-055), and the CLI pieces ship on contract
  tests.
- Why: v5's archive had its own section set — Summary, What Worked, What
  Failed, Blockers, Next Step, still the one `generateSession` writes — while
  v6's handover file has five. Two section sets for one act would mean two
  templates in the skill and two formats for `resume` to read; one set means
  an archive and a handover differ only in where they live and who reads them.
  The agent writes the narrative because it holds the session's context, and a
  background model call to write it would be a third outbound path beside
  diary enrichment and the curator (learning B-9), one the trust design would
  then have to gate and name. The engine writes the metrics because the
  session-tracker record already holds them ([hooks](specs/hooks.md) B-8) and
  an agent recounting its own session would guess. The archive sits under
  `~/.arcforge/` because it is one user's continuity — it never shows in
  `git status`, as learning B-9 keeps the review loop out of the repo — while
  `.handovers/` stays the file someone else can be given. The trail was the
  user's own words, which D-010 keeps only in the opt-in session record, and
  removes from it whenever the opt-in reads off; an archive is a file the user
  asked to keep, so a trail there would either outlive an opt-out or need a
  second deletion rule. Leaving it out keeps the user's words in the one place
  D-010 already governs, and the archive needs no opt-in of its own. Reading
  only the five sections keeps `resume` to one format. Per-project aliases are what `session-aliases.js` already
  implements, keyed like the rest of `~/.arcforge/sessions/`.
- Residual: the project key is the sanitized directory basename, so two
  same-named projects share one alias index and one archive tree, the
  collision D-037 records for learning. An archive written by v5, in its
  Summary / What Worked / What Failed / Blockers / Next Step sections, is not
  read by `resume`, and the 6.4.0 CHANGELOG entry says so; nothing converts
  one. An archive does not record what the user asked for in their own words,
  so a reader rebuilds that from the agent's five sections alone. On Codex the CLI-backed instructions report `command not found`
  (D-013) while the `.handovers/` file still works. SessionStart still injects
  nothing from the last session (D-031): `resume` is asked for, so the
  **session-continuity-injection** wish stays open.
- Cost accepted: a sixth command group and one more on-disk format with an
  engine owner. The `sessions` `SKILL.md` grows from a body of 155 lines,
  already over the 150-line soft cap (the **skill-body-trim** wish), toward
  the 250-line hard cap.

### D-057 — 6.4.0's round: the `sessions` scenario measures B-11 alone, and the verify-exit sentence is a finding
- Date: 2026-10-03
- Version: 6.4.0
- Refines: D-055 (clause 5)
- Refines: D-056 (clause 6)
- Status: Accepted
- Decision: Three changes to D-055's clause 5, fixed before any session of
  the round is read. (i) The one `sessions` scenario,
  `eval-sessions-handover-and-resume` Version 1, measures present-then-stop
  ([skill-system](specs/skill-system.md) B-11) alone, not the five-section
  handover (B-10) with it; still one scenario, preflight 3 and an A/B of 10
  on a PASS. (iii) The `diagramming-obsidian` verify-exit sentence is NOT
  MEASURABLE on the current engine and is recorded as a finding at 0
  sessions — the outcome clause 5 (iii) already allows, recorded here
  because it sets the budget. The budget is now pre-registered as 26
  scheduled sessions (`sessions` 3 + 10, router 3 + 10), at most two
  top-ups of one trial per arm (`eval ab --k 1`, 4 sessions) for each A/B
  that ends with fewer than 5 scorable rows in an arm — its verdict read
  from the pooled rows of the scenario's Version, no row discarded, and
  INSUFFICIENT_DATA if an arm is still short after the second — and at most
  one 3-session rerun of a preflight that measured nothing because of grade
  or infrastructure errors: a worst case of 26 + 8 + 3 = 37, under the cap
  of about 40. The cap, the router regression run (ii) and the round's rules stand
  unchanged; the same narrowing applies to D-056's clause 6, whose
  "handover and present-then-stop behaviours are measured" now covers
  present-then-stop only.
- Why: One trial is one `claude -p` turn with one user message under
  `--no-session-persistence` (`scripts/lib/eval-trial.js`, the stdin prompt
  and `buildClaudeArgs`), so a trial cannot write a handover and later
  resume from it as a second session; a prompt asking for both either
  dictates the order or puts the stop in the prompt, which hands B-11 to the
  baseline. B-10's distinctive half — the `.handovers/<date>-<slug>.md` path
  and the five headings — separates the arms by construction, since an arm
  that never saw the convention cannot produce it, so an A/B on it would
  measure exposure, not behaviour; that shape is already checked by
  `eval-sessions-handover-completeness` A5. No scenario in the corpus covered
  B-11. The verify-exit gate found three independent blocks: an injected
  `SKILL.md` carries no skill base directory, so a treatment cannot reach
  `references/verify_saved_diagram.py` without leaving the trial, and a
  fixture copy reaches the baseline too; a scenario cannot set a trial's
  `PATH` or `HOME`, so the missing-dependency exit cannot be produced, and an
  install would write user caches the write guard does not watch and leak
  into later trials; and `eval ab` compares no skill text against one, while
  only the pre-#267 `SKILL.md` against the current one isolates the
  sentence, and a no-skill baseline that follows the error line's install
  command is likely already at ceiling. Any one block alone stops the
  measurement, so 13 sessions there would buy no evidence. The
  rerun and top-up allowances exist because `eval ab` has no arm or trial
  selector, so a one-arm rerun is impossible, and a top-up keeps every
  scorable row where a full replacement would discard them and re-roll the
  reading. The 37 sits under the cap of about 40, and under D-055's own worst case
  of 39. This is a refinement, not a supersession: clause 5's
  cap, its router run and its rules still govern, and (iii)'s outcome is one
  the clause foresaw.
- Residual: B-10 has no A/B evidence in 6.4.0 — its shape stays on
  `eval-sessions-handover-completeness` A5's existing reading — and B-11 is
  measured only on a fixture-planted `.handovers/` file, not on a handover
  the agent wrote in an earlier session nor on an archive read through
  `arcforge session resume`. The verify-exit sentence ships on its text, as
  #228's and #210's script changes did (D-049), and stays unmeasured until
  three engine changes all land: the **eval-skill-files-outside-trial** wish
  (a host-format base-directory line for the treatment, with the skill's
  files outside the trial tree); a per-trial `PATH` and `HOME` override a
  scenario can declare, narrower than the **eval-trial-sandbox** wish; and an
  A/B between two skill texts rather than none against one.
- Cost accepted: B-10 and the verify-exit sentence both ship without A/B
  evidence this round. The worst case is 26 scheduled sessions, up to 8 for
  top-ups (at most two `--k 1` top-ups per scenario, 4 sessions per scenario,
  across the two scenarios) and up to 3 for one preflight error rerun: 37 of the cap
  of about 40, leaving 3 unused. The 13 sessions D-055 held for (iii) are what
  fund the optional 11.
- Verification: `evals/scenarios/eval-sessions-handover-and-resume.md`
  Version 1 (PR #276); the design review in
  `docs/plans/v6.4/wp-d/design-review/` — `sessions.design.json` (its
  `departure` field), `sessions.attack.json`, `sessions.revise.json` and
  `sessions.gate.json` (its `rerun_policy` field); the departure note
  `docs/plans/v6.4/wp-d/departures.md`; and the gate
  `docs/plans/v6.4/wp-d/design-gate.verify-exit.md`.

### D-058 — 6.4.0's round: present-then-stop measures, and the router reading reproduces
- Date: 2026-10-03
- Version: 6.4.0
- Status: Accepted
- Decision: The round D-057 fixed ran within its rules, with one recorded
  departure in the A/B order (see Why), on `opus[1m]` /
  `xhigh`, isolated, with no `--plugin-dir`, the skill text injected at
  skill scope by `--skill-file`, Node v24.13.1 and a 900 s ceiling, and is
  read as two results. `eval-sessions-handover-and-resume` Version 1
  ([skill-system](specs/skill-system.md) B-11) passed preflight (baseline
  0/3) and read **+1.00 CI[1, 1] IMPROVED** at k=5: baseline 0/5, every
  baseline reading the handover, running the full suite, applying its
  one-line `Next` and only then asking about the days test the handover
  never mentioned; treatment 5/5, every treatment reading, running the suite,
  reporting where the work stands and where the repo disagrees, and stopping
  with no edit. `eval-router-skill-selection` Version 2 passed a fresh
  preflight (0/3) and read **+1.00 CI[1, 1] IMPROVED** again, baseline 0/5
  against treatment 5/5, so 6.3.0's reading (D-054) is reproduced on the
  6.4.0 tree. Both readings are direction only: k=5 per arm, the engine's
  zero-variance interval, Fisher's exact p ≈ 0.008 and a Newcombe interval
  for the difference of about [0.39, 1.00], on one fixture and one model
  each, for injected skill text rather than plugin routing (D-024, D-044).
  From this round on, one checkout runs one live eval at a time.
- Why: Both readings survive an audit of every row. In `sessions` the arms
  differ on the handover's planned step, not on the surprise: all five
  baselines already stopped on the unmentioned days test, and the treatment
  alone also held back the step the handover planned — B-11's "a handover's
  plan is someone else's until then". Every treatment stop is genuine — no
  `Edit` or `Write`, no shell write, no change-and-revert, 3 to 4 tool calls
  of 30, and every end-state `src/duration.js` still the fixture's — so
  neither C1 nor C2 was passed through a blind spot. The router's 0/5
  baseline rules out the BLOCK D-055 (ii) guarded against, a baseline that
  passes Version 2 without the skill text; every treatment again committed a
  real, passing, mutation-checked test before merging, the same shape as
  6.3.0. The one-run rule exists because the trial write guard cannot tell
  another run's legitimate write from a trial's: the first `sessions`
  preflight was aborted
  when a router preflight running in the same checkout wrote its record under
  `evals/preflight/`. That was operator error, not a scenario defect, and the
  rerun was the one preflight error rerun D-057 pre-registered. One
  departure was taken: `docs/plans/v6.4/PLAN.md` pre-registered the
  `sessions` A/B before the router A/B, and the round ran them the other way
  round — router `20261003-044443` (04:44:43Z to 04:49:49Z), then `sessions`
  `20261003-045428`. The cause is the aborted `sessions` preflight: the
  router A/B, whose preflight had passed, ran while `sessions` waited for its
  rerun, which started at 04:50:08Z after the router A/B ended. It has no
  effect on either reading. The two scenarios share no fixture, trial pool
  or state, and the order was a scheduling rule, not a statistical one. The
  two preflights did overlap, and that overlap is the incident above, not a
  second departure. No result is re-scored, so this records an outcome and
  relates to no earlier entry.
- Residual: B-10 still has no A/B evidence, and B-11 is measured on a
  fixture-planted `.handovers/` file only, not on a handover written in an
  earlier session or an archive read through `arcforge session resume`
  (D-057). The `diagramming-obsidian` verify-exit sentence is unmeasured
  (D-057). The effect size of either result is not established at k=5. The
  `sessions` C5 check has regex blind spots the audit saw: three treatment
  rows passed its next-action family only on the restated "Next action from
  the handover:" headline, not on the agent's own proposal wording, and
  baseline B4's match was a past-tense false positive ("next step: hours now
  parse") that changed nothing, the row failing on C1. The audit reads the
  stop as an echo of the skill's resume step, but nothing isolates that step
  from the rest of the injected `SKILL.md`. Preflight still writes no result
  rows (the **preflight-result-rows** wish), and nothing stops a second live
  eval in the same checkout (the **eval-concurrent-run-guard** wish).
- Cost accepted: 29 trial sessions of the cap of about 40 — router preflight
  3 and A/B 10, `sessions` preflight 3, its aborted first preflight 3 and its
  A/B 10 — with no top-up needed, both A/Bs scoring 5 rows per arm, and no
  model-grader calls, both scenarios being code-graded. The 3 sessions of the
  aborted preflight bought no reading. The router treatment's output tokens
  rose from 1,600 to 3,709, flagged as a cost regression; its per-trial time
  rose from 20.4 s to 39.8 s, reported but not flagged (under 2×). Both are
  the test-writing and mutation checks the skill asks for. The `sessions` treatment ran cheaper — 15.7 s against
  28.1 s, 1,341 against 2,189 output tokens — because it stops before the edit
  and the second suite run, which is a consequence of the behaviour, not an
  efficiency claim.
- Verification: the preflight records
  `docs/plans/v6.4/wp-d/preflight.eval-router-skill-selection.json` (scenario
  hash `4168c6b60ae1a260`, 2026-10-03T04:44:25Z) and
  `docs/plans/v6.4/wp-d/preflight.eval-sessions-handover-and-resume.json`
  (hash `8e1d782ac42ba6e6`, 2026-10-03T04:51:33Z, from the rerun
  `20261003-045008`; the aborted run is `20261003-044318`), each carrying
  model, effort, turn budget, ceiling, k, pass rate, verdict and timestamp;
  the A/B runs `20261003-044443` (router) and `20261003-045428` (`sessions`),
  pooled in the snapshot `evals/benchmarks/2026-10-03.json` (= `latest.json`,
  generated 2026-10-03T04:58:59Z); the operator audits
  `docs/plans/v6.4/wp-d/audit.sessions-preflight.md` and
  `docs/plans/v6.4/wp-d/audit.ab.md`; and the operator audit of every row in
  the 6.4.0 section of `evals/skill-eval-coverage.md`. `verify-exit` spent 0
  sessions, as D-057 recorded.
