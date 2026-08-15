# Eval: eval-d1-bare-cli-invocation

## Scope
workflow

## Target
skills/core/finishing/SKILL.md

## Context
A small JavaScript package. The base checkout is on `main` and the suite runs with `npm test`. The repository has no remote.

## Scenario
The user says:

> feat-slugify is finished. Wrap it up, and tell me the exact path of the worktree it lives in.

Do the work now, then summarize what you did.

## Design Notes
Not sent to the agent (only `## Context` and `## Scenario` reach it) — this
section is for whoever maintains the scenario.

This is the D1 runtime acceptance for the v6 skill/engine seam, not a prose eval.

D1 says a skill never reaches engine internals directly; it shells out to the
`arcforge` CLI. D9 fixed the spelling of that call: the plugin's `bin/` is on PATH
inside a plugin session, so the invocation is the bare command `arcforge <cmd>` —
never a path built from `CLAUDE_PLUGIN_ROOT` (unset in skill-triggered Bash) and
never a direct call into the repository's CLI entry point.

All of that has so far been checked statically: the D1 lint forbids the wrong
spellings inside skill files. What no static check can show is that the bare
command actually resolves at runtime, inside a real plugin session. That is what
this scenario measures, so it runs through the real plugin loader
(`--plugin-dir`) and every assertion is behavioral.

The user's request forces the seam. A worktree path is resolved exactly one way —
by asking the CLI — because reconstructing it from a naming pattern is the failure
`finishing` exists to prevent. An agent that answers the path question without the
CLI call has bypassed the seam, whatever the answer it gives.

Baseline runs isolated: no plugin, so no `arcforge` on PATH. It can satisfy the
two negative assertions and not the positive one, which caps it at 0.67 — below
the 0.8 behavioral pass line — while a working seam scores 1.0.

Scope, stated exactly: this establishes D9 — the bare command resolves inside a
plugin session — and nothing about skill routing. Version 1 also asserted
`[tool_called] Skill:finishing`; it scored 0 in 6/6 trials across both arms, and
`Skill` appears zero times in the whole stored action corpus. A direct probe
explains why: a headless `claude -p` session — with `--plugin-dir`, the plugin
loaded, and `which arcforge` resolving — exposes no `Skill` tool at all. The
assertion was unsatisfiable by construction rather than failed by the agent, so it
is gone. The version-1 treatment agents that did reach the CLI got there by
exploring (`which arcforge`, `arcforge --help`), not by loading `finishing`, which
was never in their context. Do not re-add a `[tool_called] Skill:*` assertion to
any scenario until the harness can run a modality where that tool exists; router
trigger rate is P6's acceptance (`router 觸發矩陣命中率`), measured there, not
smuggled in here.

The positive assertion is anchored with a regex instead of a bare substring so it
matches only in command position — a path such as `~/.arcforge/worktrees/...`, or
any `/…/arcforge/…` directory, cannot satisfy it because the product name there is
preceded by a slash, while `cd <dir> && arcforge worktree list` still does. The
trailing `[-\w]` requires an argument, so `which arcforge` is a probe and not an
invocation.

### Version 3 — stability, after treatment triggered in only 3 of 5 (P3 掛帳)

The P3 gate recorded this scenario as unstable and named the cause precisely:
treatment reached the CLI in 3/5 trials, so **no verdict policy would have passed
it** — the instrument, not the policy, was the problem. Two defects are fixed
here; a third is named and left alone because the scenario cannot reach it.

**Defect 1 — the assertion was narrower than the claim it encodes.** v2 required
`arcforge worktree list`, one specific subcommand. What D9 asserts, and what the
Design Notes above state as this scenario's entire scope, is that **the bare
command resolves on PATH inside a plugin session** — the two negative assertions
are what make it mean "bare". Pinning the subcommand smuggles a tool-choice
requirement into a scenario that explicitly disclaims routing scope, and it scores
0 for a trial that demonstrated D9 through `arcforge worktree --help`,
`arcforge worktree`, or any other subcommand. v1's own history says this happens:
the treatment agents that reached the CLI got there by exploring, not by loading
`finishing`, which was never in their context. The regex now credits any bare
`arcforge <argument>` in command position and keeps both negatives intact. This
widens what counts as evidence for the D9 claim; it does not weaken what the claim
is, and nothing about the command form it accepts is looser — command position and
the two negatives are unchanged.

**Defect 2 — the turn budget was less than half the corpus norm.** 14 turns
against 40 for every comparable scenario. The task is agentic — orient, run the
suite in the linked worktree, answer the path question — and this corpus has
recorded three separate instances of a trial cut off mid-work being scored as a
behavior failure (P4 300s→600s, P6 600s→900s, the `tdd` scenario's 25→40 turn
raise). Turn exhaustion is not a discipline failure. 30 turns.

**Not fixed, and worth stating: `git worktree list` is a legitimate answer here.**
The fixture builds the worktree with plain `git worktree add`, so it is `kind:
external` in arcforge's own listing, and an agent that just wants a path has no
reason inside the trial to prefer the arcforge CLI over git. Nothing the scenario
can do about that without either teaching the CLI in the prompt — which would make
the measurement circular — or putting `finishing` in the treatment's context, which
`## Scope workflow` deliberately does not do (treatment is the real plugin loader,
not an injected skill body). Residual variance from this cause stays; if treatment
still misses after these two fixes, that is where to look first, and the answer is
a harness modality that exposes skills, not a narrower regex.

This scenario is `## Preflight skip` / `## Verdict Policy non-regression`, so it is
not in the P7 delta-campaign set and these edits carry no re-preflight cost beyond
the corpus-wide one.

## Preflight
skip

## Verdict Policy
non-regression

## Plugin Dir
${PROJECT_ROOT}

## Max Turns
30

## Setup
mkdir -p test
cat > package.json <<'EOF'
{
  "name": "d1-bare-cli-fixture",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
EOF

cat > test/smoke.test.js <<'EOF'
const test = require('node:test');
const assert = require('node:assert');

test('smoke', () => {
  assert.strictEqual('ok'.toUpperCase(), 'OK');
});
EOF

git init -q -b main
git config user.email fixture@example.com
git config user.name fixture
git add package.json test
git commit -q -m "initial"
git branch feat-slugify
git worktree add -q wt-slugify feat-slugify
mkdir -p wt-slugify/src

cat > wt-slugify/src/slugify.js <<'EOF'
function slugify(str) {
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

module.exports = { slugify };
EOF
cat > wt-slugify/test/slugify.test.js <<'EOF'
const test = require('node:test');
const assert = require('node:assert');
const { slugify } = require('../src/slugify');

test('slugifies a title', () => {
  assert.strictEqual(slugify('  Hello, World!  '), 'hello-world');
});
EOF
git -C wt-slugify add -A
git -C wt-slugify commit -q -m "feat: slugify"

## Assertions
- [tool_called] Bash:re:(^|[\s;&|(])arcforge\s+[-\w]
- [tool_not_called] Bash:CLAUDE_PLUGIN_ROOT
- [tool_not_called] Bash:scripts/cli.js

## Grader
mixed

## Grader Config
Not applicable — every assertion is behavioral and graded deterministically
against the action log.

The two negative assertions are what make the positive one mean "bare call":
the CLI has to have been reached as `arcforge`, not through a plugin-root path
and not through the repository's CLI entry point. The positive assertion is
anchored to command position, so a path that merely contains the product name
cannot satisfy it.

## Trials
5

## Version
3
