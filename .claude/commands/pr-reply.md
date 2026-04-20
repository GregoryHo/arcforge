---
description: Post a threaded reply to a PR inline review comment. Arg format; <comment-id> <disposition notes>
argument-hint: "<comment-id> <disposition: reject|accept|defer — rationale>"
disable-model-invocation: true
---

Post a threaded reply to a specific inline review comment. Designed to pair with `/pr-comments` (to discover IDs) and `arc-receiving-review` (to decide disposition).

## Arguments

`$ARGUMENTS` format: `<comment-id> <disposition notes>`

- First token: numeric GitHub review-comment ID (the parent comment you're replying to; not a reply's ID)
- Remainder: disposition notes in free form. Conventions:
  - Starts `reject` → refuse with rationale (cite CHANGELOG / spec / design decision)
  - Starts `accept` or `fix` → acknowledge + cite the fix commit SHA
  - Starts `defer` → name the tracking artifact (follow-up issue, v-next PR)
  - Starts `ack` → neutral acknowledgment (e.g., "already done on main")

## Steps

1. **Parse `$ARGUMENTS`** — split at first whitespace: `commentId = first`, `notes = rest`
   - If `commentId` is not a positive integer, report blocked
   - If `notes` is empty, report blocked (disposition is required — no silent rubber-stamps)

2. **Resolve PR context from the comment**

   ```bash
   gh api "repos/{owner}/{repo}/pulls/comments/<commentId>"
   ```

   Extract: `pull_request_url` (→ PR number), `path`, `line`, `body` (original finding), `user.login` (reviewer).

3. **Draft the reply body** based on disposition:

   | Disposition | Reply shape |
   |---|---|
   | `reject ...` | State rejection + cite the contract that makes the finding out of scope (CHANGELOG entry, design decision, spec requirement). Avoid "disagree" — name the principle. |
   | `accept ...` / `fix ...` | Acknowledge + include the SHA of the fix commit: `Fixed in <sha>` (check `git log --oneline -5` for the latest relevant commit). Mention what the fix did in one sentence. |
   | `defer ...` | State why it's correct but out-of-scope-for-this-PR; name the tracking artifact; provide a rough when. |
   | `ack ...` | Brief acknowledgment only. Use when the finding is accurate but needs no action (already fixed elsewhere, deprecated code, etc.). |

   The reply must be substantive — no "Thanks!", no "Great catch!", no performative gratitude. Technical content only.

4. **Post the reply**

   ```bash
   gh api -X POST "repos/{owner}/{repo}/pulls/<prNumber>/comments/<commentId>/replies" \
     -f body="<drafted reply>"
   ```

5. **Output the reply URL** (from the API response's `html_url`) so the user can verify formatting/tone on GitHub.

## Guardrails

- Do NOT accept the disposition without the user supplying notes — silence is not a valid classification
- Do NOT resolve/close the conversation thread — replies only; resolving is a separate UI action the user controls
- Do NOT auto-apply code changes as part of a `fix` reply — code fixes go through `arc-receiving-review` and land as separate commits BEFORE `/pr-reply` cites them
- For `fix`/`accept`: verify the cited commit actually exists (`git rev-parse <sha>`) and touches the file in the finding
- For `reject`: if the rationale doesn't reference a concrete contract (CHANGELOG line, decision note, spec ID, rule file), ask the user to strengthen it before posting

## Completion format

```
Reply posted → <html_url>
Parent: comment <commentId> by <reviewer>
File: <path>:<line>
Disposition: <reject|accept|defer|ack>
```

## Blocked format

```
Reply blocked
Reason: [missing comment-id | missing disposition notes | comment not found | unverified fix SHA | weak rejection rationale]
Action: [retry with <correct usage> | supply rationale | verify commit | run arc-receiving-review first]
```
