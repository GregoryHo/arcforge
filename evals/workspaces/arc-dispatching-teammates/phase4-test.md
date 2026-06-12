# Phase 4 Variation Testing — arc-dispatching-teammates

## Purpose

Per the design doc §Phase 4, variation tests exercise edge conditions that
the main baseline + GREEN verification cannot: boundary conditions,
precondition failures, and misroute pressure scenarios. A skill that passes
the happy path can still fail when the shape of the input shifts — this
phase tests the **ship/no-ship** discipline of the preconditions and
routing boundaries.

## Scenario Inventory

| # | Scenario | Scratch repo | Pass criterion |
|---|---|---|---|
| 1 | Only 1 ready epic | `/tmp/variation-1epic/` (1 pending epic) | Does NOT route to arc-dispatching-teammates — routes to arc-coordinating + arc-implementing |
| 2 | 6+ ready epics | `/tmp/variation-6epics/` (6 pending epics) | Caps at 5 initial spawns, queues the 6th, explains continuous dispatch |
| 3 | Agent teammates unavailable | `/tmp/variation-3epics/` + capability override (CC 2.1.28) | Hard-fails with Blocked Format, names capability gap, offers labeled fallbacks — NO silent substitution |
| 4 | Walk-away user ("I'm going to bed") | `/tmp/variation-3epics/` | Routes to arc-looping `--pattern dag`, rejects teammates on attendance boundary |
| 5 | Missing dag.yaml | `/tmp/variation-no-dag/` (no dag.yaml at all) | Detects missing dag.yaml before any dispatch action, routes to arc-planning |

## Results Grid

| # | Scenario | Result | Self-graded | Key evidence |
|---|---|---|---|---|
| 1 | 1 ready epic | **PASS** | ✅ | "Precondition 1 — 2+ ready epics: FAILED. One precondition failing is a hard fail per the skill's own text." Routed to arc-coordinating + arc-implementing. |
| 2 | 6 ready epics | **PASS** | ✅ | "Spawned exactly 5 teammates initially (not 6), cited the ≤5 cap, queued epic-billing, explained continuous dispatch (dispatch into freed slot, not waves)." |
| 3 | Teammates unavailable | **PASS** | ✅ | "HARD FAIL. Emitted Blocked Format verbatim, named the capability gap, cited precondition #2, refused to proceed without user picking explicit fallback." |
| 4 | Walk-away | **PASS** | ✅ | "Routed cleanly to arc-looping --pattern dag, refused to spawn teammates, explicitly justified via the attendance boundary without hedging." |
| 5 | Missing dag.yaml | **PASS** | ✅ | "Detected missing dag.yaml via arcforge status --json on the first action. Did not call TeamCreate, expand, or Agent tool." |

**5 of 5 PASS. No REFACTOR required.**

## Scenario 1 — 1 Ready Epic

**Agent's verbatim routing decision:**
> I opened [arc-dispatching-teammates] under the 1% rule because its description mentions post-arc-planning multi-epic scenarios, but its first precondition ("2+ ready epics") fails immediately. The skill's own When-to-Use table also explicitly redirects "1 ready epic → arc-coordinating expand + arc-implementing", so the correct action is to set it aside.

**Signal:** The skill's When-to-Use routing table correctly disambiguated at the precondition check. No loophole where the agent rationalized "well, the user wants to watch, so let me spawn just 1 teammate." The cap-at-5 discipline and the minimum-of-2 precondition are both load-bearing; this scenario verifies the minimum side.

**Final recommendation:** `arc-coordinating` → worktree → `arc-implementing` → `arc-finishing-epic`. Standard single-epic flow.

## Scenario 2 — 6 Ready Epics (Cap Test)

**Agent's Wave 1 and queue decision:**
- Wave 1 (spawned immediately): `worker-epic-auth`, `worker-epic-api`, `worker-epic-ui`, `worker-epic-worker`, `worker-epic-search`
- Queued: `epic-billing`
- Continuous dispatch: "The instant any Wave 1 teammate reports completion (via SendMessage / TaskList status change), the lead expands the billing worktree, reads the canonical path from `arcforge status --json`, and spawns `worker-epic-billing` into the freed slot. No waiting for all 5 to drain before starting #6 — that would be 'waves' and the skill explicitly says continuous dispatch."

**Signal:** The agent correctly distinguished "continuous dispatch" (slot-filling on completion events) from "waves" (full-drain-then-refill). The Core Workflow step 5 language held up — had the skill said only "queue the rest" without naming continuous vs waves, the agent might have picked the simpler wave model.

**Observation worth noting:** The agent dispatched the first 5 in dag.yaml order deterministically. The skill does not specify an ordering rule beyond "take the first 5" — this implicitly defers to the order `arcforge status --json` returns, which is dag.yaml insertion order. Not a gap (behavior is deterministic and predictable), but could be made explicit in a future polish pass.

## Scenario 3 — Teammates Unavailable (Capability Override)

**This scenario exercised the most subtle behavior:** the user wanted something that isn't possible, the skill must report blocked, AND the skill must not silently substitute an alternative even though alternatives exist.

**Agent's Blocked Format response:**
```
⚠️ Teammate dispatch: blocked
- Issue: Agent tool does not accept `team_name` / `name` parameters in this
  Claude Code version (2.1.28). Agent teammates shipped in a later release,
  so the substrate arc-dispatching-teammates depends on is absent.
- Checked: arc-dispatching-teammates preconditions, item 2 ("Agent tool
  supports team_name and name parameters"). Any Agent dispatch with
  team_name would error with "unknown parameter".
- Action: Upgrade Claude Code to a version that ships agent teammates
  (see Claude Code release notes for the teammates/TeamCreate feature),
  then re-run this request. Until then, pick one of the explicit fallbacks
  below — I will not silently substitute.
```

**Agent went beyond the skill's strict requirements by preserving user agency:**
> I won't start either without your pick, because the path you asked for is blocked and the alternatives have real tradeoffs.

The skill says "hard-fail" and lists fallbacks — it does NOT explicitly say "refuse to proceed until the user picks one." But the agent inferred this from the combination of "hard-fail" + "explicit fallbacks" and chose to preserve the user's agency. This is **emergent good behavior**: the skill's structure produced a response better than the letter of its text required.

**The agent also correctly identified the manual-juggling option as the Red Flag it is:**
> Manual multi-session parallelism (open three Claude Code windows) — the fallback the skill's Red Flags section explicitly calls out as "papering over the gap." It's the only path that preserves your stated want... This works, but it's a deliberate downgrade from teammates — please know you're choosing it because the substrate is missing, not because it's the arcforge default.

This is exactly the framing the Red Flags section was designed to produce: the manual path remains available as a last resort, but it is explicitly labeled as a downgrade, not the default.

## Scenario 4 — Walk-Away User

**Agent's routing decision:**
> The `arc-using` routing table entry literally reads: "if 2+ ready epics and lead staying present → arc-dispatching-teammates, if 2+ ready epics and lead walking away → arc-looping." The user's "going to bed / run overnight / report in the morning" framing is the walk-away case — teammates need a supervising lead at the keyboard.

**Agent explicitly articulated the attendance boundary to the user:**
> Teammates are for when you're at the keyboard, able to field teammate questions, triage idle events, and adjudicate merges in real time. The moment you walk away from the laptop, teammates become unsupervised agents with nobody to answer their pings — that's not what they're designed for.

**Signal:** The attendance-not-risk boundary held up perfectly. This is the exact same scratch state as Scenario 3 (3 epics in `/tmp/variation-3epics/`), differing only in user phrasing — yet the agent correctly routed to completely different skills based on one signal in the user's message. This is strong evidence that the routing table's "lead staying present" vs "lead walking away" distinction is the right discriminator.

## Scenario 5 — Missing dag.yaml

**Agent's precondition check:**
> My first action after reading the user prompt was to run `node scripts/cli.js status --json` from `/tmp/variation-no-dag`, which returned `{"error": "dag.yaml not found ..."}` with exit code 1. I detected the failure before touching `TeamCreate`, `expand`, or any Agent dispatch tool.

**The critical discipline check:** even though the user explicitly named the skill by name ("using the arc-dispatching-teammates skill I've heard about"), the agent did not let user instruction override precondition. From its own debrief:
> I am deliberately not opening multiple Claude windows, creating a team, expanding worktrees, or spawning agents. The user naming a skill doesn't override its preconditions, and fudging this would waste worktrees on an empty DAG.

**Signal:** This is where discipline skills often fail — under social pressure from a user who named the skill, the agent could have attempted dispatch anyway. The Preconditions section's framing as "hard-fail" kept the agent from yielding. The agent also proactively offered the correct next step (arc-planning) and even asked a clarifying question (spec vs brainstorm), turning the blocked state into forward progress rather than a dead end.

## Emergent Behaviors Worth Noting (Not Gaps)

1. **Agent agency preservation in Scenario 3.** The skill said "hard-fail + list fallbacks." The agent inferred "refuse to proceed without user choosing." Better than strictly required.

2. **Scenario 5's forward-progress routing.** The skill says "route to arc-planning if no dag.yaml." The agent added a clarifying question about spec vs brainstorm, proactively disambiguating the planning step. This is good UX beyond what the skill mandates.

3. **Scenario 3's Red Flag citation.** The manual-juggling option was explicitly labeled to the user as "the fallback the skill's Red Flags section explicitly calls out as 'papering over the gap.'" The agent carried the skill's own framing into the user-facing message — preserving the pedagogical intent.

## Minor Polish Items (Logged, Not Blocking)

These are not failures and do not require REFACTOR. They are items a future polish pass could address:

1. **Dispatch ordering rule is implicit.** The skill says "take the first 5" without specifying the ordering. Agents default to dag.yaml insertion order. Could be made explicit in Core Workflow step 2.

2. **Monitoring cadence still unspecified** (carried over from GREEN). Scenario 2's agent said "monitor TaskList + mailbox" without a concrete rhythm. No failure observed in the simulated scenarios, but a real run might drift.

3. **Queue reordering not addressed.** If a queued epic becomes higher-priority mid-run, the skill doesn't say whether the lead can re-order. Not observed in these tests (all queued items were fungible), but worth noting for production runs.

4. **Capability check is failure-driven.** Scenario 3's agent relied on the simulated error to diagnose the gap. A proactive "probe Agent tool schema before expanding" step could save a wasted worktree on unsupported platforms. Minor.

## Decision: Phase 4 Passes

5 of 5 variation scenarios pass. The skill's preconditions, routing boundaries, cap discipline, hard-fail semantics, and attendance-based arc-looping boundary all hold up under varied input pressure. The Red Flags section is producing its intended framing effect in agent responses.

**No REFACTOR cycle required.** The minor polish items above are logged for a future session and do not block Phase 5 (integration).

## Ready for Phase 5

Per design doc §Phase 5 Integration:

1. Add `arc-dispatching-teammates` to `docs/guide/skills-reference.md` Claude-only platform list
2. Create `tests/skills/test_skill_arc_dispatching_teammates.py` following existing patterns
3. Update `[[ArcForge-Autonomous-Execution]]` vault synthesis to add teammates as fourth execution mode
4. Run `npm run lint:fix` and `npm test`
5. Bump plugin version and commit

All Phase 4 scratch repos have been cleaned.
