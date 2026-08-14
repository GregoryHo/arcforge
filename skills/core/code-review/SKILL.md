---
name: code-review
description: Review gate for a change about to be handed off. Use when an implementation or task is finished and needs checking against its requirements, before opening a pull request or merging, or when review feedback has come back and needs answering.
---

# Code Review

Two halves in order: get the change read by someone who did not write it, then answer
what comes back. Steps 1–4 send it; **Answering the review** handles the return.

## Step 1 — Run the project's own checks

Run the project's lint, type check, and test commands as that project defines them —
read its `package.json` scripts, Makefile, or contributor guide rather than guessing a
command name. A reviewer spending attention on a failure the suite already prints is
attention not spent on the change.

- [ ] Done when every check the project defines has run in this working tree and you can state each one's exit status and failure count.

Red or unrunnable checks end the review here: name the command and its failure, then
stop. A review dispatched over a broken tree buries that failure under review comments.

## Step 2 — Compute the review range

```bash
BASE="${TASK_BASE_SHA:-$(git merge-base HEAD "${BASE_BRANCH:-main}")}"
HEAD="$(git rev-parse HEAD)"
git diff --stat "$BASE..$HEAD"
```

Never `HEAD~1`. A task carrying more than one commit loses everything but its last
commit, and the reviewer then reports on a change nobody made.

Blank fields, the literal strings `HEAD~1`/`HEAD`, and "look at my recent changes" are
not a range — resolve them even when asked to skip the resolution for speed.

- [ ] Done when BASE and HEAD hold resolved SHAs and `git diff --stat` printed a non-empty file list.

## Step 3 — Dispatch a fresh reviewer

Dispatch one subagent and paste the text below into it with the four slots filled in —
the text itself, because a subagent handed a file path resolves it against its own
working directory. Fresh means it gets your requirements and your diff and none of your
reasoning: a reviewer that already believes the change is correct reviews the belief.

```
You are reviewing one change. Read it once, then return both parts below.

Requirements under review:
{REQUIREMENTS}

The implementer reported:
{IMPLEMENTER_REPORT}

Read the change with:
  git diff --stat {BASE}..{HEAD}
  git diff -U10 {BASE}..{HEAD}

The implementer's report is a set of unverified claims. Check every requirement
against the code in the diff. A stated rationale ("kept it simple per YAGNI",
"deliberate for now") is itself a claim and never lowers a finding's severity.

Return exactly these two parts, in this order, each with its own verdict line.

## Part 1 — Spec compliance
Verdict: COMPLIANT | ISSUES
Classify every requirement as met, or as one of: Missing (not implemented, or
implemented so it does something else), Extra (in the code, not in the
requirements), Misunderstood (a different problem solved). A requirement that
lives outside this diff and cannot be settled from it is `Cannot verify from
diff` — say what the caller should check and stop there.

## Part 2 — Code quality
Verdict: APPROVED | NEEDS FIXES
Assess every changed function, not only the ones a requirement covers:
separation of concerns, error handling and swallowed errors, resource cleanup on
all paths, edge cases, security, duplication, test quality, file and function
size. Severity is Critical / Important / Minor by actual impact. A defect the
requirements explicitly mandated is still a finding — report it and label it
plan-mandated.

Cite file:line for every finding in both parts, state its impact, and give the
fix. Report only what you read in the diff.
```

- [ ] Done when the reviewer returned both parts, each carrying its own verdict line.

## Step 4 — Report both axes

What you pass on is the two parts as they came back: Part 1 with its verdict, then Part 2
with its verdict, every finding under the axis it belongs to.

One severity list merged from both parts is the default shape and the one this review
exists to avoid: "requirement 3 is not implemented" and "this function leaks a file
handle" answer different questions, and merged, the first reads as a severity call
rather than the compliance fact it is.

- [ ] Done when both verdicts are stated separately and no finding was moved, merged, or re-ranked across the two parts.

## Answering the review

Feedback is a claim about the code, not an instruction to change it. Work the items one
at a time.

1. **Read** the whole report before answering any item.
2. **Restate** each item in your own words. An item you cannot restate is unclear — ask
   about every unclear item at once, and implement nothing until they are answered.
3. **Verify** the claim against this codebase. "`parse_config` already validates that"
   is checkable; check it before deleting your own check.
4. **Decide** per item — fix now, defer with a reason, or push back with the evidence.
   Severity sets the order: Critical now, Important before this change moves on, Minor
   recorded.
5. **Implement** one item at a time and re-run the checks after each.

### Openings that are not answers

| Instead of | Write |
|---|---|
| "You're absolutely right!" | The finding, restated, and whether it holds |
| "Great point!" / "Excellent feedback!" | Nothing — go straight to item 1 |
| "Thanks for catching that" | "Confirmed: `sync.py:41` never resets the counter." |
| "Let me implement that now" | "Checked `parse_config`: it strips whitespace only, so the check stays." |

Agreement expressed before verification is a prediction, and the reviewer who reads it
learns nothing about the code.

### Push back when

| The finding | Evidence that settles it |
|---|---|
| Would break behavior that exists | The caller or test that depends on it |
| Asks for a capability nothing uses | `grep` showing zero callers — offer to remove instead |
| Is wrong for this stack or version | The version, the API, or the constraint that rules it out |
| Rests on context the reviewer lacked | The decision or requirement they could not see |

Push back with the evidence attached; "I disagree" without it is the same failure as
agreement without it.

## Red flags

| About to | Instead |
|---|---|
| Dispatch the review with tests failing or unrun | Step 1 — report the failure and stop |
| Use `HEAD~1` as the base | Step 2 — `git merge-base` against the base branch |
| Tell the reviewer to "look at my recent changes" | Give resolved SHAs and the requirements |
| Send the reviewer your summary of the change | Send the diff range; the summary is the claim under test |
| Merge the two parts into one severity list | Step 4 — two verdicts, findings stay put |
| Excuse a finding because the plan asked for it | Report it, labeled plan-mandated |
| Accept "already validated upstream" and delete your check | Read the upstream code first |
| Open with agreement, then verify | Verify, then answer |

## Before claiming the review is answered

Every "fixed", "passing", or "done" in your reply is a claim that needs evidence
produced in this message — `references/completion-evidence.md` lists what each kind of
claim requires and what does not count. Open it before writing the reply.

Once the report is answered and the project's checks are green again, `/finishing`
handles the branch.
