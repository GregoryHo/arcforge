# arcforge Skills Reference

This is the offline reference for all 24 arcforge skills. In a live session, **`arc-using` is the canonical router** — invoke it when you want arcforge to map your situation to a skill; use this document when you want to read about skills in depth.

## Table of Contents

- [Quick Start](#quick-start)
- [Skill Categories](#skill-categories)
- [Complete Skill Catalog](#complete-skill-catalog)
  - SDD: [arc-brainstorming](#arc-brainstorming) · [arc-writing-tasks](#arc-writing-tasks) · [arc-executing-tasks](#arc-executing-tasks) · [arc-finishing](#arc-finishing)
  - Orchestration: [arc-agent-driven](#arc-agent-driven) · [arc-dispatching-parallel](#arc-dispatching-parallel) · [arc-dispatching-teammates](#arc-dispatching-teammates) · [arc-looping](#arc-looping) · [arc-using-worktrees](#arc-using-worktrees)
  - Discipline: [arc-tdd](#arc-tdd) · [arc-debugging](#arc-debugging) · [arc-verifying](#arc-verifying) · [arc-reviewing](#arc-reviewing)
  - Memory: [arc-journaling](#arc-journaling) · [arc-reflecting](#arc-reflecting) · [arc-learning](#arc-learning) · [arc-recalling](#arc-recalling) · [arc-managing-sessions](#arc-managing-sessions) · [arc-compacting](#arc-compacting)
  - Knowledge: [arc-maintaining-obsidian](#arc-maintaining-obsidian) · [arc-diagramming-obsidian](#arc-diagramming-obsidian)
  - Meta: [arc-using](#arc-using) · [arc-writing-skills](#arc-writing-skills) · [arc-evaluating](#arc-evaluating)
- [Workflow Patterns](#workflow-patterns)
- [Comparison Tables](#comparison-tables)
- [Operating Principles](#operating-principles)

## Quick Start

arcforge is a minimal, composable skill toolkit for Claude Code and Codex. Skills are structured workflow guides that add discipline when useful while preserving direct answers, read-only inspection, and harness/eval isolation when workflow would be overhead.

> **Platform support**: Core workflow, worktree, and quality skills work on both platforms. A handful of skills are currently Claude Code-only because they integrate with platform-specific features (session transcripts, subprocess spawning, tool-call logs, agent teammates). Look for **Platform:** markers in each skill's entry below. Today the Claude Code-only skills are: `arc-looping`, `arc-dispatching-teammates`, `arc-evaluating`, `arc-learning`, and `arc-managing-sessions`.

**Core skills every user should learn first:**

1. **arc-using** — Bounded router and skill index for ArcForge tasks
2. **arc-brainstorming** — Design exploration when intent is unclear
3. **arc-writing-tasks** — Break approved work into an executable task list
4. **arc-tdd** — Test-driven implementation discipline
5. **arc-debugging** — Systematic root cause investigation
6. **arc-verifying** — Fresh evidence before completion claims
7. **arc-evaluating** — Measure whether skills and workflows change behavior

**What are you trying to do?**

```
What are you trying to do?
|
+-- Build something new?
|   +-- Have a spec? --> arc-writing-tasks
|   +-- Need to explore? --> arc-brainstorming
|
+-- Fix a bug?
|   +-- arc-debugging --> arc-tdd --> arc-verifying
|
+-- Understand the system?
|   +-- arc-using (when routing help is useful)
|
+-- Improve workflow?
    +-- arc-journaling --> arc-reflecting
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
| **SDD** | arc-brainstorming, arc-writing-tasks, arc-executing-tasks, arc-finishing | Explore, specify, build, integrate |
| **Orchestration** | arc-agent-driven, arc-dispatching-parallel, arc-dispatching-teammates, arc-looping, arc-using-worktrees | Dispatch subagents; manage worktrees and loop state |
| **Discipline** | arc-tdd, arc-debugging, arc-verifying, arc-reviewing | Condition-triggered quality gates |
| **Memory** | arc-journaling, arc-reflecting, arc-learning, arc-recalling _(user-invoked)_, arc-managing-sessions, arc-compacting | Session continuity + learning (default-off module) |
| **Knowledge** | arc-maintaining-obsidian, arc-diagramming-obsidian | Ingest, query, audit, and visualize an Obsidian vault |
| **Meta** | arc-using, arc-writing-skills _(user-invoked)_, arc-evaluating | Route, evaluate, and maintain the catalog itself |

**How skills flow through a project:**

```
  PLANNING          EXECUTION         COORDINATION
  --------          ---------         ------------
  brainstorming --> writing-tasks --> executing-tasks --> finishing
                    |                 |
                    v                 v
                    agent-driven      dispatching-parallel
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

### arc-brainstorming

**Purpose:** Explore ideas before implementation through structured discovery and design.

**When to use:** When intent is vague, a new feature needs design, or an existing spec needs another iteration — the front door to the SDD pipeline.

**Key workflow:**
1. Phase 0 Scan and Route — list `specs/<spec-id>/` directories; user confirms new topic vs. iterating on existing spec-id
2. Understand context — check project state, ask questions one at a time
3. Explore approaches — propose 2-3 options with trade-offs, apply YAGNI
4. Present design — 200-300 word sections, confirm each with user
5. Write design doc to `docs/plans/<spec-id>/<YYYY-MM-DD>/design.md` (prose for new topic; Context + Change Intent for iteration). Design doc MUST NOT carry a pre-authored delta — refiner is the delta authority.
6. Route to next skill (refining → planning → coordinating)

**Artifacts:**
- Output: `docs/plans/<spec-id>/<YYYY-MM-DD>/design.md`
- Intermediate: `docs/research/<topic>.md` (2-Action Rule saves)

**Related:** nothing required --> **arc-brainstorming** --> arc-writing-tasks

---

### arc-writing-tasks

**Purpose:** Break features into bite-sized (2-5 minute) tasks with exact code and commands.

**When to use:** When a spec or feature is ready and you need concrete, executable implementation steps with exact code before coding.

**Key workflow:**
1. Read feature spec or design document
2. Identify files needed
3. Break into 2-5 minute tasks with exact code (not "add validation")
4. Add test commands with expected output per task
5. Output task list in TDD order (test first, then implementation)

**Artifacts:**
- Input: design doc, feature spec, or epic.md
- Output: `docs/tasks/<feature-name>-tasks.md`

**Related:** arc-brainstorming --> **arc-writing-tasks** --> arc-executing-tasks or arc-agent-driven

---

### arc-executing-tasks

**Purpose:** Human-in-the-loop task execution with batch checkpoints and verification.

**When to use:** When tasks are already broken down and you implement them in-session with human-in-the-loop checkpoints. For isolated subagent-per-task execution, use arc-agent-driven.

**Key workflow:**
1. Load and review task file from `docs/tasks/`
2. Execute in batches (default 3 tasks per batch)
3. Follow TDD steps exactly for each task
4. Present checkpoint report after each batch — wait for feedback
5. Continue or adjust based on feedback
6. Use arc-finishing when all tasks complete

**Artifacts:**
- Input: `docs/tasks/<name>-tasks.md`
- Output: committed code, checkpoint reports

**Related:** arc-writing-tasks --> **arc-executing-tasks** --> arc-finishing

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

**Related:** arc-executing-tasks / arc-agent-driven --> **arc-finishing** --> done

---

### Orchestration Skills

---

### arc-agent-driven

**Purpose:** Fully autonomous task execution with fresh subagent per task and a single task-reviewer returning both verdicts (spec compliance + task quality).

**When to use:** When tasks need isolated contexts (one fresh subagent + task-reviewer per task) to avoid cross-task pollution. For in-session human-checkpoint execution, use arc-executing-tasks.

**Key workflow:**
1. Read task list, create TodoWrite tracking
2. Per task: dispatch implementer subagent with full task text
3. Dispatch task-reviewer — returns both verdicts (spec compliance + task quality) in one pass
4. Max 3 review cycles per task — escalate to human if not converging
5. After all tasks: dispatch final code reviewer, then arc-finishing

**Artifacts:**
- Input: `docs/tasks/<name>-tasks.md`
- Output: committed code per task, review reports

**Related:** arc-writing-tasks --> **arc-agent-driven** --> arc-finishing

---

### arc-dispatching-parallel

**Purpose:** Dispatch multiple agents for independent tasks in parallel.

**When to use:** When fanning out multiple independent features to parallel subagents you drive yourself within one worktree. For epic-level teammates you monitor as a present lead, use arc-dispatching-teammates.

**Key workflow:**
1. Identify independent tasks (no shared dependencies or files)
2. Create focused prompts with specific scope and constraints
3. Dispatch agents in parallel via Task tool
4. Review and integrate — verify no conflicts, run full test suite
5. If conflicts found: tasks were not truly independent — resolve manually

**Artifacts:**
- Input: `specs/<spec-id>/dag.yaml` (DAG-based) or list of independent failures (without DAG)
- Output: parallel fixes integrated, test suite passing

**Related:** arc-writing-tasks --> **arc-dispatching-parallel** --> arc-finishing

---

### arc-dispatching-teammates

**Platform:** Claude Code only — requires the agent teammates feature (Claude Code 2.1.32+) and the Agent tool's `team_name`/`name` parameters. Other platforms have no equivalent multi-worker coordination substrate.

**Purpose:** Dispatch one Claude Code agent teammate per ready epic so the lead session stays in control while multiple epics progress in parallel. Fills the gap between single-epic interactive work and `arc-looping` (multi-epic unattended).

**When to use:** When 2+ epics are ready and you stay present to monitor a live team. For walk-away loops use arc-looping; for feature fan-out use arc-dispatching-parallel.

**Key workflow:**
1. Verify preconditions: 2+ ready epics, Agent tool supports `team_name`, lead in project root (not inside a worktree)
2. Cap team size at 5 — if more ready epics, queue the rest for continuous dispatch
3. `TeamCreate` before any Agent dispatch (passing `team_name` to Agent does NOT auto-create)
4. Per epic: `arcforge expand --epic <id>` → read canonical worktree path → spawn teammate with spawn prompt template (parallel dispatch, sequential retry on GH #40168 timing race)
5. Monitor via SendMessage — dispatch queued epics into freed slots as teammates complete (continuous, not waves)
6. **Acceptance check** per teammate completion: dispatch `arcforge:spec-reviewer` + `arcforge:verifier` subagents with fresh context. Both PASS = accept and shut down teammate; either FAIL = Step 7. Lead reads reports and decides — does NOT run checks inline
7. **Retry loop** on rejection: up to 3 retries per epic with cumulative feedback. Fresh worktree from dev HEAD (fix-forward), dispatch retry teammate. Spec-defect overrides (spec references wrong file/path) skip retry via override-accept protocol
8. **Wrap up** when all epics reach terminal state: emit Final Report with per-epic subagent evidence, cleanup accepted worktrees, shut down remaining teammates, `TeamDelete`

**Artifacts:**
- Input: `specs/<spec-id>/dag.yaml` (required), `skills/arc-dispatching-teammates/SKILL.md`
- Output: per-epic worktrees at `~/.arcforge/worktrees/...`, one agent teammate per ready epic, merged epics via each teammate's own finishing step, Final Report with subagent evidence
- Progressive-loading references: `acceptance-and-retry.md`, `spawn-prompt-template.md`, `tmux-timing-race.md`, `wrap-up-sequence.md`

**Related:** arc-writing-tasks → **arc-dispatching-teammates** → (per completion: two acceptance subagents); each teammate runs arc-agent-driven → arc-finishing on its own

---

### arc-looping

**Platform:** Claude Code only — spawns fresh sessions via `claude -p` subprocess. Other platforms have no equivalent invocation mechanism (yet).

**Purpose:** Run arcforge workflows autonomously across sessions — each iteration spawns a fresh Claude session while DAG and git persist state.

**When to use:** When walk-away unattended execution across sessions is needed with no human judgment per task. For a present lead monitoring epic teammates, use arc-dispatching-teammates.

**Key workflow:**
1. Verify the task list exists (from arc-writing-tasks) and baseline tests pass
2. Set bounds: `--max-runs` and optional `--max-cost`
3. Start loop: `node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" loop --tasks tasks.md --max-runs 20`
4. Each iteration: read the task list, spawn fresh Claude session, execute task, mark it done
6. Stop on: all complete, max-runs hit, cost limit, stall detected, or retry storm

**Artifacts:**
- Input: `specs/<spec-id>/dag.yaml` (required, must be committed)
- Output: `.arcforge-loop.json` (loop state tracking), committed code per completed task

**Related:** arc-writing-tasks --> **arc-looping** --> arc-finishing

---

### arc-using-worktrees

**Purpose:** Isolated git worktrees for **any** repo, in two tiers. A
**generic tier** (`arcforge worktree add|list|remove`) handles a parallel
branch, an experiment, or a review checkout in any project; a **composition
tier** hands single-epic work to the coordinator. Both derive the canonical
path at runtime — you never invent one.

**When to use:** When work needs an isolated workspace — a parallel branch, experiment, or review checkout — in any git repo, even if the user never says "worktree".

**Key workflow (top-down, first match wins):**
1. `.arcforge-epic` exists in cwd → already inside a marked worktree; never
   nest. Integration → arc-finishing.
2. Anything else (a branch, experiment, or review checkout) → generic tier:
   `arcforge worktree add <name>`, then read the absolute `path` from the
   JSON output and `cd` there.

**Artifacts:**
- Generic: a managed worktree at `~/.arcforge/worktrees/<project>-<hash>-<slug>/`
  with **no** marker (`kind: generic`)
- Epic (composition tier): worktree + `.arcforge-epic` marker authored by the
  coordinator, `dag.yaml` epic status updated

For the full derivation rules — including the generic null-spec path, kind
annotation, and the sync/merge invisibility guarantee — see
[`docs/guide/worktree-workflow.md`](worktree-workflow.md) and the Worktree
Rule in `skills/arc-using/SKILL.md`.

**Related:** arc-writing-tasks --> **arc-using-worktrees** --> arc-agent-driven or arc-executing-tasks

---

### Discipline Skills

---

### arc-tdd

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

**Related:** arc-writing-tasks --> **arc-tdd** (during execution) --> arc-verifying

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

**Related:** any failure --> **arc-debugging** --> arc-tdd --> arc-verifying

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

**Related:** embedded in all skills as a mindset, especially arc-finishing, arc-tdd

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

**Related:** arc-agent-driven --> **arc-reviewing** --> continue or arc-verifying

---

### Memory Skills

---

### arc-journaling

**Purpose:** Capture session reflections as structured diary entries for future pattern extraction.

**When to use:** When a significant work session ends, the user asks to journal, or the PreCompact hook fires before context is compacted.

**Key workflow:**
1. Pre-diary check — verify session had non-trivial decisions or challenges
2. Reflect on conversation from memory (do NOT read files)
3. Fill template: decisions, preferences, challenges, solutions
4. Save to `~/.arcforge/diaries/{project}/{date}/diary-{sessionId}.md`
5. Offer follow-up: "run `/arcforge:arc-reflecting` to extract patterns"

**Artifacts:**
- Output: `~/.arcforge/diaries/{project}/{YYYY-MM-DD}/diary-{sessionId}.md`

**Related:** **arc-journaling** --> arc-reflecting (after 5+ entries)

---

### arc-reflecting

**Purpose:** Analyze multiple diary entries to identify recurring patterns and save insights.

**When to use:** When 5+ diaries have accumulated, the user asks to summarize learnings from past sessions, or inject-context flags reflection is due.

**Key workflow:**
1. Smart filter selection (unprocessed, project_focused, or recent_window)
2. Read CLAUDE.md rules to detect violations
3. Read and analyze diary entries for patterns
4. Identify patterns (3+ occurrences) vs observations (1-2)
5. Save reflection + instincts, update processed.log

**Artifacts:**
- Input: `~/.arcforge/diaries/{project}/*/diary-*.md`
- Output: `~/.arcforge/diaryed/{project}/YYYY-MM-reflection-N.md`, instinct files

**Related:** arc-journaling (5+ entries) --> **arc-reflecting** --> arc-learning (dashboard review)

---

### arc-learning

**Platform:** Claude Code only — reads Claude Code tool-call observations from `~/.arcforge/observations/`, populated by Claude Code PostToolUse hooks.

**Purpose:** Turn repeated project observations into reviewable learning candidates and activated artifacts through the dashboard — the full observe → curate → review → activate lifecycle.

**When to use:** When the default-off learning module is enabled and observations should become reviewable candidates, inactive drafts, then activated instincts.

**Key workflow:**
1. Enable learning: `arcforge learn enable --project`
2. Capture: hooks record every tool call to observations.jsonl (skip filter honored); the background daemon assembles sanitized batches and an LLM curator proposes candidates
3. Open the dashboard: `arcforge learn dashboard` (port 3334)
4. Review queued candidates (`pending_review` → `approved` → `materialized` → `activated`)
5. Authorize through three gates: Approve → Materialize → Activate (no candidate changes behavior without explicit action)
6. Promote / Evolve / Deactivate as needed (Promote and Evolve mint new candidates; silent auto-promotion is not supported)

**Artifacts:**
- Input: `~/.arcforge/observations/{project}/observations.jsonl` → `~/.arcforge/learning/candidates/queue.jsonl` (Layer 5 candidate queue)
- Output: `~/.arcforge/learning/drafts/` (Layer 7 inactive drafts) → `~/.arcforge/instincts/<scope>/` (Layer 8 activation)

**Related:** background daemon --> **arc-learning** (capture → dashboard review → activation)

> The pre-pivot `arcforge learn analyze` statistical clustering (Jaccard, confidence thresholds) was retired in v3.1 — see [learning-dashboard.md](learning-dashboard.md).

---

### arc-recalling

**Purpose:** Manually save patterns and insights as instincts from the current session context.

**When to use:** When you want to manually save a pattern or insight from the current session as a reusable instinct. User-invoked only (disable-model-invocation).

**Key workflow:**
1. Receive user's natural language description
2. Infer structured fields: id, trigger, action, domain, evidence
3. Preview instinct for user confirmation
4. Check for duplicates
5. Save with source: manual, confidence: 0.50

**Artifacts:**
- Input: user-described pattern or insight
- Output: `~/.arcforge/instincts/{project}/<id>.md`

**Related:** user insight --> **arc-recalling** --> instinct saved for arc-learning lifecycle

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
2. Pre-compact: save decisions to files/memory, invoke `arc-journaling` if session was substantial
3. Check for un-committed work — ensure valuable changes are committed
4. Compact with focused seed text: `/compact Focus on implementing [next task]`
5. Post-compact: run `arcforge reboot`, re-read needed files

**Artifacts:**
- Input: session context, rule files, memory files
- Output: compacted context focused on next phase

**Related:** compact-suggester hook --> **arc-compacting** --> arc-agent-driven, arc-writing-tasks

---

### Knowledge Skills

---

### arc-maintaining-obsidian

**Platform:** All platforms. Requires an Obsidian vault; `obsidian-cli` is preferred for vault operations but the skill falls back to direct file writes when the CLI is unavailable.

**Purpose:** Vault interface — resolves which registered Obsidian vault to operate on (via `--vault=<name>`, cwd match, or the single-vault default), then dispatches one of three universal actions (ingest, query, audit) against that vault's paired contract (`AGENTS.md` runtime contract + `SCHEMA.md` domain schema). Vaults are domain-agnostic; `init-vault` bootstraps a new vault from a preset (minimal, llm-wiki, news, project-tracker).

**When to use:** When saving notes/ideas/URLs, querying vault knowledge, auditing vault health, or initializing/registering a vault. Not for diagrams — use arc-diagramming-obsidian.

**Key workflow:**
- **Registry-level** (vault-agnostic): `init-vault <path> --name <name> [--preset=<minimal|llm-wiki|news|project-tracker>]` runs an 11-step bootstrap that authors `AGENTS.md` + `SCHEMA.md` from the chosen preset and registers the vault; `register` / `unregister` / `set-default` / `list-vaults` manage `~/.arcforge/obsidian-vaults.json`.
- **Ingest** pipeline: `Classify → Confirm → Create → Visuals → Index → Propagate → Log` — page types are declared per-vault in that vault's `SCHEMA.md` (the llm-wiki preset ships Source, Entity, Synthesis, MOC, Decision, Log + a Paper variant; news/project-tracker declare their own domain-specific types). Raw-first-then-wiki rule preserves re-extraction ability.
- **Query** pipeline: `Orient → Search → Read → Synthesize → (File Back)` — vault-only answers (no general-knowledge backfill), inline citations, optional file-back as a new synthesis note.
- **Audit** pipeline: `LINK → LINT → GROW` — resolve plain-text mentions into wikilinks, schema/orphan/stale checks with `index.md` rebuild, gap analysis with internal and external suggestions.

**Artifacts:**
- Input: URLs, files, text descriptions, natural-language queries
- Output: typed notes per the vault's `SCHEMA.md`; language format (e.g. bilingual `[!multi-lang-{code}]` callouts under the llm-wiki/minimal presets, vs single-language body text under news/project-tracker) is declared in that vault's `AGENTS.md` Language Policy; audit reports under `_audits/audit-YYYY-MM-DD-<scope>.md`, rolling `index.md` and `log.md`

**Related:** user input --> **arc-maintaining-obsidian** (three modes) --> vault state updated. Delegates Excalidraw creation to **arc-diagramming-obsidian** via the Visuals decision tree.

---

### arc-diagramming-obsidian

**Platform:** All platforms. Requires an Obsidian vault with the Excalidraw community plugin installed.

**Purpose:** Create Excalidraw diagrams directly in an Obsidian vault via structured JSON write with a render-validate loop, applying a cool minimal color palette for visual consistency.

**When to use:** When the user wants an Excalidraw diagram or visual — architecture, flowchart, mind map, casual "draw this". Also when arc-maintaining-obsidian delegates Synthesis visuals.

**Key workflow:**
1. Identify target concept and relationships (nodes + edges)
2. Draft Excalidraw JSON with positions, groups, and color palette
3. Write the `.excalidraw.md` file into the vault's Excalidraw folder
4. Render-validate loop: open in Obsidian, verify layout, iterate on positioning
5. Return the vault path for embedding in a Source note

**Artifacts:**
- Input: concept description, existing vault note to visualize, or relationship graph
- Output: `.excalidraw.md` file in the vault's Excalidraw folder, ready for embedding via `![[filename]]`

**Related:** arc-maintaining-obsidian (Visuals step, Q4 spatial complexity) --> **arc-diagramming-obsidian** --> diagram embedded in the originating note

---

### Meta Skills

---

### arc-using

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

**Related:** optional session bootstrap --> **arc-using** --> any applicable skill, or direct task execution

---

### arc-writing-skills

**Purpose:** ArcForge project-level meta skill for maintaining ArcForge's own skill system using TDD for process documentation.

**When to use:** When maintaining ArcForge itself — creating, editing, or verifying ArcForge skills and skill tests before deployment. User-invoked only (disable-model-invocation); project-level meta, not a user-facing product skill.

**Key workflow:**
1. RED — run pressure scenario WITHOUT skill, document baseline failures
2. GREEN — write minimal SKILL.md addressing specific rationalizations found
3. REFACTOR — find new loopholes, add counters, re-test until the skill behavior is covered
4. Validate: frontmatter (name + description only, max 1024 chars, "Use when...")
5. Run pytest validation and commit skill changes

**Artifacts:**
- Input: baseline test results showing agent failures
- Output: `skills/<skill-name>/SKILL.md`, pytest test file

**Related:** ArcForge maintainer task --> **arc-writing-skills** --> deployed ArcForge skill

---

### arc-evaluating

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

**Related:** arc-brainstorming --> **arc-evaluating** --> arc-writing-skills (for shipping)

---

## Workflow Patterns

### 1. Small Feature

```
arc-using --> arc-writing-tasks --> arc-executing-tasks --> arc-finishing
                                        |
                                   (if bugs) --> arc-debugging --> arc-tdd
```

Best for single features with clear requirements. Use arc-writing-tasks to break down, execute with human checkpoints, finish when done.

### 2. Large Epic

```
arc-brainstorming --> arc-writing-tasks --> arc-using-worktrees
     |                                            |
     v                                            v
  design.md                          arc-dispatching-teammates
                                                  |
                                                  v
                                          arc-agent-driven
                                                  |
                                                  v
                                            arc-finishing
```

Full workflow for complex projects. Explore design, break it into tasks, isolate in worktrees, dispatch parallel work, implement with subagents.

### 3. Bug Fix

```
arc-debugging --> arc-tdd --> arc-verifying --> arc-finishing
     |                            |
     v                            v
  root cause              evidence collected
  identified              before claiming done
```

Systematic debugging first (no guessing), TDD to fix (failing test proves the bug), verify with evidence before finishing.

### 4. Learning Loop

```
arc-journaling --> arc-reflecting --> arc-learning
     |                  |                 |
     v                  v                 v
  diary entry      patterns found    instincts clustered
```

Capture session insights in diaries, extract patterns after 5+ entries, and cluster related instincts. ArcForge maintainers may separately use `arc-writing-skills` when a proven pattern should become an ArcForge skill.

---

## Comparison Tables

### arc-executing-tasks vs arc-agent-driven

| | arc-executing-tasks | arc-agent-driven |
|---|---|---|
| **Model** | Human-in-the-loop batches | Fully autonomous subagents |
| **Review** | Human reviews each batch | Single task-reviewer (spec + quality) |
| **Best for** | Tasks needing judgment | Mechanical tasks with clear specs |
| **Risk** | Slower (human bottleneck) | May diverge without oversight |

### arc-brainstorming vs arc-writing-tasks

| | arc-brainstorming | arc-writing-tasks |
|---|---|---|
| **Input** | Rough idea | Approved design/spec |
| **Output** | design.md | tasks.md with exact code |
| **Mode** | Exploratory, Socratic | Prescriptive, detailed |
| **Requires** | Nothing | Design document |

---

## Operating Principles

These principles keep ArcForge disciplined without making every task follow the same workflow:

1. **Smallest Useful Workflow** — use direct answers for simple/read-only tasks; route only when a skill adds leverage
2. **Explore Before Committing to Design** — arc-brainstorming: research existing patterns before proposing new
3. **No ArcForge Skill Without Failing Test** — arc-writing-skills: project-level TDD for ArcForge skill documentation
4. **No Fix Without Hypothesis** — arc-debugging: Observe, Hypothesize, Test, Fix cycle
5. **No Completion Claim Without Evidence** — arc-verifying: evidence-first verification
6. **Verify Before Implementing Review Feedback** — arc-reviewing: technical rigor, not performative agreement
7. **File Artifacts = Truth** — Don't rely on session memory; resume from file artifacts
