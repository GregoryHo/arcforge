# Eval: eval-speccing-spec-before-code

## Scope
skill

## Target
skills/core/speccing/SKILL.md

## Context
A small reporting tool. A saved query produces an immutable run, and a run can
be pulled out over the API — today as JSON only. The project's product intent
lives in `product/`: a roadmap table with a decision log, a backlog of
un-scheduled wishes, and one living spec per area under `product/specs/`.
`npm test` runs the suite.

## Scenario
The user says:

> Let's do the CSV export this version — get it started. A caller should be able
> to pull a stored run as CSV the same way they pull JSON today, so wire it into
> the `formatFor` dispatcher in `src/exporter.js` and keep the suite green.

Do the work now, then summarize what you did in at most 8 lines.

Constraints:
- You may run shell commands and read, write, edit, or move files.
- Work only inside this project directory.

## Design Notes
Not sent to the agent (only `## Context` and `## Scenario` are).

**Why the baseline fails.** The request is a coding request with a named file
and a named function in it, and the suite is right there to prove the work. The
shortest honest route is: read `src/exporter.js`, add `toCsv`, extend
`formatFor`, add a test, run `npm test`, report. Every part of that is correct
work, and none of it touches `product/`. The backlog wish stays in the pool, the
roadmap gains no row for the version being built, no decision records why CSV
was picked up now, and no spec states what the CSV export must do — so the next
person reads a backlog that still wants a feature that shipped, and a roadmap
that ends one version behind the code.

The skill's rule is that the wish is promoted before the first line of code:
backlog line removed, decision appended, roadmap row added, and the version's
spec written from the template — *then* the implementation, against that spec.
The measurable consequence is an ordering the transcript records: the spec file
is written before the exporter is edited.

**Why the ordering is the discriminator, and not the mere presence of a spec.**
An agent nudged into tidiness might write a spec after the code, describing what
it just built. That artifact looks the same in a directory listing and is worth
nothing — it cannot disagree with the code, because it was derived from it. So
the pass is anchored on `[tool_before]`, with the spec's existence kept as a
separate floor rather than folded into the same assertion.

The fixture withholds the method. There is no maintenance guide beside the four
files, no instruction anywhere that a wish must be promoted before it is built,
and no earlier commit demonstrating the sequence — only the artifacts a real
project would have. A fixture that spelled out the playbook would let the
baseline read the answer off disk.

`src/exporter.js` is an existing module with a dispatcher that must be extended
in place, and the prompt names it, so the implementation move is an `Edit` on a
known path rather than a fresh `Write` — the second operand of the ordering
assertion is one an honest treatment trial reliably produces.

Max Turns is 40 because the treatment spends turns the baseline never spends:
four product-file edits before any code, then the code, then the suite.

## Preflight
run

## Verdict Policy
delta

## Setup
test -d "$PROJECT_ROOT/evals/fixtures/tallyhouse-product" || {
  echo "fixture missing: \$PROJECT_ROOT/evals/fixtures/tallyhouse-product (PROJECT_ROOT=$PROJECT_ROOT)" >&2
  exit 1
}

cp -R "$PROJECT_ROOT/evals/fixtures/tallyhouse-product/." .

git init -q -b main
git config user.email fixture@example.com
git config user.name fixture
git add README.md package.json product src test
git commit -q -m "tallyhouse: 0.3.0, JSON export"

## Max Turns
40

## Assertions
- [tool_called] Write:re:product/specs/
- [tool_before] Write:re:product/specs/ < Edit:re:src/exporter
- [ ] A1: The spec written under `product/specs/` states what the CSV export must do as numbered behavior items (`B-1`, `B-2`, …) — a contract the implementation can be checked against — rather than a recap of code that already exists.
- [ ] A2: The `csv-export` line is gone from `product/BACKLOG.md`, `product/ROADMAP.md` gained a row for the version being built, and a decision entry using the next free id records picking the wish up now.
- [ ] A3: `product/ROADMAP.md` carries exactly one `← we are here` marker — the marker moved rather than being duplicated or dropped.

## Grader
mixed

## Grader Config
Grade from the transcript, including tool calls and the full content of any file
the agent wrote, and from the trial directory artifacts. Grade the files the
agent actually produced, not the intentions it states.

A1 is scored on the spec file the agent wrote under `product/specs/`. Score 1
only when it carries numbered behavior items (`B-1`, `B-2`, … or an equivalent
numbering) that state what the CSV export must do — the column order it honours,
what happens to embedded separators or quotes, what an unknown format still does
— in terms an implementation could fail. Score 0 when no spec was written, when
the file is a changelog or a summary of the diff ("added `toCsv`, extended
`formatFor`"), or when its content is only prose with nothing numbered or
checkable in it. A spec that is short scores 1 if its items are checkable.

A2 is scored on the two product files. Score 1 only when all three are true:
the `csv-export` wish no longer sits in the backlog's wish pool (struck through
or removed both count; still listed as an open wish does not), `ROADMAP.md`
carries a new row for the version this work belongs to, and a decision entry
with the next free id in that log records the choice. Score 0 if any of the
three is missing.

A3 is a structural check on `ROADMAP.md`. Score 1 when exactly one line carries
the `← we are here` marker. Score 0 for zero markers and 0 for two or more.

Score each assertion 1 or 0; partial credit is not available.

## Trials
5

## Version
1
