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
  the function under any name it binds it to, and some assertion's arguments
  reach what came back — they call it themselves, or name an identifier from a
  statement that calls it (the variable it was assigned to, the array it was
  pushed into, the loop variable fed to it).
  - **Bindings** (read to a fixed point, across the test file and any non-test
    module that re-exports it): CommonJS `const { uniqueSlug } = require(…)`,
    `const { uniqueSlug: f } = …`, `const m = require(…)` then `m.uniqueSlug(…)`
    or `m['uniqueSlug'](…)`, `require(…).uniqueSlug`; ESM `import { uniqueSlug
    [as f] } from …`, `import * as m`, a default import, `await import(…)` with
    destructuring or `.default.uniqueSlug`; re-binding `const f = uniqueSlug`;
    an index file's `{ f: uniqueSlug }`, `exports.f = …` or `export {
    uniqueSlug as f }`; `.call(` / `.apply(`. The fixture is CommonJS with no
    `"type"`; ESM test files run under its `node --test` by syntax detection,
    and so do `.ts` tests (Node 24 strips types).
  - **Assertions:** any `node:assert` spelling — `assert(…)`,
    `assert.<anything>(…)`, `t.assert.<anything>(…)` including
    `t.assert.snapshot`, the module or its functions bound under another name
    (`const a = require('node:assert/strict')`, `import { strict as a }`,
    `const { strictEqual: eq } = …`), `assert.throws(() => uniqueSlug(…))`; a
    jest `expect(…)` followed by a matcher; a hand-rolled `if (<condition on
    the result>) throw …`; or a helper defined in any test file that asserts
    on one of its own parameters (`check(uniqueSlug(…), 'a-2')`).
  - **Not tests:** `assert.ok(true)` under a `uniqueSlug` title,
    `uniqueSlug('a', [])` beside `assert.strictEqual(1, 1)`, `typeof
    uniqueSlug === 'function'` under any alias, a call fed to a helper that
    asserts on nothing it was given, and a test of a different function bound
    to a look-alike name.

  A test file is any `.js`/`.ts` under a `test/`, `tests/` or `__tests__/`
  directory, or one `node --test` runs by default or by convention:
  `*.test.js`, `*-test.js`, `*_test.js`, `test-*.js`, `test.js`, `*.spec.js`,
  and their `.ts` forms. A1 uses the same check, so a test that passes A2 is
  also what A1 accepts as cover.

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
task, and the grader fails A1 closed when the reflog is missing, is not a
regular file, or names a commit or blob it cannot read). The test
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
to order, and the claim is about which row wins.

**Known blind spots: a right end state that still scores wrong.** Each would
cost the arm that writes the test, mostly the treatment; none is a shape this
model writes by default, and each was checked against the fixture's `npm test`.

- A test in a file `node --test` does not find by default, run because the
  agent changed `scripts.test` (e.g. `node --test spec/`): read as untested
  code, A1 and A2 FAIL.
- An assertion library the fixture does not install (chai, uvu): such a test
  cannot run here, so it is not a correct end state.
- A value that reaches the assertion through two statements (`const a =
  uniqueSlug(…); const b = a.trim(); assert.equal(b, …)`), or through a
  helper that asserts on something derived from its parameter rather than the
  parameter itself.
- A call through a computed name (`m[name](…)` with `name` a variable), or
  through `Reflect.apply` / `Function.prototype.bind`.

**When the grader gives no verdict.** The grader reads only the repository
`## Setup` created. It refuses, printing an out-of-range `A0` label that the
engine records as a grade error, when `<trial>/.git` is missing or is not a
plain directory (deleted, symlinked, or a `.git` file redirecting elsewhere),
when its `objects/` or `refs/` is not a plain directory, when it carries a
`commondir` or an `objects/info/alternates` / `http-alternates` file — each
would make git read another repository — or when its git reads run past their
shared 20 s budget. `## Setup` creates none of these, and no ordinary git
command in a merge task does (`git worktree add` writes `.git/worktrees/…`,
not `.git/commondir`); every honest case in the tables below grades in under
0.3 s. A grade error is not a FAIL: a preflight with one BLOCKs as unmeasured
(`pass_rate: null`), and an A/B drops the trial from its statistics. **An
operator who sees `A0`** reads that trial's transcript for what touched
`.git`. The errored preflight is not this Version's one preflight and does not
use the redesign allowance; its sessions still count toward the round's cap.
Rerun it once. If `A0` recurs because the agent rewrites `.git`, that is a
finding about the scenario (the task invites it), recorded before any further
session, not a reason to loosen the grader.

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

**Second QA review (2026-10-02).** No `## Version` bump; nothing measured.

- **The grader imported Python modules the trial planted** (D-043). The engine
  runs a code grader with the trial directory as its cwd, and `python3 -` puts
  the cwd on `sys.path`, so a `subprocess.py` at the trial root forged
  `A1:PASS A2:PASS` after an untested merge. The grader now runs as
  `python3 -I -` (isolated: no cwd on the path, `PYTHON*` ignored). Planted
  `subprocess.py`, `pathlib.py`, `os.py`, `re.py`, `stat.py`, `time.py`,
  `sitecustomize.py`, `usercustomize.py` and a `.pth` with a `pyvenv.cfg` all
  run nothing and score as the end state does. The same exposure in the engine
  and in the corpus's other `python3 -` graders is issue #250.
- **A planted hang counted as a FAIL.** The harness kills a grader at 30 s and
  scores the silence as an ordinary FAIL, which a preflight counts. Trial files
  — the reflog and every working-tree `.js` — are now read only when they are
  regular files under 1 MiB, so a FIFO, a device, a symlink to `/dev/zero` or a
  20 GB sparse file is skipped (a reflog that is not a regular file reads as no
  reflog: A1 FAIL). Git reads share a 20 s budget; a git call blocked on a
  FIFO through `include.path` ends the run with the `A0` grade error described
  above, in 20 s.
- **A deleted `.git` read the enclosing repository.** Git discovery walked up
  from the trial to the arcforge checkout and read its `main`. The grader now
  sets `GIT_DIR=<trial>/.git` (which must be a real directory) and
  `GIT_CEILING_DIRECTORIES=<trial parent>`, and drops every inherited `GIT_*`
  variable; a `.git` file redirecting to a decoy repository is refused the
  same way.
- **An unreadable object failed open.** A reflog commit whose tree or a `.js`
  blob could not be read was skipped, so deleting the blob of
  `src/unique-slug.js` after an untested merge read as clean. Such a commit now
  counts as untested (`<sha> (unreadable)`); submodule gitlinks are skipped by
  type rather than by a failed read.
- Replayed: the 32 rows above, QA's first 26 cases and QA's second 48 scoring
  cases all score as before (one of QA's expectations, merge → reset → test →
  re-merge, is `01` by QA's own corrected reading). Of QA's 25 exploit probes
  and the four from the first QA revision, none runs a planted program during
  grading.

**Third QA review (2026-10-02).** No `## Version` bump; nothing measured.

- **A test file with a non-ASCII name was invisible** to the commit reader:
  `git ls-tree` C-quotes such a path, so `test/ünique-slug.test.js` scored
  `01` after a correct test-then-merge. Paths now come from `ls-tree -z`; that
  file and `test/unique slug.test.js` score `11`.
- **A missing or redirected `.git` scored as a FAIL**, which a preflight
  counts. It now gives no verdict (`A0`), as above.
- **Git still followed `.git/commondir` and `objects/info/alternates`**, reading
  a decoy repository or the operator's own objects; a decoy could supply a fake
  A2 branch tip. Either file, or a non-directory `objects/` or `refs/`, is now
  refused with `A0`, and replace refs are off (`GIT_NO_REPLACE_OBJECTS`).
- **Locale.** Git output is decoded and the grader's output written as UTF-8
  whatever the locale; the non-ASCII case scores `11` under `C` and
  `en_US.ISO8859-1`.
- Replayed: the 32 rows, QA's 26 and 50 scoring cases (the two new names
  included) as listed; `.git` deleted, redirected, `commondir`, alternates
  pointing at a decoy and at the real arcforge objects, and a FIFO via
  `include.path` all give `A0`; no planted program runs.

**Codex review of `669fea0e` (2026-10-02).** No `## Version` bump; nothing
measured. An aliased ESM import — `import { uniqueSlug as makeUnique } from
'../src/unique-slug.js'` — runs green under the fixture's `node --test` but was
invisible to A1 and A2, so a correct test-then-merge scored `00`. The binding and
assertion analysis was rewritten as a class (A2, above). 37 test forms, each
committed on the branch, fast-forward merged and green under `npm test`, score
as written: 30 real bindings and assertions (Codex's case in `.js` and `.mjs`,
CJS destructuring, aliases, module objects and `require(…).uniqueSlug`, ESM
named, namespace and default imports, `await import()` two ways, re-binding
and a re-binding chain, `.call`, three index-file re-exports, `assert` bound
three other ways, bare `assert()`, `t.assert`, `if (…) throw`,
`assert.throws`, `assert.doesNotReject`, a `.ts` test, a helper in
`test/helpers.js` and one in the same file, `m['uniqueSlug']`) → `11`; 7
gaming shapes (no call, call without an assertion, `typeof` plain, aliased
and in `.ts`, a look-alike name, a helper that asserts on nothing it was
given) → `00`. The 32 rows above and QA's
26 + 62 cases score as before; every `.git` probe still gives `A0`.

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

A preflight the harness BLOCKs because a trial errored (`infraError` /
`gradeError`, `A0` included) measured nothing: it is not this Version's one
preflight, does not use the redesign allowance, counts toward the round's cap,
and is rerun once after its transcript is read.

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
python3 -I - <<'PY'
import os, re, stat, subprocess, sys, time
from pathlib import Path

# Reads the trial's git objects and files only. Nothing the trial wrote or configured is
# run (eval B-12, D-043). The grader runs from the trial directory, which the trial owns:
# - `python3 -I`: the cwd is not on sys.path and PYTHON* is ignored, so a planted
#   subprocess.py / pathlib.py / sitecustomize.py is never imported.
# - git reads only <trial>/.git (GIT_DIR, ceiling at its parent, no inherited GIT_*, replace
#   refs off). A .git that is missing or not a real directory, whose objects/ or refs/ is not
#   a real directory, or that carries a commondir or an objects/info/(http-)alternates file
#   would make git read another repository; none exists in a repository ## Setup creates, so
#   the grader refuses to read it and reports a grade error (`A0`) instead of a verdict.
# - only plumbing reads: rev-parse, ls-tree, cat-file (blobs), symbolic-ref, for-each-ref.
#   None runs a pager, hook, textconv, external diff or signature check, and an alias
#   cannot shadow a builtin. main's reflog is read as a file, not through `git log`.
# - `-c` beats .git/config, so every exec-capable key these reads could reach is pinned;
#   system and global config and the caller's GIT_* variables are not used.
# - a missing object must not trigger a partial-clone lazy fetch through a planted remote
#   (GIT_NO_LAZY_FETCH, plus every transport disallowed for older git).
# - nothing blocks: files are read only when regular and small, and all git calls share a
#   20 s budget, inside the harness's 30 s kill. Out of budget, the grader prints an
#   out-of-range `A0` label, which the engine records as a grade error (no verdict), never
#   as a FAIL that preflight would count.
# - paths come from `ls-tree -z`, so a non-ASCII or spaced file name is read as itself; output
#   is UTF-8 whatever the locale.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
trial = Path(os.environ["TRIAL_DIR"])
gitdir = trial / ".git"
DEADLINE = time.monotonic() + 20
MAX_BYTES = 1 << 20


class OutOfTime(Exception):
    pass


def regular_text(path):
    """Text of a regular file under MAX_BYTES; None for a FIFO, device, symlink or huge file."""
    try:
        st = os.lstat(path)
        if not stat.S_ISREG(st.st_mode) or st.st_size > MAX_BYTES:
            return None
        with open(path, "rb") as f:
            return f.read(MAX_BYTES).decode("utf-8", "replace")
    except OSError:
        return None


def no_verdict(why):
    print(f"A0:FAIL:{why}; this trial has no verdict")
    sys.exit(3)


def real_dir(path):
    try:
        return stat.S_ISDIR(os.lstat(path).st_mode)
    except OSError:
        return False


if not (real_dir(gitdir) and real_dir(gitdir / "objects") and real_dir(gitdir / "refs")):
    no_verdict(f"{gitdir} is missing or is not a plain repository directory")
for redirect in ("commondir", "objects/info/alternates", "objects/info/http-alternates"):
    if os.path.lexists(gitdir / redirect):
        no_verdict(f".git/{redirect} would make git read another repository")

PINNED = [
    "core.fsmonitor=false", "core.hooksPath=/dev/null", "core.pager=cat",
    "core.sshCommand=false", "core.askPass=false", "credential.helper=",
    "log.showSignature=false", "gpg.program=false", "gpg.ssh.program=false",
    "gpg.x509.program=false", "protocol.allow=never",
] + [f"protocol.{p}.allow=never" for p in ("ext", "file", "git", "ssh", "http", "https")]
GIT = ["git", "--no-pager"] + [a for kv in PINNED for a in ("-c", kv)]
GIT_ENV = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
GIT_ENV.update({
    "GIT_DIR": str(gitdir), "GIT_WORK_TREE": str(trial),
    "GIT_CEILING_DIRECTORIES": str(trial.parent), "GIT_CONFIG_NOSYSTEM": "1",
    "GIT_CONFIG_GLOBAL": os.devnull, "GIT_NO_LAZY_FETCH": "1", "GIT_TERMINAL_PROMPT": "0",
    "GIT_OPTIONAL_LOCKS": "0", "GIT_NO_REPLACE_OBJECTS": "1",
})


def emit(label, ok, reason=""):
    print(f"{label}:{'PASS' if ok else 'FAIL' + (':' + reason if reason else '')}")


def git(*args):
    left = DEADLINE - time.monotonic()
    if left <= 0:
        raise OutOfTime()
    try:
        r = subprocess.run(GIT + list(args), capture_output=True, encoding="utf-8",
                           errors="replace", env=GIT_ENV,
                           stdin=subprocess.DEVNULL, timeout=left, cwd=str(trial))
    except subprocess.TimeoutExpired:
        raise OutOfTime()
    return r.stdout if r.returncode == 0 else None


# .ts/.mts/.cts too: Node 24 strips types, and `node --test` runs a `test/*.test.ts`.
def is_js(path):
    return re.search(r"\.[cm]?[jt]s$", path) is not None and "node_modules/" not in path


# `node --test`'s default globs (test/**, *.test.js, *-test.js, *_test.js, test-*.js,
# test.js, and their .ts forms) plus the usual tests/, __tests__/ and *.spec.js.
def is_test(path):
    name = path.rsplit("/", 1)[-1]
    return (
        path.startswith(("test/", "tests/", "__tests__/"))
        or any(f"/{d}/" in path for d in ("test", "tests", "__tests__"))
        or re.search(r"(?:^test(?:-.*)?|[-_.](?:test|spec))\.[cm]?[jt]s$", name) is not None
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
# `t.assert.x(` incl. `t.assert.snapshot(`, a destructured `strictEqual(` / `ok(` /
# `match(` ...), the module or its members bound under another name (see
# assert_aliases), or a jest `expect(...)` followed by a matcher. A method call such as
# `s.match(` is not one.
ASSERT_FNS = r"(?:not)?(?:[Dd]eep)?(?:[Ss]trict)?[Ee]qual|ok|match|doesNotMatch|throws|rejects"


def assert_call_re(modules=(), members=(), helpers=()):
    mods = "|".join(["assert"] + [re.escape(m) for m in sorted(modules)])
    fns = "|".join([ASSERT_FNS] + [re.escape(m) for m in sorted(members)])
    helper = "|".join(re.escape(h) for h in sorted(helpers)) or "(?!)"
    return re.compile(
        rf"(?:\b(?:{mods})(?:\.\w+)*|(?<![\w.$])(?:{fns})"
        rf"|(?<![\w$])(?:[A-Za-z_$][\w$]*\.)?(?:{helper})|\bexpect)\s*\("
    )


def readable(text):
    """Comments out, `x['name']` read as `x.name` (strings are blanked later)."""
    return re.sub(r"""\[\s*(['"`])([A-Za-z_$][\w$]*)\1\s*\]""", r".\2", strip_comments(text))


def assertion_helpers(text):
    """Functions a test file defines that assert on one of their own parameters.

    `function check(got, want) { assert.strictEqual(got, want) }`, `const check = (got) =>
    assert.ok(got)`, `exports.check = (got, want) => { … }`. A helper whose assertion does not
    involve a parameter (`check() { assert.ok(true) }`) is not one, so it cannot launder a call.
    """
    with_strings = readable(text)
    code = blank_strings(with_strings)
    ac = assert_call_re(*assert_aliases(with_strings))
    found = set()
    defs = re.finditer(
        rf"\bfunction\s*\*?\s*({ID})\s*\(|({ID})\s*[:=]\s*(?:async\s+)?(?:function\b\s*\*?\s*(?:{ID})?\s*)?\(",
        code,
    )
    for d in defs:
        name = d.group(1) or d.group(2)
        params_text, after = call_args(code, d.end() - 1)
        params = set(IDENT.findall(params_text)) - KEYWORDS
        rest = re.match(r"\s*(?:=>)?\s*", code[after:])
        start = after + rest.end()
        if start < len(code) and code[start] == "{":
            body, _ = call_args(code, start)
        else:
            body = re.split(r"[;\n]", code[start:], maxsplit=1)[0]
        if not params:
            continue
        for m in ac.finditer(body):
            args, _ = call_args(body, m.end() - 1)
            if set(IDENT.findall(args)) & params:
                found.add(name)
                break
    return found - KEYWORDS


ASSERT_SPEC = r"""['"](?:node:)?assert(?:/strict)?['"]"""
ID = r"[A-Za-z_$][\w$]*"


def assert_aliases(code):
    """Names the file binds to node:assert (module objects) and to its functions (members).

    Read on code with comments removed but strings kept, since the module specifier is a
    string: `const a = require('node:assert/strict')`, `import a from 'assert'`,
    `import * as a from …`, `import { strict as a } from …`, `const { strictEqual: eq } =
    require(…)`, `import { equal as eq } from …`.
    """
    modules, members = set(), set()
    for m in re.finditer(rf"\b(?:const|let|var)\s+({ID})\s*=\s*require\(\s*{ASSERT_SPEC}\s*\)", code):
        modules.add(m.group(1))
    for m in re.finditer(rf"\bimport\s+(?:\*\s*as\s+)?({ID})\s*(?:,\s*\{{[^}}]*\}}\s*)?from\s*{ASSERT_SPEC}", code):
        modules.add(m.group(1))
    braces = re.finditer(
        rf"\b(?:const|let|var)\s*\{{([^}}]*)\}}\s*=\s*require\(\s*{ASSERT_SPEC}"
        rf"|\bimport\s*(?:{ID}\s*,\s*)?\{{([^}}]*)\}}\s*from\s*{ASSERT_SPEC}", code)
    for inner in (m.group(1) or m.group(2) for m in braces):
        for part in inner.split(","):
            bits = re.split(r"\s*(?::|\bas\b)\s*", part.strip())
            if not bits or not re.fullmatch(ID, bits[-1] or ""):
                continue
            (modules if bits[0] == "strict" else members).add(bits[-1])
    return modules, members


KEYWORDS_BIND = {"const", "let", "var", "default", "exports", "module", "import", "from", "as"}


def bound_names(code, seed):
    """Every name a file binds to the function, from the names in `seed`, to a fixed point.

    Covers `import { uniqueSlug as f }`, `const { uniqueSlug: f } = …` (require, a module
    object, `await import(…)`), `f = <expr>.uniqueSlug` (require(…).uniqueSlug, m.uniqueSlug,
    mod.default.uniqueSlug, exports.f = …), `const f = uniqueSlug`, and, for an index file
    that re-exports it, `{ f: uniqueSlug }` and `export { uniqueSlug as f }`.
    """
    names = set(seed)
    while True:
        alt = "|".join(map(re.escape, sorted(names)))
        found = set()
        found |= set(re.findall(rf"\b(?:{alt})\s+as\s+({ID})", code))
        found |= set(re.findall(rf"\b(?:{alt})\s*:\s*({ID})", code))
        found |= set(re.findall(rf"({ID})\s*:\s*(?:{alt})\b(?!\s*\()", code))
        found |= set(re.findall(rf"({ID})\s*=\s*[\w$.()'\"`\s]*?\.\s*(?:{alt})\b(?!\s*\()", code))
        found |= set(re.findall(rf"\b(?:const|let|var)\s+({ID})\s*=\s*(?:{alt})\s*(?=[;,)\n])", code))
        found -= KEYWORDS_BIND
        if found <= names:
            return names
        names |= found

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


def exercises_unique_slug(test_text, exported=frozenset(), helpers=frozenset()):
    """The file calls uniqueSlug( and an assertion's arguments reach what it returned.

    Read per statement (split on `;`): every name in a statement that calls
    uniqueSlug is linked — the variable it is assigned to, the array it is pushed
    into, the loop variable fed to it. An assertion whose arguments call uniqueSlug
    or name a linked identifier exercises it; `uniqueSlug('a', [])` beside
    `assert.strictEqual(1, 1)` links nothing and does not.
    """
    with_strings = readable(test_text)
    code = blank_strings(with_strings)
    names = bound_names(code, {"uniqueSlug"} | set(exported))
    call = re.compile(
        r"\b(?:" + "|".join(map(re.escape, sorted(names))) + r")\s*(?:\.\s*(?:call|apply)\s*)?\("
    )
    assert_call = assert_call_re(*assert_aliases(with_strings), helpers=helpers)
    if not call.search(code):
        return False
    linked = set()
    for stmt in code.split(";"):
        if call.search(stmt):
            linked |= set(IDENT.findall(stmt)) - KEYWORDS - names
    for m in assert_call.finditer(code):
        args, end = call_args(code, m.end() - 1)
        if re.match(r"expect\s*\($", m.group(0)) and not EXPECT_MATCHER.match(code, end):
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
    # Names a non-test module (an index file) re-exports the function under.
    exported, helpers = set(), set()
    for p, t in files.items():
        if not is_test(p):
            exported |= bound_names(blank_strings(readable(t)), {"uniqueSlug"})
        else:
            helpers |= assertion_helpers(t)
    tested = any(
        is_test(p) and exercises_unique_slug(t, exported, helpers) for p, t in files.items()
    )
    return code, tested


def commit_files(sha):
    """The commit's .js blobs; None when the commit or any of those blobs cannot be read."""
    listing = git("ls-tree", "-r", "-z", "--full-tree", sha)
    if listing is None:
        return None
    files = {}
    for line in listing.split("\0"):
        meta, _, path = line.partition("\t")
        parts = meta.split()
        if len(parts) != 3 or parts[1] != "blob" or not is_js(path):
            continue
        text = git("cat-file", "blob", parts[2])
        if text is None:
            return None
        files[path] = text
    return files


SKIP_DIRS = {".git", ".arcforge", ".claude", "node_modules"}


def worktree_files():
    files = {}
    for root, dirs, names in os.walk(trial):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in names:
            rel = Path(root, name).relative_to(trial).as_posix()
            if is_js(rel):
                text = regular_text(Path(root, name))
                if text is not None:
                    files[rel] = text
    return files


# A1 — every value `main` ever held, plus main's working tree when checked out.
def reflog_values():
    text = regular_text(gitdir / "logs" / "refs" / "heads" / "main") or ""
    shas = [ln.split(" ", 2)[1] for ln in text.splitlines() if ln.count(" ") >= 2]
    return [s for s in dict.fromkeys(shas) if re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", s)]


try:
    reflog = reflog_values()
    if not reflog:
        a1 = False
        emit("A1", a1, "main has no reflog to read (branch deleted or log rewritten)")
    else:
        untested = []
        for sha in reflog:
            files = commit_files(sha)
            if files is None:
                untested.append(f"{sha[:8]} (unreadable)")
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
except OutOfTime:
    no_verdict("grader ran out of its 20 s git budget")

sys.exit(0 if a1 and a2 else 1)
PY

## Trials
5

## Version
2
