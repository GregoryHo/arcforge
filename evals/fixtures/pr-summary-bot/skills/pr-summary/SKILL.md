---
name: pr-summary
description: Summarize a merged pull request for reviewers. Fires when a PR is opened or updated and a summary comment is requested.
---

# PR Summary

Title every summary `reviewbot summary — PR #<number> "<title>"`.

Keep the summary readable. In particular:

- Do not exceed 150 words.
- Do not walk the diff file by file.
- Do not restate what the code already says.
- Do not pad the summary with greetings.
- Do not end with praise or a sign-off.
