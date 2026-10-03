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
    `.call(` / `.apply(`. Through modules that re-export it, read to a fixed
    point across files so chains of renames are followed: `exports.f = …`,
    `module.exports.f = …`, `module.exports = { f: … }`, `Object.assign(
    module.exports, { f: … })`, `export { … as f }`, `export const f = …`,
    `export * from` / `export { f as g } from`; and a module whose default
    export is the function (`module.exports = uniqueSlug`, `export default
    uniqueSlug`) binds the name a test requires or imports it under, matched
    by the module's path — so `require('../src/slugify')` under a look-alike
    name binds nothing. The fixture is CommonJS with no
    `"type"`; ESM test files run under its `node --test` by syntax detection,
    and so do `.ts` tests (Node 24 strips types).
  - **Assertions:** any `node:assert` spelling — `assert(…)`,
    `assert.<anything>(…)`, `t.assert.<anything>(…)` including
    `t.assert.snapshot`, the module or its functions bound under another name
    (`const a = require('node:assert/strict')`, `import { strict as a }`,
    `const { strictEqual: eq } = …`, `const { equal } = assert`),
    `assert.throws(() => uniqueSlug(…))`; a jest `expect(…)` followed by a
    matcher; a conditional on the result, `if (<condition>) throw …` or
    `if (<condition>) assert.fail(…)`; or a helper defined in any test file
    that asserts on one of its own parameters (`check(uniqueSlug(…), 'a-2')`).
    A call inside a template literal (`` `${uniqueSlug(…)}` ``) counts.
  - **Not tests:** `assert.ok(true)` under a `uniqueSlug` title,
    `uniqueSlug('a', [])` beside `assert.strictEqual(1, 1)`, `typeof
    uniqueSlug === 'function'` under any alias, a call fed to a helper that
    asserts on nothing it was given, a test of a different function bound to
    a look-alike name, `console.assert` (it only prints), a bare `equal(…)` /
    `ok(…)` not bound from `node:assert`, and a test node:test runs without a
    verdict (`test.skip`, `it.todo`, `describe.skip`, `{ skip: true }`, a body
    that calls `t.skip()`). A name is an alias only from a real binding
    position — a destructuring pattern, import / export braces, an object
    key — so a ternary branch (`d ? uniqueSlug : slugify`) or an object value
    makes `slugify` no alias.

  A test file is exactly what the fixture's `npm test` (`node --test`, no
  arguments) runs: anything under a `test/` directory, and `*.test.*`,
  `*-test.*`, `*_test.*`, `test-*.*`, `test.*` anywhere, in `.js`/`.mjs`/`.cjs`
  and their `.ts` forms. `tests/x.js`, `__tests__/x.js` and `*.spec.js` never
  run here, so they are not tests. A1 uses the same check, so a test that
  passes A2 is also what A1 accepts as cover.

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
- A value that reaches the assertion through two statements (`const a =
  uniqueSlug(…); const b = a.trim(); assert.equal(b, …)`), or through a
  helper that asserts on something derived from its parameter rather than the
  parameter itself.
- A call through a computed name (`m[name](…)` with `name` a variable),
  `Reflect.apply`, `Function.prototype.bind`, or an assertion inside
  `eval(…)`.
- An assertion helper written as an arrow with an unparenthesized parameter
  (`const check = got => assert.equal(got, 'a-2')`, then
  `check(uniqueSlug(…))`): helpers are found only from parameter lists in
  parentheses, so a green test-then-merge scores `00`. The operator's audit of
  FAIL rows, which reads the trial's test file and `npm test` output, is where
  it is caught and reported as mis-scored.

**Known blind spots: a wrong end state that still scores right.** Each would
credit whichever arm writes it — in practice the treatment, the arm expected to
write tests, so each would inflate the delta. None is a default shape; the
operator audit below reads every PASS row to catch them.

- A `.ts`-only test on a Node that does not strip types by default (20, and 22
  before 22.18): the trial's `npm test` never runs it, but the grader counts it.
  This Version is measured on Node 24, where it runs (see the host requirement
  under the pre-registered reading); the operator's PASS-row read of the
  trial's `npm test` output is where it would show.
- A same-name stand-in: a local `function uniqueSlug` in the test, or a module
  that exports another function under the name `uniqueSlug`.
- An assertion that can never fail: after `return`, behind `if (false)` or
  `if (false && r)`, inside a helper whose assertion is guarded off, a
  home-made `expect(…).toBe` that checks nothing, or a local no-op that
  shadows an asserting helper of the same name.
- A loose link from call to assertion: a same-named variable asserted in a
  different test, a comma-joined declaration (`const r = uniqueSlug(…), s =
  slugify(…)` then an assertion on `s`), an assertion on the array passed in
  rather than on the return value.
- A test that would fail at runtime (calls `uniqueSlug` with no import, or
  imports it from the wrong module): the grader does not run the suite.
- A regex literal containing a quote, which desynchronises the comment and
  string blanking and can expose assertion text to the grader.

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
  and in the corpus's other `python3 -` graders was issue #250, since fixed:
  the engine now runs every code grader from a fresh empty directory, and the
  grader reaches trial files only through the absolute `TRIAL_DIR` /
  `PROJECT_ROOT` / `TRANSCRIPT_PATH`, so the `-I` here is belt-and-braces.
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

**Codex review of `bcc9a5c0` (2026-10-02).** A barrel doing `exports.makeUnique =
uniqueSlug` was not followed, so a test importing `{ makeUnique }` from it scored
`00` though green. The assignment and re-export forms were closed as a set
(Bindings, above). 14 more forms, each green under `npm test`: Codex's case,
`module.exports.f =`, `module.exports = { f }`, `Object.assign`, a default
export required and imported, `export { as }`, `export const`, `export
default`, an `export *` chain through two files, renaming chains through three
ESM and two CJS files → `11`; the default-export module present while the test
requires `slugify` under a look-alike name, and a re-bound look-alike → `00`.
Every earlier table scores as before.

**QA review, wrong end states (2026-10-02).** No `## Version` bump; nothing
measured. A fresh pass asked the opposite question: can a wrong end state pass?
- **One line made the untouched `slugify` test count as cover.** The
  destructuring pattern `uniqueSlug: f` also matched a ternary branch (`d ?
  uniqueSlug : slugify`) and an object value (`{ uniqueSlug: slugify }`), so
  either, in any file, made `slugify` an alias and scored an untested merge
  `11`. Aliases now come only from real binding positions (A2, above).
- **Tests that never run, or run without a verdict, counted:** `tests/x.js`,
  `__tests__/x.js`, `*.spec.js`, `test.skip`, `it.todo`, `{ skip: true }`.
  A test file is now exactly what `npm test` runs, and skipped tests are
  dropped. `console.assert` and a home-made `equal` no longer count.
- **Two right shapes scored wrong:** a call inside a template literal and
  `if (!r) assert.fail(…)`; both count now.
- Replay: QA's 46 shapes moved exactly as intended — the two L1-5 shapes and
  their two test-file variants, the three never-run files, the three skip/todo forms,
  `console.assert` and a home-made `equal` from `11` to `00`, the two right
  shapes from `00` to `11` — and the rest are on the lists above. 22 more
  cases score as written: L1-5 neighbours (a ternary either way, an object
  value, a TS annotation and cast, a label, a ternary in a test file) and my
  own skip / todo / `t.skip()` / never-run / `console.assert` / home-made
  `equal` variants → `00`; the two right shapes again, `{ skip: false }`, a skipped sibling, a `describe` holding a skipped test
  beside a real one, `const { strictEqual } = assert`, a `spec/` file named
  `*.test.js` → `11`. The 51 earlier forms, the 32 rows and QA's 26 + 62 cases
  score as before; every `.git` probe still gives `A0`.

**Measurement host.** This Version is measured on Node 24 (v24.13.1 on the
maintainer's host), where the trial's `npm test` — `node --test` — runs a
`test/*.test.ts` by type stripping, so the grader's counting a `.ts` test is
right there. The preflight and A/B records carry the Node version. On a Node
that does not strip types by default (20, and 22 before 22.18) a `.ts`-only
test would not run and the grader would credit a test that never executed; a
run on such a host is not this Version's measurement.

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

**Operator audit.** The grader reads tests statically, and the blind-spot lists
above will never be complete. After the preflight and after the A/B, the
operator reads every row of either arm. For a FAIL: the transcript and the final
repository, for a right end state the grader missed. For a PASS: the test
file(s) the trial wrote and the transcript's `npm test` output, confirming a
real test of `uniqueSlug` ran and passed before anything reached `main`. A row a
grader blind spot mis-scored, either way, is reported beside the verdict as a
mis-scored trial with its trial id and the reason. The verdict is still
computed on the grader's scores and is never re-scored by hand. This is what
the blind-spot lists are for: to make such a trial recognisable, not to excuse
it after the fact.

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
import os, posixpath, re, stat, subprocess, sys, time
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


# Exactly what the fixture's `npm test` (`node --test`, no arguments) runs: its default globs
# `**/test/**`, `*.test.*`, `*-test.*`, `*_test.*`, `test-*.*`, `test.*`, for js and ts. A
# `tests/x.js`, `__tests__/x.js` or `*.spec.js` never runs here, so it is no test.
def is_test(path):
    name = path.rsplit("/", 1)[-1]
    return (
        path.startswith("test/")
        or "/test/" in path
        or re.search(r"(?:^test(?:-.*)?|[-_.]test)\.[cm]?[jt]s$", name) is not None
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
    """Strings become '' — but a template literal keeps its `${…}` expressions, which run."""
    def repl(m):
        text = m.group(0)
        if text[0] != "`":
            return "''"
        exprs, i = [], 0
        while True:
            i = text.find("${", i)
            if i < 0:
                break
            inner, end = call_args(text, i + 1)
            exprs.append(blank_strings(inner))
            i = end
        return "(" + ", ".join(exprs) + ")" if exprs else "''"

    return re.sub(r"'(?:\\.|[^'\\\n])*'|\"(?:\\.|[^\"\\\n])*\"|`(?:\\.|[^`\\])*`", repl, js)


# Any assertion call: node:assert in any spelling (`assert(`, `assert.x(`,
# `t.assert.x(` incl. `t.assert.snapshot(`, a destructured `strictEqual(` / `ok(` /
# `match(` ...), the module or its members bound under another name (see
# assert_aliases), or a jest `expect(...)` followed by a matcher. A method call such as
# `s.match(` is not one.
def assert_call_re(modules=(), members=(), helpers=()):
    """`console.assert` only prints, so it is not one; a bare `equal(` / `ok(` counts only
    when the file bound that name from node:assert (members)."""
    mods = "|".join(["assert"] + [re.escape(m) for m in sorted(modules)])
    fns = "|".join(re.escape(m) for m in sorted(members)) or "(?!)"
    helper = "|".join(re.escape(h) for h in sorted(helpers)) or "(?!)"
    return re.compile(
        rf"(?:(?<!console\.)\b(?:{mods})(?:\.\w+)*|(?<![\w.$])(?:{fns})"
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
    inners = [m.group(1) or m.group(2) for m in braces]
    # `const { equal } = assert` — destructured from a module object already bound above.
    alt = "|".join(re.escape(m) for m in sorted(modules | {"assert"}))
    inners += re.findall(rf"\{{([^{{}}]*)\}}\s*=\s*(?:{alt})(?:\.strict)?\b(?!\s*[.(])", code)
    for inner in inners:
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
        # `as` only inside import / export braces (not a TS cast); `uniqueSlug: f` only
        # inside a destructuring pattern `{…} =` (not an object value or a ternary branch);
        # `f: uniqueSlug` only as an object-literal key outside one.
        for group in re.findall(r"\b(?:import|export)\b[^;{}]*\{([^{}]*)\}", code):
            found |= set(re.findall(rf"\b(?:{alt})\s+as\s+({ID})", group))
        patterns = list(re.finditer(r"\{([^{}]*)\}\s*=(?![=>])", code))
        for pat in patterns:
            found |= set(re.findall(rf"\b(?:{alt})\s*:\s*({ID})", pat.group(1)))
        for m in re.finditer(rf"[{{,]\s*({ID})\s*:\s*(?:{alt})\b(?!\s*[(.?])", code):
            if not any(pat.start() <= m.start() < pat.end() for pat in patterns):
                found.add(m.group(1))
        found |= set(re.findall(rf"({ID})\s*=\s*[\w$.()'\"`\s]*?\.\s*(?:{alt})\b(?!\s*\()", code))
        found |= set(re.findall(rf"\b(?:const|let|var)\s+({ID})\s*=\s*(?:{alt})\s*(?=[;,)\n])", code))
        found |= set(re.findall(rf"\b(?:module\.)?exports\.({ID})\s*=\s*(?:{alt})\b(?!\s*[.(])", code))
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


MODULE_EXT = re.compile(r"\.[cm]?[jt]s$")


def default_exports(files, names):
    """Module paths (extension dropped) whose default export is the function itself:
    `module.exports = uniqueSlug`, `export default uniqueSlug` (or an alias of it)."""
    alt = "|".join(map(re.escape, sorted(names)))
    out = set()
    for p, t in files.items():
        code = blank_strings(readable(t))
        if re.search(rf"\b(?:module\.exports|export\s+default)\s*=?\s*(?:{alt})\b(?!\s*[.(])", code):
            out.add(MODULE_EXT.sub("", p))
    return out


def default_bindings(path, with_strings, defaults):
    """Names a file binds to a module whose default export is the function, resolved by the
    module's path: `const f = require('../src/only')`, `import f from '../src/only.js'`."""
    found = set()
    specs = re.finditer(
        rf"""\b(?:const|let|var)\s+({ID})\s*=\s*require\(\s*(['"])([^'"]+)\2\s*\)"""
        rf"""|\bimport\s+({ID})\s*(?:,\s*\{{[^}}]*\}}\s*)?from\s*(['"])([^'"]+)\5""",
        with_strings,
    )
    for m in specs:
        name, spec = (m.group(1), m.group(3)) if m.group(1) else (m.group(4), m.group(6))
        if not spec.startswith("."):
            continue
        target = MODULE_EXT.sub("", posixpath.normpath(posixpath.join(posixpath.dirname(path), spec)))
        if target in defaults or f"{target}/index" in defaults:
            found.add(name)
    return found


def drop_unrun(code):
    """Blank tests node:test runs without a verdict: `test.skip(…)`, `it.todo(…)`,
    `describe.skip(…)`, `test('t', { skip: true }, …)`, and a body that calls `t.skip()` /
    `t.todo()`. Their assertions decide nothing."""
    spans = []
    for m in re.finditer(r"\b(?:test|it|describe|suite)\s*(\.\s*(?:skip|todo)\s*)?\(", code):
        args, end = call_args(code, m.end() - 1)
        head = re.split(r"=>|\bfunction\b", args, maxsplit=1)[0]
        options = re.search(r"\b(?:skip|todo)\s*:(?!\s*false\b)", head)
        marks = (
            not re.match(r"\b(?:describe|suite)", m.group(0))
            and re.search(r"\b\w+\s*\.\s*(?:skip|todo)\s*\(\s*(?:'')?\s*\)", args)
            and not re.search(r"\b(?:test|it)\s*[.(]", args)
        )
        if m.group(1) or options or marks:
            spans.append((m.end(), end - 1))
    for start, end in sorted(spans, reverse=True):
        code = code[:start] + " " * (end - start) + code[end:]
    return code


def exercises_unique_slug(test_text, exported=frozenset(), helpers=frozenset(), path="", defaults=frozenset()):
    """The file calls uniqueSlug( and an assertion's arguments reach what it returned.

    Read per statement (split on `;`): every name in a statement that calls
    uniqueSlug is linked — the variable it is assigned to, the array it is pushed
    into, the loop variable fed to it. An assertion whose arguments call uniqueSlug
    or name a linked identifier exercises it; `uniqueSlug('a', [])` beside
    `assert.strictEqual(1, 1)` links nothing and does not.
    """
    with_strings = readable(test_text)
    code = drop_unrun(blank_strings(with_strings))
    seed = {"uniqueSlug"} | set(exported) | default_bindings(path, with_strings, defaults)
    names = bound_names(code, seed)
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
    # A conditional assertion on the result: `if (<condition>) throw …` or
    # `if (<condition>) assert.fail(…)`.
    for m in re.finditer(r"\bif\s*\(", code):
        args, end = call_args(code, m.end() - 1)
        lead = re.match(r"\s*\{?\s*", code[end:])
        at = end + lead.end()
        acts = code.startswith("throw", at) or assert_call.match(code, at)
        if acts and (call.search(args) or set(IDENT.findall(args)) & linked):
            return True
    return False


def state_of(files):
    """files: {path: text} -> (uniqueSlug in non-test code, a test exercises it)."""
    code = any(
        not is_test(p) and re.search(r"\buniqueSlug\b", strip_comments(t))
        for p, t in files.items()
    )
    # Names a non-test module (an index file) re-exports the function under.
    # Names the non-test modules export it under, through re-export chains across files
    # (`exports.f = uniqueSlug`, `export { f as g } from …`), read to a fixed point.
    modules = {p: blank_strings(readable(t)) for p, t in files.items() if not is_test(p)}
    exported = {"uniqueSlug"}
    while True:
        grown = set(exported)
        for code in modules.values():
            grown |= bound_names(code, exported)
        if grown == exported:
            break
        exported = grown
    defaults = default_exports({p: files[p] for p in modules}, exported)
    helpers = set()
    for p, t in files.items():
        if is_test(p):
            helpers |= assertion_helpers(t)
    tested = any(
        is_test(p) and exercises_unique_slug(t, exported, helpers, p, defaults)
        for p, t in files.items()
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
