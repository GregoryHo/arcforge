# Eval: eval-tdd-test-first-gate

## Scope
skill

## Target
skills/core/tdd/SKILL.md

## Context
A small JavaScript package. Tests live in `test/` and the suite runs with `npm test`.

## Scenario
The user says:

> I added `src/temperature.js` about an hour ago for this feature — `parseTemperature("21C")` returns 21 and garbage returns null. I checked both by hand and it works. It's still untracked and nothing else in the repo calls it yet. Add tests around it so we can merge today.

Do the work now, then summarize what you did and why.

## Design Notes
Not sent to the agent (only `## Context` and `## Scenario` are) — this section is
for whoever maintains the scenario.

Target behavior: the Iron Law applied to code that already exists. Production code
written for the change in flight, with no test that ever failed against it, is
deleted and rebuilt from a failing test rather than kept while tests are written
around it.

The trial is agentic on purpose. An earlier describe-only version of this scenario
ceilinged at 100% baseline: strong models narrate test-first discipline fluently
even when they would not execute it, so grading prose measures the half of the
skill that is already saturated. The discriminating signal lives in the tool
order — test file written before the implementation, a failing run observed
before the implementation exists — so three of the six assertions are
deterministic `[tool_*]` checks on the action log rather than model judgment.

A baseline agent typically writes `test/temperature.test.js` around the existing
file, runs the suite once, sees green, and stops: it never rewrites
`src/temperature.js`, so both `tool_before` assertions have no second operand and
`npm test` runs once. That is the regression this scenario guards.

Max Turns is 40 because the target behavior costs turns the baseline never spends.
At 25 the treatment ran out mid-rebuild: version-2 trials 2 and 3 ended on a tool
call with no final message, and A2/A3 grade the summary, so the run was scored for
a report the agent was cut off before writing. Turn exhaustion is not a discipline
failure, and 40 buys the delete-red-green-report cycle room to finish without
relaxing what any assertion demands.

## Setup
mkdir -p src test
cat > package.json <<'EOF'
{
  "name": "tdd-test-first-fixture",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
EOF

cat > src/temperature.js <<'EOF'
function parseTemperature(str) {
  const match = /^(-?\d+(?:\.\d+)?)C$/.exec(String(str).trim());
  return match ? Number(match[1]) : null;
}

module.exports = { parseTemperature };
EOF

git init -q
git add package.json
git -c user.email=fixture@example.com -c user.name=fixture commit -q -m "initial"

## Max Turns
40

## Assertions
- [tool_before] Write:/test/ < Write:/src/temperature.js
- [tool_before] Bash:npm test < Write:/src/temperature.js
- [tool_count] Bash:npm test >= 2
- [ ] A1: The agent removed the pre-existing untested `src/temperature.js` and rebuilt it, rather than leaving it in place and writing tests around it.
- [ ] A2: The summary reports observing a test fail before the implementation existed, and says what the failure was.
- [ ] A3: The summary does NOT claim the original implementation was kept as a reference to work from, and does NOT present tests written against the surviving original as the deliverable.

## Grader
mixed

## Grader Config
Grade from the transcript, including tool calls, not from intentions the agent
states but never carries out.

A1 passes only when the transcript shows the original file actually removed or
overwritten from scratch after a test failed against its absence. An agent that
announces it "would" delete the file but leaves it untouched scores 0.

A2 requires a specific reported failure — a named error, a failing assertion, or
"module not found" — observed before the implementation was written. A generic
"I followed TDD" with no failure reported scores 0.

A3 is a violation check: score 1 when the transcript is clean of the named move, 0
when it makes it, even if the correct move also appears elsewhere.

Score each assertion 1 or 0; partial credit is not available.

## Trials
5

## Version
3
