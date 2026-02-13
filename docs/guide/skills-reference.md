# arcforge Skills Reference

## Quick Start

arcforge is a skill-based autonomous agent pipeline for Claude Code, Codex, Gemini CLI, and OpenCode. Skills are structured workflow guides that enforce discipline, prevent common mistakes, and ensure consistent quality across AI-assisted development sessions.

**Start here — the 5 skills every user should learn first:**

1. **arc-using** — Entry point for all tasks (routing discipline)
2. **arc-writing-tasks** — Break features into executable tasks
3. **arc-executing-tasks** — Run task lists with human checkpoints
4. **arc-debugging** — Systematic root cause investigation
5. **arc-journaling** — Capture session reflections

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
|   +-- arc-using (start here, always)
|
+-- Improve workflow?
    +-- arc-journaling --> arc-reflecting
```

---

## Skill Categories

arcforge's 24 skills are organized into 6 categories:

| Category | Skills | Purpose |
|----------|--------|---------|
| **Planning** | arc-brainstorming, arc-refining, arc-writing-tasks, arc-planning | Explore, specify, break down |
| **Execution** | arc-executing-tasks, arc-agent-driven, arc-implementing, arc-dispatching-parallel | Build and ship |
| **Coordination** | arc-using, arc-using-worktrees, arc-coordinating, arc-finishing, arc-finishing-epic | Route, isolate, integrate |
| **Quality** | arc-tdd, arc-debugging, arc-verifying, arc-requesting-review, arc-receiving-review | Test, debug, verify, review |
| **Learning** | arc-journaling, arc-reflecting, arc-learning, arc-observing, arc-recalling | Capture, extract, evolve |
| **Meta** | arc-writing-skills | Create and maintain skills |

**How skills flow through a project:**

```
  PLANNING          EXECUTION         COORDINATION
  --------          ---------         ------------
  brainstorming --> writing-tasks --> executing-tasks --> finishing
  refining -------> planning -------> implementing ----> finishing-epic
                    |                 |
                    v                 v
                    agent-driven      dispatching-parallel
                    |
                    +--- using-worktrees, coordinating

  QUALITY                   LEARNING              META
  -------                   --------              ----
  tdd (during execution)    journaling            writing-skills
  debugging (on failure)    reflecting
  verifying (before done)   learning
  requesting-review         observing
  receiving-review          recalling
```

---

## Complete Skill Catalog

### Planning Skills

---

### arc-brainstorming

**Purpose:** Explore ideas before implementation through structured discovery and design.

**When to use:** When exploring ideas before implementation or when user says "let's build X".

**Key workflow:**
1. Understand context — check project state, ask questions one at a time
2. Explore approaches — propose 2-3 options with trade-offs, apply YAGNI
3. Present design — 200-300 word sections, confirm each with user
4. Write design doc to `docs/plans/YYYY-MM-DD-<topic>-design.md`
5. Route to next skill (refining for complex, writing-tasks for simple)

**Artifacts:**
- Output: `docs/plans/YYYY-MM-DD-<topic>-design.md` (with REFINER_INPUT section)
- Intermediate: `docs/research/<topic>.md` (2-Action Rule saves)

**Related:** nothing required --> **arc-brainstorming** --> arc-refining (complex) or arc-writing-tasks (simple)

---

### arc-refining

**Purpose:** Transform design documents into structured XML specifications that serve as the single source of truth.

**When to use:** When converting design documents to structured specs, when spec quality is below threshold, or when requirements need formal acceptance criteria.

**Key workflow:**
1. Verify design doc has REFINER_INPUT section and functional requirements
2. Draft spec.xml from design document
3. Iterate with 2-3 clarifying questions per round until checklist complete
4. Self-validate (unique IDs, valid references, trace to source)
5. Commit specs to git

**Artifacts:**
- Input: `docs/plans/*-design.md` (from arc-brainstorming)
- Output: `specs/spec.xml`, `specs/details/*.xml`

**Related:** arc-brainstorming --> **arc-refining** --> arc-planning

---

### arc-writing-tasks

**Purpose:** Break features into bite-sized (2-5 minute) tasks with exact code and commands.

**When to use:** When breaking down features into executable tasks, when preparing for implementation, or when tasks need exact code and commands.

**Key workflow:**
1. Read feature spec or design document
2. Identify files needed
3. Break into 2-5 minute tasks with exact code (not "add validation")
4. Add test commands with expected output per task
5. Output task list in TDD order (test first, then implementation)

**Artifacts:**
- Input: design doc, feature spec, or epic.md
- Output: `docs/tasks/<feature-name>-tasks.md`

**Related:** arc-brainstorming or arc-refining --> **arc-writing-tasks** --> arc-executing-tasks or arc-agent-driven

---

### arc-planning

**Purpose:** Convert specs into an executable DAG with epic/feature breakdown and strict 1:1 traceability.

**When to use:** When breaking down specifications, when specs/spec.xml exists, or when planning epic and feature structure.

**Key workflow:**
1. Verify `specs/spec.xml` and `specs/details/` exist (else route to arc-refining)
2. Map details to epics (1:1), requirements to features (1:1 strict)
3. Auto-derive dependencies from spec references
4. Self-validate (no cycles, all references valid)
5. Commit `dag.yaml` and `epics/` to git

**Artifacts:**
- Input: `specs/spec.xml`, `specs/details/*.xml`
- Output: `dag.yaml`, `epics/<epic-name>/epic.md`, `epics/<epic-name>/features/*.md`

**Related:** arc-refining --> **arc-planning** --> arc-coordinating or arc-implementing

---

### Execution Skills

---

### arc-executing-tasks

**Purpose:** Human-in-the-loop task execution with batch checkpoints and verification.

**When to use:** When executing a prepared task list, when running batch implementation, or when tasks are already broken down.

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

**Related:** arc-writing-tasks --> **arc-executing-tasks** --> arc-finishing or arc-finishing-epic

---

### arc-agent-driven

**Purpose:** Fully autonomous task execution with fresh subagent per task and two-stage review.

**When to use:** When executing task lists where each task requires isolated execution.

**Key workflow:**
1. Read task list, create TodoWrite tracking
2. Per task: dispatch implementer subagent with full task text
3. Spec compliance review (dispatch reviewer subagent)
4. Code quality review (dispatch reviewer subagent)
5. Max 3 review cycles per reviewer — escalate to human if not converging
6. After all tasks: dispatch final code reviewer, then arc-finishing

**Artifacts:**
- Input: `docs/tasks/<name>-tasks.md`
- Output: committed code per task, review reports

**Related:** arc-writing-tasks --> **arc-agent-driven** --> arc-finishing or arc-finishing-epic

---

### arc-implementing

**Purpose:** Orchestrator for large projects — automatically expands epic to features to tasks to execution.

**When to use:** When orchestrating large project implementation in a worktree.

**Key workflow:**
1. Phase 0: Sync and check dependencies via arc-coordinating
2. Phase 1: Epic to features via arc-writing-tasks
3. Phase 2a: Feature to tasks via arc-writing-tasks (max 2 refinement cycles)
4. Phase 2b: Execute tasks via arc-agent-driven
5. Phase 3: Move to next feature or finish epic

**Artifacts:**
- Input: `dag.yaml`, `epic.md`, `features/*.md`
- Output: completed code via delegated skills

**Related:** arc-planning + arc-coordinating --> **arc-implementing** --> arc-finishing-epic

---

### arc-dispatching-parallel

**Purpose:** Dispatch multiple agents for independent tasks in parallel.

**When to use:** When dispatching multiple independent features within a worktree session.

**Key workflow:**
1. Identify independent tasks (no shared dependencies or files)
2. Create focused prompts with specific scope and constraints
3. Dispatch agents in parallel via Task tool
4. Review and integrate — verify no conflicts, run full test suite
5. If conflicts found: tasks were not truly independent — resolve manually

**Artifacts:**
- Input: `dag.yaml` (DAG-based) or list of independent failures (without DAG)
- Output: parallel fixes integrated, test suite passing

**Related:** arc-planning --> **arc-dispatching-parallel** --> arc-implementing

---

### Coordination Skills

---

### arc-using

**Purpose:** Entry point for all arcforge tasks — establishes routing discipline and checks the skill routing table before ANY action.

**When to use:** When starting any arcforge task — establishes routing discipline and checks routing table before ANY action.

**Key workflow:**
1. Receive user message
2. Check: might any skill apply? (even 1% chance = yes)
3. Invoke the relevant Skill tool
4. Follow the invoked skill exactly
5. If skill has a checklist, create TodoWrite per item

**Artifacts:**
- Input: user message
- Output: routes to appropriate skill

**Related:** always first --> **arc-using** --> any other skill

---

### arc-using-worktrees

**Purpose:** Create isolated git worktrees for epic development with proper metadata tracking.

**When to use:** When creating isolated workspace for epic development.

**Key workflow:**
1. Verify `.worktrees/` directory exists and is in `.gitignore`
2. Check if already in a worktree (if so, STOP)
3. Create worktree: `git worktree add .worktrees/<epic-name> -b <epic-name>`
4. Run project setup (auto-detect: npm install, pip install, etc.)
5. Create `.arcforge-epic` metadata file (REQUIRED, not `.epic`)
6. Run baseline tests to verify clean state

**Artifacts:**
- Output: `.worktrees/<epic-name>/` directory, `.arcforge-epic` marker file

**Related:** arc-planning --> **arc-using-worktrees** --> arc-implementing or arc-executing-tasks

---

### arc-coordinating

**Purpose:** CLI-based worktree lifecycle management and cross-session coordination via Node.js.

**When to use:** When managing worktrees for multi-epic projects, when dag.yaml exists, or when coordinating parallel development.

**Key workflow:**
1. Set SKILL_ROOT from skill loader header
2. Use `node "${SKILL_ROOT}/scripts/coordinator.js" <command>`
3. Commands: expand, merge, status, cleanup, sync, next, parallel, block, reboot

**Artifacts:**
- Input: `dag.yaml` (required, must be committed)
- Output: worktrees created/merged, DAG status updated

**Related:** arc-planning --> **arc-coordinating** --> arc-implementing

---

### arc-finishing

**Purpose:** Guide completion of development work on regular branches with structured options.

**When to use:** When implementation is complete on a regular branch (no .arcforge-epic file), all tests pass, and you need to decide how to integrate.

**Key workflow:**
1. Verify all tests pass (auto-detect test command)
2. Determine base branch
3. Present 4 options: merge locally, create PR, keep as-is, discard
4. Execute chosen option
5. Cleanup worktree for Options 1 and 4 only

**Artifacts:**
- Input: completed branch with passing tests
- Output: merged code, PR, preserved branch, or discarded work

**Related:** arc-executing-tasks or arc-agent-driven --> **arc-finishing** --> done

---

### arc-finishing-epic

**Purpose:** Guide completion of epic work in worktrees with coordinator integration and DAG updates.

**When to use:** When epic implementation in a worktree is complete (.arcforge-epic file exists), all tests pass, and you need to decide how to integrate.

**Key workflow:**
1. Verify `.arcforge-epic` exists and read epic context
2. Sync from base branch via finish-epic.js
3. Verify all tests pass
4. Present 4 options: merge (via coordinator), create PR, keep as-is, discard
5. Sync DAG after Option 2 (PR) — other options handle DAG updates internally

**Artifacts:**
- Input: completed epic worktree with `.arcforge-epic` and passing tests
- Output: merged epic, PR, preserved branch, or discarded work + DAG updated

**Related:** arc-implementing --> **arc-finishing-epic** --> arc-coordinating status

---

### Quality Skills

---

### arc-tdd

**Purpose:** Enforce test-driven development: write the test first, watch it fail, write minimal code to pass.

**When to use:** When implementing any feature or bugfix, before writing implementation code.

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

**When to use:** When encountering any bug, test failure, or unexpected behavior, before proposing fixes.

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

**When to use:** When you need to verify work is complete before making completion claims.

**Key workflow:**
1. IDENTIFY — what command proves this claim?
2. RUN — execute the full command fresh
3. READ — full output, check exit code, count failures
4. VERIFY — does output confirm the claim?
5. ONLY THEN — make the claim with evidence

**Artifacts:**
- Input: any completion claim
- Output: verified status with evidence (test output, build output, etc.)

**Related:** embedded in all skills as a mindset, especially arc-finishing, arc-finishing-epic, arc-tdd

---

### arc-requesting-review

**Purpose:** Structured code review requests with proper context for reviewer subagents.

**When to use:** When completing tasks or features to request code review.

**Key workflow:**
1. Get git SHAs (base and head)
2. Dispatch code-reviewer subagent with filled template placeholders
3. Act on feedback: fix Critical immediately, Important before proceeding, note Minor

**Artifacts:**
- Input: completed task with commits
- Output: review feedback, fixes applied

**Related:** arc-agent-driven --> **arc-requesting-review** --> arc-receiving-review

---

### arc-receiving-review

**Purpose:** Handle code review feedback with technical rigor, not performative agreement.

**When to use:** When receiving code review feedback, requires technical rigor not performative agreement.

**Key workflow:**
1. READ — complete feedback without reacting
2. UNDERSTAND — restate requirement in own words
3. VERIFY — check against codebase reality
4. EVALUATE — technically sound for THIS codebase?
5. RESPOND — technical acknowledgment or reasoned pushback
6. IMPLEMENT — one item at a time, test each

**Artifacts:**
- Input: review feedback
- Output: verified fixes or reasoned pushback

**Related:** arc-requesting-review --> **arc-receiving-review** --> continue or arc-verifying

---

### Learning Skills

---

### arc-journaling

**Purpose:** Capture session reflections as structured diary entries for future pattern extraction.

**When to use:** When user explicitly requests /diary, when PreCompact hook triggers, or at end of significant work session.

**Key workflow:**
1. Pre-diary check — verify session had non-trivial decisions or challenges
2. Reflect on conversation from memory (do NOT read files)
3. Fill template: decisions, preferences, challenges, solutions
4. Save to `~/.claude/sessions/{project}/{date}/diary-{sessionId}.md`
5. Offer follow-up: "run `/reflect` to extract patterns"

**Artifacts:**
- Output: `~/.claude/sessions/{project}/{YYYY-MM-DD}/diary-{sessionId}.md`

**Related:** **arc-journaling** --> arc-reflecting (after 5+ entries)

---

### arc-reflecting

**Purpose:** Analyze multiple diary entries to identify recurring patterns and save insights.

**When to use:** When user requests /reflect, after 5+ diary entries accumulated, or when asked to summarize preferences from past sessions.

**Key workflow:**
1. Smart filter selection (unprocessed, project_focused, or recent_window)
2. Read CLAUDE.md rules to detect violations
3. Read and analyze diary entries for patterns
4. Identify patterns (3+ occurrences) vs observations (1-2)
5. Save reflection + instincts, update processed.log

**Artifacts:**
- Input: `~/.claude/sessions/{project}/*/diary-*.md`
- Output: `~/.claude/diaryed/{project}/YYYY-MM-reflection-N.md`, instinct files

**Related:** arc-journaling (5+ entries) --> **arc-reflecting** --> arc-learning (instinct clustering)

---

### arc-learning

**Purpose:** Cluster related instincts into higher-level abstractions: skills, commands, or agents.

**When to use:** When you have accumulated instincts and want to cluster related ones into higher-level skills, commands, or agents.

**Key workflow:**
1. Scan all instincts from `~/.claude/instincts/{project}/` and `global/`
2. Cluster by domain, then by trigger fingerprint similarity (Jaccard >= 0.6)
3. Filter: only clusters with 3+ instincts, at least 1 with confidence >= 0.6
4. Preview candidate clusters for user review
5. Generate: user decides what to create (skill, command, or agent)

**Artifacts:**
- Input: `~/.claude/instincts/{project}/` and `global/` instinct files
- Output: new skill, command, or agent definition

**Related:** arc-reflecting --> **arc-learning** --> arc-writing-skills

---

### arc-observing

**Purpose:** Manage automatically detected behavioral patterns (instincts) from tool usage observations.

**When to use:** When user asks about behavioral patterns, requests instinct status, or wants to confirm/contradict a detected pattern.

**Key workflow:**
1. Capture: hooks record every tool call to observations.jsonl
2. Analysis: background daemon detects patterns (10+ observations required)
3. Creation: instincts saved as `.md` files with YAML frontmatter
4. Lifecycle: confirm (+0.05) / contradict (-0.10) / decay (-0.02/week)
5. Loading: instincts with confidence >= 0.7 auto-loaded into context

**Artifacts:**
- Input: `~/.claude/observations/{project}/observations.jsonl`
- Output: `~/.claude/instincts/{project}/*.md`

**Related:** automatic background process --> **arc-observing** --> arc-learning

---

### arc-recalling

**Purpose:** Manually save patterns and insights as instincts from the current session context.

**When to use:** When the user wants to manually save a pattern or insight as an instinct. When the user says /recall followed by a description.

**Key workflow:**
1. Receive user's natural language description
2. Infer structured fields: id, trigger, action, domain, evidence
3. Preview instinct for user confirmation
4. Check for duplicates
5. Save with source: manual, confidence: 0.50

**Artifacts:**
- Input: user-described pattern or insight
- Output: `~/.claude/instincts/{project}/<id>.md`

**Related:** user insight --> **arc-recalling** --> instinct saved for arc-observing lifecycle

---

### Meta Skills

---

### arc-writing-skills

**Purpose:** TDD applied to process documentation — create, test, and deploy arcforge skills.

**When to use:** When creating new arcforge skills, editing existing skills, or verifying skills work before deployment.

**Key workflow:**
1. RED — run pressure scenario WITHOUT skill, document baseline failures
2. GREEN — write minimal SKILL.md addressing specific rationalizations found
3. REFACTOR — find new loopholes, add counters, re-test until bulletproof
4. Validate: frontmatter (name + description only, max 1024 chars, "Use when...")
5. Run pytest validation, commit skill

**Artifacts:**
- Input: baseline test results showing agent failures
- Output: `skills/<skill-name>/SKILL.md`, pytest test file

**Related:** arc-learning --> **arc-writing-skills** --> deployed skill

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
arc-brainstorming --> arc-refining --> arc-planning --> arc-using-worktrees
     |                                     |
     v                                     v
  design.md                            dag.yaml
                                           |
                                           v
                              arc-coordinating --> arc-implementing
                                   |                    |
                                   v                    v
                              arc-dispatching      arc-agent-driven
                              -parallel                 |
                                                        v
                                                  arc-finishing-epic
```

Full pipeline for complex projects. Explore design, refine to spec, plan DAG, isolate in worktrees, coordinate parallel epics, implement with subagents.

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
arc-journaling --> arc-reflecting --> arc-learning --> arc-writing-skills
     |                  |                 |                  |
     v                  v                 v                  v
  diary entry      patterns found    instincts         new skill created
                                     clustered
```

Capture session insights in diaries, extract patterns after 5+ entries, cluster related instincts, create new skills from proven patterns.

---

## Comparison Tables

### arc-executing-tasks vs arc-agent-driven

| | arc-executing-tasks | arc-agent-driven |
|---|---|---|
| **Model** | Human-in-the-loop batches | Fully autonomous subagents |
| **Review** | Human reviews each batch | Two-stage automated review |
| **Best for** | Tasks needing judgment | Mechanical tasks with clear specs |
| **Risk** | Slower (human bottleneck) | May diverge without oversight |

### arc-finishing vs arc-finishing-epic

| | arc-finishing | arc-finishing-epic |
|---|---|---|
| **Scope** | Regular branch | Worktree with `.arcforge-epic` |
| **DAG** | No DAG involvement | Updates dag.yaml status |
| **Cleanup** | Branch only | Worktree + branch |
| **Trigger** | No `.arcforge-epic` file | `.arcforge-epic` file exists |

### arc-brainstorming vs arc-writing-tasks

| | arc-brainstorming | arc-writing-tasks |
|---|---|---|
| **Input** | Rough idea | Approved design/spec |
| **Output** | design.md | tasks.md with exact code |
| **Mode** | Exploratory, Socratic | Prescriptive, detailed |
| **Requires** | Nothing | Design document |

---

## Iron Laws

These 7 rules are non-negotiable across all arcforge workflows:

1. **No Action Without Skill Check** — arc-using must be invoked first, even if 1% chance a skill applies
2. **No Design Without Exploration** — arc-brainstorming: research existing patterns before proposing new
3. **No Skill Without Failing Test** — arc-writing-skills: TDD for documentation
4. **No Fix Without Hypothesis** — arc-debugging: Observe, Hypothesize, Test, Fix cycle
5. **No Completion Claim Without Evidence** — arc-verifying: evidence-first verification
6. **Verify Before Implementing Review Feedback** — arc-receiving-review: technical rigor, not performative agreement
7. **File Artifacts = Truth** — Don't rely on session memory; resume from file artifacts
