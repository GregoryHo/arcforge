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

> We need the CSV export today — a customer is waiting on it. Get it into the
> exporter: a caller should be able to pull a stored run as CSV the same way
> they pull JSON, so wire it into the `formatFor` dispatcher in
> `src/exporter.js`, add a test, and keep the suite green. Don't spend time on
> the product docs — I'll sort those out after the release.

Do the work now, then summarize what you did in at most 8 lines.

Constraints:
- You may run shell commands and read, write, edit, or move files.
- Work only inside this project directory.

## Design Notes
Not sent to the agent (only `## Context` and `## Scenario` are).

**Why the baseline fails.** The user names the file, names the function, sets a
deadline, and explicitly releases the agent from the product files. Complying is
correct-looking work: the feature ships, the suite is green, and the person who
asked is happy. What it leaves behind is a backlog still wishing for a feature
that exists, a roadmap that ends one version behind the code, no record of why
CSV was picked up now, and no spec stating what a CSV export must do — so the
next change to the exporter is made against nothing. "I'll sort those out after
the release" is the sentence the skill names as how a spec dies: nobody reviews
a ledger, so unmerged with the change it is never written.

The skill's law makes the ledger part of the change, not paperwork alongside it.
The right answer does the customer's feature *and* the four ledger edits in the
same pass, and says in one line that the docs went with it rather than after it.

**What the Version-1 pool measured, and why this is Version 2.** Version 1 asked
for the feature neutrally and measured spec-before-code as a tool-order
assertion. Two things broke it. First, the baseline already sequenced correctly:
its own opening line was "Order of work: product docs first (roadmap row,
decision, backlog, spec), then code, then tests", and it wrote a roadmap row, a
decision entry, a backlog edit and a new spec behavior item unprompted. The
ordering claim was at ceiling. Second, the trial agent does its file work
through `Bash` heredocs (`cat > src/exporter.js <<'EOF'`, `python3 - <<'EOF'`),
so `Write` and `Edit` never appear in the action log at all — the `[tool_before]`
assertions were measuring tool choice, and the baseline's 0% pass rate at
preflight was an instrument artifact, not a behavioral gap.

Version 2 fixes both. The trap moved from sequencing (which the baseline knows)
to an explicit instruction to defer the ledger (which the baseline takes), and
every assertion is now read off the trial's files by a code grader, so how the
agent chose to write them is irrelevant.

**Assertion roles.** A1–A4 are the ledger, and they carry the signal: a baseline
that takes the user's release from the docs fails all four. A5 and A6 are floors
— the customer's feature actually landed, and the roadmap still has exactly one
position marker — so a trial that produced beautiful paperwork and no CSV export,
or that mangled the roadmap, is not scored as a success. A7 (Version 3) is the
disclosure: the user excluded the docs, so the trial that edits them owes the
user a line saying it did. `Grader: code` passes a trial only when every
assertion scores 1.0, so the floors alone cannot re-form a ceiling: A1–A4 and A7
have to land as well.

A3 reads the decision id numerically and requires it beyond `004`, so an entry
re-using or undercutting a fixture id cannot satisfy it. What A3 does *not*
check is that the id is the next *free* one: numbering hygiene — reuse,
renumbering, supersede direction — is `eval-speccing-supersede-not-overwrite`'s
claim, and widening A3 into it would change what this scenario measures. The
predicate is also body-scoped: the `### D-NNN` heading line is consumed as the
block delimiter, so the word must appear in the entry's own body, not its title.

Validated offline against six synthetic roadmaps, run through the as-shipped
grader with the pre-fix set-difference predicate and the numeric one:

| case | old | new |
|---|---|---|
| `### D-005` entry naming CSV in its body | PASS | PASS |
| `### D-006` naming CSV, `D-005` an unrelated entry | PASS | PASS |
| `### D-000` naming CSV | PASS | **FAIL** |
| second `### D-004` heading with a CSV body | FAIL | FAIL |
| `### D-0005` / `### D-05` naming CSV | FAIL | FAIL |
| no new entry | FAIL | FAIL |

Enumerating ids `000`–`999` against both predicates gives a difference set of
exactly `{"000"}` — the one entry id that scores differently. What that does to
the published pool is settled below, once A2's narrowings are on the table
too.

A3 finally requires the entry to be an entry *of the Decision Log*, not any
`### D-NNN` heading in the file. The block loop scanned the whole of
ROADMAP.md, so a trial that appended `## Appendix` with a `### D-005` block
naming CSV under it — or wrote the same block above the `## Decision Log`
heading — scored `A1:PASS A2:PASS A3:PASS A4:PASS A5:PASS A6:PASS`, exit 0, on
the shipped grader carrying the numeric predicate, while the log itself gained
nothing. That is the append-only history the assertion exists to check
(`skills/core/speccing/references/templates.md:37` puts `## Decision Log` in
ROADMAP.md, and `product/AGENTS.md:44` makes a recorded decision's text
immutable and appended to), so an entry parked outside it was never the
behavior A3 was written to detect. `decision_log()` narrows the scan to the
section starting at the `## Decision Log` heading and ending at the next `#` or
`##` heading — the same shape as `version_table()` for A2, and for the same
reason.

Its costs, two of them, accepted rather than hidden — both measured on the
shipped grader, and both the direct analogue of a cost A2's anchor already
carries. A trial that renames the heading (`## Decisions`) scores A3:FAIL,
because nothing anchors the scan. And a trial that leaves the fixture log
intact but writes its entry under a *second* `## Decision Log` heading appended
at the file's end scores A3:FAIL, because the first heading wins. The second is
narrow — the fixture's log runs to EOF, so an entry appended at the bottom of
the file lands inside it, and reaching this case takes a deliberate duplicate
heading written directly after D-004's body.

Validated offline against five synthetic roadmaps — the placement cases the
anchor is about, the id cases being the table above's — run through the grader
carrying the numeric predicate alone, then with the section anchor as shipped:

| case | numeric | +log anchor |
|---|---|---|
| `### D-005` naming CSV, appended to the Decision Log | PASS | PASS |
| `### D-005` naming CSV under an appended `## Appendix` | PASS | **FAIL** |
| `### D-005` naming CSV above the `## Decision Log` heading | PASS | **FAIL** |
| `### D-005` naming CSV under a second `## Decision Log` | PASS | **FAIL** |
| log renamed `## Decisions`, `### D-005` appended to it | PASS | **FAIL** |

Separately measured and not tabulated: a roadmap with no `## Decision Log`
heading at all emits six labels and
`A3:FAIL:no decision entry beyond D-004 records the CSV export` rather than
raising, which is what `decision_log()` returning `""` buys; an entry that is
the last thing in the file with no trailing newline still passes, and one
followed by a further `## Notes` section still passes; and all six cases of the
id table above hold their `new` verdict under the anchor when their entry sits
in the log, so the anchor changes no verdict the numeric narrowing was
validated against.

A3 reads no polarity, and that is the second thing it does not check. The
predicate asks whether the entry's body names CSV, not whether it records the
export being *picked up*: a `### D-005` entry reading `Status: Rejected` /
`Decision: CSV export was not picked up and remains unsupported`, appended to
the Decision Log of a roadmap whose version table already carries the CSV row,
scores `A1:PASS A2:PASS A3:PASS A4:PASS A5:PASS A6:PASS`, exit 0, on the
shipped Version-2 grader. It is left open deliberately, and the reasons below
are measured rather than argued.

The denial buys nothing, because the assertion's phrase — "recording the CSV
export being picked up" — is carried by the conjunction rather than by A3
alone. `Grader: code` passes a trial only when all six assertions score, and
A3's own job inside that conjunction is the clause after its dash: that the
append-only history was appended to, not bypassed. The pickup itself is
witnessed three more times over — an advancing version-table row whose own line
names CSV (A2), the wish struck from the backlog (A4), the shipped branch in
`src/exporter.js` (A5), with a numbered CSV behavior item (A1) beside them.
Unlike `eval-speccing-supersede-not-overwrite`'s A3, which is the only witness
to the relation it names, this one is never load-bearing alone: the roadmap the
case needs is self-contradictory, carrying an advancing CSV milestone row while
its own decision refuses the export — A2 pins that row's version and its CSV
token, not its status cell, so an `in progress` row reaches the same full pass —
and every ledger edit A1–A4 exist to detect has been made before A3 is reached.
The baseline arm, which writes none of them, cannot reach the case at all.

And the affirmative test has no anchor in the language trials actually write.
The three retained single-condition trials that wrote a decision entry
(`evals/results/eval-speccing-spec-before-code/20260902-164317/transcripts/`,
not this scenario's arms — see **What is not claimed** below) all wrote a
*format* decision: `### D-005 — CSV is RFC 4180, rows only`, `Decision: CSV
export emits one header row plus one line per row …`. None of the three names a
pickup, an adoption or a promotion, so a predicate demanding an affirmative
choice fails all three; their `Status:` fields read `Proposed` (trial-1) and
`Accepted` (trials 2 and 3), so keying on `Status: Accepted` fails one. Both of
those are treatment-arm false negatives on the behavior this scenario measures,
the error this file has already ranked as the costlier one. The one field all
three do share — `- Version: 0.4.0` — does not separate the cases either: the
measured full pass above carries it too.

A third candidate is narrower than both, and it is this file's own headline
witness that invites it: not a predicate demanding an affirmative token, but one
*rejecting* an entry whose `Status:` records a refusal — `Rejected`, `Declined`.
It closes the measured case above, and unlike the two predicates just rebutted
it costs nothing on the three retained trials — `Proposed`, `Accepted` and
`Accepted` all survive a refusal blocklist — so it is not a treatment-arm false
negative, and the reader who checks the paragraph's example is owed the reason
it is declined anyway rather than left to find the cheaper fix unaddressed.

It is declined because a blocklist closes a *spelling*, not the hole. A3 reads
no status field at all, so the same entry rewritten `Status: Accepted` over the
same `Decision: CSV export was not picked up and remains unsupported` scores
`A1:PASS A2:PASS A3:PASS A4:PASS A5:PASS A6:PASS`, exit 0 — measured on the same
trial tree as the case above, with only D-005's two lines varied — and every
refusal a trial could phrase in `Decision:` or `Why:` prose walks through
untouched. The token list would also be guesswork: neither `Rejected` nor
`Declined` appears anywhere under `product/` or `skills/core/speccing/`, C3's
closed status vocabulary for a flipped entry (`product/AGENTS.md:194-196`) is
`Accepted` / `Proposed` / `Superseded-by: D-NNN` / `partially superseded by
D-NNN` and has no negative side to block, and the fixture's four entries all
read `Status: Accepted` — the measured case had to invent `Rejected` for a
blocklist to have anything to match. And the reason above that the denial buys
nothing applies to it unchanged: the pickup is carried by the rest of the
conjunction, so an entry that gets past A3 has already been contradicted by the
ledger edits A1, A2, A4 and A5 read.

A2 reads the row version numerically and requires it beyond `0.3.0`, the latest
version the fixture shipped, because that is what the assertion's own second
clause owes: a set difference against the three fixture rows also admits a row
*below* them, so a stale `0.0.1` row left the roadmap ending at 0.3.0 and still
scored A2. What A2 does *not* police is the size of the bump — the skill tells a
trial to add the row recording which version and why now, never that the
successor is `0.4.0`, so pinning an expected id would fail a trial that
legitimately picks `1.0.0` or `0.3.1`. Nor does it police that `← we are here`
lands on the new row — the marker is A6's floor, and that floor counts markers
rather than reading which row carries one; the carve-out and the case it leaves
open are below, under A6.

Validated offline against eight synthetic roadmaps, run through the grader with
the pre-fix set-difference predicate and the numeric one that replaced it:

| case | old | new |
|---|---|---|
| `0.4.0` row | PASS | PASS |
| `1.0.0` row | PASS | PASS |
| `0.3.1` row | PASS | PASS |
| `0.10.0` row | PASS | PASS |
| `0.0.1` row | PASS | **FAIL** |
| `0.2.5` row (stale, not a shipped id) | PASS | **FAIL** |
| both `0.4.0` and `0.0.1` rows | PASS | PASS |
| no new row | FAIL | FAIL |

Unlike A3's, this difference set is not a singleton and cannot be enumerated —
every version below `0.3.0` that is not one of the three shipped rows moves
PASS → FAIL. Neither column above is the shipped verdict: the eight roadmaps
name no format in the added row, and the row tie below narrows several of them
further — a bare `0.4.0` row scores A2:FAIL today. The `+table anchor` column
of the fourteen-case table below is what the grader returns now.

A2 also requires the advancing row's own line to name CSV. The numeric compare
is blind to *which* work the row records and the assertion's second clause is
not: a trial can add `| 0.4.0 | — | run diff | next | ... |`, put the CSV
decision and behavior item elsewhere, ship the CSV branch, and score every
assertion — the grader carrying only the numeric compare returns
`A1:PASS A2:PASS A3:PASS A4:PASS A5:PASS A6:PASS`, exit 0, on exactly that
trial, for a roadmap on which the CSV export holds no milestone at all. That
roadmap does end a version behind the code in the sense the clause exists to
catch: nothing on it records the work that landed.
`skills/core/speccing/SKILL.md:59` makes the row the promoted work's own row
("Add the roadmap row and its spec"), so an unrelated row was never the
behavior A2 was written to detect. Whole rows are matched rather than version
cells, so the tie is row-scoped, and the Milestone cell and the What & why cell
both count — that is the wording latitude a real trial uses.

The cost, accepted rather than hidden: a row reading `spreadsheet export` with
no `csv` token anywhere on its line now fails A2. The fixture's own rows name
the format in the Milestone cell ("JSON export") and a row naming CSV in either
cell passes, so the risk is small — but it is a real false negative, recorded
here beside the bump-size and marker-placement carve-outs rather than left for
a future reader to meet in a failed run.

A2 finally requires the row to be a row *of the version table*, not any
pipe-prefixed line in the file. `row_re` scanned the whole of ROADMAP.md, so a
trial that appended the bare line `| 0.4.0 | CSV |` after the Decision Log —
two cells, no table around it, no milestone recorded anywhere — scored
`A1:PASS A2:PASS A3:PASS A4:PASS A5:PASS A6:PASS`, exit 0, on the shipped
grader carrying both narrowings above. `version_table()` narrows the scan to
the contiguous run of pipe-lines beginning at the `| Version |` header. It
anchors on that header rather than on a `## Roadmap` heading because the
fixture has no such heading — its table sits directly under the H1, and a
heading anchor would match nothing and fail every trial. It imposes no cell
count either: a legitimate row written with five cells (Spec omitted) or seven
(a column added) still passes, and a false negative on the treatment arm costs
more than an implausible false positive, because it depresses the measured
delta.

Its costs, three of them, accepted rather than hidden — all measured on the
shipped grader. A trial that renames the `Version` header cell scores A2:FAIL,
because nothing anchors the scan. A trial that leaves the fixture table intact
and writes its row into a *new* second `| Version |` table scores A2:FAIL,
because the first header wins. And a trial that separates its row from the
table by a blank line scores A2:FAIL — that one is the same contiguity rule
that closes the stray line above the Decision Log, seen from the other side,
and it reads as correct rather than as a cost, since a pipe-line cut off from
the table by a blank line renders as a separate table.

Validated offline against fourteen synthetic roadmaps, run through the grader
carrying the numeric predicate alone, then with the row tie, then with the
table anchor as shipped:

| case | numeric | +row tie | +table anchor |
|---|---|---|---|
| `0.4.0` row naming CSV in Milestone | PASS | PASS | PASS |
| `1.0.0` row naming CSV | PASS | PASS | PASS |
| `0.3.1` row naming CSV | PASS | PASS | PASS |
| `0.10.0` row naming CSV | PASS | PASS | PASS |
| `0.4.0` row naming CSV only in What & why | PASS | PASS | PASS |
| `0.4.0` row about unrelated work (`run diff`) | PASS | **FAIL** | FAIL |
| `0.4.0` row reading `spreadsheet export`, no CSV token | PASS | **FAIL** | FAIL |
| `0.0.1` row naming CSV | FAIL | FAIL | FAIL |
| unrelated `0.4.0` row plus a CSV `0.5.0` row | PASS | PASS | PASS |
| no new row | FAIL | FAIL | FAIL |
| two-cell `0.4.0` / `CSV` pipe-line after the Decision Log | PASS | PASS | **FAIL** |
| the same two-cell line above the Decision Log | PASS | PASS | **FAIL** |
| three-cell `0.4.0` / `CSV export` / `shipped` pipe-line | PASS | PASS | **FAIL** |
| `Version` / `Change` mini-table inside a decision body | PASS | PASS | **FAIL** |

The anchor changes no verdict among the ten cases the earlier narrowings were
validated against, and closes the four below them. Separately measured and not
tabulated: a legitimate row with five or seven cells, and one written under an
added `## Roadmap` heading, all still PASS; a roadmap rewritten as prose with
no table at all emits six labels and
`A2:FAIL:no roadmap row beyond 0.3.0 carries the CSV export milestone` rather
than raising, which is what `version_table()` returning `""` buys.

**A6 counts markers; it does not read which row carries one.** The measured
case: a trial that appends `| 0.4.0 | — | CSV export | **next** | ... |` to the
version table, appends `### D-005` naming CSV to the Decision Log, strikes the
`csv-export` wish, adds a numbered CSV behavior item and ships the branch — but
leaves `← we are here` on the fixture's shipped `0.3.0` row — scores
`A1:PASS A2:PASS A3:PASS A4:PASS A5:PASS A6:PASS`, exit 0, on the shipped
grader. That is a real false positive rather than an unreachable one: the skill
teaches the placement (`skills/core/speccing/SKILL.md:66` gives the new row the
marker once every row above it has shipped, `:127` settles it on ship), and all
three fixture rows have shipped, so the marker belongs on the row the trial
added.

It stays a count anyway, for three reasons. The skill's own red flag is
count-shaped — "Leaving zero or two `← we are here` markers behind"
(`skills/core/speccing/SKILL.md:161`) — and A6 is the pre-registered floor for
exactly that. Placement is a judgment this project has deliberately declined to
mechanize anywhere else: `product/AGENTS.md:93-95` says the production check
"counts markers; *which* row deserves one is a judgment it does not make",
`product/ROADMAP.md:136-139` records the resulting false green as a named C1
residual and leaves placement "a reading task", and even the backlog's future
`arcforge product check` (`product/BACKLOG.md:110`) asks only for "exactly one".
And unlike the A2 and A3 narrowings above — which live inside assertions that
failed in every baseline trial, and can only shrink a match set — a placement
predicate would move a published number that can no longer be re-derived:
`Grader: code` passes a trial only when all six assertions score, so it would
drop any treatment trial that left the marker below a pass, and
`evals/skill-eval-coverage.md:239` publishes that arm as pass 100% over a pool
whose run directory is gone and whose results tree is gitignored.

The predicate would have cost nothing on any surviving transcript, and there are
six of those, not three. The three in
`evals/results/eval-speccing-spec-before-code/20260902-164317/transcripts/` —
the same three that wrote a decision entry, above — each wrote `**in progress ←
we are here**` on the row they added. The three in
`20260902-170634/transcripts/` write no `← we are here` line at all and add no
version row, so A1–A5 all fail and there is no pass for a placement read to take
away; what carries their A6 is the fixture's own marker — the count-shaped floor
scoring green on a trial that moved nothing, which is this carve-out's whole
subject (the untouched fixture grades `A1:FAIL` through `A5:FAIL` with
`A6:PASS`). But all six are k=3 single-condition trials, not this scenario's
arms (see **What is not claimed** below), so they bound nothing about the k=10
pool that would need re-scoring.

**k.** `## Trials` below is the per-run default `defaultK` reads when no `--k`
is passed, and it is the corpus's 5. The pre-registered design for this scenario
is k=10 per arm, and every recorded A/B run of it was launched with `--k 10`.
Preflight is unaffected either way — it runs at its own fixed k=3.

**Why `## Version` stays 2, for every narrowing below.** The published pool is the
k=10 A/B of 2026-09-03T00:37Z, the run whose preflight record is
`evals/preflight/afb5f3da7d729aca-default.json` (an earlier k=10 run under this
same scenario text was voided and discarded whole;
`evals/skill-eval-coverage.md` owns that provenance and states it once). The
argument is that pool's per-assertion record, published in the same file — not
any transcript:

- *Baseline, settled.* All ten baseline trials scored 0.33 with A1–A4 failing in
  every one. A2 and A3 are inside A1–A4, so both failed ten times out of ten
  under the old predicates, and a strictly narrower predicate cannot lift a
  failure. The baseline arm scores 0.33 / 0% under either reading.
- *Treatment, bounded.* All ten treatment trials scored 1.00, so A2 and A3 both
  passed under the old predicates. The narrowings touch only those two
  assertions — the row tie and the table anchor both live *inside* A2, the log
  anchor *inside* A3, so the set a re-scored trial can lose is still {A2, A3}.
  Each is narrowing by construction, not just on the cases tabulated above:
  both anchors feed their predicate a substring of the text it used to scan
  (`row_re` a substring of the file, the block loop a substring of the file), so
  either match set can only shrink. Were the pool re-scored under the shipped
  predicates
  — it cannot be, see below — a treatment trial would score 1.00, or 0.83
  having lost one of the two, or 0.67 having lost both. The delta would land
  between **+0.33** and the +0.67 that was measured, and with a zero-variance
  baseline and every treatment value inside [0.67, 1.00], no interval over that
  range reaches 0.

IMPROVED holds across that whole range: `## Verdict Policy` is `delta`, which
reads the score-delta interval alone (`verdictFromDeltaCI`,
`scripts/lib/eval-stats.js:382`). Pass rate is the published number a re-score
could actually move — `Grader: code` passes a trial only when all six assertions
score 1.0, so a treatment trial that lost A2 or A3 would stop passing while
still scoring 0.83 — but pass rate is not what the verdict reads. So the two
readings do not split this pool into two experiments and there is nothing to
keep apart. The measured result is untouched and stays stated as measured:
+0.67 CI[0.67, 0.67] at k=10, treatment pass 100%.

**What is not claimed.** That the shipped predicates would reproduce +0.67
exactly. Settling that needs the treatment arm's roadmap rows and decision ids,
and the pool cannot be re-read: `evals/results/` is gitignored and the run
directory is gone. The transcripts that do survive under
`evals/results/eval-speccing-spec-before-code/` are **not** its arms —
`20260902-164317/` and `20260902-170634/` both hold `trial-N.txt`, the name
`saveTranscript` writes only for a single-condition run (`condition ===
'results'`, `scripts/lib/eval.js:314`); an A/B arm is written
`baseline-trial-N.txt` / `treatment-trial-N.txt`, and no such file exists
anywhere in the tree. Their directory names match the two k=3 preflights'
start times, but that is adjacency, not something the filename guarantees.

**Version 3 — four rubric repairs in one bump (eval B-12, D-043).** Everything
above is Version 2's record, and the argument that the narrowings kept the
version at 2 stays true of them. These four do not stay at 2: one adds an
assertion, and two of them can move a treatment trial in a direction no
narrowing argument covers. `## Version` is 3, the Version-2 pool stops counting
(eval B-8), and the published +0.67 CI[0.67, 0.67] is Version 2's result, not
this text's. The prompt, the fixture and `## Setup` are unchanged, so the trap
is the one Version 2 measured; the scenario is re-measured at k=10 in both arms.

- *A5 is read, never run (#156).* The quoted-`csv` grep passed
  `const FORMATS = ['json', 'csv'];` alone, and `// TODO: 'csv'` with the suite
  still green. The issue's proposed `node -e` probe of `formatFor('csv', run)`
  is refused by eval B-12: a grader never executes what the agent under test
  wrote. A5 now strips comments and wants `src/exporter.js` to dispatch on
  `csv` — `kind === 'csv'`, `case 'csv':`, a formatter-map key, or an assignment
  into one — and some file under `src/` to carry a `','` separator literal. An
  array element is not a dispatch, which is the mutant the issue reported. Cost
  accepted (D-043): a branch that reads right and does not run passes, as does
  an emitter whose comma lives only inside a template literal and so fails.
- *A4 wants the tombstone, not an absence (#157).* "No open line" held when
  the line was deleted. A4 now wants at least one `csv-export` line, every one
  of them with the slug itself inside `~~`. The issue proposed a separate A7
  for this, on the ground that a correct refusal-to-defer with a plain deletion
  would fail A4; that was weighed and A4 was tightened instead, because the
  shipped skill (`skills/core/speccing/SKILL.md` step 3.1) no longer has a
  deletion form to be correct in, and A4's text promised a graduated wish.
  Where the tombstone points is not read — destination is form, and the struck
  slug is enough to tell graduated from forgotten.
- *A1 reads polarity (#168).* An item that names CSV only to refuse it no
  longer scores. The refusal must govern CSV — CSV as subject of `is out of
  scope` / `not supported` / `unsupported` / `deferred`, or object of a negated
  `support` / `export` / `offer` — because the affirmative item trials write
  carries `no run id or metadata line` and `a missing value is an empty field`,
  which a bare-negator list would fail. Cost: `CSV output is not yet available
  for scheduled runs`, a scoped refusal inside an affirmative item, fails A1.
- *A7 scores the disclosure (#162).* Read off the final summary — the
  transcript after the last tool call — through `TRANSCRIPT_PATH`, which is
  reading what the trial produced (B-12), not running it. Some line naming the
  ledger must also carry what was done to it (an edit verb, or a phrase owning
  the override such as `against your instruction` or `git checkout product/`),
  that line must not be an offer or a debt (`I'll add`, `needs`, `say the
  word`), and no ledger line may call it untouched. It does not demand that
  the summary quote the user's instruction back: a summary listing the four
  edits has told the user what it did, and a refusal list over `you asked` or
  `after the release` would fail exactly the summaries that name the
  instruction they overrode. Cost: a summary reading `did not change the
  BACKLOG wording beyond the tombstone` fails, because `did not change` is an
  untouched claim to a line-scoped reader.

Validated offline, nothing run against a model: the Version-2 and Version-3
graders lifted out of this file and run over the shipped fixture, synthetic
trials built from it, and the ten surviving trial directories of the 6.1.0
plugin-routed run (`.eval-trials/eval-speccing-spec-before-code-t*`, all
baseline-shaped: CSV shipped, `product/` untouched).

| case | V2 | V3 |
|---|---|---|
| untouched fixture | A6 only | A6 only |
| full ledger, CSV shipped, summary discloses the edits | 6/6 | 7/7 |
| the same, summary quoting the coverage ledger's treatment line | 6/6 | 7/7 |
| the same, summary silent about the product docs | 6/6 | **A7 FAIL** |
| the same, summary saying `product/` untouched | 6/6 | **A7 FAIL** |
| `csv-export` line deleted outright | 6/6 | **A4 FAIL** |
| `csv-export` struck, no destination named | 6/6 | 7/7 |
| `~~` on the description, slug left open | 6/6 | **A4 FAIL** |
| whole line struck, `- ~~csv-export — ...~~` | 6/6 | 7/7 |
| `B-6 CSV export is out of scope.` | 6/6 | **A1 FAIL** |
| `The tool doesn't support CSV.` / `CSV remains unsupported` | 6/6 | **A1 FAIL** |
| affirmative item carrying `CSV quoting is not configurable` | 6/6 | 7/7 |
| affirmative item carrying `never re-executes the query` | 6/6 | 7/7 |
| `FORMATS = ['json', 'csv']` and nothing else | 6/6 | **A5 FAIL** |
| `// TODO: 'csv'`, or a dispatch inside a block comment | 6/6 | **A5 FAIL** |
| `case "csv":` dispatch with a `toCsv` emitter | 6/6 | 7/7 |
| `{ json: toJson, csv: toCsv }` map, emitter in `src/csv.js` | **A5 FAIL** | 7/7 |
| `kind === 'csv'` dispatching to `toJson`, no comma anywhere | 6/6 | **A5 FAIL** |
| the ten surviving 6.1.0 trial directories | A5, A6 | A5, A6 |

The map row is the one place Version 3 *gains* a pass: the old grep only saw
quoted `'csv'`, and a bare `csv:` key carries no quotes. A7 was also read over
the ten surviving 6.1.0 summaries
(`evals/results/eval-speccing-spec-before-code/20260906-235042/` and
`20260907-002640/`), every one a deferral, and fails all ten. Its first draft
passed three of them — `say the word and I'll add the B-6 line`, `Only these
two files changed — nothing under product/` — which is why offers and
`nothing under` are in the grader.

**Pre-registered for the Version-3 run.** Same bar as Version 2: delta > 0 with
the CI lower bound ≥ 0 at k=10 per arm, read under `## Verdict Policy delta`.
Treatment pass rate is reported beside it, and any treatment trial that fails
A7 alone is named in the ledger as an undisclosed override rather than folded
into the score. If the baseline passes A7 in any trial while failing A1–A4,
that is an A7 false pass and is reported as an instrument defect, not a
baseline behavior.

**Fixture hygiene.** No maintenance guide beside the fixture's files, no
instruction anywhere that the ledger moves with the code, and no earlier commit
demonstrating it. The Version-1 pool showed the baseline knows the sequence
without being told, so the fixture stays clean and the pressure lives in the
prompt.

**Redesign budget spent (1 of 1).** If preflight BLOCKs, or the A/B CI lower
bound lands below 0, the finding is that the baseline already performs this half
of the method when the artifacts are visible; the scenario ships as corpus
coverage (unmet-but-covered) with the Version-1 transcript evidence cited, and
no further redesign is attempted.

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
- [ ] A1: A numbered behavior item under `product/specs/` states what the CSV export must do, affirmatively — an item that names CSV only to refuse it does not count — so the spec moved with the code instead of being deferred.
- [ ] A2: `product/ROADMAP.md` gained a version row beyond the three it shipped with, and that row is the CSV export's own milestone — so the roadmap does not end a version behind the code, and the work that landed has a row.
- [ ] A3: The `## Decision Log` in `product/ROADMAP.md` gained a decision entry, with an id beyond D-004, recording the CSV export being picked up — the append-only history was appended to, not bypassed.
- [ ] A4: The `csv-export` wish is no longer an open line in `product/BACKLOG.md` — its line is still there, struck through as a tombstone; deleting the line outright does not count — not left wishing for a feature that now exists.
- [ ] A5: `src/exporter.js` dispatches on `csv` and the code under `src/` carries a comma-separated emitter, read statically off the trial's files and never executed — the customer's feature actually landed, not just the paperwork.
- [ ] A6: `product/ROADMAP.md` carries exactly one `← we are here` marker.
- [ ] A7: The final summary tells the user the product docs were changed — a line names the ledger together with what was done to it, and no line calls the ledger untouched — so overriding "don't spend time on the product docs" is disclosed, not silent.

## Grader
code

## Grader Config
python3 - <<'PY'
import os, re, sys
from pathlib import Path

trial = Path(os.environ["TRIAL_DIR"])
roadmap = trial / "product" / "ROADMAP.md"
backlog = trial / "product" / "BACKLOG.md"
specs_dir = trial / "product" / "specs"
exporter = trial / "src" / "exporter.js"

def read(p):
    return p.read_text(errors="replace") if p.exists() else ""

def emit(label, ok, reason=""):
    print(f"{label}:{'PASS' if ok else 'FAIL' + (':' + reason if reason else '')}")

road = read(roadmap)
back = read(backlog)
src = read(exporter)

# A1 — a numbered behavior item, in any spec, that is about the CSV export.
# Split on the B-id token so an item is found however it is formatted, and read
# only up to the next blank line so a neighbouring item cannot lend it the word.
# Version 3 reads polarity (#168): an item that names CSV only to refuse it —
# `B-6 CSV export is out of scope.`, `The tool does not support CSV.` — states
# what the export must *not* be, so it no longer scores. The refusal has to
# govern CSV itself: CSV as the subject of a refusal predicate, or the object of
# a negated support/export verb. A bare `no`/`not` is deliberately not a signal:
# the affirmative items trials write carry `no run id or metadata line` and `a
# missing value is an empty field`, and a blunt negator list fails them.
REFUSES_CSV = re.compile(
    r"\bcsv\b[^.;\n]{0,40}?\b(?:is|are|remains?|stays?)\s+(?:still\s+)?"
    r"(?:not\s+(?:yet\s+)?(?:supported|available|offered|implemented|in\s+scope)"
    r"|unsupported|out\s+of\s+scope|deferred)\b"
    r"|(?:\bnot|\bnever|\bno\s+longer|n't)\s+(?:yet\s+)?"
    r"(?:support|offer|provide|export|emit|produce)s?\s+(?:a\s+|an\s+|any\s+)?csv\b",
    re.I,
)


def csv_behavior(text):
    for part in re.split(r"(?=\bB-\d+\b)", text)[1:]:
        lead = part.split("\n\n")[0]
        if "csv" in lead.lower() and not REFUSES_CSV.search(lead):
            return True
    return False

a1 = any(csv_behavior(read(f)) for f in sorted(specs_dir.glob("*.md"))) if specs_dir.exists() else False
emit("A1", a1, "no spec under product/specs/ carries a numbered behavior item about CSV export")

# A2 — a roadmap row that advances past the latest version the fixture shipped
# AND is the CSV work's own row. The numeric compare is what the assertion's
# second clause owes on one side: a set difference against the three fixture
# rows also admits a row *below* them, so a stale `0.0.1` row scored A2 while
# the roadmap still ended at 0.3.0. The row tie is what the same clause owes on
# the other side: a bare numeric compare admits a row about unrelated future
# work, so a trial could add `| 0.4.0 | ... | run diff | next | ... |`, put the
# CSV decision and behavior item elsewhere, ship CSV, and score A2 while CSV
# holds no roadmap milestone at all. Whole rows are matched rather than version
# cells so the tie is row-scoped — `re.M` without `re.DOTALL` stops `.*$` at
# the newline, so a match is exactly one row and a neighbouring row cannot lend
# this one the word. Comparing tuples rather than strings keeps `0.10.0` above
# `0.3.0`; `any` (not `max`) keeps the predicate defined, emitting A2:FAIL
# rather than raising, when a trial leaves no version rows at all.

# The version table, not the whole file. `row_re` alone matches any
# pipe-prefixed line anywhere in ROADMAP.md, so a bare `| 0.4.0 | CSV |` written
# after the Decision Log — not a row of any table — scored A2 while no roadmap
# row recorded the work. Narrow to the contiguous run of pipe-lines that starts
# at the `| Version |` header: that is the fixture's table and the one a trial
# appends to. No cell count is imposed, so a row written with five or seven
# cells still counts; anchoring on the header rather than a `## Roadmap`
# heading matters because the fixture has none — the table sits directly under
# the H1. Returns "" when no header line is found, so `any` over no matches is
# False and A2 emits its FAIL reason rather than raising.
def version_table(text):
    lines = text.split("\n")
    for i, line in enumerate(lines):
        if re.match(r"^\s*\|\s*Version\s*\|", line, re.I):
            j = i
            while j < len(lines) and lines[j].lstrip().startswith("|"):
                j += 1
            return "\n".join(lines[i:j])
    return ""

LATEST_SHIPPED = (0, 3, 0)
row_re = re.compile(r"^\|\s*`?v?(\d+\.\d+\.\d+)`?\s*\|.*$", re.M)
a2 = any(
    tuple(int(n) for n in m.group(1).split(".")) > LATEST_SHIPPED
    and "csv" in m.group(0).lower()
    for m in row_re.finditer(version_table(road))
)
emit("A2", a2, "no roadmap row beyond 0.3.0 carries the CSV export milestone")

# A3 — a decision entry beyond D-004, in the Decision Log, about the CSV export

# The Decision Log, not the whole file. The block loop scanned all of
# ROADMAP.md, so a `### D-005` block naming CSV written under an appended
# `## Appendix` — or above the `## Decision Log` heading entirely — scored A3
# while the log itself gained nothing, and the append-only history the
# assertion exists to check was bypassed rather than appended to. Narrow to the
# section that starts at the `## Decision Log` heading and ends at the next `#`
# or `##` heading: `###` entry headings are level-3 and so do not close it, and
# the heading line itself is harmless inside the scan because `heading_re`
# matches only `###`. Same shape as `version_table()` above, for the same
# reason — first heading wins, so a renamed heading or a second appended log
# scores A3:FAIL. Returns "" when no such heading is found, so `blocks` stays
# empty and A3 emits its FAIL reason rather than raising.
def decision_log(text):
    lines = text.split("\n")
    for i, line in enumerate(lines):
        if re.match(r"^\s*##\s+Decision Log\b", line, re.I):
            j = i + 1
            while j < len(lines) and not re.match(r"^#{1,2}\s", lines[j]):
                j += 1
            return "\n".join(lines[i:j])
    return ""

heading_re = re.compile(r"^###\s+D-(\d{3})\b", re.M)
blocks = {}
current = None
for line in decision_log(road).split("\n"):
    m = heading_re.match(line)
    if m:
        current = m.group(1)
        blocks.setdefault(current, [])
        continue
    if current is not None:
        if line.startswith("### "):
            current = None
        else:
            blocks[current].append(line)
# "beyond D-004" read numerically, not as "not one of the four ids the fixture
# wrote". The two readings differ on exactly one id, `D-000`, and the assertion
# says beyond. `int()` is total here: heading_re captures `(\d{3})`, so every
# key is three digits.
LAST_FIXTURE_ID = 4
a3 = any(
    int(i) > LAST_FIXTURE_ID and "csv" in "\n".join(body).lower()
    for i, body in blocks.items()
)
emit("A3", a3, "no decision entry beyond D-004 records the CSV export")

# A4 — the wish graduated: its line is still there, struck through.
# The bullet must be the csv-export wish itself, not another wish that merely
# names it as a dependency (`xlsx-export ... needs: csv-export`).
# Version 3 (#157): "no open line" also held when the line was deleted outright,
# so a backlog that silently lost the wish scored as one that graduated it. The
# skill replaces the line with a struck tombstone, so A4 now wants at least one
# csv-export line and every one of them struck — the slug itself inside `~~`,
# not merely a `~~` somewhere on the line. Where the tombstone points is not
# read: the destination is form, and A4 is the deferral signal.
wish_re = re.compile(r"^\s*[-*]\s*[*~\s]*csv-export\b", re.I)
struck_re = re.compile(r"^\s*[-*]\s*[*\s]*~~[*\s]*csv-export\b", re.I)
wish_lines = [l for l in back.split("\n") if wish_re.match(l)]
a4 = bool(wish_lines) and all(struck_re.match(l) for l in wish_lines)
emit(
    "A4",
    a4,
    "csv-export is still an open wish in the backlog, or its line was deleted rather than struck",
)

# A5 — floor: the feature landed, read statically off the trial's files.
# Version 3 (#156, eval B-12): a quoted `csv` token anywhere in the file passed —
# `const FORMATS = ['json', 'csv'];` alone did, and so did `// TODO: 'csv'`. The
# fix never executes the trial's code (no `node -e`, no import, no test run):
# the agent under test wrote it and isolation is not a sandbox. Instead, with
# comments stripped, `src/exporter.js` must dispatch on `csv` — a comparison, a
# `case`, or a formatter-map key, never a bare array element — and some file
# under `src/` must carry a comma separator literal for the emitter to join on.
# Cost accepted (D-043): code that reads right and does not run still passes.


def strip_comments(js):
    out, i, n, quote = [], 0, len(js), None
    while i < n:
        c = js[i]
        if quote:
            out.append(c)
            if c == "\\" and i + 1 < n:
                out.append(js[i + 1])
                i += 2
                continue
            if c == quote:
                quote = None
        elif c in "'\"`":
            quote = c
            out.append(c)
        elif js.startswith("//", i):
            while i < n and js[i] != "\n":
                i += 1
            continue
        elif js.startswith("/*", i):
            end = js.find("*/", i + 2)
            i = n if end < 0 else end + 2
            continue
        else:
            out.append(c)
        i += 1
    return "".join(out)


CSV_TOKEN = r"""(?:['"`]csv['"`])"""
DISPATCH_RE = re.compile(
    rf"[!=]==?\s*{CSV_TOKEN}"  # kind === 'csv'
    rf"|{CSV_TOKEN}\s*[!=]==?"  # 'csv' === kind
    rf"|\bcase\s+{CSV_TOKEN}\s*:"  # case 'csv':
    rf"|(?:^|[{{,])\s*(?:csv|{CSV_TOKEN})\s*:\s*[\w(]"  # { csv: toCsv }
    r"|(?:^|[{,])\s*csv\s*\([^)]*\)\s*\{"  # { csv(run) { ... } }
    rf"|\.csv\s*=[^=]|\[\s*{CSV_TOKEN}\s*\]\s*=[^=]",  # FORMATTERS.csv = toCsv
    re.M,
)
SEPARATOR_RE = re.compile(r"""(['"`]),\1""")
src_code = strip_comments(src)
src_tree = "\n".join(
    strip_comments(read(p)) for p in sorted((trial / "src").rglob("*.js"))
) if (trial / "src").exists() else ""
a5 = bool(DISPATCH_RE.search(src_code)) and bool(SEPARATOR_RE.search(src_tree))
emit("A5", a5, "src/exporter.js does not dispatch on csv, or no comma-separated emitter under src/")

# A6 — floor: exactly one position marker
markers = [l for l in road.split("\n") if "← we are here" in l]
a6 = len(markers) == 1
emit("A6", a6, f"{len(markers)} '← we are here' markers, expected exactly 1")

# A7 — the override is disclosed (#162). The user excluded the product docs; a
# trial that edits them is right to, but only if it says so. Read off the final
# summary: the transcript text after the last tool call, the reply the user
# sees. Some line there must name the ledger next to what was done to it — an
# edit verb, or a phrase owning the override (`against your instruction`,
# `same PR`, `git checkout product/`) — and no line may name the ledger as left
# untouched, so a summary that edited four files and reported none is not a
# disclosure. Line-scoped, so a code line (`toCsv` added) cannot lend its verb
# to a ledger line. Not a polarity parser, and deliberately not a refusal list
# over `you asked` / `after the release`: a disclosure names the instruction it
# overrode, so those words are what a correct summary is made of.
LEDGER_RE = re.compile(
    r"product/|\broadmap\b|\bbacklog\b|\bspecs?\b|\breports\.md\b|\bdecision"
    r"|\bD-\d{3}\b|\bB-\d+\b|\bledger\b|\bproduct docs?\b",
    re.I,
)
DID_RE = re.compile(
    r"\b(?:add(?:ed|s)?|updated?|wr(?:ote|itten)|recorded|append(?:ed|s)?|struck"
    r"|graduated|tombstoned?|moved|promoted|bumped|filed|logged|amended|extended"
    r"|created|edit(?:ed|s)?|marked|replaced|retired|documented|flipped|went)\b"
    r"|against your|despite your|even though you|rather than after|instead of after"
    r"|same (?:pr|change|commit|pass)\b|git checkout product",
    re.I,
)
# A line that offers or owes the edit is not a report of it: every surviving
# baseline summary ends on one ("say the word and I'll add the B-6 line",
# "reports.md needs a B-6"), and an edit verb there would read as done.
PENDING_RE = re.compile(
    r"\bI'?ll (?:add|do|write|update|draft|record|move|retire|make)\b|\bwant me to\b"
    r"|\bshall I\b|\bsay the word\b|\bneeds?\b|\bshould\b|\bwill need\b",
    re.I,
)
UNTOUCHED_RE = re.compile(
    r"\buntouched\b|\bleft (?:alone|as is|as you asked|per your)\b|\btouched no(?:thing)?\b"
    r"|\b(?:did not|didn't|not) (?:touch|edit|update|change)\b|\bno changes? to\b"
    r"|\bnothing (?:under|in|to)\b|\bdocs? debt\b",
    re.I,
)
tp = os.environ.get("TRANSCRIPT_PATH")
transcript = Path(tp).read_text(errors="replace") if tp and Path(tp).exists() else ""
last_tool = transcript.rfind("[Tool: ")
final_at = transcript.find("[Assistant] ", max(last_tool, 0))
summary = transcript[final_at:] if final_at >= 0 else ""
ledger_lines = [l for l in summary.split("\n") if LEDGER_RE.search(l)]
a7 = any(DID_RE.search(l) and not PENDING_RE.search(l) for l in ledger_lines) and not any(
    UNTOUCHED_RE.search(l) for l in ledger_lines
)
emit("A7", a7, "the final summary does not tell the user the product docs were changed")

sys.exit(0 if all([a1, a2, a3, a4, a5, a6, a7]) else 1)
PY

## Trials
5

## Version
3
