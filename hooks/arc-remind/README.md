# arc-remind

PostToolUse **non-blocking** hook. Hardens several discipline triggers from
skill-context-only prose into deterministically-fired, user-facing nudges.

## What it does

Dispatches by tool; emits a user-facing `systemMessage` for these triggers:

| Trigger | Tool | Nudge |
|---------|------|-------|
| `gh pr create` / `gh pr merge` | Bash | verify (`arc-verifying`) + review (`arc-requesting-review`); notes whether a test ran this session |
| raw `git worktree add` in an arcforge project (`specs/`) | Bash | prefer the arcforge CLI in BOTH directions — `arcforge expand` for epic worktrees, `arcforge worktree add` for non-epic ones (`arc-using-worktrees`). A CLI-routed worktree add never contains the raw `git worktree add` literal, so it never trips this nudge. |
| `git commit` / `push` after a SKILL.md edit (once/session) | Bash + Edit/Write | freshness-aware eval-before-ship: compares `evals/benchmarks/latest.json` against the session's SKILL.md edits (`arc-writing-skills` Iron Law) |
| first code (non-doc) edit on `main`/`master` (once/session) | Edit/Write | prefer a branch / epic worktree for feature work (`arc-executing-tasks`) |

The last one is the shippable, user-facing half of eval-before-ship; the
`ci.yml` annotation is the arcforge-repo half (the plugin is disabled here).
Edit/Write events are observed only to track which `SKILL.md` files were edited.

## Eval-before-ship freshness

The ship-a-skill nudge is evidence-based, not a slogan. At commit/push time it
compares the mtime of the SKILL.md files edited this session against
`evals/benchmarks/latest.json` (the `generated` ISO timestamp; file mtime when
the JSON is malformed). Three branches:

| Evidence | Message |
|----------|---------|
| no `latest.json` (or no datable edit) | the generic Iron Law nudge — identical to the pre-freshness behavior |
| benchmark older than the last skill edit | stale: "no eval result newer than your skill edit exists", naming the edited skills |
| benchmark newer than the last skill edit | fresh: evidence postdates the edit; confirm it covers the edited skills |

Still once per session, still a user-facing `systemMessage`.

## Why the PR boundary

A pull request is the cleanest mechanical proxy for "claiming work complete" — a
commit is not a completion claim, a PR is. Anchoring here keeps the reminder rare
and high-signal. Anchoring to every commit, or to every edit on `main`, would be
a noise machine that gets the hook disabled (arcforge itself develops on `main`).

## Audience: attended → user; autopilot → user + Claude

A PostToolUse `systemMessage` is shown to the **user**. In an **attended**
session that is the whole story: verification is human-in-the-loop, and a
user-facing-only nudge avoids the model performatively running a test just to
satisfy a hook. The worktree-add, main-branch and spec→dag nudges are always
user-only for this reason.

When an autonomous loop is **live** for this checkout — `loopSentinelPresent(cwd)`
is true (worktree-aware: an epic worktree resolves to its base via the
`.arcforge-epic` marker) — there is no human watching the systemMessage, so the
**PR-boundary** and **eval-before-ship** nudges ADDITIONALLY reach the model over
the PostToolUse model channel (`hookSpecificOutput.additionalContext`,
spike-verified v2.1.172). Both fields ride a single merged JSON object; the
`systemMessage` is still emitted so a human reviewing the transcript sees it too.
PostToolUse cannot block; this hook only ever reminds.

## State

Tracks a per-session `arc-remind-test-seen` counter (incremented when a test <!-- doc-ref-lint: ignore R4 arc-remind-test-seen is a per-session state counter name, not a skill/hook/agent reference -->
runner command is seen) so the reminder can note when no verification ran, and
a hook-local per-session JSON list of the SKILL.md paths edited this session
(feeding the freshness comparison above).

See `docs/plans/hook-hardening-design.md` for the full tier analysis.
