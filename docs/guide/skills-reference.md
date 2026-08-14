# arcforge Skills Reference

This is the offline reference for all 24 arcforge skills. In a live session, **`using` is the canonical router** — invoke it when you want arcforge to map your situation to a skill; use this document when you want to read about skills in depth.

## Table of Contents

- [Quick Start](#quick-start)
- [Skill Categories](#skill-categories)
- [Complete Skill Catalog](#complete-skill-catalog)
  - SDD: [brainstorming](#brainstorming) · [executing](#executing) · [arc-finishing](#arc-finishing)
  - Orchestration: [dispatching](#dispatching) · [looping](#looping)
  - Discipline: [tdd](#tdd) · [arc-debugging](#arc-debugging) · [arc-verifying](#arc-verifying) · [arc-reviewing](#arc-reviewing)
  - Memory: [learning](#learning) · [arc-managing-sessions](#arc-managing-sessions) · [arc-compacting](#arc-compacting)
  - Knowledge: [maintaining-obsidian](#maintaining-obsidian) · [diagramming-obsidian](#diagramming-obsidian)
  - Meta: [using](#using) · [writing-skills](#writing-skills) · [evaluating](#evaluating)
- [Workflow Patterns](#workflow-patterns)
- [Comparison Tables](#comparison-tables)
- [Operating Principles](#operating-principles)

## Quick Start

arcforge is a minimal, composable skill toolkit for Claude Code and Codex. Skills are structured workflow guides that add discipline when useful while preserving direct answers, read-only inspection, and harness/eval isolation when workflow would be overhead.

> **Platform support**: Core workflow, worktree, and quality skills work on both platforms. A handful of skills are currently Claude Code-only because they integrate with platform-specific features (session transcripts, subprocess spawning, tool-call logs, agent teammates). Look for **Platform:** markers in each skill's entry below. Today the Claude Code-only skills are: `arc-looping`, `evaluating`, and `learning`.

**Core skills every user should learn first:**

1. **using** — Bounded router and skill index for ArcForge tasks
2. **brainstorming** — Design exploration when intent is unclear
3. **executing** — Break approved work into an executable task list
4. **tdd** — Test-driven implementation discipline
5. **arc-debugging** — Systematic root cause investigation
6. **arc-verifying** — Fresh evidence before completion claims
7. **evaluating** — Measure whether skills and workflows change behavior

**What are you trying to do?**

```
What are you trying to do?
|
+-- Build something new?
|   +-- Have a spec? --> executing
|   +-- Need to explore? --> brainstorming
|
+-- Fix a bug?
|   +-- debugging --> tdd --> /code-review
|
+-- Understand the system?
|   +-- using (when routing help is useful)
|
+-- Improve workflow?
    +-- learning (user-invoked)
```

---

## Skill Categories

arcforge's 24 skills are organized into a three-layer model:

1. **Core toolkit** — the small promoted surface most users should learn first.
2. **Optional workflows** — recipes and advanced orchestration used only when the task justifies them.
3. **Harness/eval layer** — tests and evaluation skills that verify both activation and non-activation behavior.

The complete catalog is grouped by `category` frontmatter. Within each category, model-invoked skills auto-trigger from their description; user-invoked skills _(marked)_ never auto-trigger and are reached only by `/arcforge:<name>` or a project-level task:

| Category | Skills | Purpose |
|----------|--------|---------|
| **SDD** | brainstorming, executing, arc-finishing | Explore, specify, build, integrate |
| **Orchestration** | dispatching, looping | Dispatch subagents; manage worktrees and loop state |
| **Discipline** | tdd, arc-debugging, arc-verifying, arc-reviewing | Condition-triggered quality gates |
| **Memory** | learning _(user-invoked)_, arc-managing-sessions, arc-compacting | Session continuity + learning (default-off module) |
| **Knowledge** | maintaining-obsidian, diagramming-obsidian | Ingest, query, audit, and visualize an Obsidian vault |
| **Meta** | using, writing-skills _(user-invoked)_, evaluating | Route, evaluate, and maintain the catalog itself |

**How skills flow through a project:**

```
  PLANNING          EXECUTION         COORDINATION
  --------          ---------         ------------
  brainstorming --> executing (write the list) --> executing (run it) --> finishing
                                                   |
                                                   v
                                                   dispatching-parallel
                                                   |
                                                   +--- using-worktrees, dispatching-teammates

  DISCIPLINE                MEMORY                META
  ----------                ------                ----
  tdd (during execution)    journaling            using (router)
  debugging (on failure)    reflecting            evaluating (skill eval)
  verifying (before done)   learning              writing-skills
  reviewing (on completion) recalling
                            managing-sessions
                            compacting
```

---

## Complete Skill Catalog

### SDD Skills

---

### brainstorming

**Purpose:** Structured exploration before a design is settled.

**When to use:** When a request is underspecified, when several designs are plausible and one is about to be chosen silently, or when the user is thinking out loud rather than asking for code.

**Key workflow:**
1. Read the repo first, then ask only what it cannot answer — one question per message
2. Name at least two approaches you could actually defend, each with its cost and what it forecloses
3. Recommend one and say why
4. Cut with YAGNI against the measured scale of the problem, not the imagined one
5. Converge on four elements: problem, approach, what it must do, scope in/out

**Artifacts:**
- Output: a design narrative — written to a file only when the user names one; there is no directory convention

**Related:** nothing required --> **brainstorming** --> executing

---

### executing

**Purpose:** Break work into a checkbox task list and run it to completion. The list file is the only progress record.

**When to use:** When a change needs more than one step, when a task list is already waiting to be run, or when choosing between attended and unattended execution.

**Key workflow:**
1. Write the list in the v1 checkbox format — stable ids, four markers, a `verify:` command per task
2. Pick a mode with the user: attended (batch, then report and wait) or unattended
3. Per task: mark `[~]`, do the work through tdd, run `verify:`, mark `[x]` only on a run you read
4. Blocked is `[!]` plus a `note:` a stranger could act on — never a guess
5. On resume, trust the file over memory; never redo an `[x]` task

**Artifacts:**
- Input/output: the task list file (markdown checkboxes) — no second ledger

**Related:** brainstorming --> **executing** --> arc-finishing

---

### arc-finishing

**Purpose:** Guide completion of development work with structured options. One skill, two paths — Step 0 discriminates on `.arcforge-epic`: an **epic path** (coordinator integration + DAG updates for marker'd worktrees) and a **non-epic path** (plain git for regular branches and generic worktrees).

**When to use:** When implementation is complete and tests pass and you need to decide how to integrate a finished branch or worktree.

**Key workflow:**
1. Verify all tests pass (auto-detect test command)
2. Determine base branch
3. Present 4 options: merge into the base checkout, create PR, keep as-is, discard
4. Look up the worktree path via `worktree list --json`
5. Cleanup worktree for Options 1 and 4 only (cd to base first)

**Artifacts:**
- Input: completed branch or worktree with passing tests
- Output: merged code/epic, PR, preserved branch, or discarded work

**Related:** executing --> **arc-finishing** --> done

---

### Orchestration Skills

---


**Purpose:** Discipline for work that can run in parallel — proving the pieces
are independent, isolating each writer in its own worktree, writing a brief a
fresh agent can run on, and accepting what comes back on evidence rather than on
the report.

**When to use:** When several pieces of work could run at once, when work needs
an isolated workspace, when writing a dispatch brief, or when dispatched work
reports back and has to be accepted.

**Key workflow:**
1. Prove the pieces are independent — no shared dependency, no shared file, each readable alone
2. `arcforge worktree add <name> --json` per writer; read the `path` field, never construct it
3. Write the dispatch card — absolute paths, verbatim acceptance criteria, return format, authority to finish
4. Accept on evidence: a fresh-context compliance check plus a fresh-context test run, never the author's own report
5. Merge accepted pieces one at a time onto a branch, checks after each; the branch is the deliverable

**Substrate:** subagents for pieces you drive yourself; agent teammates when you
stay present to answer questions (cap 5); an unattended loop when you are leaving.
The line between the last two is attendance, not risk.

**Artifacts:**
- Input: the set of work units and their acceptance criteria
- Output: one worktree per writer (`kind: generic`), one branch carrying the accepted pieces, per-piece acceptance evidence
- Progressive-loading references: `dispatch-card.md`, `acceptance.md`

**Related:** the task list --> **dispatching** --> `/finishing`

---

### looping

_(user-invoked — run `/looping`; the model never loads it on its own.)_

**Platform:** Claude Code only — spawns fresh sessions via `claude -p` subprocess. Other platforms have no equivalent invocation mechanism (yet).

**Purpose:** Work a markdown checkbox task list unattended — one task per iteration, each in a fresh session, with the list and git carrying every bit of state between them.

**When to use:** When you are handing a verified task list to a loop and walking away. For a present lead monitoring epic teammates, use arc-dispatching-teammates.

**Key workflow:**
1. Verify the task list parses, every task carries a `verify:` line (or the run supplies `--verify-cmd`), and the suite is green now
2. Set both ceilings: `--max-runs` and `--max-cost`
3. Pre-authorize and detach: `arcforge loop --tasks tasks.md --max-runs 20 --max-cost 15 --permission-mode acceptEdits --allowed-tools "Bash,Edit,Write,Read"`
4. Each iteration: read the list, spawn a fresh session, run the acceptance floor, mark the task done or blocked
5. Stop on: all complete, max-runs hit, cost limit, stall detected, retry storm, or a task failing after its retry

**Artifacts:**
- Input: a markdown checkbox task list (`--tasks`, required — the loop's only task source)
- Output: `.arcforge-loop.json` (loop state tracking), committed code per completed task

**Related:** a task list --> **looping** --> `/code-review` --> `/finishing`

---

### Discipline Skills

---

### tdd

**Purpose:** Enforce test-driven development: write the test first, watch it fail, write minimal code to pass.

**When to use:** When about to write any feature or bugfix code — before the implementation, write the failing test first.

**Key workflow:**
1. Find similar implementations first (reference before building)
2. RED — write one minimal failing test showing desired behavior
3. Verify RED — watch it fail for the expected reason
4. GREEN — write simplest code to pass the test
5. Verify GREEN — all tests pass, output pristine
6. REFACTOR — clean up while keeping tests green

**Artifacts:**
- Input: feature spec or bug report
- Output: test file + implementation, both committed

**Related:** executing --> **tdd** (during execution) --> arc-verifying

---

### arc-debugging

**Purpose:** Systematic root cause investigation using a four-phase scientific method.

**When to use:** When hitting any bug, test failure, or unexpected behavior, before proposing a fix.

**Key workflow:**
1. Phase 1: Root Cause Investigation — read errors, reproduce, check recent changes, trace data flow
2. Phase 2: Pattern Analysis — find working examples, compare differences
3. Phase 3: Hypothesis and Testing — form single hypothesis, test minimally, one variable at a time
4. Phase 4: Implementation — create failing test, implement single fix, verify
5. If 3+ fixes fail: STOP and question the architecture

**Artifacts:**
- Input: bug report, test failure, or unexpected behavior
- Output: root cause identified, failing test, verified fix

**Related:** any failure --> **arc-debugging** --> tdd --> arc-verifying

---

### arc-verifying

**Purpose:** Evidence-first verification mindset — no completion claims without fresh verification evidence.

**When to use:** When about to make a completion claim ('done', 'fixed', 'passing') — gather fresh evidence first.

**Key workflow:**
1. IDENTIFY — what command proves this claim?
2. RUN — execute the full command fresh
3. READ — full output, check exit code, count failures
4. VERIFY — does output confirm the claim?
5. ONLY THEN — make the claim with evidence

**Artifacts:**
- Input: any completion claim
- Output: verified status with evidence (test output, build output, etc.)

**Related:** embedded in all skills as a mindset, especially arc-finishing, tdd

---

### arc-reviewing

**Purpose:** Request code review with faithful context, then process the feedback with technical rigor — one request→receive loop.

**When to use:** When a task or feature is complete and needs code review, and when processing the reviewer feedback that returns.

**Key workflow:**
1. Get git SHAs (base and head)
2. Dispatch code-reviewer subagent with filled template placeholders
3. Read feedback completely, restate each item, verify against codebase reality
4. Respond with technical acknowledgment or reasoned pushback — not performative agreement
5. Act on feedback: fix Critical immediately, Important before proceeding, note Minor

**Artifacts:**
- Input: completed task with commits, review feedback
- Output: verified fixes or reasoned pushback

**Related:** executing --> **arc-reviewing** --> continue or arc-verifying

---

### Memory Skills

---

### learning

**Platform:** Claude Code only — reads Claude Code tool-call observations from `~/.arcforge/observations/`, populated by Claude Code PostToolUse hooks.

**Purpose:** The whole opt-in learning loop in one user-invoked skill: capture a session diary, extract recurring patterns from accumulated diaries, save a single insight as an instinct by hand, and review what the subsystem proposes to activate.

**When to use:** User-invoked only (`disable-model-invocation`). The user types `/learning`; hooks nudge them toward it when a diary draft or a reflection is pending.

**Key workflow:**
1. Diary — noise-gate the session, finalize an existing draft rather than writing a duplicate, otherwise reconstruct from memory and save after the user agrees
2. Reflection — `arcforge learn reflect scan`, read the listed diaries, separate patterns (3+ citing diaries) from observations, record the result so the same diaries are not re-analyzed
3. Manual instinct — infer the fields, check for a duplicate, preview, save
4. Lifecycle review — `arcforge learn status` / `enable --project` / `dashboard`; nothing changes behavior until someone activates it

**Artifacts:**
- Diaries: `~/.arcforge/diaries/{project}/{YYYY-MM-DD}/diary-{sessionId}.md`
- Reflections: `~/.arcforge/diaryed/{project}/`, instinct files under `~/.arcforge/instincts/{project}/`
- Candidate lifecycle: `~/.arcforge/observations/{project}/observations.jsonl` → `~/.arcforge/learning/candidates/queue.jsonl` → `~/.arcforge/learning/drafts/` → `~/.arcforge/instincts/<scope>/`

**Related:** background daemon --> **learning** (capture → dashboard review → activation)

> The pre-pivot `arcforge learn analyze` statistical clustering (Jaccard, confidence thresholds) was retired in v3.1 — see [learning-dashboard.md](learning-dashboard.md).

---

### arc-managing-sessions

**Platform:** Claude Code only — uses Claude Code's session IDs, transcript format, and the `~/.arcforge/sessions/` directory layout.

**Purpose:** Lightweight, user-controlled session continuity. Default = handover, not archive — most handoffs need only a short handover (quick bullet list, full context summary, or a tail marker); reach for a durable archive snapshot only when the session holds decisions or patterns worth preserving weeks or months later.

**When to use:** When ending a session and handing off, summarizing recent context to continue, or archiving, resuming, or aliasing a saved session.

**Key workflow:**
1. **Handover (default):** Pick the lightest mode that unblocks the next session — Quick Handover (5–10 line bullets, no file by default), Full Context Summary (longer, for cross-agent/cross-person handoff), or Tail Handover (last exchanges + immediate next step only).
2. **Archive (advanced, opt-in):** Only when the archive-recommendation heuristics say the work is worth preserving — `save [alias]` reflects on the conversation and writes an enriched durable file; `resume [alias]` resolves the alias, reads the file, presents a structured briefing, and WAITs for user confirmation; `list` browses history (`--limit`, `--date`, `--query`); `alias` creates friendly names.

**Artifacts:**
- Input: current session data from `~/.arcforge/sessions/{project}/{date}/{sessionId}.json`
- Output: handovers print inline by default (optional `handover-{slug}.md` if asked); archive snapshots write `~/.arcforge/sessions/{project}/{date}/session-{alias}.md`, `aliases.json`

**Related:** any skill --> **arc-managing-sessions** (when continuity is needed)

---

### arc-compacting

**Purpose:** Guide compaction decisions at logical workflow boundaries instead of letting auto-compaction fire mid-task.

**When to use:** When deciding whether to compact now — at clean seams between workflow phases rather than mid-task; the compact-suggester hook may route here as context grows.

**Key workflow:**
1. Check phase transition — compact between phases (when state is persisted to files), not during
2. Pre-compact: save decisions to files/memory; a substantial session leaves a diary draft for `/learning` to finalize
3. Check for un-committed work — ensure valuable changes are committed
4. Compact with focused seed text: `/compact Focus on implementing [next task]`
5. Post-compact: run `arcforge reboot`, re-read needed files

**Artifacts:**
- Input: session context, rule files, memory files
- Output: compacted context focused on next phase

**Related:** compact-suggester hook --> **arc-compacting** --> executing

---

### Knowledge Skills

---

### maintaining-obsidian

**Platform:** All platforms. Requires an Obsidian vault; `obsidian-cli` is preferred for vault operations but the skill falls back to direct file writes when the CLI is unavailable.

**Purpose:** Vault interface — resolves which registered Obsidian vault to operate on (via `--vault=<name>`, the vault Obsidian currently has open, a session-sticky choice, or the registry default), then dispatches one of three universal actions (ingest, query, audit) against that vault's paired contract (`AGENTS.md` runtime contract + `SCHEMA.md` domain schema). Vaults are domain-agnostic; `init-vault` bootstraps a new vault from a preset (minimal, llm-wiki, news, project-tracker).

**When to use:** When saving notes/ideas/URLs, querying vault knowledge, auditing vault health, or initializing/registering a vault. Not for diagrams — use `/diagramming-obsidian`.

**Key workflow:**
- **Registry-level** (vault-agnostic): `init-vault <path> --name <name> [--preset=<minimal|llm-wiki|news|project-tracker>]` runs an 11-step bootstrap that authors `AGENTS.md` + `SCHEMA.md` from the chosen preset and registers the vault; `register` / `unregister` / `set-default` / `list-vaults` manage the vault registry through `arcforge obsidian`.
- **Ingest** pipeline: `Classify → Confirm → Create → Visuals → Index → Propagate → Log` — page types are declared per-vault in that vault's `SCHEMA.md` (the llm-wiki preset ships Source, Entity, Synthesis, MOC, Decision, Log + a Paper variant; news/project-tracker declare their own domain-specific types). Raw-first-then-wiki rule preserves re-extraction ability.
- **Query** pipeline: `Orient → Search → Read → Synthesize → (File Back)` — vault-only answers (no general-knowledge backfill), inline citations, optional file-back as a new synthesis note.
- **Audit** pipeline: `LINK → LINT → GROW` — resolve plain-text mentions into wikilinks, schema/orphan/stale checks with `index.md` rebuild, gap analysis with internal and external suggestions.

**Artifacts:**
- Input: URLs, files, text descriptions, natural-language queries
- Output: typed notes per the vault's `SCHEMA.md`; language format (e.g. bilingual `[!multi-lang-{code}]` callouts under the llm-wiki/minimal presets, vs single-language body text under news/project-tracker) is declared in that vault's `AGENTS.md` Language Policy; audit reports under `_audits/audit-YYYY-MM-DD-<scope>.md`, rolling `index.md` and `log.md`

**Related:** user input --> **maintaining-obsidian** (three modes) --> vault state updated. Delegates Excalidraw creation to **diagramming-obsidian** via the Visuals decision tree.

---

### diagramming-obsidian

**Platform:** All platforms. Requires an Obsidian vault with the Excalidraw community plugin installed.

**Purpose:** Create Excalidraw diagrams directly in an Obsidian vault via structured JSON write with a render-validate loop, applying a cool minimal color palette for visual consistency.

**When to use:** When the user wants an Excalidraw diagram or visual — architecture, flowchart, mind map, casual "draw this". Also when `/maintaining-obsidian` delegates Synthesis visuals.

**Key workflow:**
1. Identify target concept and relationships (nodes + edges)
2. Draft Excalidraw JSON with positions, groups, and color palette
3. Write the `.excalidraw.md` file into the vault's Excalidraw folder
4. Render-validate loop: open in Obsidian, verify layout, iterate on positioning
5. Return the vault path for embedding in a Source note

**Artifacts:**
- Input: concept description, existing vault note to visualize, or relationship graph
- Output: `.excalidraw.md` file in the vault's Excalidraw folder, ready for embedding via `![[filename]]`

**Related:** `/maintaining-obsidian` (Visuals step, Q4 spatial complexity) --> **diagramming-obsidian** --> diagram embedded in the originating note

---

### Meta Skills

---

### using

**Purpose:** Bounded router and skill index for ArcForge tasks — helps choose the smallest useful workflow without becoming a global policy layer.

**When to use:** When unsure which skill applies or the user asks where to start. A bounded router and index — skip it for simple answers, read-only inspection, grading, or isolated evals.

**Key workflow:**
1. Understand the user request and constraints
2. Decide whether routing adds value; skip routing for simple answers, read-only inspection, grading, or isolated evals
3. If useful, pick the smallest applicable skill or workflow path
4. Read/invoke only the relevant skill(s)
5. Preserve harness/eval isolation and higher-priority instructions

**Artifacts:**
- Input: user request that benefits from routing
- Output: selected skill(s) or direct continuation when routing is unnecessary

**Related:** optional session bootstrap --> **using** --> any applicable skill, or direct task execution

---

### writing-skills

**Purpose:** Meta skill for authoring arcforge skills — invocation choice, description register, information hierarchy, and the evidence a skill needs before it ships.

**When to use:** When creating or revising an arcforge skill. User-invoked only (disable-model-invocation); maintainer-facing, not a user-facing product skill.

**Key workflow:**
1. Run the no-guidance control; no observed failure means no guidance to write
2. Classify the failure and match the guidance form to it
3. Micro-test the wording, then pressure-test the skill
4. Validate structure (frontmatter schema, description register, line budget)
5. Add the skill's row to the router in the same change

**Artifacts:**
- Input: a baseline run showing what the agent does without the skill
- Output: `skills/<skill-name>/SKILL.md` plus its references

**Related:** ArcForge maintainer task --> **writing-skills** --> deployed ArcForge skill

---

### evaluating

**Platform:** Claude Code only — eval harness invokes `claude` subprocess to execute scenario trials.

**Purpose:** Measure whether skills, agents, and workflows actually change AI agent behavior — unit tests for AI agent behavior.

**When to use:** When shipping a new skill, after modifying an existing one, or comparing alternative approaches — measure whether behavior actually changes.

**Key workflow:**
1. Confirm eval scope with user: skill (behavior change), agent (task outcome), or workflow (toolkit effect)
2. Define the question first: "What are you trying to learn?"
3. Design scenario with assertions and grader type (code, model, or human)
4. Run scenario validity preflight (expected baseline failure, ceiling/floor risk, answer leakage)
5. Run eval trials (`arc eval run` or `arc eval ab` for A/B comparison)
6. Grade results, track in JSONL, report verdict: SHIP / NEEDS WORK / BLOCKED

**Artifacts:**
- Input: scenario files in `evals/scenarios/`
- Output: benchmark results in `evals/benchmarks/latest.json`, eval reports

**Related:** brainstorming --> **evaluating** --> writing-skills (for shipping)

---

## Workflow Patterns

### 1. Small Feature

```
using --> executing --> /finishing
                                        |
                                   (if bugs) --> debugging --> tdd
```

Best for single features with clear requirements. Use executing to write the list, run it with checkpoints, and finish when done.

### 2. Large Epic

```
brainstorming --> executing --> dispatching
     |               (write the list)              |
     v
```

Full workflow for complex projects. Explore design, break it into tasks, isolate in worktrees, dispatch parallel work, implement with subagents.

### 3. Bug Fix

```
debugging --> tdd --> /code-review --> /finishing
     |                            |
     v                            v
  root cause              evidence collected
  identified              before claiming done
```

Systematic debugging first (no guessing), TDD to fix (failing test proves the bug), verify with evidence before finishing.

### 4. Learning Loop

```
learning: diary --> reflection --> instinct --> activation
   |            |             |            |
   v            v             v            v
 diary entry  patterns    instinct saved  injected at SessionStart
```

Capture session insights in diaries, extract patterns after 5+ entries, and cluster related instincts. ArcForge maintainers may separately use `/writing-skills` when a proven pattern should become an ArcForge skill.

---

## Comparison Tables

### executing: attended vs unattended

Both modes live in one skill; the switch is chosen with the user before the
first task.

| | Attended | Unattended |
|---|---|---|
| **Who runs tasks** | you, in this session | subagents, or a loop with nobody watching |
| **Between tasks** | report and wait | continue on the file's evidence alone |
| **Best for** | judgment calls, shifting design, wide blast radius | mechanical, well-scoped, independently verifiable tasks |
| **Risk** | slower (human bottleneck) | spends tokens and commits unobserved |

### brainstorming vs executing

| | brainstorming | executing |
|---|---|---|
| **Input** | Rough idea | Settled design |
| **Output** | A design narrative | A checkbox task list, then the work |
| **Mode** | Exploratory, one question at a time | Prescriptive, verify-driven |
| **Requires** | Nothing | A goal that is no longer in question |

---

## Operating Principles

These principles keep ArcForge disciplined without making every task follow the same workflow:

1. **Smallest Useful Workflow** — use direct answers for simple/read-only tasks; route only when a skill adds leverage
2. **Explore Before Committing to Design** — brainstorming: research existing patterns before proposing new
3. **No Guidance Without an Observed Failure** — writing-skills: a no-guidance control comes before any behavior-shaping text
4. **No Fix Without Hypothesis** — arc-debugging: Observe, Hypothesize, Test, Fix cycle
5. **No Completion Claim Without Evidence** — arc-verifying: evidence-first verification
6. **Verify Before Implementing Review Feedback** — arc-reviewing: technical rigor, not performative agreement
7. **File Artifacts = Truth** — Don't rely on session memory; resume from file artifacts
