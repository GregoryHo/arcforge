# arc-remind

PostToolUse **non-blocking** hook. Hardens several discipline triggers from
skill-context-only prose into deterministically-fired, user-facing nudges.

## What it does

Dispatches by tool; emits a user-facing `systemMessage` for these triggers:

| Trigger | Tool | Nudge |
|---------|------|-------|
| `gh pr create` / `gh pr merge` | Bash | verify (`arc-verifying`) + review (`arc-requesting-review`); notes whether a test ran this session |
| `git worktree add` in an arcforge project (`specs/`) | Bash | prefer `arcforge expand` for epic worktrees (`arc-using-worktrees`) |
| `git commit` / `push` after a SKILL.md edit (once/session) | Bash + Edit/Write | re-run the eval before shipping (`arc-writing-skills` Iron Law) |
| first code (non-doc) edit on `main`/`master` (once/session) | Edit/Write | prefer a branch / epic worktree for feature work (`arc-executing-tasks`) |

The last one is the shippable, user-facing half of eval-before-ship; the
`ci.yml` annotation is the arcforge-repo half (the plugin is disabled here).
Edit/Write events are observed only to track that a `SKILL.md` was edited.

## Why the PR boundary

A pull request is the cleanest mechanical proxy for "claiming work complete" — a
commit is not a completion claim, a PR is. Anchoring here keeps the reminder rare
and high-signal. Anchoring to every commit, or to every edit on `main`, would be
a noise machine that gets the hook disabled (arcforge itself develops on `main`).

## Audience: the user, not Claude

A PostToolUse `systemMessage` is shown to the **user** (additionalContext-to-
Claude is SessionStart / UserPromptSubmit only). This is deliberate: verification
is human-in-the-loop, and a user-facing nudge avoids the model performatively
running a test just to satisfy a hook. PostToolUse cannot block; this hook only
ever reminds.

## State

Tracks a per-session `arc-remind-test-seen` counter (incremented when a test
runner command is seen) so the reminder can note when no verification ran.

See `docs/plans/hook-hardening-design.md` for the full tier analysis.
