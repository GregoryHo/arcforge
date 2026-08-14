# Eval: eval-compacting-persist-before-compact

> **Preflight (2026-08-01): BLOCK** — baseline 3/3 at the gate's own k, and 5/5
> on a follow-up `eval run --k 5`. 8/8 without the skill: this scenario has a
> ceiling and cannot measure lift. Repositioned as a **non-regression** claim
> (`## Verdict Policy`), not a lift gate. A PASS here says the treatment held
> every trial; it is NOT evidence of discriminative lift. See `## Design Notes`
> for why the scenario was not made "harder" instead.
>
> **The non-regression A/B has NOT been run.** Two attempts on 2026-08-01 aborted
> before any trial executed — every trial returned `model_grader_failed` with the
> transcript reading "You're out of usage credits", and the printed `REGRESSED`
> came from an empty treatment arm, not from behavior. Run
> `arcforge eval ab eval-compacting-persist-before-compact --k 5` once credits are
> available; until it returns a real verdict this scenario carries a baseline
> record only.
>
> **Retargeted (P6, `## Version` 2 → 3): `skills/compacting/SKILL.md` →
> `skills/sessions/SKILL.md`.** The two skills merged — one context-loss
> lifecycle, one skill — and the compaction half now lives under
> `## Compacting mid-session` in `sessions`. Nothing the scenario grades moved:
> the persist-first ordering, the timing table, and the focus-line requirement
> are carried over unchanged, which is what the P6 gate re-runs this scenario to
> confirm. The assertions, the fixture, and the rubric are untouched, so a
> comparison against the pre-merge record is like for like.

## Scope
skill

## Target
skills/sessions/SKILL.md

## Context
A Node parser library. `TASKS.md` is the project's task list and the only place
task state lives; `docs/design-notes.md` is where this project records the
decisions behind the code. The working tree holds the tokenizer swap, written
but not committed.

Working through T2 this session, two things were settled with the user: the
streaming parser was chosen over the buffered one, because the 2 GB fixtures
exhaust the heap; and the retry wrapper was dropped rather than ported. Both
were settled in conversation. The session is 92 tool calls deep.

## Scenario
The user says:

> Context banner just flagged a boundary and we're 90-odd calls in. Let's compact
> now — I want the window back before we start on the error paths. Go ahead, then
> tell me where we're at.

Do the work now, then summarize what you did.

## Design Notes
Not sent to the agent (only `## Context` and `## Scenario` reach it) — this
section is for whoever maintains the scenario.

Target behavior: compaction is gated on whether the state that would die with the
transcript is already on disk. Two pieces of state qualify here and neither is on
disk — the two decisions from T2, and the real status of T2 itself (`TASKS.md`
still shows `[ ]`, the tokenizer swap is done and uncommitted). An agent holding
the skill writes both down first and only then compacts; a baseline agent reads
"go ahead" as a green light, agrees the tool count is a fine boundary, and
compacts with the decisions living only in a transcript that is about to be
summarized away.

The pressure is the user's own instruction to compact, plus a tool count that
genuinely is at a boundary. Nothing in the prompt is wrong — this is a real
boundary — so the agent cannot decline on timing. The only reason to act first is
the un-persisted state, which is what the skill is for.

The prompt deliberately does not say the decisions are unwritten. That fact is in
the fixture: `docs/design-notes.md` ends at T1's decisions, and `TASKS.md` shows
T2 pending. An agent that checks finds it; an agent that does not, does not. An
earlier draft stated it outright in `## Context` and that is the ceiling risk the
`finishing` scenario already documented — a prompt that narrates the answer
measures reading comprehension, not behavior.

`Skill:*` assertions are impossible here: the harness runs every trial with
`--disable-slash-commands`, so no trial has the Skill tool. The behavioral signal
is therefore a file write, not a skill invocation.

**Why this was not redesigned harder.** The baseline already persists decisions
before compacting, 8 trials out of 8. That is a finding about the model, not a
defect in the trap: the behavior this skill names is one a capable agent reaches
for unprompted in a realistic repo. Making it discriminative would mean removing
the realism — hiding `TASKS.md`, or framing the request so that stopping to write
looks disobedient — and the resulting number would measure the contrivance. The
scenario is kept at its honest difficulty and re-scoped to the claim it can
actually support: with the skill in context, the behavior does not degrade. The
mechanism is the harness's own `non-regression` verdict policy, which judges the
treatment arm's pass rate instead of a delta whose ceiling makes it unreadable.

The single `[tool_called]` assertion targets `Edit` on `TASKS.md` specifically
because the file's own banner says markers are edited in place, which makes `Edit`
the overwhelmingly likely tool for it. `docs/design-notes.md` is deliberately NOT
asserted behaviorally: appending to it is equally natural via `Edit` or `Write`,
and a tool-name assertion there would measure tool preference rather than whether
the decisions landed. A1 covers that half and the grader is told to read the
transcript's tool calls.

## Setup
mkdir -p src docs

cat > package.json <<'EOF'
{
  "name": "parser-fixture",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
EOF

cat > TASKS.md <<'EOF'
# Tasks: parser rewrite

> arcforge task list v1 — status markers: `[ ]` pending, `[~]` in-progress,
> `[x]` done, `[!]` blocked. Every task has a stable id (`T1`, `T2`, …) that is
> never renumbered or reused. An indented `verify:` line is the command that
> proves the task done; a `note:` line explains a block. Edit markers in place —
> this file is the only state.

- [x] T1 — Split the lexer out of the reader
  - verify: `npm test`
- [ ] T2 — Swap the tokenizer onto the new lexer
  - verify: `npm test`
- [ ] T3 — Rewrite the error paths
  - verify: `npm test`
EOF

cat > docs/design-notes.md <<'EOF'
# Design notes

## Lexer split (T1)

The reader owned tokenization, which made every fixture test load a file. The
lexer is now a separate module taking a string, so tokenizer tests run without
touching disk.
EOF

cat > src/lexer.js <<'EOF'
function lex(input) {
  return String(input).split(/\s+/).filter(Boolean);
}

module.exports = { lex };
EOF

git init -q -b main
git config user.email fixture@example.com
git config user.name fixture
git add package.json TASKS.md docs src
git commit -q -m "T1: split the lexer out of the reader"

cat > src/tokenizer.js <<'EOF'
const { lex } = require('./lexer');

function tokenize(input) {
  return lex(input).map((value) => ({ value }));
}

module.exports = { tokenize };
EOF

## Verdict Policy
non-regression

## Preflight
skip

## Max Turns
40

## Assertions
- [tool_called] Edit:TASKS.md
- [ ] A1: Both decisions from T2 — choosing the streaming parser over the buffered one, and dropping the retry wrapper — are written into a file in the repository. The transcript shows the write actually happening.
- [ ] A2: Every write of that state happens BEFORE the response proposes, announces, or performs compaction. Compacting first and writing afterwards scores 0.
- [ ] A3: The response treats state that exists only in the conversation as the thing that decides the timing. Answering purely from tool count, session length, or the user's go-ahead scores 0.
- [ ] A4: The compaction the response proposes carries an instruction naming what comes next, rather than a bare compact with no direction.

## Grader
mixed

## Grader Config
Grade only what the transcript shows, including tool calls and their order. Do
not credit intentions the agent states but never carries out.

A1 passes when both decisions reach a file on disk. A response that lists them
back to the user in chat, or that says it will record them, scores 0 — the
transcript must show a write. One decision written and the other omitted scores
0. The file may be any file the agent chose; the location is not graded.

A2 is an ordering check over the transcript. Score 1 only when the writes appear
before the first mention of compacting as an action being taken or proposed. If
nothing was written at all, A2 scores 0.

A3 is about the stated reason. Score 1 when the response ties the timing to
specific state that would not survive compaction — the T2 decisions, the real
status of T2, uncommitted work. Score 0 when the justification is that the count
is high, the session is long, the phase looks right, or the user asked.

A4 scores 1 when the proposed compaction carries a next-action or focus
instruction with actual content (naming the error paths, T3, or equivalent).
A bare "/compact" or "let's compact now" with no direction scores 0.

Score each assertion 1 or 0; partial credit is not available.

## Trials
5

## Version
3
