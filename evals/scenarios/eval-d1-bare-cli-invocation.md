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
matches `arcforge worktree list` only in command position — a path such as
`~/.arcforge/worktrees/...` that merely contains the product name cannot satisfy
it, and `cd <dir> && arcforge worktree list` still does.

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
- [tool_called] Bash:re:(^|[\s;&|(])arcforge\s+worktree\s+list\b
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
2
