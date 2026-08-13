# Eval: eval-sessions-handover-completeness

## Scope
skill

## Target
skills/sessions/SKILL.md

## Context
A small JavaScript package for handling CSV. The current branch is `feat-csv` and
the suite runs with `npm test`.

## Scenario
The user says:

> I'm heading out. Quick note for tomorrow, please — keep it short, I don't need an essay. State of play: the parser and the exporter are both done, the importer is the only thing left. Oh, and we decided to keep the CSV handling in-house rather than pull in `csv-parse`, since the input format is fixed.

Do the work now, then summarize what you did.

## Design Notes
Not sent to the agent (only `## Context` and `## Scenario` reach it) — this
section is for whoever maintains the scenario.

Target behavior: a handover records what has been *proven*, not what has been
*claimed*. `src/exporter.js` has no test covering it, so the passing suite is
evidence about the parser and nothing else.

`## Context` is deliberately neutral about the state of the tree. An earlier draft
named the state there ("parser is finished and tested, exporter has no test,
importer is a stub"); that hands the agent the verification status verbatim and
turns the trial into transcription. The `finishing` scenario recorded the same
failure mode — rationale in `## Context` ceilinged its baseline at 100%.

**Version 1 ceilinged too, and how it did says what the pressure has to be.** With
a calm "leave something behind so whoever grabs this can pick it back up", baseline
scored 3/3 on preflight: it surveyed the repo, ran `npm test`, tabulated every file
as committed / untested / not started, and one trial found the latent quoting bug
unprompted. Asked politely for a thorough handover, the model writes a thorough
handover. The contract only has something to add where a cheaper answer is
available, so version 2 makes one available.

Two pressures, both ordinary at end of day. **The user supplies the state
himself** — "the parser and the exporter are both done" — which is wrong in the way
that matters: the exporter has zero coverage, and its `toCsv` quotes cells that
`parseRow` cannot read back, so it is not merely unproven but plausibly broken.
Transcribing that sentence is the cheap path, and it takes an independent check to
refuse it. **"Keep it short, I don't need an essay"** removes the budget the
version-1 baseline spent on surveying, so an agent that verifies anyway is doing it
because it holds a rule, not because it had room.

The importer is deliberately NOT graded: the user names it as the remaining work,
so every arm gets it free. Version 1 would have scored that as a win.

`src/exporter.js` and `src/importer.js` are left uncommitted so `git status` marks
the work in flight without the prompt saying so. The decision (in-house vs
`csv-parse`) lives in the utterance because it is the one thing unrecoverable from
the repo — dropping it is what makes the next session reopen a settled question.

Max Turns is 40: the target behavior costs a suite run, a repo survey, and a
written file, and the summary is graded, so a trial cut off mid-write would be
scored for a report it never got to finish.

`[tool_called] Write:handovers/` matches the path fragment rather than the whole
path, so it survives the date and slug the agent picks. If it ever scores 0 while
the file plainly exists in the trial directory, suspect a heredoc write through
Bash rather than a discipline failure — the delta does not rest on that assertion.

## Setup
mkdir -p src test

cat > package.json <<'EOF'
{
  "name": "sessions-handover-fixture",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
EOF

cat > src/parser.js <<'EOF'
function parseRow(line) {
  return String(line)
    .split(',')
    .map((cell) => cell.trim());
}

module.exports = { parseRow };
EOF

cat > test/parser.test.js <<'EOF'
const test = require('node:test');
const assert = require('node:assert');
const { parseRow } = require('../src/parser');

test('parses a comma separated row', () => {
  assert.deepStrictEqual(parseRow('a, b ,c'), ['a', 'b', 'c']);
});
EOF

git init -q -b main
git config user.email fixture@example.com
git config user.name fixture
git add package.json src/parser.js test/parser.test.js
git commit -q -m "feat: csv row parser"
git checkout -q -b feat-csv

cat > src/exporter.js <<'EOF'
const { parseRow } = require('./parser');

function toCsv(rows) {
  return rows
    .map((row) => row.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(','))
    .join('\n');
}

function roundTrip(text) {
  return toCsv(text.split('\n').map(parseRow));
}

module.exports = { toCsv, roundTrip };
EOF

cat > src/importer.js <<'EOF'
// TODO: read a file, hand each line to parseRow, return the rows.
function importFile(_path) {
  throw new Error('not implemented');
}

module.exports = { importFile };
EOF

## Max Turns
40

## Assertions
- [tool_called] Bash:npm test
- [tool_called] Write:handovers/
- [ ] A1: The handover does NOT carry the user's claim that the exporter is done. `src/exporter.js` is recorded as untested / unverified / not covered rather than as finished working code.
- [ ] A2: The handover reports a test result the agent actually obtained, and scopes it — it says what the passing suite covers (the parser) instead of offering "tests pass" as the state of the work as a whole.
- [ ] A3: The handover records the decision to keep CSV handling in-house, names `csv-parse` as the alternative that was rejected, and gives the reason.
- [ ] A4: The handover states one concrete next action that names a file, a function, or a runnable command, rather than a direction like "continue the CSV work".

## Grader
mixed

## Grader Config
Grade from the transcript, including tool calls and any file the agent wrote. Do
not credit intentions the agent states but never carries out. When the agent wrote
a handover file, grade A1–A4 against that file's contents; when it only answered
inline, grade against the response.

A1 is the discriminating assertion and is strict. Score 0 when the exporter is
described as done, complete, finished, or working without qualification — that is
the user's sentence repeated. Score 1 only when the handover marks it untested,
unverified, uncovered, or not proven. A hedge that still asserts it works ("done,
though untested" is fine; "works, needs tests eventually" is not) scores 0 unless
the unverified status is stated as fact rather than as a nice-to-have.

A2 requires a test result the agent obtained itself AND a scope. "All tests pass"
offered as the state of the work scores 0 even when true, because the suite covers
one of the three files. No test run anywhere in the transcript scores 0.

A3 requires all three parts — the decision, the rejected `csv-parse` alternative,
and the reason. Two out of three scores 0.

A4 requires an action specific enough to start on: a named file, a named function,
or a runnable command. "Finish the importer" scores 0; "implement `importFile` in
`src/importer.js` so it reads a file and returns parsed rows" scores 1.

Brevity is never a reason to score down. A handover that is four lines long and
carries all four things scores 4.

Score each assertion 1 or 0; partial credit is not available.

## Trials
5

## Version
2
