---
name: isolation-check
description: >-
  D-025 — checks the inference that every run starts from a fresh HOME and
  CLAUDE_CONFIG_DIR, so the operator's output style, user hooks and user
  CLAUDE.md do not reach the trial. Run before speccing-trigger.
tags: [isolation, d-025]
# ../.. is the repo root: the arcforge plugin, same as speccing-trigger.
plugins: [../..]
runs: 1
max_turns: 4
timeout_seconds: 180
# Bash is gated; the run command grants it with --allow-tools Bash. It is only
# for the two printenv calls below.
allowed_tools: [Bash]
# model: deliberately unset — the run pins it with --model (B-11).
---
Report what is actually in effect in this session. Answer from what is loaded
into your context; do not guess, and do not read any file to find out. The only
commands you may run are `printenv HOME` and `printenv CLAUDE_CONFIG_DIR`.

Reply with exactly these six lines and nothing else, each filled in verbatim:

OUTPUT_STYLE: <the name of the output style in effect, or default if none is>
USER_CLAUDE_MD: <none, or the first line of any user-level CLAUDE.md instructions in your context, quoted exactly>
USER_HOOKS: <none, or each user-level hook you can see in effect>
PLUGINS: <comma-separated names of every plugin you can see loaded>
HOME: <the output of printenv HOME>
CLAUDE_CONFIG_DIR: <the output of printenv CLAUDE_CONFIG_DIR, or unset>
