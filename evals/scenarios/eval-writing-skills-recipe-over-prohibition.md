# Eval: eval-writing-skills-recipe-over-prohibition

<!-- status: new in v6 P7 — first behavioural coverage for
skills/core/writing-skills/SKILL.md, the last shipped skill with no scenario.
Targets §Match the form to the failure (the measured, counterintuitive claim),
§Baseline first, and §Writing the description. -->

## Scope
skill

## Target
skills/core/writing-skills/SKILL.md

## Context
You are in the `reviewbot` repository — the automation that comments on pull requests in our monorepo. Everything the bot does comes from the skills in `skills/`; it loads the one whose situation matches and follows it. There is no network access.

## Scenario
The user says:

> Our bot writes 600-word PR summaries where 80 would do — it walks the diff file by file and says back what the code already says. Reviewers have stopped reading them. I archived the three worst ones in `samples/`. Write the bot a skill at `skills/pr-summary/SKILL.md` so it stops doing that. We ship today.

Do the work now, then summarize what you did.

## Preflight
run

## Verdict Policy
delta

## Design Notes
Not sent to the agent (only `## Context` and `## Scenario` reach it) — this
section is for whoever maintains the scenario.

**Discrimination hypothesis, stated before the first run.** The task is authoring
guidance against an excess, and the request supplies the excess in the user's own
words: too long, walks the diff, restates the code. The unaided move against an
excess is to forbid it — "never restate the diff", "no file-by-file walkthrough",
"stay under 150 words". The target skill's §Match the form to the failure says
that is the wrong form and says so as a measured claim, not a preference: this is
a **shaping** failure (right action, wrong shape — bloated, buried, restated), and
*a prohibition aimed at a shaping failure produces more of the unwanted output
than no guidance at all*. The prescribed form is a positive recipe — what the
output IS, its parts in order. Converting "stop doing X" into "the output is
these parts in this order" is the conversion an unaided author does not make,
which is why **A1 is the discriminator and baseline is predicted to fail it.**

Per assertion, with the prediction:

- **A1 (form)** — baseline fails. The prompt's phrasing ("so it stops doing
  that") points straight at a prohibition list, and prohibitions are what an
  author writes when handed a complaint. Treatment has to classify the failure
  before choosing a form.
- **A3 (no invented rules)** — baseline mostly fails. "Write us a skill" pulls
  generic PR-review advice out of the model — screenshots, link the issue, tag
  reviewers, a testing checklist — none of which the archive gives any evidence
  for. §Baseline first forbids exactly that: *if you did not observe the failure,
  do not write the guidance*, and §Failure modes names the result a **no-op**.
- **A2 (grounded in the archive)** — partial in both arms, and deliberately
  scoped so it can only be earned by reading. The prompt already hands over the
  two obvious symptoms (length, restatement), so echoing them earns nothing; A2
  requires something the samples show and the prompt does not say. Same lever as
  the `brainstorming` and `maintaining-obsidian` scenarios use.
- **A4 (description register)** — may ceiling. `skills/changelog/SKILL.md` is in
  the fixture with a well-formed description, so an arm that imitates the local
  convention gets there without holding any rule. It is scored because it is a
  real §Writing the description claim, not because it is expected to separate.
- **`[tool_called] Read:samples/`** — floor, both arms. If it ever scores 0 while
  the reply plainly quotes a sample, suspect a `cat` through Bash rather than a
  discipline failure; the delta does not rest on it.

**What is in the archive and why.** Three real-shaped bot outputs, each with the
same three-part signature: a per-file walkthrough that restates the diff, a
consequential fact buried in the second-to-last paragraph (an error body that
breaks the service's response envelope; a session migration that logs every user
out on deploy; a behaviour change to quoted CSV cells that the changelog calls a
fix), and a reflexive compliment as the sign-off. The buried fact is the payload:
it is the one thing a reviewer needed, it is discoverable only by reading the
samples, and a recipe that leads with it fixes the bot while a word cap does not.

**Pressure.** "We ship today" is the budget cut — it makes reading three archived
files feel expensive, which is what separates an agent that grounds guidance in
observed failure from one that writes plausible advice immediately.

**Fixture size is deliberate.** Five files, so the agent's own deliverable stays
inside the ten-file cap that trial-artifact capture applies (dot-entries skipped,
walk order not guaranteed) and the grader sees the written `SKILL.md` in both the
artifacts block and the transcript.

**Watch item for the first run.** The target skill also says shipping is a
measurement question and names `arcforge eval ab`, which does not exist in an
isolated trial. A treatment trial that refuses to write anything until it can run
an eval would score 0 on A1 for a reason that is not the behaviour under test —
the three archived outputs *are* the observed failure the skill demands. If that
appears in the transcripts, it is a scenario-design problem, not a skill failure:
record it and redesign rather than re-rolling.

Max Turns is 40: read three archived summaries, look at the existing skill for the
local conventions, write the new one, and write a summary that is itself graded.

## Setup
test -d "$PROJECT_ROOT/evals/fixtures/pr-summary-bot" || {
  echo "fixture missing: \$PROJECT_ROOT/evals/fixtures/pr-summary-bot (PROJECT_ROOT=$PROJECT_ROOT)" >&2
  exit 1
}

cp -R "$PROJECT_ROOT/evals/fixtures/pr-summary-bot/." .

git init -q -b main
git config user.email fixture@example.com
git config user.name fixture
git add README.md samples skills
git commit -q -m "reviewbot: archive the three summaries reviewers complained about"

## Max Turns
40

## Assertions
- [tool_called] Read:samples/
- [ ] A1: The new skill's spine is a positive recipe — it states what a good summary IS and names its parts in the order they appear — rather than a list of things not to do.
- [ ] A2: The guidance is derived from the archived outputs, not from the complaint alone: it names a failure the samples exhibit that the user's message did not mention.
- [ ] A3: Every rule in the new skill answers something the archive shows. No generic PR-summary advice appears that the samples give no evidence for.
- [ ] A4: The new skill's `description` frontmatter says what the skill is and when it fires, without restating the procedure the body contains.

## Grader
mixed

## Grader Config
Grade from the transcript, including tool calls and the full content of any file
the agent wrote, and from the trial artifacts. Grade the skill the agent actually
wrote, not the intentions it states. If no `SKILL.md` was written anywhere, A1–A4
all score 0.

A1 is the discriminating assertion and is scored on the **spine** of the body —
the thing the reader is meant to do. Score 1 when the body's central instruction
is the shape of the output: a template, an ordered list of the parts a summary
must have, or a stated form ("a summary is <this>, then <this>, then <this>"), so
that following it produces a correct summary without consulting a list of
forbidden moves. Score 0 when the central instruction is prohibitions — "never
restate the diff", "do not walk the files one by one", "no praise", a bare word or
line cap — with no stated shape for the output, even when every prohibition is
correct and even when the skill is well organised. A subordinate red-flag,
anti-pattern, or "instead of / do" table underneath a recipe does **not** score 0;
what scores 0 is a body that only tells the bot what to stop.

A2 requires something the samples show and the user's message does not say. The
message supplies length and restatement, so naming either earns nothing on its
own. Score 1 for any specific pattern the agent could only have got from the
archive: the consequential fact left in the second-to-last paragraph (the `429`
body that breaks the response envelope, the sessions that get logged out on
deploy, the quoted-cell behaviour change the changelog calls a fix), the reflexive
compliment at the end, the missing verdict about whether the change is safe to
merge, or a direct quotation from one of the three files. Score 0 when the
guidance would read identically had the samples never existed.

A3 is a violation check on invented rules. Score 0 when the skill carries a rule
the archive gives no evidence for — screenshots, linking the issue or ticket,
tagging or assigning reviewers, commit-message or branch-naming conventions,
emoji, a test-and-docs checklist, response-time SLAs. One such rule is enough to
score 0. Rules that generalise a pattern actually present in the samples are not
inventions and score 1. A skill that stays narrow scores 1 even if it is short.

A4 scores the `description` line in the written frontmatter. Score 1 when it
identifies the skill and the situation that triggers it. Score 0 when it
enumerates the steps or the parts of the output — a reader who acts on the
description alone would not need the body — and 0 when there is no description.
Length is not the criterion; restating the procedure is.

Score each assertion 1 or 0; partial credit is not available.

## Trials
5

## Version
1
