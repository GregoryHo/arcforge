# Roadmap — arcforge

The **index + history** for the product. The table is the big picture and links to
each area's living spec in `specs/`; the **Decision Log** records every product
decision *and* every reversal. How to maintain this file: [`product/AGENTS.md`](AGENTS.md).

## Roadmap

| Version | Tag | Milestone | Status | What & why | Spec |
|---|---|---|---|---|---|
| 6.0.0 | `v6.0.0` | v6 toolkit | **shipped** | Ground-up rebuild: 15 self-contained skills behind a prose router, a 5-group CLI reached as bare `arcforge`, 6 hooks, and the retained learning / eval / obsidian systems — Claude Code single-harness, zero runtime deps. | [skill-system](specs/skill-system.md) · [cli](specs/cli.md) · [hooks](specs/hooks.md) · [learning](specs/learning.md) · [eval](specs/eval.md) · [obsidian](specs/obsidian.md) · [worktrees-loop](specs/worktrees-loop.md) |
| 6.1.0 | — | learning trust · spec-driven method · Codex packaging | **building ← we are here** | Diary enrichment and user-message capture move behind the learning opt-in and the enricher loses blanket permissions; the CLI's candidate commands become a front end onto the canonical queue; the lightweight spec-driven method arcforge runs itself on ships as the `speccing` skill; arcforge installs on Codex as a skills-only plugin over the same tree. | [learning](specs/learning.md) · [hooks](specs/hooks.md) · [codex-harness](specs/codex-harness.md) · [sdd](specs/sdd.md) |

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
- Status: Accepted
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
  baseline having measured at ceiling (11/11 across two samples). B-6 in
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
