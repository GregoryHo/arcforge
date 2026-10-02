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
  one `test(` / `it(` block at a time: the block calls `uniqueSlug(` and makes
  an equality assertion (`strictEqual`, `deepStrictEqual`, `equal`,
  `deepEqual`, or jest's `toBe` / `toEqual` / `toStrictEqual`) whose own text
  reaches the result — the call inline, or a variable assigned from it.
  `assert.ok(true)` under a `uniqueSlug` title does not count. A test file is
  any `.js` under `test/`, `tests/` or `__tests__/`, or any `*.test.js` /
  `*.spec.js`.

`Grader: code` passes a trial only when both score 1.

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
check is static: a test that reads right and would fail at runtime passes A2,
and an assertion hidden in a helper fails it. Ordering inside `/tdd` — whether
the new test was run before the merge — is not scored: the code already exists,
so there is no red-first step to order, and the claim is about which row wins.

**Validated offline, nothing run against a model.** `## Setup` was run in a
scratch directory, and the grader below was run against synthetic trials built
from it:

| case | A1 | A2 | trial |
|---|---|---|---|
| untouched fixture | PASS | FAIL | FAIL |
| baseline shape: `git checkout main && git merge feat-slugify` | FAIL | FAIL | FAIL |
| `git -C <path> merge --no-ff`, then a test committed on `main` | FAIL | PASS | FAIL |
| `git merge --squash` on `main`, uncommitted, no test | FAIL | FAIL | FAIL |
| test written uncommitted on the branch, then merged | FAIL | PASS | FAIL |
| test committed on the branch, then fast-forward merge | PASS | PASS | **PASS** |
| test committed on the branch, then `--no-ff` merge | PASS | PASS | **PASS** |
| test committed on the branch, merge left to the user | PASS | PASS | **PASS** |
| test titled `uniqueSlug` whose body is `assert.ok(true)`, then merged | FAIL | FAIL | FAIL |
| a `uniqueSlug` call plus `assert.strictEqual(1, 1)`, not merged | PASS | FAIL | FAIL |

**Pre-registered reading.** This Version gets **one** preflight at k=3
(opus[1m], xhigh, isolated, no `--plugin-dir`, `--max-turns 25`). PASS
(baseline below 80%) opens the A/B at k=5 per arm with the router injected by
`--skill-file`; the claim is supported when the delta reads `IMPROVED` under
`## Verdict Policy delta` (CI wholly above 0), with treatment pass rate
reported beside it. If this Version BLOCKs, exactly one further redesign is
allowed. A second BLOCK is recorded as a finding about the scenario — the
router's precedence rule describes what this model already does — with no A/B,
and the scenario stays in the corpus as coverage without delta evidence.

**Prediction, stated before it runs.** Baseline mostly merges straight away (0
or 1 of 3 passing). Treatment is the open question: the request is an explicit
merge, and the treatment has to check the branch against the precedence
condition before acting on it. A treatment pass rate well under 100% is a
finding about how strongly the precedence sentence binds, not an instrument
failure.

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
- [ ] A2: A test exercising `uniqueSlug` exists in the working tree or at a local branch tip — a `test(` / `it(` block that calls `uniqueSlug(` and makes an equality assertion on what came back, not a title over a no-op body.

## Grader
code

## Grader Config
python3 - <<'PY'
import os, re, subprocess, sys
from pathlib import Path

# Reads the trial's git objects and files only. Nothing the trial wrote is run
# (eval B-12): plumbing and reflog reads, no hooks, no pager, no fsmonitor.
trial = Path(os.environ["TRIAL_DIR"])
GIT = ["git", "--no-pager", "-c", "core.fsmonitor=false", "-C", str(trial)]


def emit(label, ok, reason=""):
    print(f"{label}:{'PASS' if ok else 'FAIL' + (':' + reason if reason else '')}")


def git(*args):
    r = subprocess.run(GIT + list(args), capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None


if git("rev-parse", "--git-dir") is None:
    print(f"no git repository at {trial}", file=sys.stderr)
    sys.exit(2)


def is_js(path):
    return re.search(r"\.[cm]?js$", path) is not None and "node_modules/" not in path


def is_test(path):
    name = path.rsplit("/", 1)[-1]
    return (
        path.startswith(("test/", "tests/", "__tests__/"))
        or "/__tests__/" in path
        or re.search(r"\.(?:test|spec)\.[cm]?js$", name) is not None
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


ASSERT_RE = re.compile(
    r"(?:assert\.(?:deepStrictEqual|strictEqual|deepEqual|equal)\s*\(|expect\s*\()"
    r"([^;]*?)(?:\)\s*;|\)\s*\n|\.to(?:Equal|Be|StrictEqual)\b)"
)
EXPECT_MATCHER = re.compile(r"\.to(?:Equal|Be|StrictEqual)\b")


def exercises_unique_slug(test_text):
    """One test(/it( block calls uniqueSlug( and asserts equality on its result."""
    text = strip_comments(test_text)
    for block in re.split(r"(?=\b(?:test|it)\s*\()", text)[1:]:
        if not re.search(r"\buniqueSlug\s*\(", block):
            continue
        results = {"uniqueSlug"} | set(
            re.findall(r"\b(?:const|let|var)\s+(\w+)\s*=[^;]*\buniqueSlug\s*\(", block)
        )
        for m in ASSERT_RE.finditer(block):
            whole = block[m.start():m.end()]
            if whole.startswith("expect") and not EXPECT_MATCHER.search(whole):
                continue
            if any(re.search(rf"\b{r}\b", m.group(1)) for r in results):
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
reflog = git("reflog", "show", "--format=%H", "refs/heads/main")
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
emit("A2", a2, "no test block calls uniqueSlug and asserts equality on the result")

sys.exit(0 if a1 and a2 else 1)
PY

## Trials
5

## Version
2
