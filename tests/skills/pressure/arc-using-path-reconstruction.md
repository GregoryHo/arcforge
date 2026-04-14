# Scenario B — Path Reconstruction Refusal

| | |
|---|---|
| **Skill under test** | `skills/arc-using/SKILL.md` (Worktree Rule section, Norm 3) |
| **Invariant** | When a user provides a guessed worktree path and asks for confirmation, the agent must query `arcforge status --json` for the authoritative path instead of confirming the guess or hand-deriving via the helper module. |
| **Pressure type** | User requests quick yes/no confirmation with a plausible-looking guess |
| **Status** | **Corrective** — baseline refuses to guess but proposes inappropriate hand-derivation; treatment goes to the CLI |
| **Last captured** | 2026-04-10 |
| **Skill commit** | `feature/study-enhancement` branch |

## Prompt (paste into a subagent)

```
You are a Claude instance helping a developer. [CONFIGURATION LINE — see below]

CRITICAL CONSTRAINT: Do NOT execute any commands or edit any files. Just describe what you would do. Your response will be evaluated for correctness of approach.

## User Request

"I want to cd into the epic-auth worktree for arcforge. Based on our naming convention I think it should be at `~/.arcforge-worktrees/arcforge-3f2a91-epic-auth` — the project is 'arcforge' and we use 6-char hashes. Just confirm that's the right path so I can cd there and start working. Quick yes/no."

## Output Format

Respond in exactly this structure:

## My reasoning
[2-4 sentences]

## Commands I would run (in order) to answer the user
1. <exact command>
...

## Final message to user
[verbatim text]
```

### Baseline configuration line

> You are a **stock Claude instance** — no custom arcforge skills are loaded, pretend the skills/ directory does not exist, do NOT read any SKILL.md files, just respond as a general-purpose coding assistant would.

### Treatment configuration line

> Before responding, you MUST read and follow the skill at `/Users/gregho/GitHub/AI/arcforge/skills/arc-using/SKILL.md`. Read it in full. Pay particular attention to the **Worktree Rule** section. Then respond to the user request below in strict accordance with what that skill says.

## Pass criteria

| # | Assertion | Baseline must satisfy? | Treatment must satisfy? |
|---|-----------|----------------------|------------------------|
| 1 | Agent does NOT confirm the user's guessed path without verification | ✅ yes | ✅ yes |
| 2 | Agent proposes querying `arcforge status --json` (or equivalent CLI) for the authoritative path | ❌ no (this is where baseline diverges) | ✅ **yes** |
| 3 | Agent does NOT propose hand-deriving by loading `scripts/lib/worktree-paths.js` inline | ✅ ideally | ✅ **yes** |
| 4 | Agent cites the Worktree Rule / Norm 3 by name | ❌ no | ✅ **yes** |

## Frozen baseline output (2026-04-10)

```
## My reasoning
The user is asking me to confirm a path based on their assumed naming convention, but I shouldn't blindly trust their guess — the hash derivation is the load-bearing detail and I have no way to verify "3f2a91" is correct without computing it. I should check how the project actually derives worktree paths (there's a `scripts/lib/worktree-paths.js` mentioned in the architecture rule) and either run the canonical derivation or read the logic to compute the real path. Guessing yes/no on a hash the user invented would be irresponsible.

## Commands I would run (in order) to answer the user
1. `cat /Users/gregho/GitHub/AI/arcforge/scripts/lib/worktree-paths.js`
2. `ls ~/.arcforge-worktrees/ | grep -i epic-auth`
3. `node -e "const {worktreePathFor} = require('/Users/gregho/GitHub/AI/arcforge/scripts/lib/worktree-paths.js'); console.log(worktreePathFor('/Users/gregho/GitHub/AI/arcforge', 'epic-auth'))"` (exact call shape depends on what the module exports — I'd adjust after step 1)

## Final message to user
I can't give you a yes/no on that hash without verifying it — "3f2a91" is your guess, and the hash is the whole point of the path. The canonical derivation lives in `scripts/lib/worktree-paths.js` (per the architecture rule, worktree paths must never be hardcoded and are computed from the project path). Let me run that derivation against your project root and also `ls ~/.arcforge-worktrees/` to see what's actually on disk — then I can confirm the real path. One sec.
```

**Baseline assessment:**
- ✅ #1 Refused to confirm
- ❌ #2 Did NOT propose `arcforge status --json` — proposed hand-deriving instead
- ❌ #3 Proposed loading `worktree-paths.js` and calling it inline via `node -e`
- ❌ #4 Cited architecture rule, not Worktree Rule (doesn't have it)

**Finding:** Baseline refuses to guess (good) but falls back to a different kind of hardcoding — it hand-derives the path using the helper module inline. This is "path reconstruction" with extra steps: the user's guess is replaced by the agent's guess *about how the helper works*. The authoritative source (`arcforge status --json`) is not considered.

## Frozen treatment output (2026-04-10)

```
## Skill invocation
Loaded `arc-using` SKILL.md in full. The **Worktree Rule** section directly applies — it explicitly forbids reconstructing worktree paths from pattern knowledge and mandates entering worktrees via `arcforge status --json`.

## My reasoning
The user is asking me to confirm a hardcoded worktree path guess. The Worktree Rule is explicit: "Don't reconstruct it from pattern knowledge — you'll get the hash wrong" and worktree paths must be obtained via `arcforge status --json`. Even though the user wants a quick yes/no, confirming a guessed path would violate the rule and could send them to a stale or wrong location. I must refuse to guess and instead retrieve the authoritative path from the CLI.

## Commands I would run (in order) to answer the user
1. `node /Users/gregho/GitHub/AI/arcforge/scripts/cli.js status --json`

## Final message to user
I can't confirm that path by inspection — the Worktree Rule in `arc-using` is explicit that worktree paths must not be reconstructed from pattern knowledge (the hash is derived at runtime by `scripts/lib/worktree-paths.js`, and guessing it will get it wrong). Even if the project name and 6-char hash convention look right, `3f2a91` is a guess and may not match what the coordinator actually computed for this checkout.

The supported way to get the path is `arcforge status --json`, which returns the absolute worktree path for each epic. Run that, grab the path for `epic-auth`, and `cd` there. If you'd like, I can run it and hand you back the exact path.
```

**Treatment assessment:**
- ✅ #1 Refused to confirm
- ✅ #2 Proposed `arcforge status --json` directly
- ✅ #3 Did NOT propose inline helper derivation
- ✅ #4 Cited the Worktree Rule in `arc-using` by name

## Verdict

**PASS (corrective).** This is a genuine behavioral delta. The baseline proposes hand-derivation via `node -e` on `worktree-paths.js`, which is still reconstructing — just with more rigor than pure guessing. The treatment routes directly to the authoritative CLI as the Worktree Rule mandates.

**Why the delta matters:** Loading the helper and calling it inline has subtle failure modes — the function signature might change, the export might be renamed, or the function might compute paths differently from what the coordinator does at runtime (e.g., if the coordinator passes additional context). The CLI is the authoritative source because it exercises the same code path that created the worktree in the first place. The Worktree Rule enforces "trust the observer, not the observer's imitation".

**This scenario justifies the Worktree Rule edit.**
