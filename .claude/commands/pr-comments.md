---
description: Fetch review comments (conversation + inline + reviews) from a PR; present them grouped by priority/file and hand off to arc-receiving-review
argument-hint: "[pr-number]"
disable-model-invocation: true
---

Fetch the PR's review comments from all three GitHub sources and present them in a structured way so the user (or arc-receiving-review downstream) can decide disposition per finding.

## Arguments

`$ARGUMENTS` — optional PR number. When omitted, resolve from the current branch via `gh pr view`.

## Steps

1. **Resolve PR number**
   - If `$ARGUMENTS` parses as a positive integer → use it
   - Else: `gh pr view --json number,title,url,headRefName,state` on the current branch
   - If no PR is associated with the current branch, report blocked and stop

2. **Fetch all three sources in parallel** (they're independent — single message, multiple Bash calls):

   ```bash
   gh pr view <N> --comments
   gh api "repos/{owner}/{repo}/pulls/<N>/comments" \
     --jq '.[] | {author: .user.login, file: .path, line: (.line // .original_line), side: .side, commit: .commit_id[0:7], body: .body, in_reply_to: .in_reply_to_id, id: .id}'
   gh api "repos/{owner}/{repo}/pulls/<N>/reviews" \
     --jq '.[] | {author: .user.login, state: .state, submitted_at: .submitted_at, body: .body}'
   ```

   Substitute `{owner}/{repo}` from `gh repo view --json nameWithOwner`.

3. **Consolidate and present**
   - Inline review comments are the substance — group by priority label (P1/P2/P3 in body), then by `file:line`
   - Each entry shows: author, file:line, commit SHA, verbatim body
   - PR-level conversation comments go in a separate section (often automation banners — flag them but don't clutter)
   - Review summaries (approve / request-changes / commented) summarize per reviewer

4. **End with routing note:**
   > "Ready to process these via `arc-receiving-review`? It applies the verify-before-implement discipline (no performative agreement) and classifies each finding as fix / defer / reject."

## Guardrails

- Do NOT classify findings yourself (accept/reject) — that's the user's call, applied via `arc-receiving-review`
- Do NOT post replies — use `/pr-reply <comment-id>` for that
- Do NOT modify code based on findings until the user has classified them
- If a PR is closed/merged, surface state prominently — findings on a closed PR may not be actionable
- If `gh` is not authenticated or the repo has no PR for the branch, report blocked with the exact CLI error; don't try alternative mechanisms

## Completion format

```
PR #<N> — <title>
State: <open|closed|merged>  URL: <url>

Inline findings: <count> (Px: n, Py: m)
  [grouped list by priority, then file:line, with verbatim bodies]

Review summaries: <count>
  [per-reviewer state + body]

Conversation comments: <count>
  [automation banners filtered down; genuine human comments surfaced]

Next: /arc-receiving-review (or paste disposition per finding to drive /pr-reply)
```

## Blocked format

```
Fetch blocked
Reason: [no PR on current branch | gh not authenticated | repo mismatch | PR does not exist]
Action: [gh auth login | gh pr create | verify PR number]
```
