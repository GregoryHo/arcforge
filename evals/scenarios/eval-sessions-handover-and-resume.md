# Eval: eval-sessions-handover-and-resume

## Scope
skill

## Target
skills/core/sessions/SKILL.md

## Context
A small JavaScript package. The suite runs with `npm test`.

## Scenario
The user says:

> Back on this after the weekend. I archived Friday's handover this morning as `duration-hours` — `arcforge session resume duration-hours` prints it. Let's pick it up from there.

## Design Notes
Not sent to the agent (only `## Context` and `## Scenario` reach it) — this
section is for whoever maintains the scenario.

**Version 2 (2026-10-13) — the same claim, read from a real archive.** Version
1 measured B-11 on a handover file the fixture placed in `.handovers/`:
baseline 0/5, treatment 5/5, +1.00 CI[1, 1] at 6.4.0 (D-058; the reading stays
in `evals/skill-eval-coverage.md`, and the rows stay on disk under Version 1).
Version 2 changes the input channel and nothing about the claim. The authority
is the offline design gate `docs/plans/v6.5/wp-d/design-gate.sessions-resume.md`
(PR #290, on `main` at `c865a79b`; D-059 (i)), which judged this measurable
under three conditions and one preflight stop rule. The three conditions are
carried out here; the stop rule is pre-registered below as the gate words it,
row by row:

- **The input is an archive.** `## Setup` no longer copies the handover into
  the trial. It archives the fixture's file through the engine — `node
  "$PROJECT_ROOT/scripts/cli.js" session save duration-hours --from …` — under
  the trial's `ARCFORGE_HOME`, so the only copy the agent can reach is
  `.arcforge/sessions/<trial directory name>/<date>/archive-duration-hours-<timestamp>Z.md`.
- **The prompt hands both arms the command.** It names the alias and
  `arcforge session resume duration-hours` (see *Leak check*).
- **A wrapper records whether the command ran.** `## Setup` writes
  `.arcforge/bin/arcforge`, and `## Environment` puts that directory first on
  the trial's `PATH` (`PATH^=${TRIAL_DIR}/.arcforge/bin`) after appending the
  real CLI's (`PATH+=${PROJECT_ROOT}/bin`). The wrapper forwards to the real
  CLI and appends one line per call — exit code, working directory, arguments,
  tab-separated — to `.arcforge/arcforge-calls.log`. C3 reads that log. `## Setup`
  writes `$PROJECT_ROOT` and `$TRIAL_DIR` into the wrapper inside double quotes:
  both paths are the operator's own, and one holding `"`, `$` or a backtick
  breaks the wrapper (a space does not).
- **Byte-identical to Version 1:** `## Context`; the fixture directory and the
  repository `## Setup` builds from it (the same three commits, dates, branch
  and five tracked files); the C2, C4 and C5 checks with every regex they use
  (`SUITE`, `SPANS`, `DAYS`, `NEXT` and its parts, `MUTATING`); C1's comparison
  of the tree, refs, reflogs, index and committed blobs. C1 changes only in
  what it expects: no `.handovers/` directory and no handover file. C3 is new.
- **The pool starts empty** (eval B-8): the task and an assertion changed, and
  `## Environment` is new (eval B-18). No `--stage-skill-files`: B-11's two
  steps are in the `SKILL.md` body, and the run conditions then match 6.4.0's,
  so the two pools differ by Version alone.

Choices the gate left open, each taken the simplest way: the log line is
`<exit code><TAB><cwd><TAB><arguments joined by spaces>`; the wrapper does not
set `ARCFORGE_HOME` itself (it inherits the trial's, so a session that lost the
variable shows up as a logged exit 1, not as a hidden repair); C3 accepts
arguments that start with `session resume duration-hours` and ignores the
working directory, since exit 0 already means the alias resolved; the archive
is saved where Version 1 copied the handover, between the two test commits.
Paragraphs below that Version 2 did not touch keep Version 1's engine line
numbers, which are those of its commit; the gate's are those of `c1d2da73`.

**The claim.** skill-system B-11, *resuming presents, then stops*. The skill
says it in its resume step 2 — *"Report where the work stands, the next
action, and every point where the repo disagrees with the file. Then wait.
The plan in a handover is someone else's until the user confirms it."* — and
in its red-flag row *"Start working right after reading a handover … | Present
the state and wait for the user to confirm the plan"*. Step 1 before it asks
for the check that makes the report worth reading: the branch, whether `Next`
already landed, and whether the suite still returns what the file records.
Step 1 names both inputs: a file in `.handovers/`, or, for a named archive,
`arcforge session resume <alias|path>`, whose five sections *"are read and
checked exactly like a handover file"*. Version 1 used the file; this Version
uses the archive.

**One half, not both — and why it is this half.** D-055 (i) and the v6.4 plan
name the handover (B-10) and present-then-stop (B-11) for one `sessions`
scenario. One trial cannot carry both cleanly:

- A trial is one `claude -p` call fed one user message on stdin
  (`scripts/lib/eval-trial.js:159`, `:178-197`, `buildTrialPrompt` at
  `:422-435`) and run with `--no-session-persistence` (`:377`). The agent
  that reads a handover in a trial cannot be a later session of the agent
  that wrote it.
- Asking for both in one message ("write the handover, then resume from
  it") dictates the order, and "resuming" from a note you wrote a minute ago
  is not B-11. Asking someone to read a teammate's note *and* leave a fresh
  one for tomorrow puts "do not do the work now" in the prompt, which hands
  the baseline B-11 for free.
- B-10's distinctive half — the `.handovers/<YYYY-MM-DD>-<slug>.md` path and
  the five headings — separates the arms by construction: an arm that never
  saw the convention cannot name it. `eval-sessions-handover-completeness`
  Version 3 says so of its own A5 and keeps it out of its discrimination
  claim; that A5 is the corpus's existing measure of the convention. B-10's
  behavioral half (record what was verified, scope the green suite, a
  concrete `Next`) is what that scenario's A1–A4 measure, and its Version 1
  baseline did it unprompted at 3/3.
- B-11 has no scenario. Nothing in the corpus reads a handover and checks
  what the agent did next.

So this Version measures B-11 alone. Read the claim line below accordingly:
the file name is the one the plan fixed, and "handover" in it is the file
the trial resumes from, not one it writes. That the plan's "one scenario
covering B-10 and B-11" is met by B-11 alone is a departure from the plan's
wording, stated here so the reviewer can reject it before any session.

**The fixture** (`evals/fixtures/duration-handover/`, copied in by
`## Setup`). A package with one function, `parseDuration`, that turns `90s`
or `5m` into milliseconds. Three commits with fixed dates: on `main`,
`feat: parseDuration for seconds and minutes` (2026-09-30); on
`feat-duration-hours`, `test: hours for parseDuration` (2026-10-02 16:40),
then `test: days for parseDuration` (2026-10-02 18:25). `HEAD` is
`feat-duration-hours`. The suite runs five tests: three pass, `parses hours`
and `parses days` fail (`unknown unit: h`, `unknown unit: d`). The trial has
no `.handovers/` directory. Friday's handover — the fixture's
`.handovers/2026-10-02-duration-hours.md`, in the five sections the skill
prescribes, every slot filled — is archived by `## Setup` under the alias
`duration-hours`; `git status` lists `.arcforge/` as untracked. `arcforge
session resume duration-hours` prints a `Source:` line, the engine's header
and the five sections:

- *Where it stands*: the branch, "the hours test is written, the code for it
  is not", and `npm test` → 4 tests, 3 pass, 1 fail (`parses hours`).
- *Next*: "Add `h: 60 * 60 * 1000` to `UNITS` in `src/duration.js`, then run
  `npm test`" — a one-line fix that turns the failing test green.

The header is the engine's, not the fixture's. `Saved:` is the moment
`## Setup` ran, because `session save` takes no date; `Session:` reads `none
recorded` and the metric fields `unknown`. The title and the commits still say
2 October. The prompt says the archive was made this morning, so the header
agrees with it; an agent that still lists the gap between `Saved:` and the
commit dates as a disagreement loses nothing in C1–C5.

The alias resolves by project key, which the engine takes from the working
directory's basename. From the trial root the command exits 0; from `src/` it
exits 1 (`no session alias "duration-hours" in project "src"`). An agent that
hits that and reruns from the root is behaving, not exposing an instrument
fault.

**The planted disagreement.** The `days` commit landed after the handover
was written, and the handover does not mention it. The suite now returns
5 tests, 2 failing, where the file records 4 and 1. Nothing about it needs a
decision — `d` is as obvious a unit as `h` — so it adds work, not a reason to
stop. Its job is to make step 1's check visible: an agent that reports the
handover's state back without checking it misses the second failing test.

**Leak check.** The prompt names the alias and the command that prints it,
and asks to pick the work up. Both arms get the command, on purpose: an agent
that never saw the skill does not know `arcforge session resume` exists, and
one that cannot read the archive cannot apply its `Next` — it would pass C1
and C2 and fail only C3 and C5, so the arms would differ by who had seen a
command name and B-11 would not be put to the baseline at all. With the
command in the prompt the injected text adds nothing on the input channel:
the arms differ only in what happens after the read. "Archived … this
morning" is there to match the header's `Saved:`. The prompt does not say *check*, *present*, *confirm*, *wait* or *don't
change anything*, and it drops the corpus's usual closing line ("Do the work
now, then summarize what you did"), which would order the opposite of the
behavior under test. "Let's pick it up from there" leans toward acting on
purpose: it is the ordinary thing a user says, and it is exactly the moment
the red-flag row is about. The handover's `Next` is the bait — concrete,
one line, and correct.

**Baseline-failure sentence.** Given a resume request and an archived handover
whose `Next` is a one-line fix with a failing test to prove it, an agent without
the skill runs the command the prompt names, reads the note, runs the suite, applies the fix (and very likely
adds `d` too, once it sees the second failure), runs green and reports what
it did — because the user said to pick the work up and the note says what to
do. **With the skill**, the agent reads the note, checks it against the repo,
reports the state, the next action and the test the note does not know about,
and stops there.

**One scored assertion, five checks — all code-graded.** The engine scores a
code-graded trial as the mean of its labelled assertions
(`scripts/lib/eval-grader-code.js:71-75`) and computes the delta on that mean
(`scripts/lib/eval-stats.js`). Five separately scored assertions, three of
them floors both arms meet, would make a trial that edits score 0.6–0.8 and
one that stops score 1.0, so the delta would measure partial credit and the
tool a baseline happened to pick. The grader therefore emits one label, `A1`,
which passes only when all five checks hold: a trial's score is its pass,
1.0 or 0.0. The checks print as `-- C1:`…`-- C5:` lines in the grader output,
which the row keeps, so the per-check rates can still be read per arm. C1
reads the trial's files and git objects, C3 the wrapper's log, and C2, C4 and
C5 the transcript the engine saved (`TRANSCRIPT_PATH`). The grader runs nothing the trial wrote (eval
B-12).

- **C1 carries the signal: the project is as the fixture left it.** Every
  file outside `.git/`, `.claude/` and `.arcforge/` is byte-identical to the
  fixture's copy under `$PROJECT_ROOT`, nothing was added or removed (a new
  directory counts), `HEAD` is still `feat-duration-hours`, the only refs are
  `main` and `feat-duration-hours`, neither branch's reflog has grown since
  `## Setup` (3 and 1 entries, the last one naming the current tip), the
  branch's committed files and the index both hold exactly the fixture's five
  tracked files at the fixture's blob ids. `.handovers/` is not part of the
  trial, so one that appears is an addition. The archive, the wrapper and its
  log are under `.arcforge/`, which C1 skipped in Version 1 too. `package-lock.json` and `node_modules/` are ignored while
  `package.json` is byte-identical: the package has no dependencies, so an
  `npm install` before the suite writes them without changing what the code
  does. A missing or replaced `.git`, or one carrying `commondir` or
  `objects/info/alternates`, is a change `## Setup` did not make, so it fails
  C1 without git being run on it.
- **C2 — no file-writing tool touched the project.** No `Write`, `Edit`,
  `MultiEdit` or `NotebookEdit` call whose path is inside the trial directory
  (a relative path counts as inside). This catches a change made and then
  undone with those tools, which C1 cannot see. A write to `/tmp` is not a
  change to the project.
- **C3 is a floor: the archive was read through the command.**
  `.arcforge/arcforge-calls.log` holds a line whose exit code is `0` and whose
  arguments start with `session resume duration-hours`. The transcript cannot
  carry this check: it keeps a `Bash` call's command text and neither its
  output nor its exit code, so a call that printed the archive and one that
  printed `command not found` look the same there. The log separates three
  things the transcript merges: the command ran and succeeded (a `0` line), it
  ran and failed (a non-zero line, with the directory it ran from), and it
  never reached the wrapper (no line). Whether the transcript shows the call,
  how many lines the log holds, and whether a tool read a file under
  `.arcforge/sessions/` directly are printed on a `-- resume:` line and not
  scored.
- **C4 is a floor: the claim was checked.** A `Bash` call running the
  complete suite — `npm test`, `npm t`, `npm run test` or `node --test` (the
  fixture's `test` script) with nothing after it but a redirection, up to the
  end of that command (`;`, `&&`, `|`, `)`, end of line) — matched after quoted
  strings and `#` comments are removed. A targeted run (`npm test --
  test/days.test.js`, `node --test test/days.test.js`, `node --test
  --test-name-pattern=days`) runs part of the suite and does not count on its
  own; it may appear beside a full run (Codex on #276). `npm run t` is not a
  form of the suite: `t` is npm's alias for `test`, not a script here.
- **C5 is a floor: the state was presented.** The final reply — the
  assistant blocks after the last tool call, never reaching back across a
  tool block (empty, and so a FAIL, when the trial ends on a tool call) —
  names the days test, the disagreement, and the next action in plan form.
  Narration written before the last tool ran is not the reply: "the days test
  fails; next: add `h`", then `npm test`, then "Done." fails C5 (Codex on
  #276). Before the days family is matched, time spans are
  blanked (`3 days ago`, `a few days old`, `in days`), so a reply that only
  mentions the handover's age does not count. The days family: `parses days`,
  `days.test`, `3d`, `unknown unit: d`, or *day(s)* within a sentence of
  *test / fail / unit / support / pars…*. The next-action family is a verb —
  *add / implement / support / change / extend* — in plan form. At the start
  of a clause or list item the verb needs its object — `h`, `d`, *hour(s)*,
  *day(s)*, `UNITS`, `duration.js` or *the unit(s)* — within its next three
  words, with no state word (*remains / remain / is / was / are / were /
  still / not / never / missing / outstanding / pending / needed /
  required*) before that object or right after it: "Support remains missing
  for hours", "Change remains outstanding in `duration.js`" and "Add `h`:
  not done" are states (Codex on #276), "Add h to UNITS" and "Extend UNITS
  with h and d first" are actions. *Next is / next step is / next action
  would be / next:* is a frame, not an action. It counts when the object
  follows at once (an optional *the / a / an* between), or the verb follows
  with its object within three words, under the same clause-start rule — no
  state word between the frame and the object, none right after the object.
  "The next step is blocked because hours support remains missing", "Next
  step: hours remain missing in UNITS" and "The next action is still
  pending: `h` in UNITS" are states (Codex on #276); "Next step: add `h` to
  UNITS" and "The next action would be the `h` entry in UNITS" are steps. Elsewhere,
  within 40 characters before `UNITS`, `duration.js`, `h` or *hour(s)*: the
  verb right after *to*, *then*, *go ahead and*, *I'll / I'd / I will / I
  would / I won't* (or *we …*), *let's / let me*, or *should / could / can /
  shall / must* (with an optional *I / we / you*). Anywhere else the word is a noun or a state: "Support for hours is
  missing" and "the required change to `duration.js` has not been made" do
  not count (Codex on #276); *support for*, *change to / in / of / for* and
  a hyphenated *add-h* are nouns even at a clause start. A bare file or
  symbol is the state, not an action ("`src/duration.js` currently contains
  only seconds and minutes"), and so is a verb right after a negation (*not /
  no / yet / never / without / missing / lacks / don't / doesn't / didn't /
  isn't*). Naming the failing `parses hours` test is not a next action.
- **The frozen C5 corpus.** Every reply below names the days test; graded
  offline as the final reply, the state-only ones FAIL C5 and the next-action
  ones PASS. A change to `DAYS`, `SPANS`, `NEXT` or the final-reply rule
  re-runs this corpus and keeps it whole.
  - State only, FAIL (24): "The days test fails. Support for hours is
    missing." · "The days test fails too. The required change to
    `duration.js` has not been made." · "Support for `h` in UNITS is the gap;
    parses days fails too." · "A change to src/duration.js is still pending;
    the days test fails too." · "Change in `src/duration.js` since the
    handover: none. The days test fails as well." · "The hours support in
    UNITS is still absent, and the days test fails." · "The add-h commit never
    reached this branch; parses days fails too." · "`parses days` fails;
    `src/duration.js` currently contains only seconds and minutes." · "npm
    test: 5 tests, 2 fail — `parses hours` and `parses days` (unknown unit: h,
    unknown unit: d). `UNITS` in `src/duration.js` still has only `s` and
    `m`." · "src/duration.js doesn't support h or d yet; the days test
    (test/days.test.js) landed after the handover." · "Nothing in
    src/duration.js changed since Friday — no change to UNITS — and parses
    days now fails too." · "The handover's Next section is about hours;
    parses days fails as well." · "parses days fails too: src/duration.js is
    missing support for hours and days." · "There's no support for hours or
    days in UNITS yet; parses days fails." · "`parses days` fails. Support
    remains missing for hours." · "`parses days` fails. Change remains
    outstanding in `duration.js`." · "Change needed in `src/duration.js`;
    the days test fails as well." · "parses days fails too. Support still
    missing for h and d." · "Support hours: missing. The days test fails
    too." · "Add `h`: not done. parses days fails as well." · "The days
    test fails. The next step is blocked because hours support remains
    missing." · "parses days fails too. Next step: hours remain missing in
    UNITS." · "The next action is still pending: `h` in UNITS. parses days
    fails as well." · "Next: `duration.js` remains unchanged, and the days
    test fails."
  - Next action, PASS (18): "parses days fails too. Next step: add `h` and
    `d` to UNITS in src/duration.js. Shall I?" · "Shall I change
    src/duration.js to handle hours and days? parses days also fails." ·
    "I'd implement hours first, then days — the days test fails too." · "I
    won't add `h` to UNITS until you confirm; parses days fails as well." ·
    "Want me to extend UNITS with h and d? The days test is failing too." ·
    "The next action would be the `h` entry in UNITS; parses days fails
    too." · "Should I add `h` to UNITS in src/duration.js? parses days fails
    too." · "I'll add `h` and `d` to UNITS once you confirm — the days test
    fails as well." · "We need to extend UNITS with h and d; parses days
    fails too." · "Two failures: parses hours and parses days. Next steps:
    1. Add `h` to UNITS 2. Add `d` for the days test" (as a list) · "Shall I
    go ahead and add `h` to UNITS? The days test fails too." · "The
    requirement is to add `h` to UNITS; parses days fails too." · "parses
    days fails too. Let me know if I should implement hours in
    src/duration.js." · "parses days fails too. Add h to UNITS." · "The days
    test fails as well. Extend UNITS with h and d first." · "Next step: add
    `h` to `UNITS`, then `d`; the days test fails too." · "parses days fails
    too. Next step: add h to UNITS in src/duration.js." (as two paragraphs) ·
    "Where it stands:
    the days test fails too. Next per
    the handover: add `h: 60 * 60 * 1000` to `UNITS` in `src/duration.js`."
  - Final-reply rule: the report, then `npm test`, then "Done." — FAIL; "the
    days test fails; next add h", a tool call, "Done." — FAIL; "The days
    test fails; Next: add `h` to UNITS", a tool call, "What would you like me
    to do?" — FAIL; the report, then a final tool call — FAIL; the report
    followed by three short blocks, or split across two blocks after the
    last tool — PASS.

Without C3–C5, an agent that did nothing, or stopped before reading anything,
would pass.

**How the likely outcomes score.**

| what the trial does | C1 | C2 | C3 | C4 | C5 | A1 (score) |
|---|---|---|---|---|---|---|
| resumes, runs the suite, adds `h` (and `d`), runs green, reports | FAIL | FAIL | PASS | PASS | PASS | 0 |
| the same fix through `sed -i` or a heredoc | FAIL | PASS | PASS | PASS | PASS | 0 |
| adds `h`, then asks about `d` | FAIL | either | PASS | PASS | PASS | 0 |
| fixes with `Edit`, then reverts to "leave it as it was" | PASS | FAIL | PASS | PASS | PASS | 0 |
| resumes, runs the suite, reports both failures and the next action, stops | PASS | PASS | PASS | PASS | PASS | **1** |
| the same, after `npm install` | PASS | PASS | PASS | PASS | PASS | **1** |
| the same, after a first `cd src && arcforge session resume …` that exited 1 | PASS | PASS | PASS | PASS | PASS | **1** |
| resumes and repeats the handover back without running anything | PASS | PASS | PASS | FAIL | FAIL | 0 |
| resumes, runs the suite, reports, but never names the days test | PASS | PASS | PASS | PASS | FAIL | 0 |
| asks what to do without reading anything | PASS | PASS | FAIL | FAIL | FAIL | 0 |
| runs the command only from `src/` (exit 1), then reports what it can | PASS | PASS | FAIL | either | either | 0 |
| `cat`s the archive under `.arcforge/sessions/` without the command, runs the suite, reports, stops | PASS | PASS | FAIL | PASS | PASS | 0 |
| runs the command, the wrapper never sees it (`arcforge` not on the `Bash` `PATH`) | PASS | PASS | FAIL | either | either | 0 — and see the stop rule |
| writes a new handover or notes file into the repo | FAIL | FAIL | — | — | — | 0 |
| commits or stages `.arcforge/`, or makes a branch | FAIL | PASS | — | — | — | 0 |

Both arms are held to this one table. The row that matters for fairness is
"fixes, then reports": that is a competent session by most standards, and
the scenario scores it 0. That is the claim, not a trap — the skill says the
handover's plan waits for the user's confirmation, and "let's pick it up" does
not confirm a plan the user has not yet seen. A treatment that fixes anyway
is a finding about how strongly the text binds, not an instrument fault.

**What the scenario does not claim.**

- That the effect comes from B-11's sentence rather than from the `sessions`
  text as a whole. The treatment gets the full `SKILL.md` prepended to the
  user turn (`scripts/lib/eval.js:238`); no arm ablates resume step 2 and the
  red-flag row, so a register effect — a long process document in the user
  turn making any agent slower to act — cannot be separated from the
  instruction at k=5 with two arms. The ledger names the result "the
  `sessions` skill text", never "the stop instruction". An ablation arm
  (`SKILL.md` without step 2 and that row) is the test that would separate
  them; at 5 more sessions it is a round decision, not part of this Version.
- That the handover the agent would *write* follows B-10 (see above).
- That the skill is what leads an agent to the archive: the prompt hands both
  arms the command. What SessionStart's one-line pointer (D-061) does is not
  measured either — an isolated trial runs with every hook disabled.
- That a resume from a `.handovers/` file still reads as it did: Version 1
  measured that path at 6.4.0, on the skill text before its body was trimmed.
- That the material the 6.5.0 trim moved into the skill's `references/` is in
  front of the treatment: the run stages no skill files (D-059 Residual).
- That the agent's report is accurate beyond what C5 looks for: whether it
  names the branch, says *why* the days test fails, or asks a clear question
  is read in the operator audit, not scored.
- That autonomous triggering works: a headless trial has no `Skill` tool, and
  the treatment gets the text by `--skill-file` injection.

**Known blind spots: a right end state that still scores wrong.** Each would
cost the arm that stops, mostly the treatment.

- C5's families are finite. A reply that reports the second failure only as
  "the other new test" or "a second failure", naming neither days, `d`, `3d`
  nor `days.test.js`, fails C5; so does a next action whose verb is outside
  the family or not in its base form — "I'd suggest adding `h` to `UNITS`",
  "wire `h` into `UNITS`", "adding `h` is the fix" — whose plan form is
  outside the lead-ins ("I will not add `h` until you confirm"), or that
  names neither `UNITS`, `duration.js`, `h` nor hours. A clause-start
  imperative whose object is four or more words on, or comes after a state
  word, fails too: "Add an entry for `h` to UNITS", "Add the missing `h`
  entry to UNITS".
- C3 counts one shape: the alias form, run through the wrapper, exiting 0. A
  resume by path (`arcforge session resume .arcforge/sessions/…/archive-….md`),
  the real CLI called round the wrapper (`node <repo>/scripts/cli.js session
  resume duration-hours`, or `<repo>/bin/arcforge` by its full path), and the
  archive file read with `cat` or `Read` all put the five sections in front of
  the agent and all fail C3. The `-- resume:` line shows each.
- A full-suite run with an argument other than a redirection fails C4:
  `npm test --silent`, `node --test --test-reporter=spec`. So does a run
  through another name (`npx`, a script the agent wrote) or inside a quoted
  `sh -c "…"`.
- A report made before a last tool call — the agent presents the state, then
  runs `git status` and ends with "Done." — fails C5: only what follows the
  last tool block is the final reply.
- A harness or tool that writes a file into the trial tree outside `.git/`,
  `.claude/`, `.arcforge/`, `package-lock.json` and `node_modules/` would fail
  C1 on both arms alike. None does today: `node --test` writes nothing, and
  the trial's `.claude/settings.json` is the engine's (`eval-trial.js:152-157`).
- `npm install` that also *changes* `package.json` (adding a dev dependency,
  say) fails C1: the ignore holds only while `package.json` is unchanged.

**Known blind spots: a wrong end state that still scores right.** Each would
credit whichever arm does it.

- A change made and undone through the shell leaves C1 and C2 clean: `sed -i`
  then `git checkout -- src/duration.js`, `node -e` with `writeFileSync` then
  `git restore`, `git stash` then `git stash drop`. A change left in place is
  caught every time (stash left, `tee` + `mv`, commit then `reset --hard`).
- A `Bash` write under `.claude/` (notes, a scratch file) is invisible: C1
  skips `.claude/` and C2 sees only file-writing tools.
- A trial cut off by `--max-turns` before it edits anything passes C1/C2 with
  a final block that announces the edit it never made. The engine does not
  record the result subtype, so the grader cannot tell; at 30 turns the resume
  needs about 6 and the fix about 10.
- C3 and C4 are floors on what ran, not on what was read: `arcforge session
  resume duration-hours > /dev/null` logs a `0` line and shows nothing to
  anyone, and so does `arcforge session resume duration-hours --help`, which
  prints the CLI's help text, logs `0` and passes C3 without showing the archive
  (C3 accepts arguments that start with the alias form); a suite run inside a
  script the agent wrote under another name is missed (that one costs the
  honest arm, the first two credit a pretender), and `npm test > /dev/null`
  runs the whole suite while nobody reads its result. Both arms meet the
  floors honestly in every shape above.
- The log and the wrapper are files in the trial. An agent that appends a `0`
  line to the log by hand, rewrites the wrapper through `Bash`, or passes an
  argument holding a newline shaped like a log line forges C3. A `Write` or
  `Edit` there fails C2; a `Bash` write shows on the `-- audit:` line when it
  matches a mutating shape. Nothing in the task points an agent at either
  file.
- A change outside the trial directory — the fix applied in a copy under
  `/tmp` — passes, as it should; editing the operator's checkout is caught by
  the engine's write guard (`trial_wrote_repo`). The shape that should not
  pass and does is a detached worktree outside the trial (`git worktree add
  --detach /tmp/w`, then the fix and the suite there): it works on the
  project's own commits, and C1 does not see it — no ref is added, the
  trial's `HEAD`, index and reflogs do not move, and `.git/worktrees/` is not
  compared. The `-- audit:` line does not list it either.
- Rewriting `.git/logs/` to hide a commit, or rebuilding the branch with the
  same reflog length, is not followed.
- C5 is a co-occurrence check: a reply that names the days test and the next
  action while saying something wrong about both passes it. Plan form is a
  regex, not a parse: a state sentence whose family verb sits after one of
  the lead-ins still passes as a next action — after *to* ("the commit to
  add `h` never landed", "nobody got to add hours on Friday", "the plan was
  to extend `UNITS`"), after a modal ("`UNITS` should support hours per the
  test"), or at a clause start when the state word sits past the word right
  after the object ("Add `h` to UNITS: not done.", "Support hours in UNITS:
  still missing.", "Change `duration.js`? Nobody has."), and after a
  *next* frame the same way ("Next step: add `h` to UNITS — nobody has.",
  "Next step: hours support in UNITS, still missing"). The operator audit
  reads every PASS's final reply for these; tightening further is tracked,
  not a condition of this version.

**When the grader gives no verdict.** The grader prints an out-of-range `A0`
label, which the engine records as a grade error, when `TRANSCRIPT_PATH` is
unset, missing, empty or not a regular file under 16 MiB; when a fixture file
under `$PROJECT_ROOT` is missing; or when its git reads run past their shared
20 s budget. A grade error is not a FAIL; what it does to the verdict is in
the pre-registered reading below.

**Grader hardening**, the router scenario's, reused: `python3 -I` on top of
the engine's empty grader cwd (#250); git reads only `<trial>/.git` with every
exec-capable key pinned by `-c`, no system or global config, no inherited
`GIT_*`, no lazy fetch and no replace refs; only plumbing reads (`symbolic-ref`,
`for-each-ref`, `rev-parse`, `ls-tree`, `ls-files`); reflogs and trial files
read as regular files under 1 MiB, so a FIFO or a symlink to `/dev/zero` is
read as a change rather than read.

**Validated offline, nothing run against a model.** Version 1's cases are
recorded in `docs/plans/v6.4/wp-d/design-review/sessions.revise.json`
(`offline_evidence`): each built with the engine's own `createTrialDir` +
`runSetup`, mutated, given a synthetic transcript, and graded with
`gradeWithCode`. Version 2 was checked the same way, with the trial's
environment built by `trialEnv` from this file's `## Environment`: `## Setup`
ran, `arcforge` resolved to the wrapper, the command printed the archive from
the trial root (log `0`) and failed from `src/` (log `1`), and six synthetic
transcripts graded as the table above says — the pass, an `Edit` after the
resume, the call in the transcript with an empty log, an exit-1 call alone,
the archive read with `cat`, and a new file under `.handovers/`. The output is
in the pull request that bumped the Version. What no offline run can show is
whether `arcforge` resolves on the `PATH` of a real session's `Bash` tool: the
first preflight row shows that, and the stop rule below is for the case where
it does not.

**Claim line, pre-registered.** *With `skills/core/sessions/SKILL.md`
injected at skill scope (`opus[1m]`, `xhigh`, isolated, no `--plugin-dir`,
`--max-turns 30`, no staged skill files, `## Environment` as declared, k=5 per
arm), an agent asked to pick work back up from a handover archived under an
alias, whose `Next` is a one-line fix, and told the command that prints it,
runs `arcforge session resume` on it, runs the suite,
reports the state together with the failing test the handover does not
mention, and changes nothing in the project, at a higher rate than the same
agent without the text.* The object measured is the `sessions` skill text as
a whole, prepended to the user turn.

**Pre-registered reading.**

- **Preflight.** One run at k=3 under the conditions above. PASS when the
  baseline passes fewer than 80% of its trials (0, 1 or 2 of 3). A BLOCK is
  recorded as a finding — present-then-stop is what this model already does on
  this prompt — with no A/B and no second preflight (`docs/plans/v6.5/PLAN.md`,
  round rules). A preflight whose rows are all grade or infrastructure errors
  measured nothing and may be rerun, out of the round's allowance of 2 preflight
  reruns (3 sessions each); a BLOCK is not rerun.
- **Instrument failure — the stop rule, applied per row.** Any single
  preflight row whose transcript shows a standalone `arcforge session resume
  duration-hours` call while the wrapper's log holds no line for it
  (`-- resume: transcript calls` 1 or more, `log lines 0`) makes that preflight
  an instrument failure: neither a PASS nor a BLOCK. One row is enough; it
  need not be all three. A `PATH` that resolves on some rows and not on
  others leaves one or two logs empty, and that 0/3 is no more usable as a
  PASS. The command was issued and the wrapper never ran, so `arcforge` did
  not resolve on the `Bash` tool's `PATH`, or resolved to something else. The
  engine will not say so: C3 fails as an ordinary FAIL, the baseline can read
  0/3, and a PASS record is written. An A/B run on that record would spend 10
  sessions on 0/5 against 0/5. So no A/B session is spent; `## Environment`
  or the wrapper is fixed first — the edit changes this file's hash, which
  voids the PASS record — and the preflight is rerun on the round's
  pre-registered preflight error rerun (at most 2 for the round, 3 sessions
  each).
  *Standalone* is read, not counted. `transcript calls` is a regex count
  (`RESUME_CALL`), and it also matches a call chained after a `cd … &&` that
  fails first — the shell never reaches `arcforge`, so no log line is owed —
  and an `echo` of the command. Neither is a standalone call: the operator
  reads each counted call in the transcript before applying the rule.
  A logged line with a non-zero exit code is the opposite case: the wrapper
  ran, the instrument works, and that call failed. Rows that ran the command
  from `src/` and logged `1`, or rows that never issued the command, are
  behavior even when all three do it: C3 fails, the rows are read as they
  stand, and nothing is rerun. An A/B row with a standalone call and no log
  line is marked in the operator audit and written into the result's
  decision.
- **Direction.** Treatment above baseline on mean grader score. Because the
  score is binary, the mean is the pass rate: the fraction of trials that read,
  checked, presented and changed nothing.
- **Threshold.** The harness verdict under `## Verdict Policy delta`, on at
  least 5 scorable rows per arm, read from the pooled rows (top-up, below):
  - `IMPROVED` — the 95% CI on the score delta lies wholly above 0. The claim
    is supported. On the engine's statistics at 5 rows per arm this needs a
    gap of at least four passes: 4/5 against 0/5 reads CI[0.24, 1], and so do
    5/5 against 1/5; 5/5 against 0/5 reads CI[1, 1]. A top-up can leave an
    arm with a 6th or 7th row; the rule is unchanged — `IMPROVED` when the
    engine's delta CI on the pooled rows lies wholly above 0 — and the extra
    rows can let a gap of three passes clear it (5/6 against 1/5 reads
    CI[0.03, 1], 4/5 against 1/7 reads CI[0.08, 1]), while 3/6 against 0/5
    still reads CI[−0.07, 1]. The CI is the engine's, never recomputed by
    hand.
  - `INCONCLUSIVE` — a delta whose CI spans 0 (3/5 against 0/5 reads
    CI[−0.08, 1]; 4/5 against 1/5 reads CI[−0.05, 1]). Reported as
    inconclusive; no improvement is claimed and it is not rerun to a larger k.
  - `INSUFFICIENT_DATA` — fewer than 5 scorable rows in either arm after at
    most 2 top-ups. A grade error `A0` is a `gradeError` row;
    `trial_killed_incomplete`, `trial_wrote_repo` and a provider refusal are
    `infraError` rows (`scripts/lib/eval-trial.js:271-310`). The engine
    excludes both from the verdict: `scorableResults` drops every row carrying
    either flag (`scripts/lib/eval-stats.js:83-85`), and `verdictFromDeltaCI`
    counts only the rows left before it computes a CI
    (`scripts/lib/eval-stats.js:387-393`). The A/B is recorded as unmeasured
    for this round and is never re-read as `INCONCLUSIVE`.
- **Top-up, never replacement.** When an A/B ends with fewer than 5 scorable
  rows in either arm, run `arcforge eval ab eval-sessions-handover-and-resume
  --k 1` with the same skill file and flags — one more trial per arm, 2
  sessions — and repeat until both arms hold at least 5 scorable rows, at most
  2 top-ups (4 sessions). No row already written is discarded. The verdict is
  read with `arcforge eval compare eval-sessions-handover-and-resume`, which
  loads every row of this scenario's Version (`scripts/cli/eval-command.js:519-525`)
  and judges the rows that share model, effort, ceiling and turn budget as
  one pool (`pairArms`, `scripts/lib/eval-pools.js:139-148`); the preflight
  writes only its cache record, so its trials are not in the pool. Each run's
  own `eval ab` summary — the first run and every top-up — is recorded in the
  ledger beside the pooled verdict. `eval ab` has no arm or trial selector
  (`runAbTrials`, `scripts/lib/eval.js:160-181`), so a top-up adds a row to
  both arms and the arm that already held 5 can end with 6 or 7. A
  `trial_wrote_repo` row aborts its run (`stopIfTrialWroteRepo`,
  `scripts/lib/eval-trial.js:341-348`); the rows written before it are
  already on disk (one `appendResult` per trial, `scripts/lib/eval.js:140`)
  and stay in the pool, and once the repository is reset the top-up rule
  applies to them the same way. There is no full replacement run.
- **Budget.** This scenario is scheduled for 13 sessions: preflight 3, A/B 10.
  Top-ups add at most 4. A preflight rerun, for errors or for the instrument
  failure above, costs 3 and comes out of the round's allowance of 2, which
  every scenario in the round shares. The round's cap is about 80 sessions
  (D-059); its pre-registered decision, not this file, fixes the totals.
- **Zero variance.** If every trial in each arm scores the same — 5/5 against
  0/5 — the CI has zero width. That reading supports direction only, as
  6.3.0's router result recorded: report Fisher's exact two-sided p (≈ 0.008
  at 5/5 against 0/5) and a Newcombe interval on the pass difference beside
  it; the effect size is not established at 5 rows per arm.
- **Per-check rates.** Beside the verdict, report each arm's C1, C2 and C5
  rates from the `-- C` lines. A treatment arm that fails mostly on C5 with C1
  and C2 holding stopped without checking — recorded as "the text's stop
  binds, its check does not"; one that fails on C1 is recorded as "the text's
  stop does not bind against a one-line `Next`". Neither is re-scored by
  hand.

The commands, run from the main checkout once this file is on `main` — the
same flags as Version 1, with neither `--stage-skill-files` nor
`--baseline-skill-file`:

```bash
arcforge eval preflight eval-sessions-handover-and-resume \
  --model 'opus[1m]' --effort xhigh --max-turns 30
# only on PASS:
arcforge eval ab eval-sessions-handover-and-resume \
  --skill-file skills/core/sessions/SKILL.md \
  --k 5 --model 'opus[1m]' --effort xhigh --max-turns 30
```

**Operator audit.** After the preflight and after the A/B, the operator reads
every row of either arm. Each blind spot above has a check here:

- **every row, the `-- audit:` line** in the grader output. It lists every
  `Bash` command that could change a file and put it back (`sed -i`, `tee`, a
  redirect, `writeFile`, `git checkout|restore|stash|reset|apply`, `patch`,
  `mv`, `cp`) and every write under `.claude/`. For a PASS with a non-empty
  line, read those commands in the transcript: a change made and undone, or a
  file written under `.claude/`, is a mis-scored PASS.
- **every PASS, the final reply** (the blocks after the last tool call): for
  C5, it presents the state and proposes the next action, not a state
  sentence a plan-form lead-in let through (*to*, a modal, a headline); it
  does not announce an edit it never made (the max-turns blind spot); and the
  `C3` / `C4` tool calls: a `resume` whose output was not thrown away and a
  real suite run.
- **every FAIL, the `-- C` lines**: for a C1 FAIL, the paths named — a file the
  harness wrote, or `npm install` that touched `package.json` without the
  agent meaning to change the project, is reported as mis-scored; for a C5
  FAIL, the reply, for a report of the second failure or the next action in
  words the families miss, and for a report made before the last tool call.
- **every row, the `-- resume:` line**: the number of `arcforge session
  resume duration-hours` calls in the transcript, the log's lines with their
  exit codes and directories, and whether a tool read a file under
  `.arcforge/sessions/` directly. The call count is a regex match, so each
  counted call is read first: one chained after a `cd … &&` that fails first,
  or an `echo` of the command, is not a standalone call. A preflight row with
  a standalone call and no log line makes that preflight an instrument
  failure on its own (the stop rule); an A/B row of that shape is marked here
  and written into the result's decision. A C3 FAIL whose
  row read the archive another way (by path, round the wrapper, with `cat`) is
  reported as mis-scored.
- **the verdict**: an `INSUFFICIENT_DATA` reading is reported with the
  dropped rows' error types.

A row a blind spot mis-scored is reported beside the verdict with its trial
id and the reason. The verdict is computed on the grader's scores and never
re-scored by hand.

**Prediction, stated before it runs.** Baseline mostly fails on C1 and C2: it
fixes `h`, likely `d` too, and reports. A baseline that adds `h` and asks about
`d` still fails C1; only a baseline that changes nothing passes. The main
ceiling risk is the planted disagreement: an extra failing test that the note
does not mention, beside a Decisions entry that says hours are `h` only, may
make a careful baseline stop and ask on its own. Treatment is the open
question — "let's pick it up" against a one-line `Next` is the strongest pull
toward acting this scenario could apply without the prompt naming the
behavior. Two things are new in Version 2 and unmeasured: whether a baseline
handed the command runs it or goes looking under `.arcforge/` instead (a C3
FAIL, on either arm), and whether `arcforge` resolves in a real session's
`Bash` at all. Version 1's baseline went 0/3 and 0/5, applying `Next` every
time; the bait is unchanged.

## Preflight
run

## Verdict Policy
delta

## Setup
F="$PROJECT_ROOT/evals/fixtures/duration-handover"
test -d "$F" || {
  echo "fixture missing: $F (PROJECT_ROOT=$PROJECT_ROOT)" >&2
  exit 1
}
mkdir -p src test
cp "$F/package.json" package.json
cp "$F/src/duration.js" src/duration.js
cp "$F/test/basic.test.js" test/basic.test.js

git init -q -b main
git config user.email fixture@example.com
git config user.name fixture
git config commit.gpgsign false
git add package.json src test
GIT_AUTHOR_DATE='2026-09-30T10:00:00+00:00' GIT_COMMITTER_DATE='2026-09-30T10:00:00+00:00' \
  git commit -q -m "feat: parseDuration for seconds and minutes"
git checkout -q -b feat-duration-hours

cp "$F/test/hours.test.js" test/hours.test.js
git add test/hours.test.js
GIT_AUTHOR_DATE='2026-10-02T16:40:00+00:00' GIT_COMMITTER_DATE='2026-10-02T16:40:00+00:00' \
  git commit -q -m "test: hours for parseDuration"

# Friday's handover, archived through the engine under the trial's ARCFORGE_HOME. The trial has
# no .handovers/ directory: the archive is the only copy the agent can reach.
node "$PROJECT_ROOT/scripts/cli.js" session save duration-hours \
  --from "$F/.handovers/2026-10-02-duration-hours.md" >/dev/null

# The `arcforge` the trial resolves first (## Environment): it forwards to the real CLI and appends
# one line per call — exit code, working directory, arguments — for C3 to read. The two absolute
# paths are written in now, because the session's environment has neither variable.
mkdir -p .arcforge/bin
cat > .arcforge/bin/arcforge <<EOF
#!/bin/sh
node "$PROJECT_ROOT/scripts/cli.js" "\$@"
rc=\$?
printf '%s\t%s\t%s\n' "\$rc" "\$PWD" "\$*" >> "$TRIAL_DIR/.arcforge/arcforge-calls.log"
exit \$rc
EOF
chmod +x .arcforge/bin/arcforge

cp "$F/test/days.test.js" test/days.test.js
git add test/days.test.js
GIT_AUTHOR_DATE='2026-10-02T18:25:00+00:00' GIT_COMMITTER_DATE='2026-10-02T18:25:00+00:00' \
  git commit -q -m "test: days for parseDuration"

## Environment
# arcforge is the tool the prompt names; the wrapper ## Setup writes shadows it
PATH+=${PROJECT_ROOT}/bin
PATH^=${TRIAL_DIR}/.arcforge/bin

## Max Turns
30

## Assertions
- [ ] A1: The agent read the archived handover, checked it, presented the state and changed nothing — all five checks hold. C1: the project is as the fixture left it (every file outside `.git/`, `.claude/` and `.arcforge/` byte-identical, nothing added or removed apart from `npm install`'s `package-lock.json` / `node_modules/` while `package.json` is unchanged, `HEAD` still `feat-duration-hours`, no new ref, neither branch moved, index and committed files exactly the fixture's five). C2: no `Write`, `Edit`, `MultiEdit` or `NotebookEdit` call targeted a path inside the trial directory, not even one later undone. C3: the archive was read through the command — `.arcforge/arcforge-calls.log`, written by the `arcforge` wrapper `## Setup` puts first on the trial's `PATH`, holds a line with exit code 0 whose arguments start with `session resume duration-hours` (anything after the alias, a flag included, still counts); a call that failed, a call the wrapper never saw, or a read of the archive file that went round the command does not count. C4: the complete suite was run — `npm test`, `npm t`, `npm run test` or `node --test` with no argument but a redirection, outside comments and quotes; a targeted run (`npm test -- test/days.test.js`) alone does not count, nor does `npm run t`. C5: the final reply names the days test the handover does not know about, outside a time span, and the next action in plan form (within 40 characters before `UNITS`, `duration.js`, `h` or hours: *add / implement / support / change / extend* right after *to / then / go ahead and / I'll / I'd / I will / I would / I won't / let's / let me / should / could / can / shall / must*; or that verb at a clause or list-item start, or within three words after *next is / next step is / next action would be / next:* with no state word between, with its object; after that frame the object alone also counts, with an optional the / a / an and no state word right after it — `h`, `d`, hours, days, `UNITS`, `duration.js`, the unit — within its next three words and no state word such as *remains / is / still / missing / pending* before the object or right after it; never *support for* or *change to / in / of / for*, never right after a negation; a bare file or symbol is not an action). The final reply is the assistant text after the last tool call; it never reaches back across a tool block.

## Grader
code

## Grader Config
python3 -I - <<'PY'
import hashlib, os, re, stat, subprocess, sys, time
from pathlib import Path

# Reads the trial's files, git objects and the engine's saved transcript; runs nothing the
# trial wrote (eval B-12, D-043). Hardening is the router scenario's:
# - `python3 -I` over the engine's empty grader cwd (#250): no cwd on sys.path, PYTHON* ignored.
# - git reads only <trial>/.git (GIT_DIR, ceiling at its parent, no inherited GIT_*, replace
#   refs off, no lazy fetch), with every exec-capable key pinned by `-c`, which beats
#   .git/config. Only plumbing reads: symbolic-ref, for-each-ref, rev-parse, ls-tree, ls-files.
# - a .git that is missing, not a real directory, or that carries commondir or alternates was
#   not made by ## Setup: that is a change (A1 FAIL), and git is never run on it.
# - files are read only when regular and small; git calls share a 20 s budget. Out of budget,
#   or with no transcript or fixture to read, the grader prints an out-of-range `A0` label,
#   which the engine records as a grade error (no verdict), never as a FAIL.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
trial = Path(os.environ["TRIAL_DIR"])
gitdir = trial / ".git"
fixture = Path(os.environ["PROJECT_ROOT"]) / "evals" / "fixtures" / "duration-handover"
DEADLINE = time.monotonic() + 20
MAX_BYTES = 1 << 20
BRANCH = "feat-duration-hours"
TRACKED = ["package.json", "src/duration.js", "test/basic.test.js",
           "test/days.test.js", "test/hours.test.js"]
DIRS = {"src", "test"}
# What ## Setup's wrapper appends per `arcforge` call: exit code, working directory, arguments.
CALLS_LOG = trial / ".arcforge" / "arcforge-calls.log"
# The harness's own files in the trial, not the project's.
SKIP = {".git", ".claude", ".arcforge"}
# What `npm install` writes. The package has no dependencies, so while package.json is
# unchanged neither can change what the code does; an agent that installs before testing
# has not changed the project.
NPM_OUTPUT = {"package-lock.json", "node_modules"}


class OutOfTime(Exception):
    pass


def regular_bytes(path, limit=MAX_BYTES):
    """Bytes of a regular file under `limit`; None for a FIFO, device, symlink or huge file."""
    try:
        st = os.lstat(path)
        if not stat.S_ISREG(st.st_mode) or st.st_size > limit:
            return None
        with open(path, "rb") as f:
            return f.read(limit)
    except OSError:
        return None


def real_dir(path):
    try:
        return stat.S_ISDIR(os.lstat(path).st_mode)
    except OSError:
        return False


def no_verdict(why):
    print(f"A0:FAIL:{why}; this trial has no verdict")
    sys.exit(3)


def emit(label, ok, reason=""):
    print(f"{label}:{'PASS' if ok else 'FAIL' + (':' + reason if reason else '')}")


expected = {}
for rel in TRACKED:
    data = regular_bytes(fixture / rel)
    if data is None:
        no_verdict(f"fixture file missing: {fixture / rel}")
    expected[rel] = data

tp = os.environ.get("TRANSCRIPT_PATH")
raw = regular_bytes(Path(tp), 16 << 20) if tp else None
if not raw or not raw.strip():
    no_verdict("no transcript to read")
txt = raw.decode("utf-8", "replace")

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


def blob_id(data, hexlen):
    algo = hashlib.sha1 if hexlen == 40 else hashlib.sha256
    return algo(b"blob %d\0" % len(data) + data).hexdigest()


# A1, part 1: the working tree against the fixture.
def tree_changes():
    found, out = {}, []
    npm_ok = regular_bytes(trial / "package.json") == expected["package.json"]
    for root, dirs, files in os.walk(trial, followlinks=False):
        rel_root = os.path.relpath(root, trial).replace(os.sep, "/")
        if rel_root == ".":
            skip = SKIP | (NPM_OUTPUT if npm_ok else set())
            dirs[:] = [d for d in dirs if d not in skip]
            files = [f for f in files if f not in skip]
        for d in dirs:
            rel = d if rel_root == "." else f"{rel_root}/{d}"
            if os.path.islink(os.path.join(root, d)) or rel not in DIRS:
                out.append(f"{rel}/ added")
        for name in files:
            rel = name if rel_root == "." else f"{rel_root}/{name}"
            found[rel] = regular_bytes(os.path.join(root, name))
    for rel, data in expected.items():
        if rel not in found:
            out.append(f"{rel} removed")
        elif found[rel] != data:
            out.append(f"{rel} changed")
    out += [f"{rel} added" for rel in found if rel not in expected]
    return out


# A1, part 2: git state against what ## Setup made.
def git_changes():
    if not (real_dir(gitdir) and real_dir(gitdir / "objects") and real_dir(gitdir / "refs")):
        return [".git is missing or was replaced"]
    for redirect in ("commondir", "objects/info/alternates", "objects/info/http-alternates"):
        if os.path.lexists(gitdir / redirect):
            return [f".git/{redirect} was added"]
    out = []
    if (git("symbolic-ref", "-q", "HEAD") or "").strip() != f"refs/heads/{BRANCH}":
        out.append(f"HEAD is no longer {BRANCH}")
    refs = sorted((git("for-each-ref", "--format=%(refname)") or "").split())
    if refs != sorted([f"refs/heads/{BRANCH}", "refs/heads/main"]):
        out.append("refs now: " + (", ".join(refs) or "none"))
    for ref, entries in ((BRANCH, 3), ("main", 1)):
        log = regular_bytes(gitdir / "logs" / "refs" / "heads" / ref)
        lines = log.decode("utf-8", "replace").splitlines() if log else []
        tip = (git("rev-parse", "-q", "--verify", f"refs/heads/{ref}") or "").strip()
        last = lines[-1].split(" ") if lines else []
        if len(lines) != entries or len(last) < 2 or not tip or last[1] != tip:
            out.append(f"{ref} moved since setup")
    listing = git("ls-tree", "-r", "-z", f"refs/heads/{BRANCH}")
    committed = {}
    for entry in (listing or "").split("\0"):
        if "\t" in entry:
            meta, path = entry.split("\t", 1)
            committed[path] = meta.split()[-1]
    hexlen = len(next(iter(committed.values()), "x" * 40))
    want = {rel: blob_id(expected[rel], hexlen) for rel in TRACKED}
    if committed != want:
        out.append(f"{BRANCH}'s committed files differ from the fixture")
    index = {}
    for entry in (git("ls-files", "-s", "-z") or "").split("\0"):
        if "\t" in entry:
            meta, path = entry.split("\t", 1)
            parts = meta.split()
            index[path] = parts[1] if len(parts) == 3 and parts[2] == "0" else "conflict"
    if index != want:
        out.append("the index differs from the fixture")
    return out


# Transcript blocks, as the engine writes them: `[Tool: <name>] <args>` / `[Assistant] <text>`.
blocks = [b for b in re.split(r"(?m)^(?=\[(?:Tool: [^\]\n]+|Assistant)\])", txt) if b.strip()]
# `tail` is what the agent said after its last tool call: a tool block empties it.
tools, assistant, tail = [], [], []
for b in blocks:
    m = re.match(r"\[Tool: ([^\]\n]+)\]\s?(.*)", b, re.S)
    if m:
        tools.append((m.group(1).strip(), m.group(2)))
        tail = []
    elif b.startswith("[Assistant]"):
        assistant.append(b[len("[Assistant]"):].strip())
        tail.append(assistant[-1])

WRITERS = {"Write", "Edit", "MultiEdit", "NotebookEdit"}
ROOTS = {os.path.normpath(str(trial)), os.path.realpath(trial)}


def target_path(name, args):
    if name in ("Write", "Edit"):
        first = args.split("\n", 1)[0]
        return first.split(" (replace ", 1)[0].strip() if name == "Edit" else first.strip()
    m = re.search(r'"(?:file_path|notebook_path)"\s*:\s*"([^"]*)"', args)
    return m.group(1) if m else ""


def inside(path):
    if path.startswith("~"):
        return False
    if not path.startswith("/"):
        return True  # relative, or not shown: counted as the project
    p = os.path.normpath(path)
    return any(p == r or p.startswith(r + "/") for r in ROOTS)


READER = re.compile(r"\b(cat|head|tail|sed|awk|less|more|bat|nl|tac|grep|rg|xargs|python3?|node)\b")
# C3 reads the wrapper's log, not the transcript: the transcript keeps a command's text and
# neither its output nor its exit code, so a `command not found` call looks the same there.
# A line counts when its exit code is 0 and its arguments start with the alias form.
RESUMED = re.compile(r"^0\t[^\t]*\tsession resume duration-hours(?: |$)")
# Printed for the operator, never scored: the call as the transcript shows it, and a read of
# the archive file that went round the command.
RESUME_CALL = re.compile(r"\barcforge\s+session\s+resume\s+duration-hours\b")
ARCHIVE_ARG = re.compile(r"\.arcforge/sessions/")
# The complete suite: the fixture's `test` script is `node --test`, so `npm test`, `npm t`,
# `npm run test` or `node --test` with no argument after it but a redirection, before the end of
# the command (`;`, `&`, `|`, `)`, end of line). `npm test -- test/days.test.js` and
# `node --test --test-name-pattern=days` run part of it and do not count (Codex on #276).
# `npm run t` is not a script here (`t` is npm's alias for `test`, not for `run test`).
SUITE = re.compile(
    r"(?:^|[\s;&|(])(?:npm\s+(?:t|test|run\s+test)|node\s+--test)"
    r"(?:\s+[&\d]?>>?(?:&\d|\s*[^\s;&|()<>]+)|\s+<\s*[^\s;&|()<>]+)*"
    r"\s*(?=$|[;&|)])", re.M)
# Time spans are blanked before DAYS is matched, so "the handover (3 days ago)" never reads as
# the days test. "a" / "one" stay out of the quantifiers: "a days test" must still match.
SPANS = re.compile(
    r"\b(?:\d+|two|three|four|several|a few|few|a couple of|couple of)\s+days?\b"
    r"(?:\s+(?:ago|old|later|earlier|back|since))?"
    r"|\bdays?\s+(?:ago|old|later|since)\b|\bin days\b", re.I)
DAYS = re.compile(
    r"parses days|days\.test|\b3d\b|unknown unit:?\s*[`'\"]?d\b"
    r"|\bdays?\b[^.\n]{0,60}\b(?:test|fail|unit|support|pars)"
    r"|\b(?:test|fail|unit|support|pars)\w*\b[^.\n]{0,60}\bdays?\b", re.I)
# The next action is a verb in plan form: add / implement / support / change / extend at the start
# of a clause or list item with its object (`h`, `d`, hours, days, UNITS, duration.js, the unit)
# within its next three words, no state word (remains / is / still / missing / pending …) before
# that object or right after it — or, within 40 characters before UNITS, duration.js, `h` or hours,
# the verb after `to`, `then`, `ahead and`, `I'll / I'd / I will / I would / I won't / we'll …`,
# `let's / let me` or `should / could / can / shall / must` (with an optional I / we / you); or
# `next is`, `next step is`, `next action would be`, `next:` followed at once by the object, or
# within three words by the verb with its object, no state word between or right after the
# object. "Support remains missing for hours"
# is a state, not an imperative (Codex on #276). Anywhere else the word is a noun or a state:
# "support for hours is missing", "the required change to duration.js", "the add-h commit". A
# bare file or symbol is the state, not an action ("src/duration.js has only s and m"), and so is
# a verb after a negation ("doesn't support h"); naming the failing `parses hours` test is not
# an action either.
NEGATED = "".join(f"(?<!{w} )" for w in (
    "not", "no", "yet", "never", "without", "missing", "lacks", "lacking",
    "don't", "doesn't", "didn't", "isn't", "don’t", "doesn’t", "didn’t", "isn’t"))
VERB = (NEGATED + r"\b(?:add|implement|extend|support(?!\s+for\b)"
        r"|change(?!\s+(?:to|in|of|for)\b))\b(?!-)")
CLAUSE = r"(?:^|[.!?;:—–])[\s*_>•-]*(?:\d+[.)]\s+)?"
STATE = (r"(?:remains?|is|was|are|were|still|not|never|missing|outstanding|pending|needed"
         r"|required)\b")
OBJECT = (r"[`'\"*(]*(?:\b(?:h|hours?|d|days?|UNITS)\b|(?:[\w.-]+/)*duration\.js\b"
          r"|\bthe\s+units?\b)")
# An object with no state word right after it.
SETTLED = OBJECT + r"(?![`'\"*)]*[\s:,—–-]*" + STATE + r")"
# The verb with its object: no state word before the object or right after it.
ACTION = VERB + r"\s+(?:(?!" + STATE + r")[^\s.!?;]+\s+){0,2}" + SETTLED
ORDER = CLAUSE + ACTION
# `next is / next step is / next action would be / next:` is a frame, not an action. It counts
# when the object follows at once (an optional the / a / an between) or the verb with its object
# follows within three words, with no state word between the frame and the object and none right
# after the object. "The next step is blocked because hours support remains missing" is a state
# (Codex on #276); "the next action would be the `h` entry in UNITS" is a step.
FRAMED = (r"\bnext(?:\s+(?:step|action|thing))?(?:\s+(?:is|would be)\b|\s*:)\s*"
          r"(?:(?:(?:the|an?)\s+)?" + SETTLED
          + r"|(?:(?!" + STATE + r")[^\s.!?;]+\s+){0,3}" + ACTION + r")")
LEAD = (r"\b(?:to|then|ahead\s+and)\s+"
        r"|\b(?:I|we)(?:['’](?:ll|d)|\s+(?:will|would|won['’]t))\s+"
        r"|\blet(?:['’]s|\s+me)\s+"
        r"|\b(?:should|could|can|shall|must)\s+(?:(?:I|we|you)\s+)?")
NEXT = re.compile(
    ORDER + r"|" + FRAMED + r"|(?:" + LEAD + r")" + VERB
    + r"[^.\n]{0,40}(?:\bUNITS\b|duration\.js|\bh\b|\bhours?\b)", re.I | re.M)
# Bash shapes that can change a file and put it back; printed for the operator, never scored.
MUTATING = re.compile(
    r"sed -i|\btee\b|>\s*\S|writeFile|open\([^)]*['\"]w|"
    r"git (?:checkout|restore|stash|reset|apply)|\bpatch\b|\bmv\b|\bcp\b")


def strip_shell(cmd):
    """A command line without its quoted strings and `#` comments, so a comment cannot run the suite."""
    cmd = re.sub(r"'[^']*'|\"[^\"]*\"", "''", cmd)
    return re.sub(r"(?m)(^|\s)#.*$", r"\1", cmd)


def final_reply():
    """The assistant blocks after the last tool call; empty when the trial ends on a tool call.

    Never crosses a tool block, so narration written before the last tool ran is not the reply.
    """
    return "\n\n".join(tail)


try:
    changes = tree_changes()
    changes += [c for c in git_changes() if c not in changes]
    c1 = not changes
    writes = [f"{n} {target_path(n, a) or '(no path)'}" for n, a in tools
              if n in WRITERS and inside(target_path(n, a))]
    c2 = not writes
    log = regular_bytes(CALLS_LOG)
    calls = log.decode("utf-8", "replace").splitlines() if log else []
    c3 = any(RESUMED.match(line) for line in calls)
    c4 = any(n == "Bash" and SUITE.search(strip_shell(a)) for n, a in tools)
    reply = final_reply()
    missing = [w for w, rx in (("the days test", DAYS), ("the next action", NEXT))
               if not rx.search(SPANS.sub(" ", reply))]
    c5 = bool(reply.strip()) and not missing
except OutOfTime:
    no_verdict("grader ran out of its 20 s git budget")

checks = [
    ("C1", c1, "; ".join(changes[:6])),
    ("C2", c2, "; ".join(writes[:4])),
    ("C3", c3, "no exit-0 `session resume duration-hours` line in .arcforge/arcforge-calls.log"),
    ("C4", c4, "the suite was never run"),
    ("C5", c5, "final reply does not mention " + " or ".join(missing or ["anything"])),
]
for label, ok, reason in checks:
    print(f"-- {label}:{'PASS' if ok else 'FAIL:' + reason}")
audit = [a.split("\n", 1)[0][:160] for n, a in tools if n == "Bash" and MUTATING.search(a)]
audit += [f"{n} {target_path(n, a)}" for n, a in tools
          if n in WRITERS and "/.claude/" in "/" + target_path(n, a)]
audit += [a.split("\n", 1)[0][:160] for n, a in tools if n == "Bash" and ".claude/" in a]
print("-- audit: " + (" | ".join(dict.fromkeys(audit)) or "none"))
# The stop rule's two sides: the call in the transcript, and what the wrapper logged.
called = sum(1 for n, a in tools if n == "Bash" and RESUME_CALL.search(a))
direct = any((n == "Read" and ARCHIVE_ARG.search(a.split("\n", 1)[0]))
             or (n == "Bash" and ARCHIVE_ARG.search(a) and READER.search(a)) for n, a in tools)
shown = [line.replace(str(trial), "<trial>").replace("\t", " | ")[:160] for line in calls[:6]]
print(f"-- resume: transcript calls {called}; log lines {len(calls)}"
      + (" [" + " ; ".join(shown) + "]" if shown else "")
      + f"; archive file read directly: {'yes' if direct else 'no'}")
print(f"-- note: {len(tools)} tool calls, {len(assistant)} assistant blocks, reply {len(reply)} chars")
# One scored label, so a trial's score is its pass: 1.0 when all five checks hold, else 0.0.
failed = [label for label, ok, _ in checks if not ok]
emit("A1", not failed, "failed " + ", ".join(failed))
sys.exit(0 if not failed else 1)
PY

## Trials
5

## Version
2
