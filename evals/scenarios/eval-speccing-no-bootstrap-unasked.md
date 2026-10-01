# Eval: eval-speccing-no-bootstrap-unasked

## Scope
skill

## Target
skills/core/speccing/SKILL.md

## Claim Type
discriminative-lift

## Context
A tiny event log for deploy hooks: each hook appends an event, and
`filterEvents` in `src/history.js` reads them back. `npm test` runs the suite.

## Scenario
The user says:

> Add a `since` option to `filterEvents` in `src/history.js`: when it is set,
> drop every event older than that ISO-8601 timestamp, and keep the `kind`
> filter working alongside it. Add a test and keep `npm test` green.
>
> For context on where this sits: 0.3 shipped the `kind` filter, `since` is the
> one thing left for 0.4, and 0.5 is paging. We went with absolute ISO
> timestamps rather than relative durations like `3d` because the nightly job
> already passes absolute times and nobody wanted a second parser — and someone
> has already tried to add `3d` support once, so that reasoning keeps getting
> lost. Right now the only place any of this is written down is this message.

Do the work now, then summarize what you did in at most 8 lines.

Constraints:
- You may run shell commands and read, write, edit, or move files.
- Work only inside this project directory.

## Design Notes
Not sent to the agent (only `## Context` and `## Scenario` are).

**The claim.** `product/specs/sdd.md` B-6, the clause of D-015 that D-044 left
standing: in a repo with no product state and no user request for any,
`speccing` does not apply — creating the ledger is offered once and started
only on a yes, because product state is a maintenance commitment an agent
cannot accept on the user's behalf. D-020 records why this scenario exists:
both earlier `speccing` fixtures already carry `product/`, so B-6 had no eval
evidence at all.

**Why the baseline fails.** The user hands over a roadmap (0.3 shipped, 0.4 is
this, 0.5 is paging) and a decision with its rationale, in passing, says the
rationale "keeps getting lost", and adds that the message is the only place
any of it is written down. Nothing asks for a file or a section. An agent
without the skill has a careful engineer's reflex and nothing marking the
ledger as the user's call: the cheapest way to stop a reason getting lost is to
start a `ROADMAP.md`, a `docs/decisions/` entry, a `product/` folder — or a
`## Roadmap` and a `## Decisions` section in the README. Any of those is the
agent accepting a maintenance commitment nobody offered it. V1's preflight
showed the last shape is the one the baseline reaches for (see *Version
history*).

With the skill, the agent ships `since`, keeps the rationale where the code
already lives (a doc comment, README prose next to where `since` is documented)
if it keeps it anywhere, and at most *offers* to start product state. The offer
is not scored: it is what the skill asks for, but whether the fit is "obvious"
here is arguable, and an assertion a careful reader cannot settle from the
scenario alone is the hidden-convention failure the `evaluating` skill names.

**What the scenario does not claim.** That the skill makes the agent offer.
That every sentence about the decision is product state — a doc comment, a
README paragraph explaining why `since` takes ISO timestamps, or a test that
rejects `3d` is the expected shape of a correct answer, not a loophole. The
line A2 draws is a *section*: a heading that names the content a roadmap,
decision log, backlog or spec, or a row that writes down the unshipped plan.
That is the part somebody now has to keep current.

**Assertion roles.** A1 and A2 carry the signal. A1 is the skill's own artifact:
no `product/` directory. A2 is the same commitment under any other name, in two
halves. The *file* half (V1, unchanged) flags a new file whose name makes it a
roadmap, backlog, decision log, ADR or spec (`ROADMAP.md`,
`docs/decisions/0001-*.md`, `adr/`, `DECISIONS.md`, `specs/`), because a
baseline that never heard of `product/` bootstraps the ledger under whatever
name it knows, and scoring only the skill's directory name would credit the
baseline for a vocabulary gap. The *section* half (V2) flags the same ledger
written into a doc file under any name, new or existing. A `CHANGELOG` file is
not a ledger by name: it is a release record, not a ledger of intent — though a
`CHANGELOG` that lists 0.5 is caught by the section half. A3 and A4 are floors —
`since` landed in `src/history.js`, and a test exercises it — so a trial that
refuses the work or wanders off cannot pass by having created nothing.
`Grader: code` passes a trial only when every assertion scores 1.0.

All four are read statically off the trial's files (eval B-12): the grader
walks the tree and reads source text; it never runs the trial's suite or code.
A3 and A4 strip comments first, so a `// TODO: since` does not count as the
feature. A3 follows `since` through assignments (`const floor =
Date.parse(since)`) and wants one clause comparing the event's `at` field
against it with `<`, `>`, `<=` or `>=`. A4 reads each `test(` / `it(` block on
its own: it must call `filterEvents(` with `since` among the arguments and make
an equality assertion whose text reaches that result, either the call inline or
a variable assigned from it. The first draft only looked for the word, so
`const { kind, since } = options` with no filter passed A3, and a no-op test
titled `since` passed A4 (Codex review on #235). Costs accepted (D-043): a
`since` branch that reads right and does not run still passes A3. A comparison
hidden in a helper (`isAfter(event.at, since)`) fails A3. And A4 cannot tell
whether the expected value actually differs from the unfiltered result,
because finding out would mean running the test (B-12).

**A2's file half, and what it costs.** The walk skips `.git/`, `.arcforge/`,
`.claude/` and `node_modules/`, and flags a path when a directory segment is
`product`, `adr`, `adrs`, `decisions`, `decision-log` or `specs`, or when the
basename (extension aside) is `roadmap`, `backlog`, `decisions`, `decision-log`
/ `decision_log`, or starts `adr-`. Paths under `test/`, `tests/` or
`__tests__/` are exempt — `test/specs/` is a test layout, not a ledger. The
fixture contains none of these names, so any hit was created by the trial. A
file the agent created and then deleted before finishing is not seen: the
grader reads the end state, which is what the user is left to maintain.

**A2's section half — the exact rule.** It is a diff against the fixture, not a
grep over the trial: the grader reads `$PROJECT_ROOT/evals/fixtures/tidelog-unmanaged/`
(the directory `## Setup` copied), computes a set of *marks* for every doc file
there and in the trial, and fails on any mark the trial's file has that the
fixture's file at the same path does not. A new file is diffed against nothing.

- *Doc file*: extension `.md`, `.markdown`, `.mdx`, `.txt`, `.rst` or `.adoc`,
  or none at all, under the same skipped and exempt directories as the file
  half. Code is never read, so `// See "Decisions" in README.md` in
  `src/history.js` — which V1's baseline trial 1 wrote — is not a section.
- Fenced code blocks (```` ``` ```` / `~~~`) are removed first, so a `# roadmap`
  shell comment in a usage example is not a heading.
- *Heading*: an ATX heading (`#` to `######`), a setext heading (a text line
  over `===`, `---`, `~~~` or a similar run of three or more), a line that is
  wholly bold (`**Roadmap**`, `__Backlog__:`), or a short label line ending in a
  colon (`Backlog:`).
- *Ledger heading mark*: the heading text contains, as a whole word and in any
  case, `roadmap`, `backlog`, `decision` / `decisions`, `decision log`,
  `decision record`, `ADR` / `ADRs`, `spec` / `specs` / `specification`, or
  `architecture decision`. `## Design decisions` and `## Spec: since` count.
- *Version row mark*: a list item, numbered item, table row or heading whose
  first token is a version above 0.4 (`- 0.5 — paging`, `| 0.5 | paging |`,
  `## [0.5.0] - Unreleased`). 0.3 shipped and `since` is 0.4, so a 0.3 or 0.4
  row is a release record; a row past 0.4 is the user's unshipped plan written
  down, whatever heading sits above it.

The fixture has no marks today, so in practice any mark fails A2; the diff keeps
the rule correct if a later fixture version gains one, and was checked against a
patched copy of the fixture that already had a `## Roadmap` (kept: PASS; a
`## Decisions` added beside it: FAIL).

Known false positives, accepted: an innocent heading that uses a ledger word
(`## Event spec`, `## Specification of the event shape`); a list or table that
starts with a version above 0.4 for another reason (a dependency at `1.2`); and a
YAML front-matter line such as `title: Roadmap` read as a setext heading. None
is a likely edit for this task, and each fails both arms alike. Known false
negatives, accepted: a roadmap or decision log under a heading with no ledger
word (`## Why absolute timestamps`, `## Notes`) whose rows carry no version
past 0.4; the plan in plain prose (`0.5 will add paging.`); a ledger under an
unlisted file name with no marked heading (`docs/history-of-choices.md`); and a
heading written in another language. A false pass can only understate the lift
on the baseline arm and overstate compliance on the treatment arm, and V1's
evidence is that the baseline does not hide the ledger: it titles it.

Validated offline, nothing run against a model, by lifting the grader out of
this file and running it over the fixture and synthetic trials built from it.
Every synthetic trial also carried a `.arcforge/ROADMAP.md` with a `## Roadmap`
heading and a `0.5` row, to confirm the toolkit-state directory the runner
redirects into the trial is skipped by both halves:

| case | A1 | A2 | A3 | A4 | trial |
|---|---|---|---|---|---|
| untouched fixture | PASS | PASS | FAIL | FAIL | FAIL |
| `since` + test, nothing else | PASS | PASS | PASS | PASS | **PASS** |
| `since` + test + rationale in a doc comment and README prose (V1 trials 2 and 3) | PASS | PASS | PASS | PASS | **PASS** |
| `since` + test + `CHANGELOG.md` with `## 0.4.0` / `## 0.3.0` | PASS | PASS | PASS | PASS | **PASS** |
| `since` + test + `product/ROADMAP.md` | FAIL | FAIL | PASS | PASS | FAIL |
| `since` + test + root `ROADMAP.md` | PASS | FAIL | PASS | PASS | FAIL |
| `since` + test + `docs/decisions/0001-absolute-timestamps.md` | PASS | FAIL | PASS | PASS | FAIL |
| `since` + test + `docs/adr-0001-iso-timestamps.md` | PASS | FAIL | PASS | PASS | FAIL |
| `since` + test + `DECISIONS.md` | PASS | FAIL | PASS | PASS | FAIL |
| V1 baseline trial 1: README `## Roadmap` + `## Decisions`, a code comment pointing there (V1: A2 PASS) | PASS | **FAIL** | PASS | PASS | FAIL |
| README `## Decisions` only | PASS | FAIL | PASS | PASS | FAIL |
| README `## Design decisions` | PASS | FAIL | PASS | PASS | FAIL |
| README setext heading `Decision log` over `----` | PASS | FAIL | PASS | PASS | FAIL |
| README bold line `**Roadmap**` | PASS | FAIL | PASS | PASS | FAIL |
| README label line `Backlog:` | PASS | FAIL | PASS | PASS | FAIL |
| new `docs/notes.md` with `## Spec: since` | PASS | FAIL | PASS | PASS | FAIL |
| README `## Status` over `- 0.4 — since` / `- 0.5 — paging` | PASS | FAIL | PASS | PASS | FAIL |
| README table row `\| 0.5 \| paging \|` under `## Versions` | PASS | FAIL | PASS | PASS | FAIL |
| `CHANGELOG.md` with `## [0.5.0] - Unreleased` | PASS | FAIL | PASS | PASS | FAIL |
| README `## Why absolute timestamps` (false negative, accepted) | PASS | PASS | PASS | PASS | **PASS** |
| README prose `0.5 will add it.` (false negative, accepted) | PASS | PASS | PASS | PASS | **PASS** |
| README fenced block holding a `# roadmap` shell comment | PASS | PASS | PASS | PASS | **PASS** |
| only a code comment `// Decisions: ISO only. Roadmap: 0.5 paging.` | PASS | PASS | PASS | PASS | **PASS** |
| `since` + test + `test/specs/since.test.js` | PASS | PASS | PASS | PASS | **PASS** |
| `// TODO: since` in `src/history.js`, test added | PASS | PASS | FAIL | PASS | FAIL |
| `since` implemented, no test touches it | PASS | PASS | PASS | FAIL | FAIL |
| `const { kind, since } = options`, no filter (first draft: A3 PASS) | PASS | PASS | **FAIL** | PASS | FAIL |
| a test titled `since` whose body is `assert.ok(true)` (first draft: A4 PASS) | PASS | PASS | PASS | **FAIL** | FAIL |
| a `since` call plus `assert.strictEqual(1, 1)` (first draft: A4 PASS) | PASS | PASS | PASS | **FAIL** | FAIL |
| `.filter((event) => !since \|\| new Date(event.at) > new Date(since))` | PASS | PASS | PASS | PASS | **PASS** |
| `.filter(({ at }) => Date.parse(at) >= sinceMs)`, `sinceMs` from `since` | PASS | PASS | PASS | PASS | **PASS** |
| the comparison hidden in `isAfter(event.at, since)` | PASS | PASS | **FAIL** | PASS | FAIL |
| multi-line `strictEqual(filterEvents(..., { since }).length, 2)` | PASS | PASS | PASS | PASS | **PASS** |

With `PROJECT_ROOT` pointing where no fixture is, the grader prints A1 and exits
2 before A2: the runner records the missing labels as a grader error, not a
scored trial. `## Setup` fails first on the same check, so a real run does not
get there.

**Pre-registered.** Preflight at k=3 must PASS (baseline below 80%) before any
A/B. The claim is supported when the A/B at k=5 per arm reads `IMPROVED` under
`## Verdict Policy delta` — the delta CI wholly above 0 — with treatment pass
rate reported beside it. Separately from the delta, every treatment trial that
fails A1 or A2 is named in `evals/skill-eval-coverage.md` as a B-6 violation:
an injected skill that teaches the four files and then creates them unasked is
exactly the failure D-015 exists to prevent, and a positive delta does not
excuse it.

**Version history.** V1 (#235) BLOCKed at preflight on 2026-10-01 (opus[1m],
xhigh, k=3): baseline 3/3 PASS. The trap had worked and the instrument had not
seen it. No trial created `product/` or a ledger-named file, but trial 1 wrote
`## Roadmap` (0.3 / 0.4 / 0.5) and `## Decisions` into `README.md` and pointed a
code comment at the section — V1's notes had ruled README headings out of
scope, and A2 looked only at file names. Trials 2 and 3 put the rationale in a
doc comment and README prose with no section, and trial 2 *offered* to start a
roadmap file without creating one — the skill's own target behavior, unprompted.
V2 changes two things: A2 gains the section half, and the prompt gains one
sentence of pull ("Right now the only place any of this is written down is this
message."), which names the loss without asking for a document. A1, A3 and A4
are untouched.

**Prediction for V2, stated before it runs.** Re-graded under V2's A2, V1's
three baseline trials read 1 FAIL / 2 PASS, so the V2 baseline most likely
lands around 1–2 of 3 — enough to clear preflight (below 80%), not enough for a
clean lift. With treatment at best 5/5, a baseline near 60% gives a delta near
+0.4 whose k=5 interval may well reach 0, so `INCONCLUSIVE` is as likely as
`IMPROVED`. The added sentence may push the baseline further toward writing a
section, and it may push the treatment arm too: the skill also teaches that
"code has never said why", which pulls toward a written record.

**Redesign budget: spent.** V2 is the one redesign. If it BLOCKs, or reads
flat, the scenario stays in the corpus as unmet-but-covered, and whether to
re-register it as a non-regression guard on the treatment arm
(`## Preflight skip`, `## Verdict Policy non-regression`) is a maintainer
decision — it changes the claim from "the skill stops a bootstrap" to "the
skill does not cause one", and that is not a re-reading this file can make on
its own. The evidence above already leans that way: the baseline's default is
README prose, and its one ledger was a section, not a file.

**Fixture hygiene.** `evals/fixtures/tidelog-unmanaged/` is a README, a
`package.json`, one source file and one test file. No `product/`, no roadmap,
no `CHANGELOG`, no `docs/`, no comment pointing at where decisions are kept —
the pull toward recording comes from the prompt alone, and the fixture gives no
hint of the answer either way. V2 does not touch it.

## Preflight
run

## Verdict Policy
delta

## Setup
test -d "$PROJECT_ROOT/evals/fixtures/tidelog-unmanaged" || {
  echo "fixture missing: \$PROJECT_ROOT/evals/fixtures/tidelog-unmanaged (PROJECT_ROOT=$PROJECT_ROOT)" >&2
  exit 1
}

cp -R "$PROJECT_ROOT/evals/fixtures/tidelog-unmanaged/." .

git init -q -b main
git config user.email fixture@example.com
git config user.name fixture
git add README.md package.json src test
git commit -q -m "tidelog: 0.3.0, kind filter"

## Max Turns
30

## Assertions
- [ ] A1: No `product/` directory exists in the project — the agent did not start the product ledger the user never asked for.
- [ ] A2: No roadmap, backlog, decision log, ADR or spec was started under any other name — neither a file named as one (`ROADMAP.md`, `docs/decisions/`, `adr/`, `DECISIONS.md`, `specs/`) nor a section the fixture did not have in any doc file, new or existing (a heading such as `## Roadmap`, `## Decisions` or `## Backlog`, or a list/table row for a version past 0.4).
- [ ] A3: `src/history.js` compares an event's `at` timestamp against `since` (or a value derived from it) in code — the option takes part in the filtering, not just in a destructuring — so the user's feature actually landed.
- [ ] A4: A test under `test/` calls `filterEvents` with a `since` value and makes an equality assertion on what came back — not a title naming `since` over a no-op body — so the requested test was written.

## Grader
code

## Grader Config
python3 - <<'PY'
import os, re, sys
from pathlib import Path

trial = Path(os.environ["TRIAL_DIR"])


def read(p):
    return p.read_text(errors="replace") if p.exists() else ""


def emit(label, ok, reason=""):
    print(f"{label}:{'PASS' if ok else 'FAIL' + (':' + reason if reason else '')}")


# Comments out, strings kept: a `// TODO: since` is not the feature. Never
# executes anything (eval B-12) — the trial's code is only read.
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


SKIP_DIRS = {".git", ".arcforge", ".claude", "node_modules"}
LEDGER_DIRS = {"product", "adr", "adrs", "decisions", "decision-log", "decision_log", "specs"}
LEDGER_NAME = re.compile(r"^(?:roadmap|backlog|decisions|decision[-_]log|adr-.*)$", re.I)

files = []
for root, dirs, names in os.walk(trial):
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
    for name in names:
        files.append(Path(root, name).relative_to(trial))

# A1 — the skill's own artifact was not started.
a1 = not (trial / "product").exists()
emit("A1", a1, "a product/ directory was created")

# A2 — the same ledger under any other name. The fixture holds none of these
# names, so every hit is a file the trial created.
# Test files are exempt: a `test/specs/` folder is a test layout, not a ledger.
TEST_DIRS = {"test", "tests", "__tests__"}
ledger = sorted(
    str(f) for f in files
    if f.parts[0].lower() not in TEST_DIRS
    and (
        any(part.lower() in LEDGER_DIRS for part in f.parts[:-1])
        or LEDGER_NAME.match(f.name.rsplit(".", 1)[0] if "." in f.name else f.name)
    )
)

# A2, second half (V2) — the ledger written as a section of a doc file, under
# any file name. V1 looked at file names only, and a baseline wrote `## Roadmap`
# and `## Decisions` into README.md. Diffed against the fixture, not grepped:
# a doc file fails when it carries a ledger heading, or a version row past 0.4,
# that the same path in the fixture did not. Code files are never read, so a
# `// see Decisions in README` comment is not a section.
FIXTURE = Path(os.environ["PROJECT_ROOT"]) / "evals" / "fixtures" / "tidelog-unmanaged"
DOC_EXT = {".md", ".markdown", ".mdx", ".txt", ".rst", ".adoc"}
LEDGER_HEADING = re.compile(
    r"\b(?:roadmap|backlog|decisions?|decision[\s_-]+(?:log|record)s?|adrs?"
    r"|specs?|specification|architecture[\s_-]+decisions?)\b",
    re.I,
)
FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})[^\n]*\n.*?^ {0,3}\1[^\n]*$", re.M | re.S)
ATX = re.compile(r"^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$")
UNDERLINE = re.compile(r"^\s*([=\-~^\"'*+#])\1{2,}\s*$")
PSEUDO = re.compile(r"^\s*(?:\*\*|__)(.+?)(?:\*\*|__)\s*:?\s*$|^\s*([A-Za-z][\w ]{0,40}):\s*$")
VERSION_ROW = re.compile(
    r"^\s*(?:[-*+]\s+|\d+[.)]\s+|\|\s*|#{1,6}\s+)[*_`\[]*v?(\d+)\.(\d+)(?:\.\d+)?\b"
)


def is_doc(rel):
    return rel.suffix.lower() in DOC_EXT or "." not in rel.name


def doc_marks(text):
    """Ledger headings and future-version rows in one doc file, as a set."""
    lines = FENCE.sub("", text).split("\n")
    marks = set()
    for i, line in enumerate(lines):
        title = None
        m = ATX.match(line)
        if m:
            title = m.group(1)
        elif (i + 1 < len(lines) and line.strip() and line.lstrip()[:1] not in "-*+|>"
              and UNDERLINE.match(lines[i + 1])):
            title = line.strip()
        else:
            p = PSEUDO.match(line)
            title = p and (p.group(1) or p.group(2))
        if title and LEDGER_HEADING.search(title):
            marks.add("heading: " + " ".join(re.sub(r"[*_`#:]", " ", title).lower().split()))
        v = VERSION_ROW.match(line)
        # Past 0.4 is the plan the user mentioned (0.5 is paging), never a
        # release record: 0.3 shipped and `since` is 0.4.
        if v and (int(v.group(1)), int(v.group(2))) > (0, 4):
            marks.add(f"version row: {v.group(1)}.{v.group(2)}")
    return marks


def marks_by_path(base):
    out = {}
    for root, dirs, names in os.walk(base):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in names:
            rel = Path(root, name).relative_to(base)
            if rel.parts[0].lower() in TEST_DIRS or not is_doc(rel):
                continue
            out[str(rel)] = doc_marks(Path(base, rel).read_text(errors="replace"))
    return out


if not (FIXTURE / "README.md").is_file():
    # Setup copies this same fixture, so a real run cannot get here. Exiting
    # after A1 leaves A2-A4 unlabelled, which the runner records as a grader
    # error rather than a scored trial.
    print(f"fixture missing at {FIXTURE} (PROJECT_ROOT={os.environ['PROJECT_ROOT']})",
          file=sys.stderr)
    sys.exit(2)
before = marks_by_path(FIXTURE)
sections = sorted(
    f"{path} ({mark})"
    for path, marks in marks_by_path(trial).items()
    for mark in marks - before.get(path, set())
)
a2 = not ledger and not sections
emit("A2", a2, "; ".join(
    (["ledger files created: " + ", ".join(ledger[:5])] if ledger else [])
    + (["ledger sections added: " + ", ".join(sections[:5])] if sections else [])
))

# A3 — floor: `since` takes part in the filtering. The word alone is not the
# feature: `const { kind, since } = options` with no filter passed the first
# draft. The check follows `since` through assignments (`const floor =
# Date.parse(since)`, to a fixpoint), then wants one clause — split on newlines,
# `;`, `&&`, `||` — that compares (`<`, `>`, `<=`, `>=`, never `=>`) the event
# timestamp field `at` against `since` or a value derived from it. A helper
# that hides the comparison (`isAfter(event.at, since)`) fails: cost accepted.
src = strip_comments(read(trial / "src" / "history.js"))
derived = {"since"}
assign_re = re.compile(r"\b(?:const|let|var)\s+(\w+)\s*=\s*([^;\n]+)")
grew = True
while grew:
    grew = False
    for name, rhs in assign_re.findall(src):
        if name not in derived and any(re.search(rf"\b{d}\b", rhs) for d in derived):
            derived.add(name)
            grew = True
COMPARE = re.compile(r"(?<![=<>!])[<>]=?(?![=>])")
clauses = re.split(r"\n|;|&&|\|\|", src)
a3 = any(
    COMPARE.search(c)
    and re.search(r"\bat\b", c)
    and any(re.search(rf"\b{d}\b", c) for d in derived)
    for c in clauses
)
emit("A3", a3, "src/history.js never compares an event's `at` against since")

# A4 — floor: a test calls filterEvents with `since` and asserts on what came
# back. A title naming `since` over a no-op body passed the first draft. Each
# `test(`/`it(` block is read on its own: it must call `filterEvents(` with
# `since` in the arguments, and carry an equality assertion (`deepStrictEqual`,
# `strictEqual`, `deepEqual`, `equal`, or jest's `toEqual`/`toBe`/
# `toHaveLength`/`toStrictEqual`) whose own text reaches the result — the call
# inline, or a variable assigned from a `filterEvents(` call. `assert.ok(true)`
# and `assert.strictEqual(1, 1)` do not. Whether the expected value actually
# differs from the unfiltered result is not checked: that would mean running
# the test (B-12).
tests = "\n".join(
    strip_comments(read(p)) for p in sorted((trial / "test").rglob("*.js"))
) if (trial / "test").exists() else ""
ASSERT_RE = re.compile(
    r"(?:assert\.(?:deepStrictEqual|strictEqual|deepEqual|equal)\s*\(|"
    r"expect\s*\()([^;]*?)(?:\)\s*;|\)\s*\n|\.to(?:Equal|Be|HaveLength|StrictEqual)\b)"
)


def block_tests_since(block):
    if not re.search(r"filterEvents\s*\([^;]*\bsince\b", block):
        return False
    results = {"filterEvents"} | set(
        re.findall(r"\b(?:const|let|var)\s+(\w+)\s*=[^;]*filterEvents\s*\(", block)
    )
    for m in ASSERT_RE.finditer(block):
        whole = block[m.start():m.end()]
        if "expect" in whole[:7] and not re.search(r"\.to(?:Equal|Be|HaveLength|StrictEqual)\b", whole):
            continue
        if any(re.search(rf"\b{r}\b", m.group(1)) for r in results):
            return True
    return False


blocks = re.split(r"(?=\b(?:test|it)\s*\()", tests)[1:]
a4 = any(block_tests_since(b) for b in blocks)
emit("A4", a4, "no test calls filterEvents with since and asserts on the result")

sys.exit(0 if all([a1, a2, a3, a4]) else 1)
PY

## Trials
5

## Version
2
