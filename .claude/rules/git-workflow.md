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

`skills`, `cli`, `hooks`, `learning`, `templates`, `agents`, `commands`

## Branch Naming

```
feat/description
fix/description
docs/description
```

## Pre-Commit Checklist

1. `npm run lint:fix` — auto-fix formatting
2. `npm test` — all 4 runners must pass
3. No secrets in diff — stop and remove before committing

## Skill PRs

Document Iron Law compliance in the PR description:
1. What baseline behavior you observed (RED)
2. How the skill addresses those failures (GREEN)
3. What loopholes you closed (REFACTOR)
