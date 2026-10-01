# Git Workflow

## Conventional Commits

Format: `<type>(<scope>): <description>`

### Types

| Type | Use |
|------|-----|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `test` | Adding or updating tests |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `chore` | Maintenance, dependencies, CI |

### Scopes

`skills`, `cli`, `hooks`, `learning`, `eval`, `docs`

## Branch Naming

```
feat/description
fix/description
docs/description
```

## Pre-Commit Checklist

1. `npm run lint:fix` — auto-fix formatting
2. `npm test` — all 5 runners must pass
3. The 7 static checks (`check:versions`, `check:docs`, `check:cli-consumers`,
   `check:hooks`, `check:eval-targets`, `check:product`, `check:file-size`) — they
   run in CI and are not part of `npm test`; see `.claude/rules/testing.md`
4. No secrets in diff — stop and remove before committing

## Claude GitHub Workflows

Both spend the maintainer's Claude subscription (`CLAUDE_CODE_OAUTH_TOKEN`),
which is the same usage the eval measurements need — treat a run as a cost.

| Workflow | Fires on | Cost note |
|---|---|---|
| `.github/workflows/claude.yml` | an `@claude` mention in an issue, PR comment, or review | one full session per mention |
| `.github/workflows/claude-code-review.yml` | PR `opened` / `ready_for_review`, only when shipped or measured paths change (the `paths` list in the file) | one review when the PR opens, another when a draft is marked ready; later pushes are not reviewed (D-030) |

There is no draft filter: a PR opened as a draft is reviewed at open *and* again
when marked ready. Changing either trigger is a product decision — record it
as a `D-NNN` the way D-030 was.

## Skill PRs

Document Iron Law compliance in the PR description:
1. What baseline behavior you observed (RED)
2. How the skill addresses those failures (GREEN)
3. What loopholes you closed (REFACTOR)
