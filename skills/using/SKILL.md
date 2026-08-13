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
| `/tdd` | you are about to write implementation code, fix a bug, or found code with no test |
| `/debugging` | a test fails, a bug is reported, behavior surprises you, a build breaks, or a fix you tried did not hold |
| `/code-review` | a change is ready to hand off — the diff needs review before it merges, or review feedback just came back |
| `/finishing` | implementation is done and the branch or worktree needs merging, a PR, keeping, or discarding |
| `/compacting` | context is filling up and you are deciding whether to compact now |
| `/sessions` | work is stopping mid-task and the next session or another person has to pick it up, or you are starting from an earlier handover |
| `/learning` | you are capturing a session diary, mining diaries for patterns, or reviewing what the opt-in learning subsystem wants to activate (user-invoked) |
| `/evaluating` | a claim about agent behavior needs evidence — you are designing or auditing an eval scenario, or reading a verdict out of eval numbers |

v6 rebuilds the skill set from zero; each skill adds its own row in the same
change that creates it, so the table grows as the rewrite lands.

## Sync Contract

The Skill Map is a bijection with the shipped skill set: every skill has exactly
one row, and every row names a skill that exists. Both directions are enforced
by a test, so a skill added without its row — or a row left behind after its
skill is deleted — fails CI rather than silently misrouting.
