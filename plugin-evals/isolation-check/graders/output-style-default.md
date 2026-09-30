---
# Gate: the agent reports the default output style.
type: regex
target: last_message
match: contains
flags: im
---
^[\s*`>-]*OUTPUT_STYLE:[\s*`"]*default[\s*`".]*$
