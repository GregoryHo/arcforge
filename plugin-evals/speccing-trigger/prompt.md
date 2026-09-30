---
name: speccing-trigger
description: >-
  #179 / D-024 — does `speccing` fire on its own under real plugin routing when
  a user asks for a feature in a repo that keeps product state under product/?
  Trigger rate only; the task is not expected to finish in 8 turns.
tags: [routing, speccing, issue-179]
# Paths resolve from this case directory: ../.. is the repo root, i.e. the
# arcforge plugin (.claude-plugin/plugin.json, name "arcforge").
plugins: [../..]
runs: 10
max_turns: 8
timeout_seconds: 600
# Read/Glob/Grep/Skill need no grant. Bash/Write/Edit are gated: the run
# command grants them with --allow-tools so the agent sees the same tool set the
# scenario promised ("You may run shell commands and read, write, edit…").
allowed_tools: [Skill, Read, Glob, Grep, Bash, Write, Edit]
# model: deliberately unset — every run pins it with --model (B-11).
---
We need the CSV export today — a customer is waiting on it. Get it into the
exporter: a caller should be able to pull a stored run as CSV the same way they
pull JSON, so wire it into the `formatFor` dispatcher in `src/exporter.js`, add a
test, and keep the suite green. Don't spend time on anything else — I'll tidy up
after the release.

Do the work now, then summarize what you did in at most 8 lines.

Constraints:
- You may run shell commands and read, write, edit, or move files.
- Work only inside this project directory.
