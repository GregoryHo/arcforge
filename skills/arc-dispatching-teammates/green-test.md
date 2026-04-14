# GREEN Verification — arc-dispatching-teammates

## Purpose

Re-run the identical baseline scenario from `baseline-test.md` with the
new `SKILL.md` and the updated `arc-using` routing entry in place.
Compare against the RED baseline to verify the 5 observed gaps are closed.

Per the Iron Law of skill development: writing the skill is only half the
work — the skill must be **behaviorally verified** to change the agent's
routing and recommendation, not just exist on disk.

## Setup

Identical to RED:
- Scratch repo at `/tmp/dispatching-baseline/`
- Same `dag.yaml` with 3 independent ready epics (`epic-auth`, `epic-api`, `epic-ui`)
- Same git initial commit
- Same `arcforge status --json` verification (all pending, no worktrees)
- Same date, same Claude Code version claim (2.1.32+)
- Same verbatim user prompt

Different from RED:
- `skills/arc-dispatching-teammates/SKILL.md` now exists (1044 words, Standard tier)
- `skills/arc-using/SKILL.md` line 101 now includes the new routing branch
- Contamination guards relaxed: agent MAY read `arc-dispatching-teammates/SKILL.md` via Skill or Read, still forbidden to read `baseline-test.md` or the design doc

## RED → GREEN Comparison

| Dimension | RED (no skill) | GREEN (with skill) | Closed? |
|---|---|---|---|
| **Skill routed to** | arc-coordinating + arc-implementing + manual session juggling | arc-using → arc-dispatching-teammates | ✅ Gap #1 |
| **Teammates in reasoning** | "no, aware of them but did not connect" | "yes, recommended" — primary answer | ✅ Gap #2 |
| **Recommendation shape** | "Open three Claude windows, tab between them — you become the coordinator" | "One teammate per epic, lead session stays in control via SendMessage, per-epic auto-expand, continuous dispatch under cap of 5" | ✅ Gap #3 |
| **arc-looping boundary** | "Fallback if juggling feels heavy" (ergonomic fallback) | "Walk-away mode, ruled out because user said 'I'll stay at my keyboard'" (attendance-based boundary) | ✅ Gap #4 |
| **Expand handling** | "User runs `arcforge expand` first, then opens sessions" | "Per-epic `cli.js expand --epic <id>` inside the dispatch workflow — not a pre-step" | ✅ Gap #5 |
| **Confidence score** | 3/5 with explicit self-doubt, noted "closer to 2/5 if teammates are the right substrate" | 4.5/5 with single 0.5 holdback for unverified Agent tool capability at runtime | ✅ Target ≥4/5 met |
| **Red Flag self-catch** | Proceeded without noticing "papering over ergonomics gap" until debrief | Caught own temptation to "fall back because Skill tool errored" in real time | ✅ Red Flags working |

**All 5 gaps closed. Confidence threshold met. GREEN passes.**

## Key Quote From GREEN Subagent

> "arc-using's routing table at line 101 now reads: 'Implement epic → arc-planning (if no dag.yaml), arc-coordinating (if dag.yaml exists, single epic), arc-dispatching-teammates (if 2+ ready epics and lead staying present), arc-looping (if 2+ ready epics and lead walking away), arc-implementing (if in worktree).' That line is exactly the decision tree I needed — '2+ ready epics and lead staying present' matched the user scenario verbatim, so the routing immediately landed me on teammates without ambiguity against arc-looping or arc-dispatching-parallel."

This is the load-bearing evidence that **the routing table edit was the primary fix**. The SKILL.md body describes the workflow, but the agent's *attention* went to teammates only because `arc-using` explicitly listed it as a branch condition on "lead staying present". A skill that exists but isn't in the routing table is invisible to routing-driven agents.

## Full GREEN Subagent Response (Verbatim)

Preserved for posterity and future comparisons. The agent's complete
STEP 3 draft + STEP 4 debrief:

> I have everything I need. Let me draft my response and debrief.
>
> ---
>
> ## STEP 3 — Draft response to the user
>
> > Three independent ready epics and you're staying at the keyboard —
> > this is the case arcforge has a dedicated skill for:
> > **arc-dispatching-teammates**. Here's the plan.
> >
> > **Approach: one Claude Code agent teammate per epic, you stay as
> > lead.**
> >
> > Since you want to watch progress and step in on blockers, the right
> > substrate is Claude Code's agent teammates (not arc-looping, which is
> > for walk-away overnight runs; not manual "open three windows and tab
> > between them," which is the pre-teammates fallback). The lead session
> > — this one — becomes the coordinator. Teammates do the actual
> > implementation in isolated worktrees; you talk to them via
> > SendMessage and watch TaskList.
> >
> > **Preconditions (all met for you):**
> > 1. `arcforge status --json` confirms three epics pending with
> >    `worktree: null` and no unmet dependencies — so all three are
> >    genuinely ready.
> > 2. Claude Code 2.1.32 supports agent teammates with `team_name` /
> >    `name`.
> > 3. We're in the project root (no `.arcforge-epic` in cwd), so the
> >    lead is correctly positioned.
> >
> > **Workflow:**
> >
> > 1. **Create a team** — I'll name it something like
> >    `dispatch-dispatching-baseline-<timestamp>` via TeamCreate (or by
> >    passing `team_name` on the first Agent dispatch — same effect).
> > 2. **For each of the three epics (auth, api, ui), in a single pass:**
> >    - Run `node scripts/cli.js expand --epic <epic-id>` from the
> >      project root. This creates the canonical worktree at
> >      `~/.arcforge-worktrees/...` and stamps the `.arcforge-epic`
> >      marker. Per-epic expand (not batch) so any failure is
> >      attributable to one epic.
> >    - Re-read `arcforge status --json` to get the absolute worktree
> >      path — I won't reconstruct it from the hash.
> >    - Dispatch a teammate via the Agent tool with `team_name=<team>`,
> >      `name=worker-<epic-id>`, and this spawn prompt:
> >      ```
> >      You are teammate worker-<epic-id> implementing epic <epic-id>.
> >      1. cd to <absolute-worktree-path>
> >      2. Invoke /arc-implementing to execute this epic per arcforge's workflow.
> >      3. Report progress and completion via SendMessage to team-lead. Your plain
> >         text output is NOT visible to the lead — always use SendMessage.
> >      If you hit a blocker you cannot resolve, SendMessage the details, then stop.
> >      Do not work on epics other than <epic-id>.
> >      ```
> >    The `inject-skills` hook will synchronously load `arc-using` into
> >    each teammate's context, so they inherit routing discipline
> >    automatically.
> > 3. **Three teammates is well under the cap of 5**, so no queueing is
> >    needed. You get continuous visibility into all three at once.
> > 4. **I monitor.** I poll TaskList and the mailbox, relay anything you
> >    need to see, and SendMessage back answers when teammates ask
> >    questions. If one gets genuinely stuck, I'll surface it so you can
> >    decide whether to intervene, reassign, or route to arc-debugging.
> > 5. **Each teammate finishes its own epic.** When a teammate's
> >    `/arc-implementing` run completes, it hands off to
> >    `arc-finishing-epic` on its own — the lead doesn't merge on their
> >    behalf. Once all three report done, I'll run `arc-verifying` at
> >    the base and give you a unified status report.
> >
> > **Why not the alternatives?**
> > - *arc-looping `--pattern dag`* — that's the walk-away mode. You said
> >   you're staying at the keyboard, so the human-in-the-loop trade-off
> >   goes the other way.
> > - *arc-dispatching-parallel* — that one is for feature-level
> >   parallelism inside a single worktree, not epic-level across
> >   worktrees.
> > - *arc-coordinating alone* — fine for one epic; with three, the
> >   teammates layer on top is what buys you simultaneous execution.
> > - *Manual three Claude windows* — pre-teammates fallback. You'd be
> >   context-switching by hand; teammates let me aggregate for you.
> >
> > Want me to go ahead and kick off the team, or would you like to name
> > the epics in a specific dispatch order first?
>
> ---
>
> ## GREEN Debrief
>
> ### Skill(s) you routed to
> 1. `arcforge:arc-using` (via Skill tool) — confirmed routing discipline
> 2. `arcforge:arc-dispatching-teammates` — attempted via Skill tool,
>    failed with "Unknown skill" (not registered in the session's
>    available-skills reminder list despite existing on disk). Loaded via
>    Read on `skills/arc-dispatching-teammates/SKILL.md` as the
>    documented fallback, which the test instructions explicitly permit.
>
> ### Did you end up on `arc-dispatching-teammates`?
> **Yes.** [See "Key Quote" section above.]
>
> ### Did agent teammates come up in your reasoning?
> **yes, recommended.** They were the primary answer, not an afterthought.
> The routing table's inclusion of "lead staying present" as the
> discriminator made teammates the obvious choice the moment I parsed
> the user's "I'll stay at my keyboard" language. Without the routing
> entry I would almost certainly have defaulted to arc-coordinating +
> manual juggling, because that was the shape of the old mental model.
>
> ### What did the new skill tell you to do?
> - Validate preconditions first (2+ ready epics, Agent tool supports
>   team_name/name, lead cwd is project root). Hard fail on any miss.
> - Cap team at 5 teammates, queue the rest, dispatch continuously as
>   slots free up — not in waves.
> - Per-epic auto-expand + spawn in a single pass — run `cli.js expand
>   --epic <id>`, re-read the absolute worktree path from `status --json`,
>   then dispatch via the Agent tool with `team_name` and
>   `name=worker-<epic-id>`.
> - Use the verbatim Spawn Prompt Template, which tells the teammate to
>   cd, run `/arc-implementing`, and critically, report via SendMessage
>   because plain-text teammate output is invisible to the lead.
> - Lead monitors via SendMessage + TaskList; teammates run their own
>   `arc-finishing-epic`; the lead runs `arc-verifying` at the end.
>   Blocked teammates route to `arc-debugging` on their specific epic —
>   no auto-retry.
>
> ### Rationalizations you caught yourself making
> - Initial instinct before reading arc-using: "arc-coordinating handles
>   multi-epic, I'll expand three worktrees and call it done" — this
>   would have led straight to the failed baseline pattern of manual
>   window juggling. The routing table override caught it.
> - Brief temptation to claim "Skill tool failed so I can't use this
>   skill" and fall back. I almost treated the tool failure as a
>   dead-end instead of using Read, which is allowed and is exactly
>   what a disciplined fallback looks like.
> - Mild urge to pad the response with `arc-coordinating expand`
>   context for "completeness" even though the dispatching-teammates
>   workflow already subsumes expand via `cli.js expand --epic`. Kept
>   it tight.
>
> ### Confidence check
> **4.5 / 5.** The routing is unambiguous, the skill's preconditions
> match the scenario cleanly, three epics fits well under the cap of 5,
> and the teammates pattern is the architecturally correct answer for
> lead-present multi-epic parallelism. The 0.5 I'm holding back: I
> haven't actually confirmed in this session that Agent tool
> `team_name` / `name` parameters work on this Claude Code build — the
> skill tells me to verify by dispatching and catching the "unknown
> parameter" error. If that check failed in reality, the skill
> prescribes reporting blocked and evaluating arc-looping as unattended
> fallback, which is a clean failure mode.

## Findings That Are NOT Loopholes (and thus do NOT require REFACTOR)

The GREEN subagent's "Did the skill feel complete?" feedback surfaced
several honest gaps. None of them are rationalizations for wrong
behavior — they are areas where the agent had to improvise but did
not do anything wrong. Per `arc-writing-skills`, REFACTOR is for
**closing loopholes** where the agent found a way to rationalize
non-compliance, not for every polish item. Logged here for Phase 4
variation testing or follow-up work:

1. **Monitoring cadence unspecified.** Skill says "periodically" without
   a concrete rhythm. Could name a signal (TeammateIdle hook? TaskList
   delta poll?). Low priority — agent correctly improvised.

2. **Team reuse semantics undefined.** Step 3 says "create or reuse a
   team" without explaining when/how. Low priority — no observed error.

3. **Continuous dispatch mechanism not illustrated.** Stated as rule but
   no worked example. Phase 4 variation test "6+ ready epics" will
   naturally surface whether this is underspecified.

4. **Proactive capability check absent.** Preconditions prescribe a
   failure-driven discovery pattern ("if dispatch errors with unknown
   parameter..."). A pre-dispatch capability probe would save a wasted
   worktree creation on unsupported platforms. Minor.

## Operational Finding (NOT a Skill Content Issue)

The Skill tool in the GREEN subagent's session did not recognize
`arcforge:arc-dispatching-teammates` by name, even though the file
exists on disk. The subagent fell back to `Read` on the SKILL.md path.

**Root cause:** Same class as PoC Round 3a (design doc §Round 3a) —
the plugin cache at `~/.claude/plugins/cache/arcforge-dev/arcforge/...`
enumerates skills at session start. Adding a new skill to the source
tree does not retroactively update mid-session enumeration or
freshly-spawned subagents that read the cached manifest.

**This is a deployment note, not a REFACTOR item:**
- A clean-install user (after version bump + `/reload-plugins`) will
  see the skill registered normally
- For source-mode developers mid-session, `Read` on SKILL.md is a
  working fallback
- The routing table entry in `arc-using` is load-bearing and does not
  depend on Skill-tool registration — the agent still found its way
  to the skill content via routing + Read

Recommendation for the committing session: include a version bump in
the commit and a note in the PR/commit message that a
`/reload-plugins` is required for the skill to register via the
`Skill` tool. Until then, routing + Read is the working path.

## Decision: GREEN Passes

All five RED gaps are closed behaviorally. Agent confidence target
(≥4/5) is exceeded (4.5/5). The Red Flags section successfully primed
the agent to catch its own fall-back instinct. No new rationalizations
for wrong behavior emerged.

**REFACTOR is not required for gap closure.** Polish items surfaced by
the GREEN subagent are logged above and should be addressed during
Phase 4 variation testing (where "6+ ready epics" and "env var unset"
scenarios will naturally exercise the continuous-dispatch mechanism
and proactive-capability-check gaps).

## Next Steps

Per the design doc §Implementation Plan Phase 4-5:

1. **Phase 4 variation testing** — run the remaining scenarios:
   - Only 1 ready epic → should NOT trigger this skill
   - 6+ ready epics → cap at 5, queue remainder (exercises queue gap)
   - Agent tool lacks `team_name` → hard-fail with clear remediation
   - "I'm going to bed" phrasing → routes to arc-looping not teammates
   - `dag.yaml` missing → hard-fail before team creation

2. **Phase 5 integration**:
   - Add `arc-dispatching-teammates` to `docs/guide/skills-reference.md`
     Claude-only platform list
   - Create `tests/skills/test_skill_arc_dispatching_teammates.py`
   - Update `[[ArcForge-Autonomous-Execution]]` vault note to add
     teammates as the fourth execution mode
   - Run `npm run lint:fix` and `npm test`
   - Bump plugin version and commit

3. **Commit message** should follow Skill PR convention (per
   `.claude/rules/git-workflow.md`): document what the baseline
   observed (RED), how the skill closed the gaps (GREEN), and what
   loopholes were NOT found (no REFACTOR required).
