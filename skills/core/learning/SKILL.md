---
name: learning
description: "The opt-in learning loop: capture a session diary, extract patterns from diaries, review what activates."
disable-model-invocation: true
---

# Learning

The loop runs `session → diary → pattern → instinct → activation`, and every step
that could change future behavior waits for a person. Learning is off until
someone enables it, and an instinct affects nothing until someone activates it.

## Which job

| The user wants | Go to |
| --- | --- |
| to record what this session decided or discovered | Capturing a diary |
| to know what keeps recurring across sessions | Reflecting over diaries |
| to remember one specific thing, right now | Saving an instinct by hand |
| to see or change what the subsystem has proposed | Reviewing what activates |

For handing unfinished work to the next session, this is the wrong skill —
`/sessions` writes handovers. A diary is for reflection, not continuity.

## Capturing a diary

### Step 1 — Check there is something worth recording

At least one must be true: a non-trivial decision was made, a challenge was
solved, the user expressed a preference, or a technique was discovered. Pure Q&A,
a retried build, exploration that decided nothing, and one-line fixes get no
diary. Say so and stop.

- [ ] Done when one of the four criteria is named, or the session is declared not worth a diary.

### Step 2 — Check for a draft before writing anything

Run `arcforge learn diary path --draft --session <id>` and read that file if it
exists. A background pipeline writes one after a substantial session.

A draft that exists is the entry — never write a fresh one alongside it. Doing
that leaves two diaries for one session: a duplicate final entry and an orphaned
draft nobody reads.

Its `## Session Metrics` section is already correct — preserve it verbatim.

Then take the enrichable sections one at a time. Which shape you write depends on
one thing: **were you in that session?**

**You were** — replace the `<!-- TO BE ENRICHED -->` line with what happened.

**You were not** — the finished section keeps the marker and gains a note under
it:

```markdown
## Decisions Made

<!-- TO BE ENRICHED -->

_Not recorded — this session is not in this conversation's history._
```

Keep the marker byte-for-byte, comment delimiters and all. It is not decoration:
the pipeline reads that exact string to tell a diary that is still missing
content from one that is finished. A diary that loses it counts as complete, so
an empty entry quietly joins the evidence later reflections draw on. Rewording
it, folding it into a sentence, or moving it into prose all break that — only the
untouched line works.

When the user asks for a real entry rather than a stub full of placeholder
comments, the note above is the answer: it states the gap in plain language for
the reader while the marker underneath keeps the machinery honest. Writing those
sections from imagination is never the answer, however finished it would look.

- [ ] Done when every enrichable section either holds what you remember, or holds the untouched marker plus a note.

### Step 3 — Write it

With a draft: edit the file, then run `arcforge learn diary finalize --session
<id>`. Finalize renames — it does not merge, so every edit must already be saved
in the draft.

Without a draft: reconstruct from conversation memory, not by reading files.
Files tell you what changed; only memory holds why. Fill the template in
`references/diary-template.md`, show it to the user, and save it after they agree
with `arcforge learn diary save --session <id> --content "..."`.

Never save without asking first.

- [ ] Done when the diary exists at the path the CLI reported and the user has seen its path.

## Reflecting over diaries

### Step 1 — Find out what is in scope

Run `arcforge learn reflect scan`. It reports the strategy, the diaries it
covers, and whether enough have accumulated. Under three diaries there is nothing
to generalize from — report the count and stop.

- [ ] Done when the strategy, the diary list, and the readiness flag are known.

### Step 2 — Read the diaries and the project's rules

Read every diary the scan listed. Read `CLAUDE.md` if the project has one, so a
correction the user repeated can be matched against the rule it broke.

Look for repeated decisions, consistent preferences, recurring challenges, and
rule violations the user had to correct.

- [ ] Done when every listed diary has been read.

### Step 3 — Separate patterns from observations

Three or more diaries showing the same thing is a **Pattern**. One or two is an
**Observation**, and it stays labelled that way. Every one of them cites the
specific diaries it came from; a claim with no citation does not go in the
report.

Report what happened, not what should happen: "chose TypeScript in four of five
projects", not "always use TypeScript". The user decides what to do about it.

Write the report in the shape given in `references/reflection-format.md`, rule
violations first.

- [ ] Done when every pattern names three or more citing diaries and no line prescribes a rule.

### Step 4 — Record it

Run `arcforge learn reflect record reflect-<id> --diaries "<files>" --reflection
<file> --summary "..."`. One command marks those diaries processed and writes the
evidence record. Skip it and the same diaries get analyzed again next time.

Save each Pattern as an instinct with `arcforge learn instinct save <id>
--source reflection --trigger "..." --action "..." --evidence-count <N>`.

Report rule violations to the user and ask before changing `CLAUDE.md`. Never
edit the rules unasked.

- [ ] Done when the record command has run and every Pattern has been saved or explicitly skipped.

## Saving an instinct by hand

For "remember this" — one insight, from the session in front of you.

1. Infer the fields from what the user said: a kebab-case id, the `trigger`
   (when it applies), the `action` (what to do), a `domain`, and the evidence
   from this session. Ask if the trigger or action is ambiguous rather than
   guessing.
2. Run `arcforge learn instinct check <id>` before writing anything.
3. Show the complete instinct and wait for the user to confirm it.
4. Save with `arcforge learn instinct save <id> --trigger "..." --action "..."
   --domain <d>`, then run `arcforge learn recall record recall-<id>
   --query "..." --instinct-ids "<id>"`.

One instinct per request. Two insights are two requests.

## Reviewing what activates

Learning is disabled by default. `arcforge learn status` says whether it is on;
`arcforge learn enable --project` turns it on for this project only.

Once on, observations become candidates automatically — and that is all that
happens automatically. A candidate becomes an inactive draft only when someone
approves and materializes it, and it changes behavior only when someone activates
it. Activated instincts are injected at SessionStart, top five by confidence.

`arcforge learn dashboard` is where review happens: approve, dismiss, materialize,
activate, deactivate, promote. Do not route around it with ad-hoc file edits.

To see what is already active and give feedback on it:

| Task | Command |
| --- | --- |
| List instincts with confidence | `arcforge learn instinct status` |
| Agree with a pattern | `arcforge learn instinct confirm <id>` |
| Disagree with a pattern | `arcforge learn instinct contradict <id>` |

A contradiction that drops confidence far enough archives the instinct. Offer the
user both directions — an auto-detected pattern is a proposal, not a fact.

## Red flags

| About to | Instead |
| --- | --- |
| Write a fresh diary while a draft exists for that session | Read the draft, edit it in place, finalize it |
| Fill `<!-- TO BE ENRICHED -->` for a session you do not remember | Keep the marker and add a note under it; a stated gap beats invention |
| Reword or delete the marker so the entry stops looking unfinished | Keep the line byte-for-byte — the pipeline reads it to know the diary is incomplete |
| Read files to reconstruct what the session decided | Reconstruct from memory — the reasoning was never in the files |
| Save a diary or instinct and tell the user afterwards | Show it first, save after they agree |
| Call two diaries showing the same thing a pattern | Label it an Observation until a third appears |
| Write "always do X" in a reflection | Report the count and let the user decide the rule |
| Update `CLAUDE.md` because a violation showed up | Report it and ask |
| Finish a reflection without running the record command | Record it, or the same diaries get re-analyzed |
| Enable learning or activate an instinct because it seems useful | Both are the user's call; surface the option and wait |
