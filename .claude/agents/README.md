# Contributor agents

Two project-local subagents for working on arcforge itself. They are the
**contributor** surface, exactly like `.claude/skills/releasing/` — not part of the
plugin, not installed by anyone, never loaded in a user's session. `package.json`'s
`files` array does not ship `.claude/`, and `.claude/rules/plugin.md`'s "there is no
`agents/` directory" is about the *plugin root*: adding a shipped component type is
still a design decision, and this directory is not one.

| Agent | Writes? | For |
|---|---|---|
| `pm` | `product/**` only (by instruction) | keeping the roadmap, Decision Log, backlog, and specs correct |
| `qa` | nothing | reviewing a branch against its spec and running the gates |

## Why the two are scoped differently

Both carry a `tools:` **allowlist**, because that is the field that actually holds.
The two allowlists differ in the one axis that matters for each agent's failure mode.

`pm` gets read, search, and write, and **nothing that executes**. Its risk is scope
creep: a product agent that can run and edit code will "just fix" the engine instead
of recording what the engine should do. With no Bash it can only describe — which is
also why running `npm run check:product` is something `pm` hands off rather than does.

`qa` gets read, search, and **Bash**, because running `npm test` and the six static
checks is its entire job — and no editing tools, because a reviewer that fixes what
it finds has stopped being evidence. It reports; a human or `pm` acts. The explicit
`disallowedTools:` line states that intent a second time.

Be honest about both seams. `qa` holds Bash, and a shell can write files: the
allowlist removes the editing tools, not the possibility. And a `tools:` allowlist
scopes *which tools* an agent holds, never *which paths* they reach — `pm`'s `Write`
is an ordinary `Write`, so "`product/**` only" rests on the Scope section of `pm.md`,
with the tool set contributing only the absence of execution. In both cases what
makes the rule hold is the instruction in the agent body, backed by a tool set that
gives it no convenient way to break the rule by accident.

## Using them

```
> use the pm agent to promote the csv-export wish into 6.2.0
> use the qa agent to review this branch against product/specs/learning.md
```

Neither is required. They exist so that "keep `product/` straight" and "check this
branch honestly" are one delegation instead of a prompt written from scratch each
time — with the half a harness can hold, which tools each agent gets, held there
instead of in good intentions.
