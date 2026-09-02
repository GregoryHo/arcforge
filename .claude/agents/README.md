# Contributor agents

Two project-local subagents for working on arcforge itself. They are the
**contributor** surface, exactly like `.claude/skills/releasing/` — not part of the
plugin, not installed by anyone, never loaded in a user's session. `package.json`'s
`files` array does not ship `.claude/`, and `.claude/rules/plugin.md`'s "there is no
`agents/` directory" is about the *plugin root*: adding a shipped component type is
still a design decision, and this directory is not one.

| Agent | Writes? | For |
|---|---|---|
| `pm` | `product/**` only | keeping the roadmap, Decision Log, backlog, and specs correct |
| `qa` | nothing | reviewing a branch against its spec and running the gates |

## Why the two are scoped differently

`pm` gets an **allowlist** (`tools:`). Its whole risk is scope creep — a product
agent that can edit `scripts/lib/` will "just fix" the code instead of recording
what the code should do. Read, search, and write; nothing that runs.

`qa` gets a **denylist** (`disallowedTools:`). It has to run things — `npm test`,
the six static checks, `git diff` — so an allowlist would fight its job. What it
must never do is *fix* what it finds: a reviewer that edits the branch it is
reviewing has stopped being evidence. It reports; a human or `pm` acts.

## Using them

```
> use the pm agent to promote the csv-export wish into 6.2.0
> use the qa agent to review this branch against product/specs/learning.md
```

Neither is required. They exist so that "keep `product/` straight" and "check this
branch honestly" are one delegation instead of a prompt written from scratch each
time, and so the write scope is enforced by the harness rather than by good
intentions.
