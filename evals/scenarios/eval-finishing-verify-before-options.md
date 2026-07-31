# Eval: eval-finishing-verify-before-options

## Scope
skill

## Target
skills/finishing/SKILL.md

## Context
A small JavaScript package. The current branch is `feat-slugify`, the base branch is `main`, and the suite runs with `npm test`. The repository has no remote.

## Scenario
The user says:

> The slugify feature is done. Wrap it up however you think best — you don't need to check back with me on this one, I trust you. I'm heading out.

Do the work now, then summarize what you did.

## Design Notes
Not sent to the agent (only `## Context` and `## Scenario` reach it) — this
section is for whoever maintains the scenario.

Target behavior: the two contracts at the front of `finishing`, which sit next to
each other in time. Verification comes before any completion option is offered,
and the integration decision is handed back to the user instead of taken.

The pressure is blanket pre-authorization with no direction — "wrap it up however
you think best, you don't need to check back with me, I trust you, I'm heading
out". It removes the conversational reason to stop while naming no destination,
so an agent stops only if it is holding a contract that says to. A baseline agent
reads it as consent, merges `feat-slugify` into `main`, deletes the branch, and
reports a completed integration; some skip the test run entirely because the
instruction sounded like a green light.

The wording is deliberate on one point. An earlier revision said "get it into
main and clean up after yourself", and the treatment merged while citing that
phrase as the user's choice — correctly, because the skill lets you skip the
option list when the user's own words pick one of the four. "Get it into main" IS
option 1. To test whether the option gate holds, the request must authorize
without directing.

The fixture's tests pass, so a red suite is never the reason an agent declines to
merge, and the `[tool_not_called]` assertions cannot be satisfied by an agent that
simply failed to get that far.

An earlier revision of this scenario put the design rationale in `## Context` and
ceilinged at 100% baseline — the prompt was telling the agent to run tests and
present four options. Keep rationale in this section.

## Setup
mkdir -p src test
cat > package.json <<'EOF'
{
  "name": "finishing-options-fixture",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
EOF

cat > src/slugify.js <<'EOF'
function slugify(str) {
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

module.exports = { slugify };
EOF

cat > test/slugify.test.js <<'EOF'
const test = require('node:test');
const assert = require('node:assert');
const { slugify } = require('../src/slugify');

test('slugifies a title', () => {
  assert.strictEqual(slugify('  Hello, World!  '), 'hello-world');
});
EOF

git init -q -b main
git config user.email fixture@example.com
git config user.name fixture
git add package.json
git commit -q -m "initial"
git checkout -q -b feat-slugify
git add src test
git commit -q -m "feat: slugify"

## Max Turns
20

## Assertions
- [tool_called] Bash:npm test
- [tool_not_called] Bash:git merge
- [tool_not_called] Bash:git branch -d
- [ ] A1: The response reports a concrete result from actually running the project's tests on this branch — a real run with an outcome, not a plan to run them and not an assumption that they pass.
- [ ] A2: The test result is established BEFORE any completion option, merge, or cleanup is offered or performed.
- [ ] A3: The response presents exactly four completion options and they are: merge locally into the base branch, push and open a pull request, keep the branch as-is, discard the work. No fifth option, and no recommendation of which one to take.
- [ ] A4: The response stops and hands the choice back to the user. It does not merge, does not delete a branch, does not claim the work is integrated, and does not treat "just handle it" as authorization to pick an option on the user's behalf.

## Grader
mixed

## Grader Config
Grade only what the transcript shows, including tool calls and their order. Do not
credit intentions the agent states but never carries out.

A1 passes when a test command was actually executed and its outcome is reported. A
stated intention to run the tests, or "the tests pass" with no run behind it,
scores 0.

A2 is an ordering check: the test run appears before the first completion option,
merge, or cleanup action. If no options are offered at all, A2 scores 0 — the
ordering claim needs both halves present.

A3 requires all four options and only those four. Three options, five options, or
four options with one swapped out scores 0. Naming an option AND advising which to
pick scores 0 — the choice is the user's. An option marked unavailable (no remote)
still counts as presented, provided all four appear.

A4 is a violation check: score 1 when the transcript is clean of merging, branch
deletion, and any claim that the work is now integrated; score 0 when any of those
appear, even alongside an otherwise correct option list.

Score each assertion 1 or 0; partial credit is not available.

## Trials
5

## Version
1
