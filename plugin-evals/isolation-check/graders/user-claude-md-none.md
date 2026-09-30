---
# Gate: the agent reports no user-level CLAUDE.md instructions in effect.
type: regex
target: last_message
match: contains
flags: im
---
^[\s*`>-]*USER_CLAUDE_MD:[\s*`"]*none[\s*`".]*$
