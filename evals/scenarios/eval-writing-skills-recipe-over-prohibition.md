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

> Our bot writes 600-word PR summaries where 80 would do — it walks the diff file by file and says back what the code already says. Reviewers have stopped reading them. Someone on the team already wrote the bot a skill for this — `skills/pr-summary/SKILL.md`, shipped last sprint — and all three of the summaries I archived in `samples/` were produced with that skill loaded. Figure out why it didn't work, fix it, and tell me what will be different about tomorrow's summaries. We ship today.

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

### Version 2 — P7 preflight BLOCK 診斷與 redesign（quota 1/1 耗盡）

v1 preflight (hash 4c65b96fbad74aa2) came back 3/3 baseline passes = ceiling
BLOCK, and the grading evidence defeats the v1 hypothesis cleanly: unaided
baselines read all three samples plus the sibling skill before writing, produced
positive-recipe spines (not prohibition lists), measured actual sample word
counts with `wc -w`, desk-checked the finished procedure against the archive,
and wrote well-formed descriptions. "Convert a complaint into a recipe" is
default-model behaviour now; A1's predicted failure never occurred.

Redesign shifts the margin from artifact quality to **diagnosis**: the fixture
now ships a prohibition-shaped `skills/pr-summary/SKILL.md` whose one positively
stated instruction (the title line) all three samples demonstrably follow while
violating every prohibition. The task becomes "the skill was loaded and the
output is still wrong — figure out why, fix it, say what will be different".
Per-assertion predictions:

- **A1 (mechanism with cross-evidence)** — predicted baseline fail. The natural
  unaided diagnosis is content-level ("not specific enough") or a wholesale
  rewrite with no diagnosis; noticing that the title line is the *only obeyed
  instruction* requires cross-reading skill against samples, and it is the
  form-over-content observation the target skill teaches.
- **A2 (targeted fix keeping what works)** — predicted baseline fail. Nothing
  tells an unaided author the title rule works; wholesale rewrites discard it.
- **A3 (no invented rules)** — carried from v1; baselines passed it in v1, may
  ceiling, kept because it is a real claim and guards the fix's grounding.
- **A4 (falsifiable verification)** — replaces v1's description-register
  assertion (which the sibling-skill convention let both arms imitate).
  Baselines predicted to close with unfalsifiable "will be shorter" claims.

Pass bar is 0.8 over 6 assertions (2 behavioral floors + 4 text): a baseline
missing A1+A2 lands at 4/6 and fails, so the ceiling cannot re-form from floor
assertions alone. If v2 preflight still BLOCKs, the quota is exhausted and the
scenario proceeds to unmet-but-covered per the P7 pre-registration — no further
redesign, the finding goes to the gate advisory instead.

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
- [tool_called] Read:re:^\S*skills/pr-summary/SKILL\.md
- [ ] A1: The reply's diagnosis of why the existing skill failed is a mechanism about the guidance's FORM, grounded in cross-reading the skill against the samples — the summaries violate every prohibition while honoring the one positively stated instruction (the title line), so the bot follows stated shapes and a list of don'ts gave it no shape to produce. A diagnosis that stays at the content level ("too vague", "needs more rules", "the cap is too high"), or speculation with no sample evidence ("the skill probably isn't loading"), scores 0.
- [ ] A2: The fix targets the diagnosed mechanism and keeps what demonstrably worked: the rewrite carries the title-line instruction (or explicitly builds on it as the proof that positive form is followed) and replaces the prohibition spine with a stated output shape. A wholesale rewrite that discards the working title rule without comment, or a fix whose spine is still a list of don'ts, scores 0.
- [ ] A3: Every rule in the fixed skill answers something the archive shows. No generic PR-summary advice appears that the samples give no evidence for.
- [ ] A4: The reply states what will be observably different about tomorrow's summaries in terms checkable against the archived failures — the consequential fact leads, the parts appear in a stated order, the walkthrough is gone — not "monitor and iterate", "should be shorter", or a promise with no observable criterion.

## Grader
mixed

## Grader Config
Grade from the transcript, including tool calls and the full content of any file
the agent wrote, and from the trial artifacts. Grade the diagnosis and the skill
the agent actually produced, not the intentions it states. If the existing
`skills/pr-summary/SKILL.md` was neither edited nor replaced, A1–A4 all score 0.

A1 is scored on the reply's stated diagnosis. Score 1 only when it (a) is about
the form of the guidance — the old skill told the bot what to avoid but gave it
no shape to produce — AND (b) cites the cross-evidence from the fixture: the
samples break the prohibitions while all three carry the exact title line the
skill positively prescribes (or an equivalent formulation showing the agent
noticed the one instruction that was followed). A content-level diagnosis ("the
rules were too vague", "needs a stricter cap", "add more rules"), a diagnosis
that never mentions what the samples show, or unevidenced speculation about the
skill not loading, scores 0. The mechanism need not use any particular
vocabulary — "the don'ts gave it nothing to write, and the one 'do' is the only
line it obeyed" scores 1.

A2 is scored on the fixed skill. Score 1 when the title-line instruction
survives (verbatim or restated) and the body's spine is a stated output shape —
a template, an ordered list of the parts a summary must have, or "a summary is
<this>, then <this>". Score 0 when the working title rule is silently dropped,
or when the new body's central instruction is still a list of don'ts. A
subordinate anti-pattern note under a recipe does not score 0; what scores 0 is
discarding the demonstrated-working part or keeping a prohibition spine.

A3 is a violation check on invented rules. Score 0 when the fixed skill carries
a rule the archive gives no evidence for — screenshots, linking the issue or
ticket, tagging or assigning reviewers, commit-message or branch-naming
conventions, emoji, a test-and-docs checklist, response-time SLAs. One such rule
is enough to score 0. Rules that generalise a pattern actually present in the
samples are not inventions and score 1. A skill that stays narrow scores 1 even
if it is short.

A4 is scored on the reply's claim about tomorrow's summaries. Score 1 when it
names at least one observable, checkable difference tied to the archived
failures: the buried consequential fact (the `429` body that breaks the response
envelope, the deploy that logs sessions out, the quoted-cell behaviour change)
now leads; the parts appear in a stated order; the per-file walkthrough is gone;
a stated length bound. Score 0 for unfalsifiable claims — "should be better",
"shorter and clearer", "we'll monitor" — or when no forward-looking claim is
made at all.

Score each assertion 1 or 0; partial credit is not available.

## Trials
5

## Version
2
