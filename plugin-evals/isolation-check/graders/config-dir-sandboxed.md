---
# Assumes a macOS operator home under /Users/ -- adapt the pattern on any other
# platform. A static grader cannot read the caller's real config dir; compare
# the printed value by hand (README).
type: regex
target: last_message
match: contains
flags: im
---
^[\s*`>-]*CLAUDE_CONFIG_DIR:[\s*`"]*/(?!Users/)\S+
