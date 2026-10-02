# Eval: eval-router-skill-selection

## Scope
skill

## Target
skills/core/using/SKILL.md

## Context
A small JavaScript package. The current branch is `feat-slugify`, the base branch is `main`, and the suite runs with `npm test`. The repository has no remote.

## Scenario
The user says:

> feat-slugify is finished and the suite is green. Merge it into main.

Do the work now, then summarize what you did.

## Design Notes
Not sent to the agent (only `## Context` and `## Scenario` reach it) — this
section is for whoever maintains the scenario.

**The claim.** Skill **selection** when two rows of the Skill Map both have a
claim on the request. The router's precedence paragraph says it in one
sentence: *"Discipline rows outrank wrap-up rows: if a defect is reported or
code is untested, `/tdd` or `/debugging` applies even when the work is
described as finished — `/finishing` presumes nothing is known to be wrong."*
`/tdd`'s own row covers "found code with no test". V1 measured the first half
of that sentence (a reported defect). V2 measures the second half (untested
code), with the same package, the same two rows, and the same target skill.

**What V1's baseline did (preflight BLOCK, 2026-09-30, opus[1m], xhigh, k=3,
hash `87dd77d26e724fb5`, run `20260930-105806`, 3/3 PASS).** V1 reported a
defect (`slugify(null)` throws) and called the branch "finished apart from
that". All three baseline trials read `src/` and `test/`, ran the suite,
appended a null test with a Bash heredoc, ran it red (`TypeError … reading
'trim'`), applied the one-line guard with `Edit`, and ran green — test first,
every time, with no router. None merged: trials 1 and 3 *offered* to commit and
merge, and trial 2 committed on `feat-slugify` and left the merge to the user.
A reported bug is work that this model treats as work unprompted, so "defect
reported → discipline, not wrap-up" is generic competence here, and V1 cannot
tell the router from its absence. (All three trials wrote the test through a
Bash heredoc, not `Edit`, which V1's `[tool_before] Edit:re:test/ <
Edit:re:src/` cannot see — another reason V2 grades the repo rather than tool
names.)

V1's baseline also shows the trap V2 uses. Every trial took the user's
"finished" at its word: trial 1 — *"Since you said the branch is otherwise
finished, should I commit the fix and merge…"*; trial 2 — *"You said the
branch is done apart from this, so I'll commit"*; trial 3 — *"You said the
branch is otherwise finished, so if you want I can … merge it into main"*. No
trial asked whether anything else on the branch lacked a test; the green suite
plus the user's word was the whole audit. In V1 that cost nothing, because
everything else on the branch was tested.

**What changed.** No defect is reported. The user says the branch is finished
and the suite is green, and asks for the merge. Both statements are true. The
branch's second commit, `feat: uniqueSlug for duplicate titles`, adds
`src/unique-slug.js` — an exported function — and no test; `git log --stat`
shows that commit touching `src/` only, and `test/` has a file for `slugify`
and nothing for `uniqueSlug`. The function is correct, so a test written for it
passes; nothing about the task is hidden, and nothing makes the merge itself
wrong once the function is covered. The `[tool_*]` assertions and the
model-graded A1/A2 of V1 are gone: the new claim is settled off the repo.

**Baseline-failure sentence.** Given a merge request on a branch whose suite is
green and whose last commit added an exported function with no test, an agent
without the router will run the suite, see green, and merge `feat-slugify`
into `main`, because the user said the branch is finished and a green suite
reads as confirmation — the false green, which V1's trials show this model
accepting at face value. **With the router**, the request matches `/finishing`,
and the precedence paragraph names the condition that overrides it: code is
untested, so `/tdd` applies first, and `uniqueSlug` gets a test before anything
reaches `main`. Merging afterwards is fine; the user asked for it.

**Leak check.** The prompt does not name testing, coverage, a discipline, or
`uniqueSlug`. "The suite is green" is the bait, and it is true. The fixture's
commit message describes the feature, not the gap. A reader who ignored the
files would merge.

**Assertions — both code-graded off the trial's git repo, never off the
transcript.** The grader reads git objects (`reflog`, `ls-tree`, `cat-file`)
and the working tree; it runs nothing the trial wrote (eval B-12).

- **A1 carries the signal: `uniqueSlug` never reached `main` without a test.**
  The grader reads `main`'s reflog — every value the branch held, so a
  fast-forward, a `--no-ff` merge, a committed squash, a cherry-pick, a
  `git -C <path> merge` and a `branch -f` are all seen — and fails if any of
  those commits carries a non-test `.js` file using `uniqueSlug` without a test
  that exercises it. When `HEAD` is `main`, the working tree is checked the same
  way, so an uncommitted `merge --squash` counts. A merge followed by a test
  added on `main` afterwards still fails: `main` held untested code in between,
  which is the integration the router says not to do. Not merging at all passes
  A1.
- **A2 is the floor: a test that exercises `uniqueSlug` exists** — in the
  working tree or at any local branch tip. Without it, an agent that did
  nothing, or stopped to ask, would pass A1. "Exercises" is read statically,
  per test file, with comments and string contents removed: the file calls
  `uniqueSlug(` (or a name it was destructured to), and some assertion's
  arguments reach what came back — they call `uniqueSlug(` themselves, or name
  an identifier from a statement that calls it (the variable it was assigned
  to, the array it was pushed into, the loop variable fed to it). An assertion
  is any `node:assert` spelling — `assert(…)`, `assert.<anything>(…)`,
  `t.assert.<anything>(…)`, a destructured `strictEqual(…)` / `ok(…)` /
  `match(…)` and kin — or a jest `expect(…)` followed by a matcher. So
  `assert.ok(true)` under a `uniqueSlug` title, `uniqueSlug('a', [])` beside
  `assert.strictEqual(1, 1)`, and `typeof uniqueSlug === 'function'` do not
  count. A test file is any `.js` under `test/`, `tests/` or `__tests__/`, or
  any `*.test.js` / `*.spec.js`. A1 uses the same check, so a test that passes
  A2 is also what A1 accepts as cover.

`Grader: code` passes a trial only when both score 1.

**How the likely outcomes score, and why that is fair.** The fixture is not
hidden: V1's baselines opened with `git log --oneline --stat` or
`git show --stat HEAD`, which here shows the last commit touching
`src/unique-slug.js` alone, and they flagged adjacent issues unprompted (V1
trial 2: *"Other non-string inputs, such as numbers, still throw"*). So both
arms will often *see* the gap. Seeing it is not scored; acting on it is.

| what the trial does | A1 | A2 | trial |
|---|---|---|---|
| merges without a word about `uniqueSlug` | FAIL | FAIL | FAIL |
| notes `uniqueSlug` has no test, merges anyway | FAIL | FAIL | FAIL |
| notes the gap, writes no test, stops to ask or offers | PASS | FAIL | FAIL |
| writes a test for `uniqueSlug`, then merges (or leaves the merge) | PASS | PASS | PASS |
| merges, then adds the test on `main` | FAIL | PASS | FAIL |

Both arms are held to this one table. The row that matters for fairness is
"stops to ask": the router does not say "warn the user", it says `/tdd`
*applies* even when the work is described as finished, and the `/tdd` row is
"found code with no test" — the work it routes to is writing that test. The
prompt says *"Do the work now"*, and a headless session gets no answer to a
question. Scoring the question as a pass would also credit the baseline's own
V1 habit of flagging a problem and offering to fix it, so the arms would be
compared on noticing rather than acting, and the scenario would stop
discriminating. A baseline that writes the test unprompted passes, which is
correct: then the behavior is generic competence and the preflight BLOCKs.

**What the scenario does not claim.** That the router makes the agent merge,
or not merge; either passes once the function is covered. That the agent names
`/tdd`; naming is not scored. That autonomous triggering works: a headless
`claude -p` session exposes no `Skill` tool (`eval-d1-bare-cli-invocation.md`),
and treatment reaches the router by `--skill-file` injection, so the result
speaks to the table's wording, not its discoverability. Router trigger rate is
P6's acceptance criterion, measured there.

**Costs accepted.** A1 trusts `main`'s reflog; an agent that deletes `main` and
recreates it, or rewrites `.git/logs`, is not followed (both are far from this
task, and the grader fails A1 closed when the reflog is missing). The test
check is static and leans lenient, because a false negative here lands on the
treatment arm: a test that reads right and would fail at runtime passes; the
link from call to assertion is co-occurrence in one `;`-delimited statement,
not data flow, so in a file written without semicolons nearly every name is
linked, and a contrived file that calls `uniqueSlug` without asserting on it
but asserts on a same-named variable elsewhere would pass. A value passed
through two variables before the assertion (`const a = uniqueSlug(…); const
b = a.trim(); assert.equal(b, …)` with the call and `b` in different
statements) is not linked and fails. None of these is a shape a model writes
by default. Ordering inside `/tdd` — whether the new test was run before the
merge — is not scored: the code already exists, so there is no red-first step
to order, and the claim is about which row wins. A missing git repository makes
the grader exit 2 with no labels, which the engine scores as an ordinary FAIL
rather than a grader error; `## Setup` always creates the repository.

**Validated offline, nothing run against a model.** Each case below was built
with the engine's own `createTrialDir` + `runSetup` (so `## Setup` runs over
the harness's pre-made `.git` boundary, as in a real trial), mutated, checked
green with `npm test` (except the two jest-syntax rows, graded statically), and
graded with `gradeWithCode`. 32 of 32 matched. The first revision of this
grader accepted only literal `assert.<equality>(` / `expect(` and direct
`const x = uniqueSlug(…)`, and failed both A1 and A2 on the three
review-reported shapes (push accumulator, destructured `strictEqual`,
`assert(x === y)`) after a correct test-then-merge; those rows now pass.

| case | A1 | A2 | trial |
|---|---|---|---|
| untouched fixture (also: flags the gap and asks, nothing written) | PASS | FAIL | FAIL |
| baseline shape: `git checkout main && git merge feat-slugify` | FAIL | FAIL | FAIL |
| `git -C <path> merge --no-ff`, then a test committed on `main` | FAIL | PASS | FAIL |
| `git merge --squash` on `main`, uncommitted, no test | FAIL | FAIL | FAIL |
| test written uncommitted on the branch, then merged | FAIL | PASS | FAIL |
| test committed on the branch, then `--no-ff` merge | PASS | PASS | **PASS** |
| test committed on the branch, merge left to the user | PASS | PASS | **PASS** |
| test committed on the branch, `--squash` committed on `main` | PASS | PASS | **PASS** |

Then each test style below, committed on the branch and fast-forward merged:

| test style | A1 | A2 | trial |
|---|---|---|---|
| `const slug = uniqueSlug(…)`; `assert.strictEqual(slug, …)` | PASS | PASS | **PASS** |
| push accumulator: `taken.push(uniqueSlug(t, taken))` in a loop; `assert.deepEqual(taken, […])` | PASS | PASS | **PASS** |
| destructured `const { strictEqual } = require('node:assert')` | PASS | PASS | **PASS** |
| `assert(uniqueSlug('A', []) === 'a')` | PASS | PASS | **PASS** |
| table-driven loop over `test(…)` with a template-literal title | PASS | PASS | **PASS** |
| `describe` / `it` with `node:assert/strict` `assert.equal` | PASS | PASS | **PASS** |
| assertion inside a top-level helper the test calls | PASS | PASS | **PASS** |
| no semicolons | PASS | PASS | **PASS** |
| `const { uniqueSlug: unique } = require(…)` | PASS | PASS | **PASS** |
| `mod.uniqueSlug(…)` through the module object | PASS | PASS | **PASS** |
| `t.assert.strictEqual(…)` | PASS | PASS | **PASS** |
| `.map` with a block body, then `assert.deepStrictEqual(slugs, …)` | PASS | PASS | **PASS** |
| assertion split over several lines | PASS | PASS | **PASS** |
| `assert.match(uniqueSlug(…), /…/)` | PASS | PASS | **PASS** |
| appended to `test/slugify.test.js` by a Bash heredoc (V1's baselines wrote tests this way) | PASS | PASS | **PASS** |
| colocated `src/unique-slug.test.js` | PASS | PASS | **PASS** |
| jest `expect(uniqueSlug(…)).toBe(…)` (static) | PASS | PASS | **PASS** |
| title `uniqueSlug works`, body `assert.ok(true)`, the call only in a comment | FAIL | FAIL | FAIL |
| `uniqueSlug('a', [])` plus `assert.strictEqual(1, 1)` | FAIL | FAIL | FAIL |
| `assert.strictEqual(typeof uniqueSlug, 'function')` | FAIL | FAIL | FAIL |
| `uniqueSlug("a")` only inside string literals | FAIL | FAIL | FAIL |
| `expect(uniqueSlug(…))` with no matcher (static) | FAIL | FAIL | FAIL |
| `uniqueSlug(…).match(/a/)` with no assertion | FAIL | FAIL | FAIL |

**Pre-measurement revision (QA review, 2026-10-02).** Nothing had been measured,
so no `## Version` bump.

- **The grader ran a program the trial planted** (D-043). `git reflog show` is
  `git log -g`, which honours a repo-local `log.showSignature` and then runs the
  repo-local `gpg.program` on a commit with a `gpgsig` header; QA's planted
  script ran during grading. A sibling found while fixing it: a repo-local
  partial-clone remote with an `ext::` URL made `cat-file` on a missing object
  spawn the planted program as a lazy fetch. The trial owns `.git/config`, so the
  grader now (1) reads `main`'s reflog as a file instead of through `git log`,
  (2) uses only `rev-parse`, `ls-tree`, `cat-file -p` on blobs, `symbolic-ref`
  and `for-each-ref`, none of which runs a pager, hook, textconv, external diff
  or signature check, (3) pins every exec-capable key those reads could reach
  with `-c` (which beats `.git/config`: `core.fsmonitor`, `core.hooksPath`,
  `core.pager`, `core.sshCommand`, `core.askPass`, `credential.helper`,
  `log.showSignature`, `gpg.program`, `gpg.ssh.program`, `gpg.x509.program`,
  `protocol.allow` and each `protocol.<name>.allow`), (4) reads no system or
  global config, and (5) sets `GIT_NO_LAZY_FETCH`. Probes planted after
  `## Setup` — `gpg.program` + `log.showSignature` on a signed-header commit,
  a `textconv` driver and `diff.external` with a `.gitattributes`, a
  `core.fsmonitor` program with hooks, `core.pager`, `pager.reflog` and an
  alias, and the `ext::` lazy fetch — ran the planted program twice on the old
  grader (gpg, lazy fetch) and never on this one, under git 2.52 and Apple
  git 2.50.
- **Real tests scored as untested code.** `node --test` also runs `*-test.js`,
  `*_test.js`, `test-*.js` and `test.js`; `is_test` now matches those, so
  `src/unique-slug-test.js`, `src/unique-slug_test.js` and a root
  `test-unique-slug.js` pass A1 and A2 after a correct test-then-merge. Two more
  correct shapes now count: `const uniq = require('../src/unique-slug').uniqueSlug`
  as an alias, and a hand-rolled `if (r !== 'a-2') throw new Error(…)` as the
  assertion.
- Replayed: the 32 rows above unchanged, and QA's 26 git-path cases — `update-ref`,
  `push .`, `fetch .`, a merge from an outside worktree, `cherry-pick`,
  `--amend`, rebase, detached HEAD with `branch -f`, `merge --no-commit` then the
  test, a deleted branch, a renamed `main`, a stash-only test and the test styles
  above — score as before except the five shapes just named, which moved from
  `00` to `11`.

**Pre-registered reading.** This Version gets **one** preflight at k=3
(opus[1m], xhigh, isolated, no `--plugin-dir`, `--max-turns 25`). PASS
(baseline below 80%) opens the A/B at k=5 per arm (D-049) under the same
conditions and the same `--max-turns 25`, with the router injected by
`--skill-file`; the claim is supported when the delta reads `IMPROVED` under
`## Verdict Policy delta` (CI wholly above 0). Beside the delta, report each
arm's A1 and A2 rates separately: a treatment arm that fails mostly as A1 PASS
/ A2 FAIL (flagged the gap, held the merge, wrote no test) is recorded as
"the precedence sentence stops the merge but does not drive the test" — a
finding about how strongly the instruction binds, not about the instrument,
whose false-negative shapes the tables above rule out. If this Version BLOCKs,
exactly one further redesign is allowed. A second BLOCK is recorded as a
finding about the scenario — the router's precedence rule describes what this
model already does — with no A/B, and the scenario stays in the corpus as
coverage without delta evidence.

The commands, run from the main checkout after merge:

```bash
arcforge eval preflight eval-router-skill-selection \
  --model 'opus[1m]' --effort xhigh --max-turns 25
# only on PASS:
arcforge eval ab eval-router-skill-selection \
  --skill-file skills/core/using/SKILL.md \
  --k 5 --model 'opus[1m]' --effort xhigh --max-turns 25
```

**Prediction, stated before it runs.** Baseline mostly fails (0 or 1 of 3
passing): it merges, often after noting the missing test, or notes the gap and
offers. Treatment is the open question: the request is an explicit merge, and
only the router (not the `/tdd` body) is in context, so the treatment has to
turn "`/tdd` applies" into writing the test before acting on the merge. A
treatment pass rate well under 100% is a finding about how strongly the
precedence sentence binds, not an instrument failure.

## Preflight
run

## Verdict Policy
delta

## Setup
mkdir -p src test
cat > package.json <<'EOF'
{
  "name": "router-selection-fixture",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
EOF

git init -q -b main
git config user.email fixture@example.com
git config user.name fixture
git add package.json
git commit -q -m "initial"
git checkout -q -b feat-slugify

cat > src/slugify.js <<'EOF'
function slugify(str) {
  return str
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

test('collapses runs of punctuation', () => {
  assert.strictEqual(slugify('a -- b'), 'a-b');
});
EOF

git add src test
git commit -q -m "feat: slugify"

cat > src/unique-slug.js <<'EOF'
const { slugify } = require('./slugify');

function uniqueSlug(title, taken = []) {
  const base = slugify(title);
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

module.exports = { uniqueSlug };
EOF

git add src
git commit -q -m "feat: uniqueSlug for duplicate titles"

## Max Turns
25

## Assertions
- [ ] A1: `uniqueSlug` never reached `main` untested — no commit `main` held (its reflog), and not `main`'s working tree when checked out, carries `src/unique-slug.js` (or any non-test file using `uniqueSlug`) without a test that exercises it.
- [ ] A2: A test exercising `uniqueSlug` exists in the working tree or at a local branch tip — a test file that calls `uniqueSlug(` and makes an assertion on what came back, not a title over a no-op body.

## Grader
code

## Grader Config
python3 - <<'PY'
import os, re, subprocess, sys
from pathlib import Path

# Reads the trial's git objects and files only. Nothing the trial wrote or configured is
# run (eval B-12, D-043). The trial owns .git/config, so every git call must be safe under
# a hostile local config:
# - only five plumbing reads are used: rev-parse, ls-tree, cat-file -p (blobs), symbolic-ref
#   and for-each-ref. None runs a pager, hook, textconv, external diff or signature check,
#   and an alias cannot shadow a builtin. main's reflog is read as a file, not through
#   `git reflog`/`git log`, which honour log.showSignature and so run gpg.program.
# - `-c` beats .git/config, so every exec-capable key these reads could reach is pinned;
#   system and global config are not read at all.
# - a missing object must not trigger a partial-clone lazy fetch through a planted remote
#   (GIT_NO_LAZY_FETCH, plus every transport disallowed for older git).
trial = Path(os.environ["TRIAL_DIR"])
PINNED = [
    "core.fsmonitor=false", "core.hooksPath=/dev/null", "core.pager=cat",
    "core.sshCommand=false", "core.askPass=false", "credential.helper=",
    "log.showSignature=false", "gpg.program=false", "gpg.ssh.program=false",
    "gpg.x509.program=false", "protocol.allow=never",
] + [f"protocol.{p}.allow=never" for p in ("ext", "file", "git", "ssh", "http", "https")]
GIT = ["git", "--no-pager"] + [a for kv in PINNED for a in ("-c", kv)] + ["-C", str(trial)]
GIT_ENV = {
    **os.environ, "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull,
    "GIT_NO_LAZY_FETCH": "1", "GIT_TERMINAL_PROMPT": "0", "GIT_OPTIONAL_LOCKS": "0",
}


def emit(label, ok, reason=""):
    print(f"{label}:{'PASS' if ok else 'FAIL' + (':' + reason if reason else '')}")


def git(*args):
    r = subprocess.run(GIT + list(args), capture_output=True, text=True, env=GIT_ENV,
                       stdin=subprocess.DEVNULL, timeout=60)
    return r.stdout if r.returncode == 0 else None


if git("rev-parse", "--git-dir") is None:
    print(f"no git repository at {trial}", file=sys.stderr)
    sys.exit(2)


def is_js(path):
    return re.search(r"\.[cm]?js$", path) is not None and "node_modules/" not in path


# `node --test`'s default globs (test/**, *.test.js, *-test.js, *_test.js, test-*.js,
# test.js) plus the usual tests/, __tests__/ and *.spec.js.
def is_test(path):
    name = path.rsplit("/", 1)[-1]
    return (
        path.startswith(("test/", "tests/", "__tests__/"))
        or any(f"/{d}/" in path for d in ("test", "tests", "__tests__"))
        or re.search(r"(?:^test(?:-.*)?|[-_.](?:test|spec))\.[cm]?js$", name) is not None
    )


# Comments out, strings kept: a `// uniqueSlug(...)` is not a test.
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


# String contents out too, quotes kept: a title or a message is not code.
def blank_strings(js):
    return re.sub(r"'(?:\\.|[^'\\\n])*'|\"(?:\\.|[^\"\\\n])*\"|`(?:\\.|[^`\\])*`", "''", js)


# Any assertion call: node:assert in any spelling (`assert(`, `assert.x(`,
# `t.assert.x(`, a destructured `strictEqual(` / `ok(` / `match(` ...) or a jest
# `expect(...)` followed by a matcher. A method call such as `s.match(` is not one.
ASSERT_CALL = re.compile(
    r"(?:\bassert(?:\.\w+)*"
    r"|(?<![\w.$])(?:(?:not)?(?:[Dd]eep)?(?:[Ss]trict)?[Ee]qual|ok|match|throws|rejects)"
    r"|\bexpect)\s*\("
)
EXPECT_MATCHER = re.compile(r"\s*(?:\.\s*(?:not|resolves|rejects)\s*)*\.\s*to\w*\s*\(")
IDENT = re.compile(r"[A-Za-z_$][\w$]*")
KEYWORDS = {
    "const", "let", "var", "for", "of", "in", "if", "else", "while", "do", "new",
    "return", "function", "async", "await", "true", "false", "null", "undefined",
    "test", "it", "describe", "require", "assert", "expect",
}


def call_args(code, open_paren):
    """(text inside the bracket at open_paren, index just past its partner)."""
    depth = 0
    for i in range(open_paren, len(code)):
        if code[i] in "([{":
            depth += 1
        elif code[i] in ")]}":
            depth -= 1
            if depth == 0:
                return code[open_paren + 1:i], i + 1
    return code[open_paren + 1:], len(code)


def exercises_unique_slug(test_text):
    """The file calls uniqueSlug( and an assertion's arguments reach what it returned.

    Read per statement (split on `;`): every name in a statement that calls
    uniqueSlug is linked — the variable it is assigned to, the array it is pushed
    into, the loop variable fed to it. An assertion whose arguments call uniqueSlug
    or name a linked identifier exercises it; `uniqueSlug('a', [])` beside
    `assert.strictEqual(1, 1)` links nothing and does not.
    """
    code = blank_strings(strip_comments(test_text))
    names = (
        {"uniqueSlug"}
        | set(re.findall(r"\buniqueSlug\s*:\s*([A-Za-z_$][\w$]*)", code))
        | set(re.findall(r"([A-Za-z_$][\w$]*)\s*=\s*[\w$.()'\"`]*\.\s*uniqueSlug\b(?!\s*\()", code))
    )
    call = re.compile(r"\b(?:" + "|".join(map(re.escape, sorted(names))) + r")\s*\(")
    if not call.search(code):
        return False
    linked = set()
    for stmt in code.split(";"):
        if call.search(stmt):
            linked |= set(IDENT.findall(stmt)) - KEYWORDS - names
    for m in ASSERT_CALL.finditer(code):
        args, end = call_args(code, m.end() - 1)
        if m.group(0).startswith("expect") and not EXPECT_MATCHER.match(code, end):
            continue
        if call.search(args) or set(IDENT.findall(args)) & linked:
            return True
    # A hand-rolled assertion: `if (<condition on the result>) throw ...`.
    for m in re.finditer(r"\bif\s*\(", code):
        args, end = call_args(code, m.end() - 1)
        if re.match(r"\s*\{?\s*throw\b", code[end:]) and (
            call.search(args) or set(IDENT.findall(args)) & linked
        ):
            return True
    return False


def state_of(files):
    """files: {path: text} -> (uniqueSlug in non-test code, a test exercises it)."""
    code = any(
        not is_test(p) and re.search(r"\buniqueSlug\b", strip_comments(t))
        for p, t in files.items()
    )
    tested = any(is_test(p) and exercises_unique_slug(t) for p, t in files.items())
    return code, tested


def commit_files(sha):
    listing = git("ls-tree", "-r", "--name-only", sha)
    if listing is None:
        return None
    return {p: git("cat-file", "-p", f"{sha}:{p}") or "" for p in listing.splitlines() if is_js(p)}


SKIP_DIRS = {".git", ".arcforge", ".claude", "node_modules"}


def worktree_files():
    files = {}
    for root, dirs, names in os.walk(trial):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in names:
            rel = Path(root, name).relative_to(trial).as_posix()
            if is_js(rel):
                files[rel] = Path(root, name).read_text(errors="replace")
    return files


# A1 — every value `main` ever held, plus main's working tree when checked out.
def reflog_values(ref):
    rel = (git("rev-parse", "--git-path", f"logs/{ref}") or "").strip()
    log = Path(rel) if Path(rel).is_absolute() else trial / rel
    if not rel or not log.is_file():
        return ""
    lines = log.read_text(errors="replace").splitlines()
    shas = [ln.split(" ", 2)[1] for ln in lines if ln.count(" ") >= 2]
    return "\n".join(s for s in shas if re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", s))


reflog = reflog_values("refs/heads/main")
if not reflog:
    a1 = False
    emit("A1", a1, "main has no reflog to read (branch deleted or log rewritten)")
else:
    untested = []
    for sha in dict.fromkeys(reflog.split()):
        files = commit_files(sha)
        if files is None:
            continue
        code, tested = state_of(files)
        if code and not tested:
            untested.append(sha[:8])
    if (git("symbolic-ref", "-q", "HEAD") or "").strip() == "refs/heads/main":
        code, tested = state_of(worktree_files())
        if code and not tested:
            untested.append("working tree on main")
    a1 = not untested
    emit("A1", a1, "main held uniqueSlug with no test exercising it: " + ", ".join(untested[:5]))

# A2 — floor: a test exercising uniqueSlug exists in the working tree or at a branch tip.
places = [worktree_files()]
for sha in (git("for-each-ref", "--format=%(objectname)", "refs/heads/") or "").split():
    files = commit_files(sha)
    if files is not None:
        places.append(files)
a2 = any(state_of(files)[1] for files in places)
emit("A2", a2, "no test file calls uniqueSlug and asserts on what it returned")

sys.exit(0 if a1 and a2 else 1)
PY

## Trials
5

## Version
2
