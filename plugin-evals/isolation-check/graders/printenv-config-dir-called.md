---
# Gate: the run actually called `printenv CLAUDE_CONFIG_DIR` through Bash, so
# the value it reports was read rather than invented. Matched against the Bash
# call's input text (no flags).
type: tool_used
tool: Bash
input_match: 'printenv\b[^\n"]*\bCLAUDE_CONFIG_DIR\b'
---
