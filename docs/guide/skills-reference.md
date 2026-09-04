# Skills

arcforge ships fifteen skills. Each one is a self-contained workflow that changes
how the agent works on a particular kind of problem — not a library of prompts to
copy, but instructions that load into the session when they apply.

## How a skill fires

Twelve of the fifteen are **model-invoked**: the agent reaches for them on its
own when the situation matches. You do not have to know they exist. Ask for a bug
to be fixed and `debugging` applies itself; say a branch is finished and
`finishing` takes over.

Three are **user-invoked** — they load only when you ask for them by name,
because starting them is a deliberate act rather than something to infer:

```
/arcforge:learning
/arcforge:looping
/arcforge:writing-skills
```

Any skill can be invoked by name this way — installing the plugin namespaces
them. The form is host-specific: `/arcforge:<name>` on Claude Code, and
`arcforge:<name>` (no leading slash) on Codex CLI, which has no slash commands
for skills — you reach one from the composer's `$` mention picker. Every
`/arcforge:<name>` spelling in this guide is Claude Code's. What a skill can do
once it loads differs too — see the [CLI guide](cli-invocation.md).

## Start here: `using`

`using` is the router. It holds one table mapping situations to skills, and it
exists for the moment you are unsure which workflow fits:

```
/arcforge:using
```

It is an index, not a gate — it points you at one skill and gets out of the way,
and if nothing matches, the honest answer is that no arcforge skill applies. You
never have to route through it to use anything else.

## Before a design is settled

**`brainstorming`** — structured exploration when a request is underspecified,
when several designs are plausible and one is about to be picked silently, or
when you are thinking out loud rather than asking for code. Its rule is that no
design gets chosen until the alternatives have been named.

## Doing the work

**`executing`** — breaks work into a markdown checkbox task list and runs it to
completion. Applies when a change needs more than one step, when a list is
already waiting, or when you are deciding between working alongside the agent and
letting it run unattended. The list file is the only progress record.

**`tdd`** — test-first implementation. Applies when adding a function or feature,
fixing a bug, changing behavior, or when implementation code exists with no test
covering it. Its law: no production code without a failing test first.

**`debugging`** — root-cause discipline for a failure nobody can yet explain. A
test fails, a bug comes in, a build breaks, behavior surprises you, or a fix you
already tried did not hold. Its law: no fix before the cause is named.

Between the two: `debugging` while the failure is unexplained, `tdd` once you
know what to change.

## Handing it off

**`code-review`** — the gate before a change leaves your hands. Runs the
project's own checks, gets the diff read by something that did not write it, and
handles the feedback when it comes back.

**`finishing`** — integration. Applies when the implementation is done and the
branch or worktree needs merging, a PR, keeping, or discarding. Verify, present
the options, execute, clean up — in that order, and never presenting options
before the verification has actually run.

## Running more than one thing

**`dispatching`** — for work that can genuinely run in parallel: splitting it,
giving each piece an isolated workspace, writing the brief each agent runs on,
and accepting what comes back. It is candid that splitting work you could have
done in one pass costs more than it saves.

**`looping`** *(user-invoked)* — hands a task list to an unattended loop that
keeps working after you walk away. One task per iteration, each in a fresh
session, restartable across a crash or a closed laptop. See the
[CLI guide](cli-invocation.md#loop) for the flags underneath it.

## Not losing the thread

**`sessions`** — continuity across a break in context. A session is ending or
being handed over, you are stopping mid-task, you are picking up from an earlier
handover note, or a long session is filling up and compaction is the question.
Both ways of losing context lose the same thing, and both are answered by getting
it onto disk first.

## Your notes

**`maintaining-obsidian`** — the interface to an Obsidian vault: filing something
into your notes, answering a question from the vault rather than from general
knowledge, auditing vault health, or bootstrapping a new one. Each vault declares
its own domain, so the skill stays domain-agnostic.

**`diagramming-obsidian`** — builds Excalidraw diagrams in that vault, for when
something is better shown than described: an architecture, a flow, a mind map. It
insists a diagram argue something rather than display a grid of boxes.

## Extending the toolkit

**`writing-skills`** *(user-invoked)* — authoring an arcforge skill that actually
changes agent behavior: invocation, description, form, evidence.

**`evaluating`** — measurement discipline for claims about agent behavior. A
claim needs evidence before it ships, a scenario needs designing or auditing, or
numbers have come back and a verdict is about to be read out of them. See the
[eval guide](eval-system.md).

**`learning`** *(user-invoked)* — the opt-in loop that captures a session diary,
extracts patterns across diaries, and reviews what activates. Off until you turn
it on; nothing it proposes changes behavior until you activate it. See the
[learning guide](learning-dashboard.md).

## The full set

| Skill | Fires when |
|-------|-----------|
| `using` | you are unsure which skill fits |
| `brainstorming` | a design is not settled and alternatives have not been named |
| `executing` | the work needs a task list and someone to run it |
| `tdd` | code is about to be written or changed |
| `debugging` | something failed and the cause is not yet known |
| `code-review` | a change is ready to hand off, or feedback came back |
| `finishing` | implementation is done and the branch needs a decision |
| `dispatching` | work can run in parallel across agents |
| `looping` | a task list is going to run unattended (user-invoked) |
| `sessions` | context is about to be lost |
| `maintaining-obsidian` | something belongs in the vault, or an answer should come from it |
| `diagramming-obsidian` | something should be shown visually |
| `writing-skills` | you are authoring or revising a skill (user-invoked) |
| `evaluating` | a behavioral claim needs evidence |
| `learning` | you are capturing, mining, or reviewing session learning (user-invoked) |

## What a skill looks like on disk

Every skill is one directory holding a `SKILL.md` and, where a workflow has
detail that would bloat the main file, a `references/` folder it opens on demand:

```
skills/core/tdd/
├── SKILL.md
└── references/
```

The `core` segment is a shelf, not part of the name — a skill is invoked as
`/arcforge:tdd` regardless of where it sits.

Skills are closed units. None of them reaches into another, and none of them
reaches into arcforge's internals; when a skill needs the engine it shells out to
the `arcforge` command like anything else would. That is what lets you read one
skill and understand it completely, and what lets you write your own without
learning how the toolkit is built inside.
