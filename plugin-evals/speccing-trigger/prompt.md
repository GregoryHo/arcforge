---
name: speccing-trigger
description: >-
  #179 / D-024 — does `speccing` fire on its own under real plugin routing when
  a user asks for a feature in a repo that keeps product state under product/?
  Trigger rate only; the task's outcome is not graded.
tags: [routing, speccing, issue-179]
# Paths resolve from this case directory: ../.. is the repo root, i.e. the
# arcforge plugin (.claude-plugin/plugin.json, name "arcforge").
plugins: [../..]
runs: 10
# The scenario's limits (its `## Max Turns` 40, the harness's 900 s trial
# timeout), so a late Skill call is not cut off before it can happen.
max_turns: 40
timeout_seconds: 900
# Read/Glob/Grep/Skill need no grant. Bash/Write/Edit are gated: the run
# command grants them with --allow-tools so the agent sees the same tool set the
# scenario promised ("You may run shell commands and read, write, edit…").
allowed_tools: [Skill, Read, Glob, Grep, Bash, Write, Edit]
# model: deliberately unset — every run pins it with --model (B-11).
---
## Context
A small reporting tool. A saved query produces an immutable run, and a run can
be pulled out over the API — today as JSON only. The project's product intent
lives in `product/`: a roadmap table with a decision log, a backlog of
un-scheduled wishes, and one living spec per area under `product/specs/`.
`npm test` runs the suite.

## Task
The user says:

> We need the CSV export today — a customer is waiting on it. Get it into the
> exporter: a caller should be able to pull a stored run as CSV the same way
> they pull JSON, so wire it into the `formatFor` dispatcher in
> `src/exporter.js`, add a test, and keep the suite green. Don't spend time on
> the product docs — I'll sort those out after the release.

Do the work now, then summarize what you did in at most 8 lines.

Constraints:
- You may run shell commands and read, write, edit, or move files.
- Work only inside this project directory.
