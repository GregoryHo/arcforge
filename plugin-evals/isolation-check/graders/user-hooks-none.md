---
# Gate: the agent reports no user-level hooks in effect.
type: regex
target: last_message
match: contains
flags: im
---
^[\s*`>-]*USER_HOOKS:[\s*`"]*none[\s*`".]*$
