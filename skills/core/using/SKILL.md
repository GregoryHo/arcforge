---
name: using
description: Router and index for the arcforge toolkit. Use when you are unsure which skill fits the work in front of you, want the shortest workflow for a task, or need a map of what this toolkit actually offers.
---

# Using arcforge

Pick the smallest workflow that fits. This skill is an index, not a gate: find
the row that matches your situation, invoke that skill, and stop reading here.
If nothing matches, no arcforge skill applies — just do the work.

## Skill Map

| Skill | Use when |
| --- | --- |
| `/writing-skills` | you are authoring or revising an arcforge skill (user-invoked) |
| `/brainstorming` | a request is underspecified, several designs are plausible, or the user is thinking out loud rather than asking for code |
| `/executing` | work needs more than one step, a task list is waiting to be run, or you are choosing between attended and unattended execution |
| `/speccing` | a project keeps its product intent under `product/` — a wish needs capturing, a version needs its spec before it is built, a recorded decision is being reversed, or a shipped version needs its roadmap and spec flipped — or the user asks to start keeping it |
| `/tdd` | you are about to write implementation code, fix a bug, or found code with no test |
| `/debugging` | a test fails, a bug is reported, behavior surprises you, a build breaks, or a fix you tried did not hold |
| `/code-review` | a change is ready to hand off — the diff needs review before it merges, or review feedback just came back |
| `/dispatching` | work could run in parallel — splitting it across agents, giving each an isolated worktree, briefing them, or accepting what comes back |
| `/finishing` | implementation is done and the branch or worktree needs merging, a PR, keeping, or discarding |
| `/sessions` | context is about to be lost — work is stopping mid-task and the next session or another person has to pick it up, you are starting from an earlier handover, or a long session is filling up and you are deciding whether to compact |
| `/learning` | you are capturing a session diary, mining diaries for patterns, or reviewing what the opt-in learning subsystem wants to activate (user-invoked) |
| `/looping` | you are handing a task list to an unattended loop that will keep working after you walk away (user-invoked) |
| `/evaluating` | a claim about agent behavior needs evidence — you are designing or auditing an eval scenario, or reading a verdict out of eval numbers |
| `/maintaining-obsidian` | something should be filed into the user's Obsidian vault, a question should be answered from it, or it needs auditing or bootstrapping |
| `/diagramming-obsidian` | the user wants something shown visually — an architecture, a flow, a mind map — as an Excalidraw diagram in their vault |

**How a row is invoked, per host.** The `/<name>` spelling above is Claude Code's
(`/arcforge:tdd` is the same row, namespaced). On Codex CLI the same skill is
listed as `arcforge:<name>` and has no slash command — you reach it from the
composer's `$` mention picker. That mapping is not local to this table: it is how
every `/<name>` in this toolkit reads, including the mid-workflow handoffs skills
write to each other, so a skill that hands off to `/<name>` names the
`arcforge:<name>` skill on Codex and is reached the same way. The three rows
marked *(user-invoked)* never fire on their own on either host; asking for them
by name is the only way in.

**Precedence when rows overlap.** Discipline rows outrank wrap-up rows: if a
defect is reported or code is untested, `/tdd` or `/debugging` applies even when
the work is described as finished — `/finishing` presumes nothing is known to be
wrong. Between the two disciplines: `/debugging` when a failure is not yet
explained, `/tdd` once you know what to change.

`/brainstorming` settles *what* to build; `/speccing` records what was settled, so
they run in that order rather than competing. `/speccing` does not apply at all in a
repo that keeps no `product/` state and whose user has not asked for any.

## Sync Contract

The Skill Map is a bijection with the shipped skill set: every skill except
`using` itself has exactly one row (the router cannot route to itself), and
every row names a skill that exists. Both directions are enforced
by a test, so a skill added without its row — or a row left behind after its
skill is deleted — fails CI rather than silently misrouting.
