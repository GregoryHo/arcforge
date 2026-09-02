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

Both carry a `tools:` **allowlist**, because that is the field that actually holds.
The two allowlists differ in the one axis that matters for each agent's failure mode.

`pm` gets read, search, and write, and **nothing that executes**. Its risk is scope
creep: a product agent that can run and edit code will "just fix" the engine instead
of recording what the engine should do. With no Bash it can only describe.

`qa` gets read, search, and **Bash**, because running `npm test` and the six static
checks is its entire job — and no editing tools, because a reviewer that fixes what
it finds has stopped being evidence. It reports; a human or `pm` acts. The explicit
`disallowedTools:` line states that intent a second time.

Be honest about the seam: `qa` holds Bash, and a shell can write files. The allowlist
removes the editing tools, not the possibility — what makes "verify, never fix" hold
is the instruction in the agent body, backed by a tool set that gives it no
convenient way to break the rule by accident.

## Using them

```
> use the pm agent to promote the csv-export wish into 6.2.0
> use the qa agent to review this branch against product/specs/learning.md
```

Neither is required. They exist so that "keep `product/` straight" and "check this
branch honestly" are one delegation instead of a prompt written from scratch each
time, and so the write scope is enforced by the harness rather than by good
intentions.
