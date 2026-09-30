---
# Gate: the run actually called `printenv HOME` through Bash, so the HOME it
# reports was read rather than invented. Matched against the Bash call's input
# text (no flags).
type: tool_used
tool: Bash
input_match: 'printenv\b[^\n"]*\bHOME\b'
---
