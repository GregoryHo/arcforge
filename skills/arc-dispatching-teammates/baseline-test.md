# Baseline Test — arc-dispatching-teammates

## Purpose

RED phase artifact for the `arc-dispatching-teammates` skill. Captures the
verbatim behavior of a current Claude Code agent (with the full existing
arcforge skill catalog but **without** `arc-dispatching-teammates`) when
given a scenario that the new skill is designed to handle.

Per the Iron Law of skill development (`arc-writing-skills`): no skill is
written without a failing test first. This file is that test.

## Scenario Setup

- **Date of run:** 2026-04-10
- **Scratch repo:** `/tmp/dispatching-baseline/` (ephemeral, cleaned after run)
- **Git-initialized:** yes, single initial commit
- **dag.yaml shape:** 3 epics, all `status: pending`, all `depends_on: []`,
  no worktrees assigned — i.e., all three are simultaneously "ready"
  - `epic-auth` — Authentication (login, session, password reset)
  - `epic-api` — Public API (REST endpoints, rate limiting)
  - `epic-ui` — User Interface (dashboard, settings panel)
- **Claude Code version simulated:** 2.1.32+ (agent teammates feature
  available)
- **Arcforge CLI verification:** `node scripts/cli.js status --json` confirms
  all three epics visible as pending with `worktree: null`

## Contamination Guards Applied

The baseline subagent was explicitly forbidden from:
- Reading `docs/plans/2026-04-10-arc-dispatching-teammates-design.md`
- Reading any file whose path contains `arc-dispatching-teammates` or
  `dispatching-teammates`
- Invoking a skill named `arc-dispatching-teammates` (does not exist)
- Running `arc-coordinating expand` or `arc-using-worktrees` against the
  scratch repo (observation-only, no side effects)
- Running git operations beyond `git status` / `git log`
- Spawning further subagents
- Editing any file

The subagent was *allowed* to invoke the existing arcforge skill catalog
via `arc-using` routing — this is what a fresh Claude Code session would
naturally do.

## User Prompt Presented to Baseline Subagent

Verbatim, as drafted in
`docs/plans/2026-04-10-arc-dispatching-teammates-design.md` §Phase 1 step 3:

> I just finished arc-planning. My dag.yaml has three independent epics
> ready: epic-auth, epic-api, and epic-ui. I want to work on all three in
> parallel so I can watch them happen and step in if anything goes wrong.
> I'll stay at my keyboard. What's the best way to run them?

## Baseline Subagent Response (Verbatim)

> OK, `arc-looping` is for **unattended** cross-session execution — the
> user explicitly said "I'll stay at my keyboard" and "step in if anything
> goes wrong," which is the opposite. Not a fit.
>
> So I have what I need. Let me write my genuine first-instinct response.
>
> ---
>
> ## STEP 3 — Draft response to user
>
> Great, three independent epics with nothing blocked is exactly the shape
> where arcforge's worktree model pays off. Here's what I'd recommend.
>
> **The architecture arcforge gives you for this**
>
> arcforge has two layers of parallelism:
> - **Epic-level** parallelism → separate git worktrees (one per epic).
>   This is what `arc-coordinating` / `arc-using-worktrees` are for.
> - **Feature-level** parallelism → dispatching subagents *inside* a
>   worktree. That's `arc-dispatching-parallel`, and it lives *under* a
>   worktree session.
>
> Because your three epics are independent at the epic level, you want the
> worktree path. One worktree per epic, each on its own branch, no shared
> files = zero chance of collision.
>
> **Concrete steps**
>
> 1. **Expand worktrees for all ready epics** (from the project root):
>    ```bash
>    node scripts/cli.js expand
>    ```
>    This reads `dag.yaml`, finds `epic-auth`, `epic-api`, `epic-ui` (all
>    pending, no deps, no worktrees), and creates an isolated git worktree
>    for each at `~/.arcforge-worktrees/dispatching-baseline-<hash>-<epic>/`.
>    It stamps each with an `.arcforge-epic` marker so DAG sync stays
>    honest.
>
> 2. **Confirm they're live**:
>    ```bash
>    node scripts/cli.js status --json
>    ```
>    You'll now see the absolute worktree path on each epic. Don't
>    reconstruct those paths by hand — the hash is derived.
>
> 3. **Open three separate Claude Code sessions**, one `cd`'d into each
>    worktree. Each session:
>    - Owns exactly one epic (the one whose `.arcforge-epic` marker is in
>      its cwd)
>    - Runs `arc-implementing` to drive that epic's features through TDD
>    - Can itself use `arc-dispatching-parallel` internally if the epic's
>      features are independent
>
>    This is the part where "I'll stay at my keyboard" matters: **you**
>    become the coordinator across the three sessions. You tab between
>    them, watch each one's output, and step in on whichever one stumbles.
>    The human-in-the-loop is the arcforge-supported pattern for
>    supervised parallel work — `arc-looping` is the *unattended*
>    alternative and it's not what you want here.
>
> 4. **When an epic finishes**, in that worktree run:
>    ```bash
>    node scripts/cli.js merge
>    ```
>    It auto-detects the epic from `.arcforge-epic`, merges back to base,
>    and marks the epic completed in `dag.yaml`. Repeat per epic as each
>    one lands. Finally `arcforge cleanup` to remove the merged worktrees.
>
> **Honest caveat** — one thing I want to flag
>
> arcforge's parallel story is strongest when the sessions run themselves
> (`arc-looping`, fully unattended) or when *one* session dispatches
> feature-level subagents via `arc-dispatching-parallel`. Your stated mode
> is in-between: three epics, parallel, but with you present at the
> keyboard watching them. There isn't a dedicated skill for "drive N
> supervised epic sessions from one lead" — the current recipe is the
> manual one above (you open the three Claude sessions yourself and tab
> between them). It works, but you're the orchestrator, not a skill.
>
> If that manual juggling feels heavy, an alternative is to just pick the
> highest-risk epic, drive it yourself in one session, and let
> `arc-looping --pattern dag` work the other two in the background with
> you spot-checking via the `loop-operator` agent. That's a hybrid — less
> simultaneous, but lower cognitive load.
>
> **My recommendation:** go with the three-worktree, three-sessions
> approach. It matches your "watch and step in" constraint exactly, and
> it's the composition the skill catalog is actually designed for.
>
> Want me to run `arcforge expand` now so the worktrees are ready?
>
> ---
>
> ## Baseline Debrief
>
> ### Skill(s) you would route to
> 1. `arc-using` (routing check)
> 2. `arc-coordinating` (multi-epic + dag.yaml + worktree lifecycle)
> 3. `arc-dispatching-parallel` (checked whether it covers epic-level —
>    it doesn't; it's feature-level within a worktree)
> 4. `arc-looping` (checked as the autonomous alternative; rejected
>    because user is supervising)
> 5. Downstream per-worktree: `arc-implementing` (recommended, not invoked
>    here)
>
> ### Did agent teammates come up in your reasoning?
> `no, aware of them but did not connect to this scenario`. I know Claude
> Code 2.1.32+ has an agent teammates feature, but my first-instinct
> mental model for "parallel epics in arcforge" jumped straight to git
> worktrees + multiple Claude sessions because that's what the arcforge
> skill catalog is built around. Teammates never surfaced as a routing
> option because nothing in `arc-using`, `arc-coordinating`, or
> `arc-dispatching-parallel` mentions them — the catalog's parallelism
> vocabulary is worktrees (epic-level) and subagents via Task tool
> (feature-level).
>
> ### Full verbatim recommendation to user
> See STEP 3 draft above. The concrete answer is: `arcforge expand` →
> open three Claude sessions, one per worktree → each runs
> `arc-implementing` → human tabs between them → `arcforge merge` per
> epic as they finish.
>
> ### Gaps in the arcforge skill catalog for this scenario
> Yes, there's a real gap. The existing skills cover two endpoints of a
> spectrum:
> - **Fully unattended parallel** → `arc-looping --pattern dag`
> - **One-session, feature-level parallel** → `arc-dispatching-parallel`
>   (Task tool subagents)
> - **Epic-level parallel via worktrees** → `arc-coordinating expand`
>   creates the worktrees, but then the skill catalog goes silent on *how
>   the human actually drives N worktrees in parallel at once*. The burden
>   falls on the user to open and manage N Claude sessions by hand.
>   There's no skill that says "here's how a lead agent supervises
>   multiple live epic sessions concurrently with the lead watching and
>   stepping in." The catalog assumes the lead drives one worktree at a
>   time sequentially, or hands off to `arc-looping` for autonomy.
>
> An ideal skill would articulate: supervised multi-epic execution where
> one lead session coordinates N live worker sessions (whatever the
> execution substrate — separate Claude windows, subagents, teammates,
> tmux panes), and the lead stays present to intervene.
>
> ### Rationalizations you caught yourself making
> - Assumed "three Claude sessions, one per worktree, tab between them"
>   is a clean pattern. In practice that's cognitively heavy and has no
>   skill backing it — I was papering over an ergonomics gap with "you're
>   the orchestrator."
> - Nearly framed the manual session-juggling as "the arcforge way" when
>   it's really "the only way the current catalog supports this exact
>   shape."
> - Didn't seriously interrogate whether a single Claude session could
>   drive all three epics simultaneously via some mechanism other than
>   Task subagents. I anchored hard on worktrees = separate Claude
>   sessions.
> - Mentally bucketed "agent teammates" as a generic Claude Code feature
>   rather than asking "wait, does that feature actually solve this
>   specific user need?"
>
> ### Clarifying questions you would have asked the user
> None — I would have proceeded with the recommendation. (I'd have
> offered to run `arcforge expand` as the confirming step, and surfaced
> the hybrid with `arc-looping` as a fallback, but I wouldn't have gated
> on asking.)
>
> ### Confidence check
> **3/5.** The recommendation is *defensible* given the current skill
> catalog — `arc-coordinating expand` + multiple manual sessions is the
> standard arcforge epic-parallelism pattern. But I'm uncomfortable
> because:
> - It pushes real coordination work onto the user (opening/managing
>   three sessions) without skill support.
> - I didn't seriously consider whether Claude Code's agent teammates
>   feature — which the briefing confirms is available — might be a
>   materially better substrate for "supervised parallel epics" than
>   manually juggling Claude windows.
> - The fact that I had to invent the phrase "you become the coordinator"
>   is a tell that the catalog has a shape-shaped hole here.
>
> If teammates turn out to be the right substrate for this scenario, my
> recommendation is reasonable but suboptimal — closer to a 2/5.

## Analysis — What the Baseline Reveals

### Primary failure pattern: teammates invisible to routing

The baseline agent was explicitly told teammates are available and still
did not route to them. The failure is **not** that the agent is unaware of
the feature — it's that the arcforge skill catalog has no vocabulary for
"agent teammates as epic dispatch substrate." Routing goes through
`arc-using` → `arc-coordinating` / `arc-looping` / `arc-dispatching-parallel`,
and none of those skills mention teammates. The agent's attention follows
the catalog; the catalog is silent; teammates drop out.

This is the exact gap the design doc predicted. See `§Problem Statement`
in `docs/plans/2026-04-10-arc-dispatching-teammates-design.md`.

### Secondary failure pattern: "you become the coordinator" rationalization

The agent landed on "open three Claude sessions, tab between them, you
are the orchestrator" as its recommendation. In its own debrief it
flagged this as "papering over an ergonomics gap." This is a
rationalization the GREEN-phase SKILL.md must explicitly counter — the
right answer is not "make the human the orchestrator," it is "spawn
teammates and let the lead session remain the orchestrator."

### Tertiary failure pattern: anchoring on worktrees = separate Claude sessions

The agent anchored early on the equivalence "one worktree = one Claude
session launched by the user." It did not interrogate whether a single
lead session could *itself* drive multiple live worker sessions
(which teammates enable). GREEN must break this anchor by presenting
teammates as "worktrees driven by spawned workers under a single lead,"
not "a new UI pattern."

### Fourth failure pattern: confidence-gap signal

The agent self-scored 3/5 with explicit self-doubt — and then proceeded
to recommend anyway (no clarifying questions). This is the
"proceed-confidently-down-a-wrong-path" pattern that Phase 1 step 4 of
the design doc specifically asked us to watch for. The skill must make
the right routing so obvious that the agent hits 5/5 confidence for
real, not that it suppresses its 3/5 honesty.

## Gaps GREEN Phase Must Address

These are the **specific** gaps observed — the GREEN SKILL.md should
address only these, per the Iron Law's minimality principle:

| # | Gap | GREEN counter |
|---|-----|----------------|
| 1 | `arc-using` routing table has no entry for multi-epic + lead-present + interactive | Add routing entry pointing to `arc-dispatching-teammates` for exactly this condition |
| 2 | Teammates are not mentioned in `arc-coordinating`, `arc-looping`, or `arc-dispatching-parallel` | New skill's frontmatter description must explicitly trigger on "agent teammates" and "parallel epics with lead present" — keywords the baseline agent would search for |
| 3 | "Open N Claude sessions manually" framed as "the arcforge-supported pattern" | Skill body must explicitly counter this framing: spawning teammates is the arcforge-supported pattern for supervised multi-epic parallelism; manual session-juggling is the fallback, not the default |
| 4 | The hybrid "drive one, let arc-looping handle the rest" was offered as a fallback without justification | Skill should clarify when arc-looping is still the right call (user walking away) vs when teammates are (user staying present) — the boundary is attendance, not risk tolerance |
| 5 | No mention of auto-expand within the dispatch workflow | Per design decision table: the skill auto-expands worktrees via `coordinator.expandWorktrees({ epicId })` rather than requiring the user to expand first — single responsibility |

## What GREEN Must NOT Add

Per the Iron Law, do not write content that addresses failures the
baseline did not show. In particular:

- The baseline agent correctly rejected `arc-looping` for a lead-present
  user. GREEN does not need a long section defending against
  `arc-looping` misrouting — a short boundary line suffices.
- The baseline agent correctly identified `arc-dispatching-parallel` as
  feature-level (inside a worktree), not epic-level. GREEN does not need
  an extended comparison — a brief "different scope" note is enough.
- The baseline agent did not attempt to over-parallelize (no "spawn 20
  teammates" fantasy). The 5-teammate cap from the design doc is still
  correct, but the skill does not need defensive prose against a failure
  mode that didn't occur.
- The baseline agent asked zero clarifying questions. GREEN does not
  need to mandate clarifying questions — it needs correct routing, not
  interrogation.

## Next: GREEN Phase

Per design doc §Implementation Plan Phase 2:
1. Write minimal SKILL.md addressing the 5 gaps above (nothing more)
2. Re-run the exact same baseline scenario with the skill present
3. Verify the agent now routes to `arc-dispatching-teammates`, recommends
   teammate spawning (not manual session juggling), and reaches ≥4/5
   confidence with justification

**Do not start GREEN until the baseline above has been reviewed and the
gaps confirmed.**
