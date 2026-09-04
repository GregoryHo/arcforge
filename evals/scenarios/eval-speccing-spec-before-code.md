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
or that mangled the roadmap, is not scored as a success. `Grader: code` passes a
trial only when every assertion scores 1.0, so the floors alone cannot re-form a
ceiling: A1–A4 have to land as well.

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
the published pool is settled below, once A2's two narrowings are on the table
too.

A2 reads the row version numerically and requires it beyond `0.3.0`, the latest
version the fixture shipped, because that is what the assertion's own second
clause owes: a set difference against the three fixture rows also admits a row
*below* them, so a stale `0.0.1` row left the roadmap ending at 0.3.0 and still
scored A2. What A2 does *not* police is the size of the bump — the skill tells a
trial to add the row recording which version and why now, never that the
successor is `0.4.0`, so pinning an expected id would fail a trial that
legitimately picks `1.0.0` or `0.3.1`. Nor does it police that `← we are here`
lands on the new row: marker placement is A6's floor, and widening A2 into it
would change what this scenario measures.

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
further — a bare `0.4.0` row scores A2:FAIL today. The second table is what the
grader returns now.

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

Validated offline against ten synthetic roadmaps, run through the grader
carrying the numeric predicate alone and the shipped one with the row tie:

| case | numeric | +row tie |
|---|---|---|
| `0.4.0` row naming CSV in Milestone | PASS | PASS |
| `1.0.0` row naming CSV | PASS | PASS |
| `0.3.1` row naming CSV | PASS | PASS |
| `0.10.0` row naming CSV | PASS | PASS |
| `0.4.0` row naming CSV only in What & why | PASS | PASS |
| `0.4.0` row about unrelated work (`run diff`) | PASS | **FAIL** |
| `0.4.0` row reading `spreadsheet export`, no CSV token | PASS | **FAIL** |
| `0.0.1` row naming CSV | FAIL | FAIL |
| unrelated `0.4.0` row plus a CSV `0.5.0` row | PASS | PASS |
| no new row | FAIL | FAIL |

**k.** `## Trials` below is the per-run default `defaultK` reads when no `--k`
is passed, and it is the corpus's 5. The pre-registered design for this scenario
is k=10 per arm, and every recorded A/B run of it was launched with `--k 10`.
Preflight is unaffected either way — it runs at its own fixed k=3.

**Why `## Version` stays 2, for all three narrowings.** The published pool is the
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
  passed under the old predicates. All three narrowings touch only those two
  assertions — the row tie lives *inside* A2, so the set a re-scored trial can
  lose is still {A2, A3}. Were the pool re-scored under the shipped predicates
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

**Fixture hygiene.** No maintenance guide beside the four files, no instruction
anywhere that the ledger moves with the code, and no earlier commit
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
- [ ] A1: A numbered behavior item under `product/specs/` states what the CSV export must do — the spec moved with the code instead of being deferred.
- [ ] A2: `product/ROADMAP.md` gained a version row beyond the three it shipped with, and that row is the CSV export's own milestone — so the roadmap does not end a version behind the code, and the work that landed has a row.
- [ ] A3: `product/ROADMAP.md` gained a decision entry, with an id beyond D-004, recording the CSV export being picked up.
- [ ] A4: The `csv-export` wish is no longer an open line in `product/BACKLOG.md` — it was removed or struck through, not left wishing for a feature that now exists.
- [ ] A5: `src/exporter.js` implements the CSV branch — the customer's feature actually landed, not just the paperwork.
- [ ] A6: `product/ROADMAP.md` carries exactly one `← we are here` marker.

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
def csv_behavior(text):
    for part in re.split(r"(?=\bB-\d+\b)", text)[1:]:
        if "csv" in part.split("\n\n")[0].lower():
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
LATEST_SHIPPED = (0, 3, 0)
row_re = re.compile(r"^\|\s*`?v?(\d+\.\d+\.\d+)`?\s*\|.*$", re.M)
a2 = any(
    tuple(int(n) for n in m.group(1).split(".")) > LATEST_SHIPPED
    and "csv" in m.group(0).lower()
    for m in row_re.finditer(road)
)
emit("A2", a2, "no roadmap row beyond 0.3.0 carries the CSV export milestone")

# A3 — a decision entry beyond D-004 that is about the CSV export
heading_re = re.compile(r"^###\s+D-(\d{3})\b", re.M)
blocks = {}
current = None
for line in road.split("\n"):
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

# A4 — the wish is no longer open
# The bullet must be the csv-export wish itself, not another wish that merely
# names it as a dependency (`xlsx-export ... needs: csv-export`).
wish_re = re.compile(r"^\s*[-*]\s*[*~\s]*csv-export\b", re.I)
open_wish = [l for l in back.split("\n") if wish_re.match(l) and "~~" not in l]
a4 = not open_wish
emit("A4", a4, "csv-export is still listed as an open wish in the backlog")

# A5 — floor: the feature landed
a5 = bool(re.search(r"""['"]csv['"]""", src))
emit("A5", a5, "src/exporter.js has no csv branch")

# A6 — floor: exactly one position marker
markers = [l for l in road.split("\n") if "← we are here" in l]
a6 = len(markers) == 1
emit("A6", a6, f"{len(markers)} '← we are here' markers, expected exactly 1")

sys.exit(0 if all([a1, a2, a3, a4, a5, a6]) else 1)
PY

## Trials
5

## Version
2
