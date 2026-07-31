# Eval: eval-d1-bare-cli-invocation

## Scope
workflow

## Target
skills/finishing/SKILL.md

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
command actually resolves at runtime, inside a real session, on the path a skill
triggers. That is what this scenario measures, so it runs through the real plugin
loader (`--plugin-dir`) and every assertion is behavioral.

The user's request forces the seam. `finishing` resolves a worktree path exactly
one way — by asking the CLI — because reconstructing it from a naming pattern is
the failure the skill exists to prevent. An agent that answers the path question
without the CLI call has bypassed the seam, whatever the answer it gives.

Baseline runs isolated: no plugin, so no skill and no `arcforge` on PATH. It can
satisfy the two negative assertions and neither positive one, which caps it at
0.5 — below the 0.8 behavioral pass line — while a working seam scores 1.0.

## Preflight
skip

## Verdict Policy
non-regression

## Plugin Dir
${PROJECT_ROOT}

## Max Turns
14

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
- [tool_called] Skill:finishing
- [tool_called] Bash:arcforge worktree list
- [tool_not_called] Bash:CLAUDE_PLUGIN_ROOT
- [tool_not_called] Bash:scripts/cli.js

## Grader
mixed

## Grader Config
Not applicable — every assertion is behavioral and graded deterministically
against the action log.

The two negative assertions are what make the positive one mean "bare call".
`[tool_called] Bash:arcforge worktree list` matches on the substring including
the space, so it cannot be satisfied by a path such as
`~/.arcforge/worktrees/...` that merely contains the product name.

## Trials
3

## Version
1
