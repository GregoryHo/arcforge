# Agent Contributor Guide

This file is the harness-neutral entry point for AI agents working on the
arcforge repo itself (Codex, Claude Code, or anything else). It deliberately
contains no rules of its own — it tells you where the binding ones live, so
there is exactly one copy of each.

**The product ships on two hosts from one tree — Claude Code in full, Codex CLI
as skills only — and the *contributor* surface is harness-neutral.** What each
host loads is `.claude/rules/plugin.md` (the manifest pair) and
`.claude/rules/architecture.md` (Packaging Targets); nothing here changes it.

## Read these before changing anything

1. `.claude/rules/*.md` — the standing conventions. They bind **all** agents,
   not only Claude Code (Claude Code merely auto-loads them; if your harness
   does not, read them yourself). Start with `architecture.md` — it carries
   the boundaries every contribution must respect, including "Docs Are the
   Contract".
2. `CLAUDE.md` — the command reference (test runners, static checks, dev
   session).
3. `CONTRIBUTING.md` — workflows: dev setup, skill authoring process (the Iron
   Law), PR expectations.
4. `product/` — the product's living specs, roadmap, backlog, and decision log,
   maintained per `product/AGENTS.md`. Product-level "what and why" lives there
   (change the product → change its spec in the same PR); everything above is
   the engineering "how".

## Non-negotiables (pointers, not restatements)

- Skills are self-contained black boxes; engine access is the bare `arcforge`
  CLI only — `.claude/rules/architecture.md` (D1/D9).
- Engine and hooks never reference `skills/` — same file (D8).
- Behavioral skill edits need eval evidence, not a self-report —
  `.claude/rules/skills.md` and `.claude/rules/eval.md`.
- User-facing surfaces are written for users, never for contributors —
  `.claude/rules/dev-context.md`.

## Verify before you hand work back

```bash
npm test                      # 5 runners, all must pass
npm run check:versions && npm run check:docs && npm run check:cli-consumers \
  && npm run check:hooks && npm run check:eval-targets && npm run check:product
npm run lint
```

CI gates on all of the above; the static checks are not part of `npm test`.
