# Documentation

Start with the guides in `guide/` — they cover the full shipped surface:

- **CLI**: `guide/cli-invocation.md` — the `arcforge` command and its five groups
- **Skills**: `guide/skills-reference.md` — the 15 core skills and how they route
- **Hooks**: `guide/hooks-system.md` — the six event-driven components
- **Worktrees**: `guide/worktree-workflow.md` — isolated working copies
- **Eval**: `guide/eval-system.md` — scenarios, preflight, A/B runs, benchmarks
- **Learning**: `guide/learning-dashboard.md` — the observation → review → activation loop

A companion wiki lives at the [ArcForge Knowledge Base](https://publish.obsidian.md/greghodev/ArcForge/MOC-ArcForge); the in-repo guides are the source of truth when the two disagree.

## Other directories

- `decisions/` — frozen mechanical contracts (skill schema, task-list format, the
  learning-curator layer specs) — the authorities other docs point at
- `plans/` — historical process records (the v6 rebuild's plan, progress, and
  evidence; what a review round deliberately deferred), contributor-facing provenance

Product intent — living feature specs, roadmap, backlog, and the decision log —
lives outside `docs/` in [`product/`](../product/AGENTS.md).
