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
| 6.4.0 | `v6.4.0` | session archive returns · daemon, write and counter races · grader isolation | **shipped** | v5's session archive, dropped at 6.0.0 without a record, returns as a sixth CLI group, `arcforge session` (`save`, `resume`, `list`, `alias`), over the engine modules that survived unexposed: an engine-written metrics header plus the handover file's five sections, written by the agent in-session, and the `sessions` skill learns to drive it (D-056). The engine fixes planned as 6.3.1 ride along — observer daemon starts and stops that can leave two daemons (#247, #252), the shared atomic-write helper's temporary-file race (#253), the diary tool counter that loses increments (#260), and code graders that can import from the trial directory (#250) — with the README naming `speccing` as the v5 pipeline's file-based replacement and two corrections to past CHANGELOG entries. A minor because it adds a CLI group; the round, capped at about 40 trial sessions, spent 29 and read the `sessions` skill's present-then-stop behaviour (B-11) at baseline 0/5 against treatment 5/5 and the router at 0/5 against 5/5 again, reproducing 6.3.0 — direction only, at k=5 on one fixture and one model each, for injected skill text — while the `diagramming-obsidian` verify-exit sentence already on `main` (#267) was found not measurable on the current engine and is recorded as a finding (D-055, D-057, D-058). | [cli](specs/cli.md) · [skill-system](specs/skill-system.md) · [learning](specs/learning.md) · [hooks](specs/hooks.md) · [eval](specs/eval.md) · [obsidian](specs/obsidian.md) |
| 6.5.0 | `v6.5.0` | eval instrument debts · session continuity · four gated measurements | **shipped** | The debts two measurement rounds left on the eval instrument are paid first: one live eval per checkout becomes a lock the engine holds instead of a rule the operator keeps, preflight writes result rows under a label of its own, every row records the Node version and the scenario hash, the operator's `PATH` stops reaching trials and a scenario can declare its trial environment, and `eval compare` can skip the analyzer session. Two additions then open what 6.4.0's design gate found not measurable: a skill's files staged outside the trial tree, and an A/B between two skill texts (D-062). SessionStart names the project's newest session archive and the command that reads it — the promise D-031 withdrew, which 6.4.0's archive makes keepable — in one line, never the archive's contents (D-061), and the `sessions` body moves its reference material into its own `references/`. A minor because it adds hook behaviour and eval flags; the round, capped at about 80 trial sessions and run one scenario at a time, spent 32 and put each measurement behind an offline design gate: the `sessions` skill's present-then-stop behaviour (B-11), on an archive read through `arcforge session resume`, read baseline 0/5 against treatment 5/5 — direction only, at k=5 on one fixture and one model, for injected skill text — the `diagramming-obsidian` `references/` layout change (#185) was at ceiling in preflight and is recorded as a finding with no A/B, the trimmed `sessions` handover path did not regress with the skill's files staged, and the `executing` to `dispatching` handoff (#184) and the `diagramming-obsidian` verify-exit sentence were found not measurable before any session (D-059, D-063, D-064). | [eval](specs/eval.md) · [hooks](specs/hooks.md) · [skill-system](specs/skill-system.md) · [obsidian](specs/obsidian.md) · [cli](specs/cli.md) |
| 6.5.1 | `v6.5.1` | instrument repairs · flaky tests · bounded transcript parse, no measurement | **shipped** | Repairs to the instrument 6.5.0's round left in debt: a transcript keeps an Agent call's whole input and marks a tool result the host flagged as an error, with the `Bash` exit code when the result text carries one, and each row records the transcript format it was written under; a provider limit that lands after the agent's tool calls is recognised by the shape of the session's last message and leaves every scored pool; each trial's raw stream-json is kept beside its run; a preflight rerun keeps the record it replaces; and an A/B's grading files are named per arm, so the two arms no longer overwrite each other. Four flaky tests are fixed at their causes and a fifth, a jest worker crash, gets a reproduction attempt; the diary transcript parse reads at most its last 8 MiB (#172); and the CLI guide names the commands that have no human format and print the same JSON with or without `--json`. No new flag or command, and nothing under `skills/`, `evals/scenarios/` or `evals/fixtures/`, so it ships as a patch without a live eval session (D-065). | [eval](specs/eval.md) · [hooks](specs/hooks.md) · [cli](specs/cli.md) |
| 6.6.0 | — | second staged skill directory · #184 handoff scenario · #185 layout V2 · #256 block model · one measurement round | **next ← we are here** | An A/B's treatment can be given a second skill's directory beside the one it is injected with — staged the way the first is, and named in one line the way the host lists a skill that is available, its body never injected (D-067) — so the `executing` to `dispatching` handoff (#184), found not measurable for want of it, gets a scenario whose two arms are injected with the same `executing` text and differ only in whether `dispatching` is within reach. The `diagramming-obsidian` layout reference (#185) gets its second and last scenario design, a task in which the baseline reaches Primary-sized elements without the prompt naming a width; another ceiling BLOCK closes #185 as a finding. The `maintaining-obsidian` lint helpers' block model (#256) rides along on contract tests: it sits under `skills/`, so only a version with a measurement round can carry it. A minor because it adds an `arcforge eval` flag; the round is capped at about 45 trial sessions, 40 at worst, each measurement behind an offline design gate that comes before any session, and the `diagramming-obsidian` verify-exit sentence stays out of it — found not measurable twice, a third attempt deferred (D-066). | [eval](specs/eval.md) · [obsidian](specs/obsidian.md) · [skill-system](specs/skill-system.md) |

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
- Status: Superseded-by: D-061
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

### D-059 — 6.5.0: the instrument's debts, session continuity, and four measurements behind design gates
- Date: 2026-10-12
- Version: 6.5.0
- Status: Accepted
- Decision: 6.5.0, a minor, carries (1) the eval-instrument changes D-062
  designs, which graduate the wishes **eval-concurrent-run-guard**,
  **preflight-result-rows**, **eval-record-node-and-hash**,
  **eval-trial-path**, **eval-compare-skip-analyzer** and
  **eval-skill-files-outside-trial**; (2) SessionStart's one-line pointer at
  the project's newest session archive, as D-061 designs it, which graduates
  **session-continuity-injection**; (3) the `sessions` `SKILL.md` body
  brought back under the 150-line soft cap by moving reference material into
  the skill's own `references/`, with no behavioural instruction cut — the
  `sessions` share of the **skill-body-trim** wish, whose other six skills
  stay in the backlog; (4) D-060's record of which `speccing` wording
  shipped; and (5) one measurement round on `opus[1m]` / `xhigh`, isolated,
  without `--plugin-dir`, the skill text injected with `--skill-file`, capped
  at about 80 trial sessions, under a plan fixed before any result is read.
  The round holds four measurements, run in this order: (i)
  `eval-sessions-handover-and-resume` Version 2 — present-then-stop
  ([skill-system](specs/skill-system.md) B-11) on an archive the fixture
  saves through the engine and the agent reads through
  `arcforge session resume`, Version 1's pool emptied and its reading kept in
  the ledger; (ii) the `executing` to `dispatching` handoff (#184), a new
  scenario; (iii) the `diagramming-obsidian` verify-exit sentence
  ([obsidian](specs/obsidian.md) B-10), a new scenario run as an A/B between
  two skill texts, the `SKILL.md` from before #267 against the current one;
  and (iv) that skill's `references/` layout change (#185), a new scenario
  run as a two-text A/B whose arms differ in the staged
  `references/layout-heuristics.md`, the one from before #182 against the
  current one. Each measurement sits behind an offline design gate, written
  after D-062's engine changes merge and before any session: a gate that
  finds the measurement NOT MEASURABLE records it as a finding at 0
  sessions. A gate that passes leads to a preflight at k=3; a BLOCK there is
  a finding, not rerun, with no A/B; a PASS goes to an A/B at the scenario's
  own trial count. An A/B that would take the round past the cap is not
  started and is recorded as not measured, never run at a smaller k. A
  fifth measurement is conditional: if (i) to (iv) end with at most 67
  sessions spent — the cap less 13 —
  `eval-sessions-handover-completeness` runs at its current Version with
  `--stage-skill-files`, a preflight of 3 and an A/B of 10 with no top-up,
  so that the trimmed handover-writing path has an A/B whose treatment sees
  the moved template; otherwise that path stays the Residual below. It is
  gated like the other four: its design gate is written with theirs,
  before any session, and a NOT MEASURABLE verdict there drops it at 0
  sessions. It runs
  last, and it is dropped before any top-up of (i) to (iv) is. The
  round is serial — one live eval per checkout (D-058) — so a measurement
  starts only when the one before it has ended.
  `eval-router-skill-selection` is not rerun, and no change in this version
  may edit its scenario file. The gates' verdicts, each scenario's k, and the
  top-up and rerun allowances are pre-registered in a later entry that
  refines this one, before any session is read. #256 stays out, and stays
  open.
- Why: Three things meet in one version. Two rounds left debts on the
  instrument: D-054's Residual lists a preflight that writes no result rows,
  records without a Node version or a scenario hash, and an operator `PATH`
  that reaches trials, and D-058 adds a second live eval aborting the first
  in the same checkout, which cost that round 3 sessions. Three measurements
  wait on one engine gap: D-057 found the verify-exit sentence blocked three
  ways — no skill files a treatment alone can reach, no trial environment a
  scenario can declare, no A/B between two skill texts — and #184 and #185
  are held by the first of those (D-049's Residual). And 6.4.0 brought the
  session archive back while no hook reads it when a session starts
  (D-056's Residual). The version is a minor by the 6.2.0 precedent (D-020):
  the eval flags are new CLI surface, and a line added to session start is
  new hook behaviour, which D-031 called a product choice of its own. The
  `sessions` body is 206 lines against a 250-line cap that fails the build —
  D-056 accepted that growth — and trimming it is a skill edit, so it rides
  a round whose first measurement is that skill. The gates come before the
  sessions because of 6.4.0: D-057's gate showed that 13 sessions on the
  verify-exit sentence would have bought no evidence. They come after the
  engine changes because each has to cite what the engine then does, not
  what a plan says it will do. The longest measurement, (iv), runs last so
  that a timeout there holds up nothing else. The router scenario was rerun
  in 6.4.0 only because #250's fix edited its file and `eval ab` looks a
  preflight record up by the file's hash (D-055); nothing here needs to edit
  it, and an edit would cost a preflight and an A/B, 13 sessions, against a
  cap the four measurements already use most of.
- Residual: the trim's non-regression rests on (i), and on the conditional
  fifth measurement where it runs. (i) measures
  B-11 only, with `SKILL.md` injected and no skill files staged, so the
  material moved into `references/` is not in front of the treatment; the
  save and compaction instructions get no A/B, and the handover
  instructions get one only where the fifth measurement runs. If (i)'s gate ends
  NOT MEASURABLE or its preflight BLOCKs, the trim ships on the skill
  structure tests. The trim moves the handover template and both compaction
  tables out of `SKILL.md`, and a skill-scope A/B injects `SKILL.md` alone,
  so from then on the treatment text of
  `eval-sessions-handover-completeness` and
  `eval-compacting-persist-before-compact` carries neither. The second is
  not in this round, so the trimmed compaction path ships unmeasured. The
  first is in it only as the conditional fifth measurement: where that
  runs, the trimmed handover-writing path has a reading with the skill's
  files staged, in a pool of its own; where it does not — the sessions did
  not fit, its gate ended NOT MEASURABLE, or its preflight BLOCKed — that
  path ships unmeasured too. Either way the existing pools of both
  scenarios describe the text
  from before the trim, and a later run of either must stage the skill's
  files ([eval](specs/eval.md) B-19) for the references to reach the
  injected arm. The second scenario's design note that the timing table is
  "carried over unchanged" is stale after the trim and is corrected when
  that scenario is next versioned, not in this round. (i) measures the
  resume path, which the trim does not move. Every reading the round produces is direction only at
  its k, on one fixture and one model, for injected skill text, not plugin
  routing (D-024, D-044, D-058). The router's 6.4.0 reading stands as
  measured before D-062 changed the trial environment. #184 and #185 close
  only on a reading; a NOT MEASURABLE verdict leaves the issue open, with
  the verdict and the missing engine capability named on it. Staying in the
  backlog: every wish under Harness, **bound-transcript-parse**,
  **project-keyspace-collision**, **cli-human-output**,
  **eval-trial-sandbox**, **product-cli**, **speccing-spec-in-sync-eval**,
  **speccing-router-adjacency-eval**, **plugin-eval-corpus-migration**,
  **executing-discriminating-claim**, **diagramming-headless-fallback**,
  **secrets-guard-staged-scan**, and the six other skills of
  **skill-body-trim**.
- Cost accepted: up to about 80 trial sessions — 52 scheduled, four
  preflights of 3 and four A/Bs of 10, with the top-up and preflight-rerun
  allowances fixed in the pre-registration entry and kept under the cap,
  and 13 more for the conditional fifth measurement only where they fit —
  plus any model-grader calls the cap does not count. Running one scenario at
  a time costs wall-clock time, and (iv) is planned under a 1800 s trial
  ceiling, reported as eval B-10 requires. The instrument and hook changes
  reach users only after the round.
- Verification: one design-gate document per measurement, the conditional
  fifth included, under
  `docs/plans/v6.5/wp-d/`; the pre-registration entry; the round's preflight
  records and A/B pools, written down the way D-058's were, with the operator
  audit of every row in a 6.5.0 section of `evals/skill-eval-coverage.md`;
  and, before the tag, an empty `git diff --stat` from the measurement commit
  over `skills/`, `evals/scenarios/` and `evals/fixtures/`, with the
  freshness check exiting 0.

### D-060 — `speccing` is the v5 pipeline's successor, not its replacement
- Date: 2026-10-12
- Version: 6.5.0
- Refines: D-055 (clause 3)
- Status: Accepted
- Decision: The wording 6.4.0 shipped stands as the product's statement:
  the README calls `speccing` "the file-based successor to v5's spec-driven
  pipeline — it keeps the product intent, not the automation",
  `docs/guide/skills-reference.md` calls it that pipeline's file-based
  successor too, and D-055's clause 3, which says `speccing` "replaces" the
  pipeline, is read through that sentence.
- Why: D-055's clause 3 and the text that shipped under it disagree on one
  word, and the shipped text is the accurate one. v5's pipeline did three
  things an engine ran — spec refinement, `dag.yaml` generation and build
  orchestration — and 6.0.0 removed all three with nothing put in their
  place; the README says so in the same sentence, and the skills reference
  says they are not replaced. What `speccing` carries forward is the intent:
  a project's specs, roadmap and decisions kept in step with its code, by
  hand, in files. "Replaces" promises a user of the v5 pipeline that the
  automation has an equivalent, and it has none (D-016 records that the
  method ships with no engine). A user deciding whether to upgrade reads the
  README, not the Decision Log, so the README's sentence is the promise made,
  and the log is brought to it. This sharpens clause 3 and reverses nothing:
  the clause's subject — the two documents name `speccing` as what follows
  the v5 pipeline — still holds.
- Residual: D-055's `Decision:` keeps the word "replaces", as recorded text
  must; a reader of D-055 alone finds the stronger claim, and the 6.4.0
  roadmap row repeats it as "file-based replacement".

### D-061 — SessionStart names the newest session archive in one line
- Date: 2026-10-12
- Version: 6.5.0
- Supersedes: D-031
- Status: Accepted
- Decision: On a SessionStart whose source is `startup` or `clear`,
  `inject-context` adds one line that names the project's newest session
  archive — an alias that points at it, or its file when none does, with the
  date it was saved — and the command that reads it,
  `arcforge session resume <alias|path>`. It adds nothing on `resume` or
  `compact`, nothing when the project has no archive, and nothing in a
  session arcforge spawned itself — the diary enricher, a loop task — the
  skip `inject-context` already applies to pending actions. "Newest" is the
  newest engine-written archive by the stamp in its file name; a hand-named
  file under the sessions directory is not considered. The line does not
  depend on the learning opt-in, and none of the archive's five sections is
  ever injected. The lookup reads names only — the date directories, the
  archive file names, which carry the save stamp, and the project's alias
  index — and never opens an archive.
- Why: D-031 withdrew "where the last session left off" from hooks B-8
  because nothing kept that promise, and left building it as a wish. 6.4.0
  then shipped the thing the promise needed: an archive the user chose to
  keep, in five known sections, with a command that reads it (D-056). What
  was still missing is the moment — a new session has no way to know an
  archive exists unless the user remembers its name. One line closes that
  gap at the smallest price. Injecting the five sections instead would put
  another session's plan into every new session's context, where the
  `sessions` skill says a handover's plan is someone else's until the user
  confirms it ([skill-system](specs/skill-system.md) B-11), and would spend
  context on an archive the session may have nothing to do with; a pointer
  leaves reading it a choice. `resume` and `compact` are the same session
  going on, so there is no earlier one to point back at. The opt-in does
  not gate it because an archive holds none of the user's words
  ([learning](specs/learning.md) B-20) and continuity is not a learning
  feature (D-010). The lookup is name-only because `inject-context` is the
  one synchronous hook at session start ([hooks](specs/hooks.md) B-7), and
  the existing archive listing opens every archive to read its title before
  it applies its limit — a cost that would grow with every save. D-031 is
  replaced whole: its one decision was to stop promising a carry-over, and
  the product now makes a narrower promise and keeps it.
- Residual: the line points at the newest archive under the project key,
  which is the sanitized directory basename, so two same-named projects
  share it (D-037, D-056), and the newest archive may belong to work the new
  session is not continuing — the line says which archive, not whether it is
  relevant. Whether an agent that sees the line reads the archive unasked,
  or should, is not measured. A `.handovers/` file is never named, only an
  archive. The line is Claude Code's alone: hooks do not run on Codex
  (D-013). An alias index that cannot be parsed, or one edited by hand so
  that its keys are not valid aliases — one that begins with a hyphen
  among them, which the CLI would read as a flag ([cli](specs/cli.md)
  B-9) — yields the path form of the line, not the alias. In the path form
  the path is one shell word, single-quoted when it needs to be, and a path
  that holds a control character yields no line at all.
- Cost accepted: one more line in the model's context and the user's summary
  at every `startup` and `clear` of a project that has an archive, and, on
  the synchronous SessionStart path, a listing of each date directory,
  newest first, until one holds an archive — all of them when none does,
  about 54 on the maintainer's machine, 1.3 ms warm and 13.6 ms cold — then
  one read of the alias index.
- Verification: cases in `hooks/__tests__/inject-context.test.js` for an
  archive at `startup` and at `clear`, for silence on `resume` and on
  `compact`, for silence with no
  archive, and for silence at `startup` in a session arcforge spawned
  itself; and, in the post-release check, a live session in a project with
  an archive whose SessionStart context carries the line, beside one without
  an archive whose context does not.

### D-062 — The eval instrument: a run lock, preflight rows, a rebuilt trial environment, staged skill files and a two-text A/B
- Date: 2026-10-12
- Version: 6.5.0
- Status: Accepted
- Decision: Seven changes to the eval instrument. (a) One live eval per
  checkout is enforced: `eval run`, `eval preflight`, `eval ab` and
  `eval report` take a lock under `.eval-trials/` that records the holder's
  process id and is released on every exit path, a preflight BLOCK
  included; a second one in the same checkout is refused at once with the
  holder named, and a lock whose process is gone is reclaimed: the run
  reserves the reclaim, and under that reservation removes only the dead
  lock whose `pid` and `started` match what it observed before reserving;
  anything else is refused. (b) Preflight writes a result row
  for each trial, to `preflight.jsonl` in its run's directory under the
  condition label `preflight`, which no A/B pool, `eval report`,
  `eval list` or the dashboard's comparison and scenario views read — the
  dashboard's run listing shows them, labelled `preflight`
  ([eval](specs/eval.md) B-16); since a row file's name ends in its
  condition, a scenario name ending in `-baseline`, `-treatment` or
  `-preflight` is refused. (c) Every result row and every
  preflight record carries the Node version that ran the engine, the hash
  of the scenario text the trials were built from, and the commit of the
  checkout they ran from (`node_version`, `scenario_hash` and
  `repo_commit`); none is a pooling condition, so eval B-8's
  conditions do not change. (d) A trial's environment is rebuilt rather than
  inherited: a contained trial and its fixture setup get an allowlist —
  variables forwarded by name (the identity, shell and locale variables,
  `CLAUDE_CONFIG_DIR`, `CLAUDE_CODE_OAUTH_TOKEN`, `CLOUD_ML_REGION`, the
  certificate variables), by prefix (`LC_`, `ANTHROPIC_`,
  `CLAUDE_CODE_USE_`, `AWS_`, `GOOGLE_`, `GCLOUD_`, `CLOUDSDK_`,
  `SSL_CERT_`) or by suffix (`_PROXY`, `_proxy`), and the redirected
  `ARCFORGE_HOME` — and everything else is dropped. A deny list wins over
  the allowlist: `ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_*_MODEL` and
  `ANTHROPIC_SMALL_FAST_MODEL` are dropped — whatever chooses the model or
  changes what a `--model` name resolves to — so the row's `model` is the
  one `--model` named, and so are the variables of the Claude Code session
  an eval was started inside (`CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`,
  `CLAUDE_CODE_SSE_PORT`, `CLAUDE_CODE_SESSION_ID`);
  `docs/guide/eval-system.md` holds the table. `PATH` is a
  shim directory under `.eval-trials/` linking `claude`, `node`, `npm` and
  `npx`, followed by the system directories, so the operator's `PATH` no
  longer reaches such a trial while `claude` and `node` stay resolvable. A
  contained trial spawns `claude` by the shim's full path,
  `<projectRoot>/.eval-trials/.bin/claude`, so a scenario's `PATH^=`
  directive cannot shadow the session binary; fixture `Setup` keeps the
  declared `PATH`. A
  `--no-isolate` trial inherits the operator's environment, with
  `ARCFORGE_HOME` redirected and the scenario's `## Environment`
  directives applied, and keeps the bare `claude` lookup. A session that
  never started — the exec fails with no exit status, nothing killed it
  and it printed nothing — is an instrument failure of a new kind,
  `trial_spawn_failed`, with `infraError: true`: it is excluded from every
  scored pool exactly like `trial_killed_incomplete` and
  `trial_wrote_repo`, and its trial directory is removed. A scenario may declare, in
  an `## Environment` section, `PATH` entries to add or remove and cache
  directories to place inside the trial; `HOME` is kept, since the session
  authenticates from `~/.claude`. The declaration applies to both arms alike
  and is recorded on the row. (e) Opt-in, by `--stage-skill-files`: the
  directory the skill file sits in is copied outside the trial tree, and the
  injection opens with a host-style "Base directory for this skill" line
  naming the copy, so the line and the files are part of the injection.
  Every row of a staged arm records a digest of the directory staged for
  it. Staging
  is a pooling condition: a run without the flag pools with the rows written
  before 6.5.0, a run with it forms a pool of its own. (f) An A/B between
  two skill texts, by `--baseline-skill-file`: the baseline is injected with
  that text in place of none, every row records a hash of the text its arm
  was injected with, the baseline's injected text is a pooling condition —
  and so, when the baseline is staged, is the digest of its staged
  directory — and `eval preflight` takes the same flag, runs that baseline,
  and keys its record on the baseline text's hash and, when the baseline
  is staged, on that digest. (g) `eval compare --no-analyzer`
  prints the verdict without starting the eval-analyzer session.
- Why: (a) D-058 made one-run-per-checkout a rule after a second run's
  write under `evals/preflight/` aborted a preflight; a rule the operator
  must remember fails the same way again, and the write guard cannot be
  taught the difference — exempting `evals/preflight/` from it would hide a
  trial's own write there. The existing lock helper waits and treats an old
  lock as stale by age; a live eval holds for minutes to hours, so this lock
  refuses immediately and decides staleness by whether the process is alive.
  `eval report` takes it too because it writes `evals/benchmarks/`, which a
  live trial's write guard would blame on the trial.
  (b) A preflight trial's grade had to be rebuilt by hand from its end state
  (D-054, D-058). The label has to be its own because a preflight trial runs
  under the scenario's bare name, the name `eval run` writes and `eval list`
  falls back to. The three name suffixes are reserved, rather than the
  condition moving into a row field, because the condition already lives in
  the result file's name: a separate field would change every reader's
  lookup and the layout on disk for a case no shipped scenario hits, and
  `eval lint` reports the collision before any session. (c) D-054's verification recorded the Node version and
  commit by hand. None of the three fields pools because none changes the
  question a row answers: Node runs the engine, not the model, and making it a
  condition would split every pool at the next Node upgrade and orphan the
  6.3.0 and 6.4.0 pools, whose rows carry none; the scenario's `## Version`
  is already what says a meaning changed, and the hash also moves on a
  cosmetic edit (B-8); and the commit moves on every merge, whatever it
  touched. Recorded, they let a reader see a mixed pool without
  the engine refusing it. (d) One 6.3.0 trial resolved `arcforge` from the
  operator's `PATH` and ran it (D-054), so what a trial can run depended on
  whose machine ran it. Rebuilding `PATH` makes that the scenario's
  statement, and the declaration is what the verify-exit measurement needs
  to produce a missing dependency (D-057). Both arms get the same
  environment because B-7 lets the arms differ in the injection only.
  (e) D-049's Residual and D-057: an injected `SKILL.md` carries no base
  directory, and a fixture copy of the skill's files reaches the baseline
  too. Staging outside the trial tree gives the files to the arm that is
  injected with them and to no other. It is opt-in and a pooling condition
  because a treatment that can read its skill's files answers a different
  question from one that cannot, and the 6.3.0 and 6.4.0 treatment pools
  were measured without them. (f) Only the old text against the new one
  isolates a sentence; against no skill at all, a baseline that follows an
  error line's own advice is likely at ceiling (D-057). The preflight has to
  run the arm the A/B will run as its baseline, which is the old text, so
  the record is keyed on it — otherwise `eval ab` finds no record, or finds
  one measured on a different baseline. (g) `eval compare` on a model- or
  human-graded scenario always spent a model call to print a verdict the
  rows already determine.
- Residual: this is not the **eval-trial-sandbox** wish. A trial still runs
  with the operator's filesystem permissions and the operator's `HOME`; the
  instruction to stay inside the trial directory is still advice, now with
  the staged directory as its one stated exception; and a trial that leaves
  its directory is still caught only afterwards, by the write guard, within
  that guard's blind spots (eval B-7). Caches the scenario does not declare
  stay the operator's and can still carry state from one trial to the next.
  The deny list is a list of names and one pattern: a new provider
  variable that remaps a model name is forwarded by its family's prefix
  until it is added.
  Because `HOME` is kept, Claude Code still sources the operator's
  `~/.zshrc` or `~/.bashrc` when it builds its shell snapshot, so the
  operator's shell functions and aliases still reach a trial's commands;
  the rebuilt environment does not fix that. A startup file that itself
  changes `PATH` may put the operator's directories back, and no engine
  test establishes whether it does, so a gate of D-059 whose measurement
  depends on a tool being absent — the verify-exit one — shows that
  absence inside a real trial before it passes.
  The lock covers the three commands that run trials and `eval report`: an
  edit, or any other write in the checkout during a live run, still reads to
  the write guard as the trial's. It is per checkout, so two worktrees are
  two locks, and a recycled process id can make a dead lock look held. A
  run killed while its trial is running can leave the trial's `claude`
  process alive — the trial is a synchronous child the signal does not
  reach — so the lock is reclaimed when the holder's PID is dead, not when
  the trial is, and the orphan's writes can be blamed on the next run's
  trial. A lock file that names no process, or a leftover
  `run.lock.reclaim`, is refused, not reclaimed, until the operator
  removes it by hand; the refusal names the file. The
  rebuilt environment is not a pooling condition, so rows from before and
  after it pool together though their trials did not see the same `PATH`.
  With one `SKILL.md` text in both arms and different staged files — the
  shape (iv) of D-059 takes — the text hashes alone do not tell the arms
  apart, so the baseline's staged content is part of the recorded
  identity: its digest is a pooling condition and part of the preflight
  key, a preflight record is not found by a run whose baseline was staged
  with different files, and the rows of two such runs do not pool. The
  treatment's digest is recorded and, like its text hash, not pooled, so a
  treatment whose staged files changed under an unchanged scenario version
  joins the earlier treatment pool. A code grader's
  environment is not rebuilt: a grader is not a trial, and it runs with the
  operator's full environment — seven graders in the corpus call `arcforge`
  and nine call `npm`. A scenario that prepends a directory of its own can
  shadow the `claude` a trial's own commands look up by name — not the
  session, which is spawned by path — an authoring error `eval lint` does
  not catch. A `claude` that starts, exits non-zero and prints nothing
  parseable is not a spawn failure and is still scored as a behavioural
  `error` row, as before. Unmeasured after
  this: routing under a real plugin load (D-024, D-044), a save into a live
  Obsidian vault, and anything that needs more than one turn in a trial
  (D-057).
- Cost accepted: four more things an operator can pass or a scenario can
  declare, and three more pooling distinctions for a reader to keep apart:
  staging, the baseline's text, and the baseline's staged files.
  A scenario that leaned on a tool from the operator's `PATH` stops finding
  it and must declare it. A staged run copies a skill directory per run. A
  second eval in a checkout now fails at once where it used to start.
- Verification: contract tests per item — the lock refusing a second holder
  and reclaiming a dead one; a preflight row that no pool reader returns;
  the three fields (`node_version`, `scenario_hash`, `repo_commit`) on a
  row and on a record, with pools unchanged by them; a
  trial's environment without the operator's `PATH` entries and with the
  scenario's declared ones; the base-directory line in the treatment's
  prompt and absent from the baseline's, the staged path outside the trial
  tree; both arms' text hashes on a two-text run, and a preflight record
  that `eval ab` finds only under the same baseline text and, when the
  baseline is staged, the same staged-files digest, with two baselines
  staged differently in two pools; and
  `eval compare --no-analyzer` spawning no session. `npm run check:docs`
  holds each new flag to the CLI manifest. The live proofs are a second preflight refused
  while a first runs, and the design gates of D-059, which cite the
  merged engine.

### D-063 — 6.5.0's round: two A/Bs and a conditional third, with the handoff and the verify-exit sentence as findings
- Date: 2026-10-13
- Version: 6.5.0
- Refines: D-059
- Status: Accepted
- Decision: D-059's round is fixed as eight clauses, after its five design
  gates and before any session of it is read. (1) Two of the four
  measurements are findings at 0 sessions: the `executing` to `dispatching`
  handoff (#184) and the `diagramming-obsidian` verify-exit sentence
  ([obsidian](specs/obsidian.md) B-10) are NOT MEASURABLE on the merged
  engine, so neither gets a scenario, a preflight or an A/B, and #184 stays
  open. (2) Three runs remain, serial, in this order: D1,
  `eval-sessions-handover-and-resume` Version 2
  ([skill-system](specs/skill-system.md) B-11); D4,
  `eval-diagramming-obsidian-layout-grid` Version 1 (#185), measurable only
  as a task that hands back a coordinate plan and builds, renders and saves
  nothing; and D5, `eval-sessions-handover-completeness` at its current
  Version 4 with the scenario file unedited, measurable as treatment
  non-regression only. (3) Every run is on `--model 'opus[1m]'
  --effort xhigh`, isolated, with no `--plugin-dir`, the skill text injected
  by `--skill-file`; each starts with one preflight at k=3 and, on a PASS,
  goes to an A/B at the scenario's `## Trials`, which is 5 per arm in all
  three. D1 stages no skill files and takes no baseline text, under
  `--max-turns 30` and the scenario's own `## Environment`. D4 injects the
  current `SKILL.md` into both arms with `--stage-skill-files` and
  `--baseline-skill-file <materialised>/SKILL.md`, the materialised
  directory being the current skill directory built outside the repository
  with `references/layout-heuristics.md` alone replaced by its text at
  `1fed56d0~1`; the baseline's directory digest is `0f3c574c1e448946` and
  the treatment's `42ec93e5d9d42cec`, the preflight and the A/B both run
  under `ARCFORGE_EVAL_TRIAL_TIMEOUT_MS=1800000`, and a digest that differs
  from these spends no session until both are registered again in an entry
  that refines this one. D5 adds `--stage-skill-files` and no baseline text,
  at the scenario's turn budget of 40; its preflight carries the flag too
  and runs the same baseline under the same key, a baseline given no text
  having nothing staged for it. (4) A preflight BLOCK at
  ceiling is a finding: no second preflight and no A/B. An A/B's verdict is
  the engine's, read with `eval compare` on the pooled rows of the
  scenario's Version and never re-scored by hand. (5) A preflight that
  measured nothing is neither a PASS nor a BLOCK and may be rerun, at most
  twice in the whole round, 3 sessions each, an allowance all three runs
  share. Three things count: a record the engine wrote as a BLOCK with no
  pass rate, which it does when any one row is a grade or infrastructure
  error; in D1, any single row whose transcript holds a standalone
  `arcforge session resume duration-hours` call while the wrapper's log
  holds no line for it — the scenario or its environment is fixed before the
  rerun, and no A/B session is spent on the record that preflight wrote; and
  in D4, any row that wrote into its staged copy
  (`trial_wrote_skill_files`), which is one such row. A measurement still without a usable preflight when the
  allowance is spent is recorded as not measured. (6) Top-ups are as D-057
  wrote them, for D1 and D4 only: an A/B that ends with fewer than 5
  scorable rows in an arm gets at most two top-ups of one trial per arm
  (`eval ab --k 1`, the same skill file and flags, 4 sessions), its verdict
  read from the pooled rows with no row discarded, and INSUFFICIENT_DATA —
  recorded as not measured, never re-read as INCONCLUSIVE — if an arm is
  still short after the second. A D4 A/B row that wrote into its staged copy
  is unscored and is made up only this way. (7) D5 runs last, after D1 and
  D4 have ended with at most 67 sessions spent, a condition every case below
  meets; it has a preflight of 3, an A/B of 10 and no top-up. Its main
  reading is the treatment's pass rate and each arm's rate on A1 to A4,
  reported per arm from the per-assertion vectors of this round's rows. The
  engine's delta is recorded and is never read as evidence of improvement,
  whatever its size, and the preflight's PASS is never cited as
  discrimination. "Treatment not regressed, A1 to A4 not discriminating" is
  written only when every treatment row passes all seven assertions, every
  baseline row passes A1 to A4, and the only assertions a baseline row
  loses are the two the arms differ on by construction, the write under
  `.handovers/` and A5. A treatment row that loses either of those two is
  the regression this run exists to find and is reported as one; a row of
  either arm that fails any of A1 to A4 is reported per assertion and per
  arm as a behavioural difference, outside that sentence. (8) One checkout runs one
  live eval at a time ([eval](specs/eval.md) B-15), so a run starts only
  when the one before it has ended, and the operator audits every row of
  every preflight and every A/B. The audit carries, per row: in D1, the
  resume calls against the wrapper's log; in D4, whether the row opened the
  staged `layout-heuristics.md`, whether a baseline row read the current
  file from the repository, and each unscored row with the path it wrote;
  in D5, whether the treatment read the staged handover template. The
  budget is 26 scheduled sessions (D1 3 + 10, D4 3 + 10), at most 8 for
  top-ups and at most 6 for preflight reruns — 40 before D5 at worst — and
  13 for D5: 53 at worst, under D-059's cap of about 80, which stands, as
  does its rule that an A/B which would pass the cap is not started.
- Why: each run or finding follows from its gate's verdict. D1 is
  MEASURABLE because an offline run of the engine's own functions showed the
  archive that the fixture's Setup saves resolving from the trial's root: the
  Setup and the session share one `ARCFORGE_HOME` and one project key. The
  prompt hands the command to both arms, since a baseline that never saw the
  skill could not otherwise read the archive and the arms would differ by
  exposure, not behaviour. It stages nothing because both of B-11's steps
  are in the `SKILL.md` body, which also leaves its pool differing from
  6.4.0's in the Version alone. Its per-row rule exists because a transcript
  keeps a command and neither its output nor its exit code: an `arcforge`
  that does not resolve in a real session's `Bash` fails C3 as an ordinary
  FAIL, the engine writes a PASS record on 0/3, and an A/B on that record
  would spend 10 sessions on 0/5 against 0/5. The handoff is NOT MEASURABLE
  because a trial runs with `--disable-slash-commands` and has no way to
  load a skill by name, so the `dispatching` body the sentence points at
  never reaches the treatment; `--stage-skill-files` copies the one
  directory the injected file sits in, and `executing/` holds `SKILL.md`
  alone; a fixture copy reaches both arms; the transcript keeps the first
  200 characters of an Agent call, so no grader reads a dispatch card; and
  of #184's two assertions, "no model-tier field" passes in every arm and
  "has acceptance criteria" measures `dispatching`'s own step, not the word
  #182 changed, which has no observable behavioural consequence. The
  verify-exit sentence is NOT MEASURABLE for a new reason. The three engine
  changes D-057 asked for have landed (D-062), but the sentence has the
  agent run `uv sync` and `uv run` inside the skill's `references/`, which
  creates a `.venv` there; that directory is now the trial's staged copy,
  the write guard reports the write, the row is `trial_wrote_skill_files`
  and unscored, and a scenario cannot move the environment because
  `UV_PROJECT_ENVIRONMENT` is not a variable it may declare. A trial that
  does what the sentence says never scores, in either arm. Separately,
  D-062's Residual requires `uv`'s absence to be shown in a real trial, the
  gate may spend no session, and the offline evidence points the other way.
  D4 is MEASURABLE in one shape for the same cause: any `uv run` loses the
  row, so the task stops where #182's edit acts, at the moment `x` and `y`
  are chosen. The merged prompt departs from the gate's draft in one
  sentence: it prescribes a typed plan, one `"type": "box"` per service
  whose `id` is the service's name, and the grader reads those entries
  alone; both arms read that sentence and it says nothing about where a box
  goes. Its one scored assertion is 40 px between same-level shapes, a
  number both versions of the reference state; "column pitch equals 220" is
  not asserted, because the old text never contains 220 and a baseline would
  fail it by construction (D-057's reasoning on the five headings). The gate
  counts five ways an old-reference baseline passes without copying the 200
  px grid, so a ceiling BLOCK is a live outcome, and it would answer #185:
  the old grid's contradiction did not make an agent plan a violating
  layout. The 1800 s ceiling is kept because raising it costs nothing while
  a killed trial costs a session, and it is part of the preflight key, so
  both commands carry it. D5 is MEASURABLE because the engine supports the
  run and staging reaches the treatment alone, and it is non-regression only
  because two of its seven assertions separate the arms by construction: the
  committed reading is five baselines at 5/7 against five treatments at 7/7,
  a delta of 0.29 that is exactly 2/7. The mixed grader passes a row at 6/7,
  so the baseline falls short of a pass on those two alone and the
  preflight's PASS follows, whatever A1 to A4 do. Staging can move one thing, the treatment downward, and that is the
  one question the 13 sessions answer. The 67-session condition always holds
  because the two findings return 26 of D-059's 52 scheduled sessions. No
  A/B restart is budgeted because a staged copy is per trial since #291: a
  write into it costs that row, not the run. Both known instrument failures
  — D1's `PATH` and D4's staged-copy write in a preflight — draw on the
  round's two reruns and get no allowance of their own, which is what keeps
  the worst case at 53. This refines D-059 and reverses nothing: D-059 left
  the gates' verdicts, each k and the allowances to this entry, a NOT
  MEASURABLE finding at 0 sessions is an outcome it provides for, and its
  order survives with (ii) and (iii) removed.
- Residual: #184 stays unmeasured and open, the word shipping on its text
  (D-049); measuring it needs a second staged skill directory for the
  treatment, a transcript that keeps an Agent call's whole prompt, and a
  claim rewritten as the two skills' joint behaviour. The verify-exit
  sentence ships on its text for a second version; measuring it needs
  `UV_PROJECT_ENVIRONMENT` declarable so the environment lands in the trial,
  a test branch that depends on Chromium being absent, not `uv`, and
  preferably a transcript that keeps a `Bash` exit code. Whether `uv`
  resolves in a real trial's shell is still not established; D4 does not
  depend on it, but a D4 row that runs `uv` is lost. D4 reads the spacing of
  a plan once the file lands in the project, not whether an agent writes to
  an absolute path, and not the full build, render and save pipeline, which
  stays unmeasured; the `cd` into `references/` is in the `SKILL.md` both
  arms share, so a lopsided count of unscored rows is reported and not read
  as discrimination. The write guard sees a `.venv` in a staged copy and the
  directory digest does not (eval B-19). D4's baseline directory is not in
  the repository and is pinned by its digest alone. D5 cannot show that
  moving the template mattered, nor that A1 to A4 discriminate: the body
  still states the path convention and the five headings, and separating the
  template's share would take a trimmed, unstaged arm outside D-059. If no
  treatment row opens the staged template, D-059's Residual — the moved
  material is not in front of the treatment — holds for this round too.
  After `eval report`, the snapshot's reading for that scenario is the
  staged pool, with the pre-trim pool beside it on disk. In D1, whether
  `arcforge` resolves on a real session's `Bash` `PATH` is decided by the
  first preflight row, the archive's `Saved:` line is the trial's own time
  because `session save` takes no date, and C5 keeps the regex blind spots
  D-058 recorded. Every reading stays direction only (D-059).
- Cost accepted: 26 scheduled sessions; up to 8 for top-ups (two `--k 1`
  top-ups, 4 sessions, for each of D1 and D4); up to 6 for two preflight
  reruns; 13 for D5. The worst case is 40 before D5 and 53 with it, of a cap
  of about 80, plus D5's model-grader calls, which the cap does not count —
  D5 is the round's one model-graded scenario. Two of D-059's four
  measurements produce no reading, and #184 stays open on a verdict. D4's
  trials run under an 1800 s ceiling, reported as eval B-10 requires, and
  the plan's two hours for its A/B is read as an upper bound, not an
  estimate.
- Verification: the five gates under `docs/plans/v6.5/wp-d/` (PR #290) —
  `design-gate.sessions-resume.md`, `design-gate.executing-dispatching.md`,
  `design-gate.verify-exit.md`, `design-gate.diagramming-layout.md` and
  `design-gate.sessions-handover-writing.md` — with `budget.md` beside
  them; `evals/scenarios/eval-sessions-handover-and-resume.md` Version 2
  (PR #292), whose Design Notes carry the per-row rule;
  `evals/scenarios/eval-diagramming-obsidian-layout-grid.md` Version 1
  (PR #293), whose Design Notes carry the baseline directory's build and
  both digests; and `evals/scenarios/eval-sessions-handover-completeness.md`
  Version 4, unedited. The round's preflight records and A/B pools are
  copied under `docs/plans/v6.5/wp-d/` the way D-058's were, with the
  operator audits, and the 6.5.0 section of `evals/skill-eval-coverage.md`
  carries the two findings' ledger text and the audit of every row. The
  outcome is a later entry.

### D-064 — 6.5.0's round: resume through the archive measures, the layout grid is at ceiling, and the trimmed handover does not regress
- Date: 2026-10-13
- Version: 6.5.0
- Status: Accepted
- Decision: The round D-063 fixed ran within its eight clauses with no
  departure, on `opus[1m]` / `xhigh`, isolated, with no `--plugin-dir`, the
  skill text injected at skill scope by `--skill-file`, Node v24.13.1, at
  commit `853ea820`, one run at a time, and is read as one measured
  result, one ceiling finding, one non-regression reading and two findings
  at 0 sessions. (1) `eval-sessions-handover-and-resume` Version 2
  ([skill-system](specs/skill-system.md) B-11) passed preflight (baseline
  0/3) and read **+1.00 CI[1, 1] IMPROVED** at k=5: baseline 0/5, every
  baseline reading the archive through `arcforge session resume
  duration-hours`, running the full suite and then applying the handover's
  one-line `Next`, two of the five adding the unmentioned `d` as well;
  treatment 5/5, every treatment reading the archive the same way, running
  the suite, reporting where the work stands and where the repo disagrees,
  and stopping with no edit. (2) `eval-diagramming-obsidian-layout-grid`
  Version 1 (#185) is **NOT MEASURABLE at ceiling**. Its first preflight
  measured nothing — the provider refused one trial on a session limit, and
  the engine wrote a BLOCK with no pass rate — and the rerun clause 5
  allows read baseline 3/3, a BLOCK at ceiling, so clause 4 applies: no
  second preflight, no A/B, a finding, and #185 stays open. (3)
  `eval-sessions-handover-completeness` Version 4, unedited and run with
  `--stage-skill-files`, is read as **treatment not regressed, A1 to A4 not
  discriminating** and as nothing more: every treatment row passes all
  seven assertions, every baseline row passes A1 to A4, and the only two a
  baseline row loses are the write under `.handovers/` and A5. The engine's
  verdict for it, IMPROVED at +0.29 CI[0.29, 0.29], is recorded and is not
  read as improvement (D-063 clause 7). (4) The `executing` to
  `dispatching` handoff (#184) and the `diagramming-obsidian` verify-exit
  sentence ([obsidian](specs/obsidian.md) B-10) are findings at 0 sessions,
  as D-063 clause 1 fixed them, and #184 stays open. The one measured
  result, (1), is direction only: k=5 per arm, the engine's zero-variance
  interval, Fisher's exact p ≈ 0.008 and a Newcombe interval for the
  difference of about [0.39, 1.00], on one fixture and one model, for
  injected skill text and not plugin routing (D-024, D-044).
- Why: Each reading survives an audit of every row — 32 transcripts read
  against their rows. In (1) the per-row instrument rule never fired: all
  13 rows hold one standalone resume call and the wrapper's log holds one
  exit-0 line for each, so `arcforge` resolves on a real session's `Bash`
  `PATH` and the 0/5 is behaviour, not a missing command. The arms differ
  where 6.4.0's did (D-058), on the step the handover planned. Every
  treatment stop is genuine — no `Edit` or `Write`, no shell write, no
  change-and-revert, 4 to 6 tool calls of 30, every end-state
  `src/duration.js` still the fixture's — and no row took a blind spot the
  scenario lists: no `--help`, no discarded output, no archive body read
  round the command, no detached worktree. In (2) the five trials that ran
  to a file took one escape, the fourth of the five the gate listed. Each
  opened the staged old `layout-heuristics.md` and kept its 200 px grid,
  and each drew the six workers 140 px wide, as Secondary elements, which
  leaves 60 px between neighbours against an asserted 40. The old text
  contradicts itself only for a 180 px Primary element, a size no trial
  chose, and no trial mentioned the contradiction. So the BLOCK answers
  #185 for this task: the old grid did not make an agent plan a violating
  layout. It says nothing about a task whose elements are Primary-sized,
  and the current reference never ran. No row wrote into its staged copy
  and none read the current file from the repository. In (3) all three of
  clause 7's conditions hold, so its one sentence is the whole reading. The
  0.29 is exactly 2/7, the two assertions an arm that never saw the
  convention cannot meet. Staging did put the moved material in front of
  the treatment: all five treatment rows opened
  `references/handover-template.md` from their own staged copy before
  writing, so D-059's Residual does not hold for this round. No result is
  re-scored and no rule was departed from, so this records an outcome and
  relates to no earlier entry.
- Residual: B-11's effect size is not established at k=5, and its archive
  is still one the fixture's Setup saved, not one the agent wrote in an
  earlier session. B-10's five sections have no discriminating evidence:
  (3) shows no regression and cannot show that moving the template
  mattered (D-063). #185 is unmeasured wherever elements are Primary-sized,
  and the build, render and save pipeline stays unmeasured; a Version 2
  needs a task in which the baseline arrives at Primary width without the
  prompt naming a width (the **eval-layout-grid-v2** wish). #184 and the
  verify-exit sentence stay unmeasured (D-063); a transcript that keeps an
  Agent call's whole prompt is the **eval-transcript-full-tool-input**
  wish. Of [eval](specs/eval.md) B-15 to B-21, the round exercised the run
  lock, preflight rows, the three row fields, the declared environment and
  staging in live trials, but B-20 only in its preflight half — no A/B
  between two skill texts has run — B-15 only uncontested, since no second
  run tried the lock, and B-21 once, on D5's `eval compare`. Three D4 rows suggest `uv` does
  not resolve in a trial's built environment — two say so and two fell back
  to `python3` one call after `uv run --no-project` — against the
  verify-exit gate's offline evidence; a transcript keeps no output, so
  this is an indication, not proof. The first D4 preflight's second trial
  was cut off by the same session limit after it wrote `layout.json` and
  was scored as an ordinary row: the engine recognises a refusal that
  replaces the agent's turn, not one that follows tool calls (the
  **eval-provider-limit-mid-trial** wish). A preflight rerun overwrites the
  record it replaces, an A/B's `grading/` files are keyed by trial number
  and so keep the second arm's only, and D1's "archive file read directly"
  flag fired on `aliases.json` in 8 rows and on the archive body in none.
  C5 keeps the regex blind spots D-058 recorded.
- Cost accepted: 32 trial sessions of the cap of about 80 — D1 preflight 3
  and A/B 10, D4's first preflight 3 and its rerun 3, D5 preflight 3 and
  A/B 10 — with no top-up and one of the two preflight reruns used. The
  first D4 preflight's 3 sessions bought no reading, and the 10 sessions
  D4's A/B would have taken were not spent. D5's 13 rows were model-graded;
  D1 and D4 are code-graded. Of D-059's four measurements and its
  conditional fifth, one is a measured reading, one a ceiling finding, two
  are findings at 0 sessions and one is a non-regression. The `sessions`
  treatment in (1) ran cheaper — 44.7 s against 84.9 s, 4,103 against 7,343
  output tokens — because it stops before the edit, which is a consequence
  of the behaviour, not an efficiency claim. In (3) the treatment cost 46.1
  s against 37.1 s and 4,519 against 3,600 output tokens, reported and not
  flagged. D4's trials ran 396 to 473 s under the 1,800 s ceiling.
- Verification: the four preflight records under `docs/plans/v6.5/wp-d/` —
  `preflight.eval-sessions-handover-and-resume.json` (scenario hash
  `a08495af5b8259ff`, 2026-10-12T22:28:02Z, run `20261012-222430`),
  `preflight.eval-diagramming-obsidian-layout-grid-1.json` (hash
  `003f6bda689dafb4`, 2026-10-12T22:55:18Z, run `20261012-224014`, the
  error BLOCK, kept from the operator's copy because the rerun overwrote
  it), `preflight.eval-diagramming-obsidian-layout-grid-2.json`
  (2026-10-13T00:14:25Z, run `20261012-235207`, baseline directory digest
  `0f3c574c1e448946`) and
  `preflight.eval-sessions-handover-completeness.json` (hash
  `708742f7f80f88f1`, 2026-10-13T00:21:04Z, run `20261013-001453`); the A/B
  runs `20261012-222837` (D1) and `20261013-002124` (D5, treatment
  `skillFilesHash` `cc8e5da279b238b6`), pooled in the snapshot
  `evals/benchmarks/2026-10-13.json` (= `latest.json`, generated
  2026-10-13T00:54:25Z), their rows in `evals/benchmarks/raw/` under the
  same name; the operator audits `docs/plans/v6.5/wp-d/audit.d1.md`,
  `audit.d4.md` and `audit.d5.md`; and the 6.5.0 section of
  `evals/skill-eval-coverage.md`. Preflight rows are in no pool and no
  snapshot ([eval](specs/eval.md) B-16), so D4's rows stay under the
  untracked `evals/results/`, and the audit is their record. The verdicts
  are the engine's, read as clause 4 requires with `eval compare` on the
  pooled rows of each scenario's Version: D1 +1.00 CI[1, 1] IMPROVED on 5
  rows an arm, and D5 +0.29 CI[0.29, 0.29] IMPROVED on 5 rows an arm with
  `--no-analyzer`, the 5 rows an arm written before conditions were
  recorded reported as not combined. Both match what `eval ab` printed and
  what the snapshot records. That comparison was run while this entry was
  under review, after the round and not by the operator at the time; it
  reads rows and starts no session. `node scripts/check-benchmark-freshness.js`
  reports OK, and `git diff --stat 853ea820..HEAD -- skills evals/scenarios
  evals/fixtures` is empty. D2 and D3 spent 0 sessions, as D-063 recorded.
  Clause 3's flags are shown by the six command lines of the round, taken
  from the operator session's own record and copied into the three audits:
  a D5 preflight row records no staging field and its record's key holds
  none, so that preflight's `--stage-skill-files` rests on its command
  line, sent at 2026-10-13T00:14:52Z. The same record shows no
  `eval compare` at run time.

### D-065 — 6.5.1: the instrument repairs 6.5.0's round left, the flaky tests, and a bounded transcript parse
- Date: 2026-10-21
- Version: 6.5.1
- Status: Accepted
- Decision: 6.5.1, a patch, carries (1) the instrument repairs D-064's
  Residual leaves: a trial transcript writes an Agent (or Task) call's whole
  input as one line of JSON, and writes a `[Result: <tool>] error` block —
  with `(exit N)` appended for `Bash` when the result text opens with an
  `Exit code N`, there being no structured field — only for a tool result the host marked
  `is_error`, never a successful result and never a result's content, and
  every row records `transcript_format`, the version of that grammar,
  recorded and not pooled ([eval](specs/eval.md) B-17); a provider refusal
  that arrives after the agent's tool calls is recognised by the shape of
  the session's last assistant message — one the host wrote, its model
  `<synthetic>`, with zero output tokens and text only — never by its
  wording, and is recorded as `provider_refusal` with `infraError` and
  `refusalAfterActions`, the number of tool calls before it (B-10); the raw
  stream-json of every trial is kept under its run's `raw/`; a preflight
  rerun moves the record it replaces into `evals/preflight/history/`, from
  which no reader takes a record (B-16); and grading files are named per
  arm, `<condition>-trial-N.json`. (2) Four flaky tests fixed at their
  causes — the diary-capture test's marker, written non-atomically and read
  empty; the session-alias lock test, whose lock waits by busy-looping and
  whose spawned children have no `error` handler; the observer daemon's
  ZB-T1, which assumes a zombie after a fixed sleep; the proposal-ingestor
  test whose `run_id` changes at a second boundary — and a reproduction
  attempt on the jest worker SIGSEGV, with `jest.config.js` changed only
  if the default worker count reproduces it and a bounded one does not.
  (3) `parseTranscript` reads at most the last 8 MiB of a transcript ([hooks](specs/hooks.md) B-7, #172). (4)
  `docs/guide/cli-invocation.md` names exactly which commands have no human
  format and print the same JSON with and without `--json`, a list built
  by running each command both ways, as [cli](specs/cli.md) B-6 now says;
  no human output format is added. It graduates the wishes
  **eval-provider-limit-mid-trial**, **eval-transcript-full-tool-input**,
  **bound-transcript-parse** and **cli-human-output**.
- Why: D-064's Residual names three of the four instrument gaps — a
  refusal after tool calls scored as an ordinary row, a preflight rerun
  overwriting the record it replaces, and `grading/` files that keep the
  second arm's only — and its wish for a transcript that keeps an Agent
  call's whole prompt is what #184's measurement needs to read a dispatch
  card at all. The refusal is told apart by the message's shape because
  the `result` event's output tokens count the whole session, so after a
  tool call they are never zero, and a wording match would break on the
  provider's next phrasing; `result.is_error` is not used because it also
  marks `error_max_turns`, which is a scored outcome. The new transcript
  content leaves every existing `[Tool: …]` block's text as it was, and a
  `[Result:` block is not an action, so the shipped graders, the
  completeness check and the refusal check read an old transcript and a
  new one alike; that is why `transcript_format` is recorded and not a
  pooling condition, like the Node version. It is a patch, not a minor:
  no flag or command is added — what is added is transcript content, two
  row fields and an untracked `raw/` directory — where 6.5.0 was a minor
  because it added hook behaviour and eval flags (D-059). It spends no
  trial session because `scripts/check-benchmark-freshness.js` counts only
  `skills/`, `evals/scenarios/` and `evals/fixtures/` as eval-backed
  surface and 6.5.1 touches none of them — the 6.2.1 shape (D-048). The
  flaky tests and #172 ride along because they are engine and test
  repairs of the same kind, and the CLI guide is corrected rather than the
  output changed because a human format would change stdout that scripts
  already parse, which a patch must not do.
- Residual: the `<synthetic>` shape is observed in Claude Code's session
  JSONL, not yet in a stream-json event, since the runner kept no raw
  stdout before this version; if the host stops marking such messages, a
  refusal after tool calls scores as a completed turn again, which is
  today's behaviour, not a regression. `[Result:]` blocks are written for
  errors only, so a grader still cannot read a successful tool's output.
  A subagent's tool calls stay unmarked in the transcript. The D1
  scenario's "archive file read directly" flag still fires on
  `aliases.json`: it is printed for the operator and not scored, and
  fixing its regex would bump the scenario's Version and empty its +1.00
  pool. Above the 8 MiB bound the diary's tool and file lists are the
  window's, not the session's. The jest SIGSEGV may stay unexplained: if
  it does not reproduce, the configuration is left as it is and the
  suspects are recorded on the PR.
- Cost accepted: 0 trial sessions; one release cycle before 6.6.0's
  measurements, which wait on (1).
- Verification: one test or check per repair, each in the PR that lands
  it — a real trial's transcript shows an Agent call's whole prompt and a
  failed `Bash` call's exit code, and the shipped graders score an
  existing fixture's transcript as before; a constructed stream-json with
  two tool calls and a final `<synthetic>` text-only message with zero
  output tokens yields a row with `infraError` and `refusalAfterActions: 2`,
  its raw stream-json under the run's `raw/`; two preflights on one key
  leave both records, the gate reading the newer; `eval ab --k 1` leaves
  `baseline-trial-1.json` and `treatment-trial-1.json` under `grading/`
  and `eval audit` reads both; each of the four tests fixed at its cause
  passes 20 runs in a row, and the jest SIGSEGV is a reproduction attempt
  whose result is recorded on the PR;
  a 50 MB synthetic transcript parses in bounded time and memory, with
  output identical to a whole-file parse within the bound; and a
  `tests/node` case asserts two of the listed commands print the same
  stdout with and without `--json`. Before the tag,
  `node scripts/check-benchmark-freshness.js` reports OK.

### D-066 — 6.6.0: a second staged skill directory, the handoff and layout measurements, and #256 on contract tests
- Date: 2026-10-22
- Version: 6.6.0
- Status: Accepted
- Decision: 6.6.0, a minor, carries (1) a second staged skill directory for
  an A/B's treatment, `eval ab --also-stage <skill-dir>` (D-067); (2) one
  measurement round of two items, each behind an offline design gate that
  is written before any session of it and may end NOT MEASURABLE, a
  finding at 0 sessions: D1, the `executing` to `dispatching` handoff
  (#184), in a new scenario whose two arms are injected with the same text,
  `skills/core/executing/SKILL.md` — the baseline by
  `--baseline-skill-file`, both arms with `--stage-skill-files` — and whose
  treatment alone adds `--also-stage skills/core/dispatching`, so the arms
  differ only in whether `dispatching` is within reach and the reading is
  the handoff sentence plus a reachable body, not the two skills together
  against none; and D2, `eval-diagramming-obsidian-layout-grid` Version 2
  (#185), a task in which the baseline arrives at Primary-sized elements
  without the prompt naming a width, run as an A/B between two skill texts
  the way D-063 clause 3 ran Version 1; (3) the block-model fix to the
  `maintaining-obsidian` lint helpers (#256), a skill-local script change
  whose evidence is contract tests under `tests/skills/` and no A/B. The
  round's skeleton, in D-059's shape: every item whose design gate passes
  starts with one preflight at k=3, always — an item the gate finds NOT
  MEASURABLE stops at the gate, at 0 sessions — and goes on a PASS to an
  A/B at its scenario's
  `## Trials`; D1 runs before D2; a preflight BLOCK at ceiling is a
  finding — no rerun, no A/B; a preflight that measured nothing may be
  rerun, at most twice in the whole round; an A/B that ends with an arm
  short of scorable rows gets at most two top-ups of one trial per arm
  (`eval ab --k 1`);
  and every verdict is the engine's, read with `eval compare` on the merged
  pool of the scenario's Version. The cap is about 45 trial sessions: 26
  when both items run once through (6 preflight, 20 A/B), up to 8 for
  top-ups and up to 6 for preflight reruns, 40 at worst; an A/B that would
  pass the cap is not started, and its k is not lowered to fit. Version 2
  is #185's second and last design, and the **eval-layout-grid-v2** wish
  graduates into this version on promotion, whatever the round reads: if
  Version 2's preflight BLOCKs at ceiling, #185 is closed as a finding. The `diagramming-obsidian` verify-exit
  sentence ([obsidian](specs/obsidian.md) B-10) is not in the round, and
  `eval-router-skill-selection` is not rerun. The detailed pre-registration
  — each gate's verdict, each k, the staged digests, the per-row audit —
  is a later entry, written after the gates, that refines this one.
- Why: A minor because `--also-stage` is a new `eval ab` flag; 6.5.1 was a
  patch because it added none (D-065), and 6.5.0 was a minor for eval
  flags (D-059). D-063 found the handoff NOT MEASURABLE because a trial
  runs with `--disable-slash-commands` and cannot load a skill by name,
  because staging copies only the directory the injected file sits in, and
  because a transcript kept the first 200 characters of an Agent call, so
  no grader could read a dispatch card. 6.5.1 lifted the third (D-065,
  [eval](specs/eval.md) B-17), and D-067 lifts the other two. Both arms get
  the same `executing` text because the claim is about the step the
  handoff sentence hands to `dispatching`: against no skill at all, the
  arms would differ in everything `executing` says. One text in both arms
  with different staged material is a shape D-063 clause 3 already ran in
  its D4. Of #184's two assertions, "no model-tier field" passes in every
  arm (D-063) and is not asserted. When D1 passes its preflight, its A/B
  is the first A/B between two skill texts the engine has run: 6.5.0's
  round exercised B-20 only in its preflight half (D-064). D2 follows
  D-064: every Version 1 baseline drew the six workers as Secondary
  elements, 140 px wide, so the old grid's contradiction for a 180 px
  Primary element never came up; Version 2 asks for the case the old text
  gets wrong. `.claude/rules/eval.md` treats a scenario still at a zero
  delta after two redesigns as a skill formalising what the agent already
  does, which is why Version 2 is the last. #256 rides here and could not
  ride 6.5.1: it changes a file under `skills/`, which re-arms
  `scripts/check-benchmark-freshness.js`, and 6.5.1 spent no session
  (D-065); a version whose round regenerates the benchmark carries it at
  no extra cost. It is evidenced by contract tests and not an A/B, as
  D-049 did for the earlier lint-script and helper fixes. The cap comes
  from the round's own arithmetic, not from D-059's 80: two items, each a
  preflight of 3 and an A/B of 10, plus the same top-up and rerun
  allowances D-063 set. The verify-exit sentence stays out because two
  gates found it not measurable (D-057, D-063), and a third attempt needs
  `UV_PROJECT_ENVIRONMENT` made declarable, a test branch that depends on
  Chromium's absence, and every trial running its own `uv sync` and
  Chromium download — work this version has no other reason to do.
  Nothing in 6.6.0 changes the router's subject, so its scenario file is
  not edited and its pool is not rerun.
- Corrections to D-065: D-065 is immutable, so four statements it made or
  left out are corrected here. (a) Its Why says the new transcript content
  leaves every existing `[Tool: …]` block's text as it was. It does not for
  the Agent and Task tools: their block was the first 200 characters of the
  input's JSON and is now the whole input, so every such block longer than
  200 characters changed. The six tools the transcript writer special-cases
  — `Write`, `Edit`, `Read`, `Bash`, `Glob` and `Grep` — are byte-identical,
  and no shipped grader under `evals/` matches an Agent or Task block. (b)
  The jest worker SIGSEGV, as shipped: 10 of 10 runs with the default
  worker count and 10 of 10 with `--runInBand` were green, it did not
  reproduce, `jest.config.js` is unchanged, and the suspects — coverage
  instrumentation in every worker, and the worker count — are recorded on
  PR #303. (c) #172 had been closed in 6.1.2, when [hooks](specs/hooks.md)
  B-7 documented the parse's unbounded cost; 6.5.1 (#304) completed the
  engine half of that issue rather than closing it. (d) The 6.5.1
  CHANGELOG also carries the 6.5.0 post-release check (#297), by the
  precedent of earlier releases, which D-065 does not mention.
- Residual: if D1's gate ends NOT MEASURABLE, #184 stays open on a finding
  for the second time and the word keeps shipping on its text (D-049).
  D1's treatment is told that `dispatching` is available in one line the
  engine writes; it is not a plugin load, so a reading is about the two
  texts' joint behaviour with the second one reachable, not about routing
  (D-024, D-044). Every reading stays direction only, on one fixture and
  one model, for injected skill text (D-059). If D2 BLOCKs, #185 closes
  with the current reference never measured against the old one. The
  6.5.0 resume scenario's "archive file read directly" flag still fires on
  `aliases.json` (D-065) and is not fixed in this version.
- Cost accepted: up to about 45 trial sessions, 40 in the worst case the
  rules allow. #256 makes the release wait on the round's `eval report`,
  since the freshness gate demands a regenerated benchmark once anything
  under `skills/` changed.
- Verification: the two design gates, written under `docs/plans/v6.6/`
  after D-067's engine change and 6.5.1's transcript change are on `main`;
  the pre-registration entry that refines this one; the contract tests for
  #256 under `tests/skills/`, failing before the fix and passing after;
  and, before the tag, `node scripts/check-benchmark-freshness.js`
  reporting OK after the round's `eval report`, with `git diff --stat`
  from the measurement commit over `skills`, `evals/scenarios` and
  `evals/fixtures` empty.

### D-067 — The second staged skill directory: `--also-stage`, treatment only
- Date: 2026-10-22
- Version: 6.6.0
- Refines: D-062
- Status: Accepted
- Decision: `eval ab --also-stage <skill-dir>` stages a second skill
  directory for the treatment arm alone. It requires `--stage-skill-files`
  and a skill-scope A/B, and `eval preflight` refuses it; the directory
  must contain a `SKILL.md` with a frontmatter `description`, which the
  listing line below carries in its parenthesis, and `eval ab` refuses a
  directory whose `SKILL.md` has none; each trial is staged a copy of its own,
  as the main directory is (B-19). The injection appends one line after
  the skill text — "Skill `<name>` (<frontmatter description>) is
  available; its base directory is `<copy>` — read `<copy>/SKILL.md` to
  use it." — which stands in for the host's listing of an available skill;
  the second skill's body is not injected. Every row of such a run records
  `alsoStaged: true`, a pooling condition added to `ranWith()` and to
  `CONDITION_FIELDS` in the style of `stageSkillFiles`, and
  `alsoStagedFilesHash`, the digest of the second staged directory,
  recorded and not pooled. `skillTextHash`, `skillFilesHash` and the
  preflight key do not change. The `--append-system-prompt` sentence that
  makes the staged directory the one exception to staying inside the
  trial directory names each staged directory instead; with one directory
  it is byte-identical to the sentence before 6.6.0, pinned by a golden
  test.
- Why: D-063 found the handoff not measurable because the `dispatching`
  body the `executing` sentence points at never reaches a trial: trials
  run with `--disable-slash-commands`, so no skill loads by name, and
  staging copies only the directory the injected file sits in. A shipped
  plugin lists `dispatching` and loads its body when the agent reads it;
  one line naming the skill and its staged copy is the closest an injected
  arm comes to that, and it leaves the decision to read the body with the
  agent, which is what the measurement is about. Treatment only, because
  the reachable second skill is the difference between the arms; the
  preflight runs the baseline, which has none, so `--also-stage` there
  would be a no-op that reads as a condition. `alsoStaged` pools for the
  reason staging does (D-062): a treatment that can reach a second skill
  answers a different question from one that cannot. Its digest is
  recorded and not pooled, like the treatment's own `skillFilesHash`
  (B-20). The preflight key and both existing hashes stay as they are so
  that every pool and record written before 6.6.0 keeps its identity.
  Two alternatives were rejected: a repeatable `--skill-file`, which
  would inject `dispatching`'s body into the prompt where the shipped
  plugin loads it on demand, and would need the CLI's shared option
  parser, which takes one value per option, to change; and a `## Skills`
  section in the scenario, which would put engine configuration into
  scenario prose.
- Residual: the line is the engine's imitation of a host skill listing,
  not the listing itself, so the treatment's chance of reading the second
  body may differ from a real session's. Nothing but the write guard and
  the prompt's advice keeps an arm away from a directory it was not given
  (B-19). The second directory's digest is not pooled, so two runs of one
  scenario version given different `--also-stage` directories — or a
  `dispatching` edited between them — land in one pool, exactly as a
  treatment's own `skillTextHash` and `skillFilesHash` do under D-062. A
  reader tells such runs apart by each row's `alsoStagedFilesHash` and the
  conditions `ranWith()` records; changing which skill the handoff is
  measured against is a bump of the scenario's Version, not a new pool.
- Cost accepted: a second directory whose content does not split a pool,
  and one more flag for the CLI manifest and the eval guide to carry.
- Verification: contract tests in the PR that lands it — the treatment's
  injection carries the base-directory line and the one-line listing,
  both paths under `os.tmpdir()`, and the baseline's carries only its
  base-directory line; a row carries `alsoStaged: true` and
  `alsoStagedFilesHash` with `skillFilesHash` unchanged; the exception
  sentence names both directories, and with one directory matches the
  golden string; `eval preflight` with the flag, the flag without
  `--stage-skill-files`, and a directory with no `SKILL.md` are each
  refused. `npm run check:docs` holds the flag to the CLI manifest.
