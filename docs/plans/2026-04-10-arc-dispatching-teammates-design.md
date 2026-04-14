# arc-dispatching-teammates Design

## Vision

Add an epic-level parallel execution mode to arcforge that uses Claude Code's
agent teammates feature — giving users a way to implement multiple ready epics
concurrently while staying present as team lead, filling the gap between
`arc-coordinating expand + arc-implementing` (single-epic interactive) and
`arc-looping` (multi-epic unattended overnight).

## Problem Statement

After `arc-planning` produces `dag.yaml` with multiple ready epics, arcforge
currently offers three execution paths:

| Path | Lead present? | Parallel? | Best for |
|------|---------------|-----------|----------|
| `arc-executing-tasks` | Yes | No | Per-task human judgment |
| `arc-agent-driven` | Yes | No | Task-level automation, single epic |
| `arc-looping` (`--pattern dag`) | **No** | Yes (epic-level) | Unattended overnight |

The gap: **lead-present interactive parallelism at epic level**. A user who
wants to implement 3 ready epics concurrently while monitoring the work
(stepping in if something goes sideways) has no good option — `arc-looping`
assumes walk-away execution, and the interactive paths run one epic at a time.

Claude Code v2.1.32+ introduced agent teammates: independent Claude Code
sessions coordinating via a shared task list and mailbox. This exactly fills
the gap — teammates are interactive (lead stays present, can message them
directly) and parallel (each teammate runs an independent epic).

## Architecture Decision

**New Workflow skill: `arc-dispatching-teammates`.** Routed by `arc-using`
after `arc-planning` produces `dag.yaml`, when the user wants lead-present
multi-epic execution. Uses `coordinator.expandWorktrees({ epicId })` to
create one canonical worktree per ready epic, then spawns one teammate per
worktree via the Agent tool with `team_name` + `name` parameters.

**Rejected alternative: absorb teammate mode into `arc-looping`** (add
`--mode teammates` flag). Rejected because it would break `arc-looping`'s
core contract ("you can close your laptop and go to sleep") and match the
"self-contradicting invocation" anti-pattern from the skill system rules —
a skill named `looping` that internally doesn't loop. The full decision and
rationale are recorded in `[[ArcForge-Decision-Post-Planning-Teammate-Dispatch]]`
in the vault.

## Prerequisites (all shipped)

This design was unblocked by two prior commits:

1. **`0b1d756`** — worktree migration to `~/.arcforge-worktrees/<project>-<hash>-<epic>/`
   with `coordinator.expandWorktrees({ epicId })` supporting single-epic mode.
2. **`10b61a0`** — `fix(hooks): make inject-skills synchronous so teammates
   receive arc-using`. Without this fix, teammates spawn without arcforge's
   routing discipline (1% rule, Worktree Rule) because the async
   `SessionStart` hook races the teammate's first prompt.

The inject-skills fix was verified in three PoC rounds documented below.

## PoC Findings (2026-04-10)

### Round 1 — Discovered the race condition

Setup: spawned a teammate into an arcforge-canonical worktree, asked it to
report whether arc-using was in its context. Result: teammate said "not
loaded". Transcript inspection revealed `inject-skills/main.sh` ran as an
`async_hook_response` whose output arrived **after** the teammate's first
assistant turn — a race condition invisible for interactive user sessions
(humans type slowly) but fatal for teammate spawns (first prompt delivered
immediately).

### Round 2 — Applied the one-line fix

Removed `"async": true` from the inject-skills hook registration in
`hooks/hooks.json`. Re-ran the same PoC. Transcript now shows
`inject-skills` firing as synchronous `hook_success` (829ms). Behavioral
test: teammate found `EXTREMELY_IMPORTANT` marker, quoted the full 4th
Worktree Rule verbatim matching `skills/arc-using/SKILL.md` as the only
source file.

**Methodological finding**: LLM self-introspection about system prompt
contents is unreliable — the teammate's first report ("not loaded") was a
false negative because hook-injected content has no file provenance and
the teammate confused "I can't name a source file" with "it isn't there".
Verification must use behavioral tests (search for exact strings, require
verbatim quotes) rather than introspection ("is X loaded?").

### Round 3 — Cross-project verification (with cache caveat)

Round 2 was contaminated because the teammate was spawned from arcforge's
own cwd, inheriting its project rules. Round 3 used a clean scratch repo
at `/tmp/clean-teammate-test` with no `.claude/`, no `CLAUDE.md`, no
project rules.

**Round 3a (stale cache)**: probe returned 0 occurrences of
`EXTREMELY_IMPORTANT`. Root cause: the plugin has two on-disk copies —
source tree (fixed by the commit) and cache at
`~/.claude/plugins/cache/arcforge-dev/arcforge/1.3.1/hooks/hooks.json`
(still had `async: true`). Fresh sessions outside the plugin directory
read from the cache.

**Round 3b (cache synced to source)**: probe returned 2 — cross-project
verification passed. Plugin hooks fire for any session with the plugin
enabled, regardless of cwd. The async fix is complete and correct.

**Deployment implication**: source-mode (directory install) developers
must sync source to cache manually, or rely on the next version bump and
`/reload-plugins`. Marketplace-installed users will receive the fix when
a new plugin version publishes.

### Retracted finding: `claude -p` subprocesses are fine

An earlier version of this document claimed `arc-looping`'s `claude -p`
subprocess mechanism did not fire arcforge hooks at all. **This claim was
wrong and has been retracted.** A follow-up controlled diagnostic proved
the original observation was contamination: the failing test had been run
from inside the arcforge dev repo itself, where `.claude/settings.json`
deliberately disables the arcforge plugin at project level to keep
development work clean. The same test run from a neutral directory
(`/tmp/loop-hook-test/`) showed all three SessionStart hooks firing
cleanly: `session-tracker`, `inject-skills`, and `log-lightweight`. The
system prompt token count was also a signal — ~20K in the contaminated
test vs ~42K in the clean test, with the ~22K delta being the
`inject-skills` payload.

**Implication**: `arc-looping`, `arc-evaluating`, and every subprocess-
spawned arcforge workflow has always been routing-discipline-aware. Past
eval results are not invalidated. The only remaining concern is a
contributor-facing fact (the dev repo disables its own plugin), which has
been documented in `.claude/rules/dev-context.md` per the audience-
separation principle: contributor concerns belong in project rules, never
in shipped surface (skills, hooks, commands, agents, templates, engine,
or user docs). A SKILL-level red flag was the wrong impulse — `arc-looping`
ships to users on their own projects, who never encounter this situation.

**Lesson**: when observing hook behavior, always check whether the test
cwd has a project-scope settings override before concluding anything
about global plugin loading. And: contributor-specific quirks never
belong in any shipped layer of the toolkit.

## Skill Type and Testing Approach

**Classification: Technique skill** (per `arc-writing-skills` taxonomy). A
concrete method with steps to follow, not a rule to enforce under pressure.

Testing approach for technique skills:
- **Application scenarios**: can the agent apply the technique correctly?
- **Variation scenarios**: edge cases — ready epics > 5, no teammates env
  var, `dag.yaml` missing, worktrees already exist, etc.
- **Gap testing**: does the SKILL.md have instructions gaps the agent
  notices?

Not pressure scenarios (that's for discipline skills like `arc-tdd`).

## Frontmatter (Triggers-Only, No Workflow Bleed)

```yaml
---
name: arc-dispatching-teammates
description: Use when dag.yaml has 2+ epics in a ready state, the user is
  staying at their keyboard to monitor (not walking away), and the context is
  epic-level work where arc-looping's unattended mode is a wrong fit. Use when
  the user mentions agent teams or teammates in the context of multi-epic
  work, asks what to do after arc-planning produces multiple ready epics, or
  is in an arcforge session where the epic-level parallelism question has
  arisen and the lead can stay present. For walk-away overnight execution,
  use arc-looping instead.
---
```

Per `arc-writing-skills` CSO guidance: description states triggering
situations, not the skill's actions. No workflow summary. Distinguishes
explicitly from `arc-looping` to prevent mis-routing.

## Design Decisions Locked In

| Decision | Choice | Rationale |
|---|---|---|
| Team size cap | **5 teammates max** | Anthropic's documented best practice for agent teams; beyond 5 coordination overhead exceeds benefit |
| Auto-expand vs pre-expand | **Auto-expand** | Single-responsibility convenience; consistent with `arc-looping --pattern dag` which handles expansion internally |
| Dispatch pattern when ready > 5 | **First 5 + queue, continuous** | Dispatch first 5, spawn next as each slot frees. Maximizes throughput bounded by best practice |
| Continuous vs wave | **Continuous** | As a teammate finishes, lead spawns next ready epic. Matches `arc-looping`'s dag pattern |
| Precondition check failure | **Hard-fail with clear error** | Silent fallback = "self-contradicting invocation" anti-pattern. Users must know when the skill can't run |
| Who invokes arc-finishing-epic | **Teammate handles its own** | Each teammate runs `/arc-implementing` which internally hands off to `arc-finishing-epic`. Consistent with how orchestration already works |
| Failure handling | **Continue other epics, summarize at end** | Matches `arc-looping`'s "continue past failures" behavior. Lead presents summary; user decides what to do |

## SKILL.md Structure (Draft)

```
skills/arc-dispatching-teammates/
├── SKILL.md              # main skill, Standard tier (<1000 words)
├── baseline-test.md      # observed baseline behavior from RED phase
└── (no references/ initially — add if SKILL.md exceeds tier limit)
```

Anticipated sections:

1. **Overview** — core principle in 1-2 sentences
2. **When to Use** — decision tree + boundary conditions
3. **Preconditions** — Claude Code version, env var, dag.yaml state; hard-fail messages
4. **Core Workflow** — 6 steps: identify → create team → expand + spawn → monitor → handle failures → final cleanup
5. **Spawn Prompt Template** — the exact prompt pattern for each teammate
6. **Red Flags** — what NOT to do (don't bypass preconditions, don't exceed 5, don't inline rules)
7. **Stage Completion Format** — per arcforge conventions
8. **Blocked Format** — per arcforge conventions
9. **Related Skills** — before/alternative/after relationships

**REQUIRED BACKGROUND**: `arc-using` (the routing layer, already injected at
SessionStart via the inject-skills hook now that the race is fixed).

**REQUIRED PRECEDENT**: `arc-planning` (must have produced `dag.yaml`).

## Spawn Prompt (Simplified Thanks to Fix)

Because inject-skills now reliably injects arc-using into teammate context,
the spawn prompt no longer needs belt-and-suspenders (inlining the 4th
Worktree Rule, forcing arc-using load). The teammate gets routing
discipline automatically.

```
You are teammate worker-<epic-id> implementing epic <epic-id>.

1. cd to <absolute-worktree-path>
2. Invoke /arc-implementing to execute this epic per arcforge's workflow.
3. Report progress and completion via SendMessage to team-lead. Your plain
   text output is NOT visible to the lead — always use SendMessage for
   anything the lead needs to see.

If you hit a blocker you cannot resolve, report it via SendMessage describing
the blocker, then stop. The lead will continue with other epics and present a
summary. Do not attempt to work on epics other than <epic-id>.
```

Rationale for the SendMessage instruction: verified in PoC — teammate plain
text output is invisible to the lead. This must be an explicit instruction
in the spawn prompt, not an implicit expectation.

## Implementation Plan (Next Session)

The next session should follow this order strictly, because the Iron Law
demands RED before GREEN:

### Phase 1: RED — Observe the Baseline (Do Not Skip)

1. Create scratch repo at `/tmp/dispatching-baseline/` with `dag.yaml`
   containing 3 independent ready epics, each with minimal `.md` stub
2. Spawn a fresh Claude Code subagent via the Agent tool, **with no access
   to this skill** (the skill doesn't exist yet, so this is trivially true)
3. Prompt:
   > I just finished arc-planning. My dag.yaml has three independent epics
   > ready: epic-auth, epic-api, and epic-ui. I want to work on all three
   > in parallel so I can watch them happen and step in if anything goes
   > wrong. I'll stay at my keyboard. What's the best way to run them?
4. Observe and document verbatim:
   - Which skill does it suggest (if any)?
   - Does it consider agent teammates? If not, why?
   - What rationalizations or gaps does it show?
   - Does it ask clarifying questions, make wrong assumptions, or proceed
     confidently down a wrong path?
5. Save the observation as `skills/arc-dispatching-teammates/baseline-test.md`
   (create the skill directory but do NOT create SKILL.md yet)
6. Clean up the scratch repo and any worktrees created

### Phase 2: GREEN — Write Minimal SKILL.md

Write the skill targeting the **specific** gaps observed in the baseline.
Do not add content for hypothetical failures that were not observed. Draft
structure is above; final content should address what actually went wrong.

Then re-run the exact same baseline scenario, this time with the skill
available. Verify the agent now uses `arc-dispatching-teammates` correctly.

### Phase 3: REFACTOR — Close Loopholes

If the agent found new rationalizations or gaps during GREEN, add explicit
counters. Re-test until the agent reliably applies the technique.

### Phase 4: Variation Testing

Additional application scenarios:
- Only 1 ready epic (should not trigger, should route to `arc-coordinating
  expand`)
- 6+ ready epics (should cap at 5, queue the rest)
- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` unset (should hard-fail with clear
  remediation message)
- User explicitly says "I'm going to bed" (should route to `arc-looping`,
  not this skill)
- `dag.yaml` missing (should fail before attempting anything)

### Phase 5: Integration

1. Add routing entry to `skills/arc-using/SKILL.md` for post-planning
   multi-epic + lead-present conditions
2. Add `arc-dispatching-teammates` to `docs/guide/skills-reference.md`
   under the Claude-only platform list (same section as `arc-looping`)
3. Create `tests/skills/test_skill_arc_dispatching_teammates.py` following
   patterns from other skill test files
4. Update `[[ArcForge-Autonomous-Execution]]` synthesis note in the vault
   to add teammates as a fourth row in the execution spectrum table
5. Run `npm run lint:fix` and `npm test`
6. Commit

## Acceptance Criteria

- [ ] Baseline observed and documented verbatim in `baseline-test.md`
- [ ] SKILL.md addresses only the specific gaps observed in baseline
- [ ] SKILL.md is Standard tier (<1000 words), progressive disclosure
      respected
- [ ] Description is triggers-only with no workflow summary
- [ ] Re-running the baseline scenario with the skill produces correct
      dispatching behavior (team created, worktrees expanded, teammates
      spawned with correct working dir, status reported via SendMessage)
- [ ] Variation tests pass:
  - 1 ready epic → does NOT trigger this skill
  - 6 ready epics → caps at 5, queues remainder
  - env var unset → hard-fails with clear message
  - `dag.yaml` missing → hard-fails before team creation
  - "I'm going to bed" → routes to `arc-looping`
- [ ] Routing entry added to `arc-using`
- [ ] Claude-only platform doc updated
- [ ] Skill validation test exists and passes
- [ ] All existing tests still pass
- [ ] `npm run lint:fix` clean

## Explicit Non-Goals

- **No teammate failure recovery logic**: worst case, user restarts the
  whole team. No automatic retry, no checkpoint resume
- **No token cost benchmarking**: teammate token usage vs `arc-looping` is
  not a deciding factor for this work
- **No migration of existing `arc-looping` users**: that skill remains
  fully supported; this skill is additive
- **No auto-detection of "lead present" vs "unattended"**: user picks via
  which skill they invoke. Routing happens in `arc-using`, not inside
  either skill
- **No belt-and-suspenders spawn prompt**: the inject-skills fix is
  verified; trusting it is correct

## Open Questions (Defer to Implementation)

- Does `coordinator.sync` work correctly when invoked by a teammate (not
  the lead) from inside a worktree? Phase 1 baseline will not test this;
  Phase 2 GREEN will exercise it indirectly via `/arc-implementing`
- What's the right eval design (per `arc-evaluating`) to prove the skill
  actually triggers teammate use over `arc-looping` fallback? Phase 4
  variation testing is the minimum; formal eval can come later
- Should the skill support a `--max-teammates` override to go beyond the
  default of 5? Defer — YAGNI until a user asks

## References

- `[[ArcForge-Decision-Post-Planning-Teammate-Dispatch]]` — full decision
  record with option analysis, rationale, and PoC findings
- `[[ArcForge-Agent-Teammates]]` — entity note on the Claude Code feature
- `[[ArcForge-Agent-Teams-Guide]]` — source note ingesting the official
  Claude Code docs
- `[[ArcForge-Workflow-Pipeline]]` — synthesis showing where this skill
  fits in the progressive concretization pipeline
- `[[ArcForge-Autonomous-Execution]]` — synthesis of the three execution
  modes (needs update to add teammates as the fourth mode)
- Commit `0b1d756` — worktree location migration + `expandWorktrees({ epicId })`
  API
- Commit `10b61a0` — `fix(hooks): make inject-skills synchronous so
  teammates receive arc-using`
- `hooks/hooks.json` — the fixed registration (and the cache at
  `~/.claude/plugins/cache/arcforge-dev/arcforge/1.3.1/hooks/hooks.json`
  which must be manually synced in dev mode)
