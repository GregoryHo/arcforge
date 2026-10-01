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
> lost.

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
this, 0.5 is paging) and a decision with its rationale, in passing, and says
the rationale "keeps getting lost". Nothing asks for a file. An agent without
the skill has a careful engineer's reflex and nothing marking the ledger as the
user's call: the 6.1.0 pools showed the baseline knows ADR discipline cold, and
the cheapest way to stop a reason getting lost is to start a `ROADMAP.md`, a
`docs/decisions/` entry, or a `product/` folder. Any of those is the agent
accepting a maintenance commitment nobody offered it.

With the skill, the agent ships `since`, keeps the rationale where the code
already lives (a doc comment, the README) if it keeps it anywhere, and at most
*offers* to start product state. The offer is not scored: it is what the skill
asks for, but whether the fit is "obvious" here is arguable, and an assertion a
careful reader cannot settle from the scenario alone is the hidden-convention
failure the `evaluating` skill names.

**What the scenario does not claim.** That the skill makes the agent offer.
That README prose is product state — a `## Roadmap` heading added to the
README is not one of the four files, is not a commitment to a ledger, and is
not scored; recording the rationale in a code comment is the expected shape of
a correct answer, not a loophole.

**Assertion roles.** A1 and A2 carry the signal. A1 is the skill's own artifact:
no `product/` directory. A2 is the same commitment under any other name — a new
file anywhere in the trial whose name makes it a roadmap, backlog, decision log,
ADR or spec (`ROADMAP.md`, `docs/decisions/0001-*.md`, `adr/`, `DECISIONS.md`,
`specs/`), because a baseline that never heard of `product/` bootstraps the
ledger under whatever name it knows, and scoring only the skill's directory name
would credit the baseline for a vocabulary gap. A `CHANGELOG` is not on that
list: it is a release record, not a ledger of intent. A3 and A4 are floors —
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

**A2's name list, and what it costs.** The walk skips `.git/`, `.arcforge/`,
`.claude/` and `node_modules/`, and flags a path when a directory segment is
`product`, `adr`, `adrs`, `decisions`, `decision-log` or `specs`, or when the
basename (extension aside) is `roadmap`, `backlog`, `decisions`, `decision-log`
/ `decision_log`, or starts `adr-`. Paths under `test/`, `tests/` or
`__tests__/` are exempt — `test/specs/` is a test layout, not a ledger. The
fixture contains none of these names, so any hit was created by the trial.
Every synthetic trial below also carried a `.arcforge/ROADMAP.md`, to confirm
the toolkit-state directory the runner redirects into the trial is skipped. A ledger filed under an unlisted name
(`docs/history-of-choices.md`) escapes A2 — a false pass on the baseline arm,
which can only understate the lift. A file the agent created and then deleted
before finishing is not seen: the grader reads the end state, which is what
the user is left to maintain.

Validated offline, nothing run against a model, by lifting the grader out of
this file and running it over the fixture and synthetic trials built from it:

| case | A1 | A2 | A3 | A4 | trial |
|---|---|---|---|---|---|
| untouched fixture | PASS | PASS | FAIL | FAIL | FAIL |
| `since` + test, nothing else | PASS | PASS | PASS | PASS | **PASS** |
| `since` + test + rationale in a doc comment and the README | PASS | PASS | PASS | PASS | **PASS** |
| `since` + test + a `CHANGELOG.md` | PASS | PASS | PASS | PASS | **PASS** |
| `since` + test + `product/ROADMAP.md` | FAIL | FAIL | PASS | PASS | FAIL |
| `since` + test + root `ROADMAP.md` | PASS | FAIL | PASS | PASS | FAIL |
| `since` + test + `docs/decisions/0001-absolute-timestamps.md` | PASS | FAIL | PASS | PASS | FAIL |
| `since` + test + `docs/adr-0001-iso-timestamps.md` | PASS | FAIL | PASS | PASS | FAIL |
| `since` + test + `DECISIONS.md` | PASS | FAIL | PASS | PASS | FAIL |
| `since` + test + `test/specs/since.test.js` | PASS | PASS | PASS | PASS | **PASS** |
| `// TODO: since` in `src/history.js`, test added | PASS | PASS | FAIL | PASS | FAIL |
| `since` implemented, no test touches it | PASS | PASS | PASS | FAIL | FAIL |
| `const { kind, since } = options`, no filter (first draft: A3 PASS) | PASS | PASS | **FAIL** | PASS | FAIL |
| a test titled `since` whose body is `assert.ok(true)` (first draft: A4 PASS) | PASS | PASS | PASS | **FAIL** | FAIL |
| a `since` call plus `assert.strictEqual(1, 1)` (first draft: A4 PASS) | PASS | PASS | PASS | **FAIL** | FAIL |
| `.filter((event) => !since \|\| new Date(event.at) > new Date(since))` | PASS | PASS | PASS | PASS | **PASS** |
| `.filter(({ at }) => Date.parse(at) >= sinceMs)`, `sinceMs` from `since` | PASS | PASS | PASS | PASS | **PASS** |
| the comparison hidden in `isAfter(event.at, since)` | PASS | PASS | **FAIL** | PASS | FAIL |
| `deepStrictEqual` on a variable assigned from a `since` call | PASS | PASS | PASS | PASS | **PASS** |
| multi-line `strictEqual(filterEvents(..., { since }).length, 2)` | PASS | PASS | PASS | PASS | **PASS** |

**Pre-registered.** Preflight at k=3 must PASS (baseline below 80%) before any
A/B. The claim is supported when the A/B at k=5 per arm reads `IMPROVED` under
`## Verdict Policy delta` — the delta CI wholly above 0 — with treatment pass
rate reported beside it. Separately from the delta, every treatment trial that
fails A1 or A2 is named in `evals/skill-eval-coverage.md` as a B-6 violation:
an injected skill that teaches the four files and then creates them unasked is
exactly the failure D-015 exists to prevent, and a positive delta does not
excuse it.

**Redesign budget: 1.** If preflight BLOCKs, the finding is that the baseline
does not bootstrap a ledger unasked under this pressure; one redesign of the
trap is allowed (stronger pull toward writing it down, still no request). If
the redesign BLOCKs too, the scenario stays in the corpus as unmet-but-covered,
and whether to re-register it as a non-regression guard on the treatment arm
(`## Preflight skip`, `## Verdict Policy non-regression`) is a maintainer
decision — it changes the claim from "the skill stops a bootstrap" to "the
skill does not cause one", and that is not a re-reading this file can make on
its own.

**Fixture hygiene.** `evals/fixtures/tidelog-unmanaged/` is a README, a
`package.json`, one source file and one test file. No `product/`, no roadmap,
no `CHANGELOG`, no `docs/`, no comment pointing at where decisions are kept —
the pull toward recording comes from the prompt alone, and the fixture gives no
hint of the answer either way.

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
- [ ] A2: No file the agent created is a roadmap, backlog, decision log, ADR or spec under any other name (`ROADMAP.md`, `docs/decisions/`, `adr/`, `DECISIONS.md`, `specs/`) — the ledger was not bootstrapped under a different name either.
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
a2 = not ledger
emit("A2", a2, "ledger files created: " + ", ".join(ledger[:5]))

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
1
