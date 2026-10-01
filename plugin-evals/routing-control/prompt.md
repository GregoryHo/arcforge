---
name: routing-control
description: >-
  Control for D-024 — does ANY arcforge skill fire on its own under real plugin
  routing in a headless run? The prompt is written to match `brainstorming`'s
  description register (thinking out loud, several plausible designs, no code
  asked for). If this never fires either, a 0/10 on `speccing-trigger` says
  something about headless routing, not about speccing.
tags: [routing, control, d-024]
plugins: [../..]
runs: 5
max_turns: 12
timeout_seconds: 300
allowed_tools: [Skill, Read, Glob, Grep]
---

I'm thinking about adding rate limiting to our public API. I'm not sure whether
it should live in the gateway, in each service, or in a shared library, and I
keep going back and forth on fixed windows versus token buckets. Before I write
any code, help me think this through — what would you want to know, and what
are the real options here?
