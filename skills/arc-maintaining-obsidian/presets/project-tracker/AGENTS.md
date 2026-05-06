---
type: agents-contract
created: <YYYY-MM-DD>
scope: <Vault Scope>
preset: project-tracker
schema_path: SCHEMA.md
raw_source: not-adopted
---

# <Vault Name> — Agent Runtime Contract (Project Tracker)

A project-tracking vault: agents help maintain Tasks, Milestones,
Decisions, and Sprints. Unlike knowledge-base presets, this vault does
NOT adopt the Raw Source pattern — work items are authored directly,
not derived from external sources. AGENTS.md governs runtime behavior;
types live in `SCHEMA.md`.

## Schema Authority

- `schema_path: SCHEMA.md` — load it after this file at Domain Contract Orientation.
- **Read SCHEMA.md before mutating content.** Mutating modes (ingest, audit) MUST read SCHEMA.md after AGENTS.md.
- **SCHEMA.md governs note types and content structure.**
- **Do not invent new note types** unless the user approves or SCHEMA.md is updated.
- **If AGENTS.md and SCHEMA.md conflict, stop and ask the user.**
- **Schema changes require a log entry.** Append `## [YYYY-MM-DD] schema | <change summary>` to `log.md`.

## Identity

- Agent helps create / update Task, Milestone, Decision, Sprint, Project notes.
- Agent reports on status (active sprints, overdue tasks, blocked items).
- Agent does NOT decide priority or assignment — those are human decisions.
- Human owns task state; agent suggests state transitions but waits for confirmation on mutations.

## Layer 1 — No Raw Sources (this preset does not adopt the pattern)

Project work items are authored directly; there are no immutable external
originals to ingest. Skip Raw Source frontmatter, sha256 hashing, and
Source Drift Check for this vault.

If you later realize you DO want to attach raw documentation (specs,
external research) to project items, edit AGENTS.md to set
`raw_source: adopted` and SCHEMA.md to declare the relevant frontmatter.

## Layer 2 — Wiki (LLM-owned)

Five typed notes — see `SCHEMA.md`:
- **Task** — atomic work item.
- **Milestone** — checkpoint with target date and tasks rolled up.
- **Decision** — trade-off record (status: proposed / accepted / superseded).
- **Sprint** — time-boxed work cycle.
- **Project** — top-level container with charter and milestone roll-up.

## Layer 3 — Schema files

- `AGENTS.md` (this file) — operational policy + schema authority
- `SCHEMA.md` — note types, frontmatter, body templates
- `CLAUDE.md` — Claude Code entry shim
- `index.md` — content catalog. Rebuilt by `audit lint`.
- `log.md` — append-only operations log
- `_audits/audit-YYYY-MM-DD-<scope>.md` — audit reports

## Scope

This vault tracks: <Vault Scope>

<TODO: list specific projects, teams, or initiatives this vault covers.
Be specific so agents can route incoming task requests correctly.

Out of scope: list neighbouring vaults if any (e.g., personal todo lists
in another vault).>

## Language Policy

Single language: <TODO: declare e.g., English | 中文>. Note bodies in
declared language; no callouts.

Frontmatter values stay canonical English regardless: status enums
(`todo`, `in-progress`, `done`, `blocked`), priority codes, type names.

## Tag Taxonomy

Top-level tags (do not invent new top-levels during ingest unless the
user approves or this list is updated):

<TODO: list 10-20 top-level tags. Project-tracker-typical examples:
- area: `frontend`, `backend`, `infra`, `design`, `docs`
- type-of-work: `feature`, `bug`, `chore`, `research`
- urgency: `p0`, `p1`, `p2`
- size: `xs`, `s`, `m`, `l`, `xl`
- meta: `blocked`, `unblocked`, `at-risk`>

Audit checks (LINT) for this vault:
- Unknown top-level tags → flag.
- Tags used 10+ times but missing from the taxonomy → EVOLVE suggestion.
- Near-duplicate tags → flag.

## Status Enums (canonical state machine)

The Task state machine — `status:` field on Task notes:

```
todo → in-progress → done
   ↘     ↘
    blocked → in-progress (when unblocked)
              done (if no longer needed)
```

The Sprint state machine — `status:` field on Sprint notes:
```
planned → active → completed
                 ↘ cancelled
```

The Decision state machine — `status:` field on Decision notes:
```
proposed → accepted → superseded
        ↘ rejected
```

Audit LINT validates each note's `status:` against these enums.

## Audit Thresholds

LINT additions for this vault — the audit pipeline must honor these:

- **Stale tasks:** `in-progress` Task notes with no update in **7 days** → flag for status check.
- **Overdue tasks:** Task notes with `due_date` past and `status: != done` → flag.
- **Blocked tasks unattended:** `blocked` Task notes with no update in **3 days** → flag.
- **Sprint cadence:** `active` Sprint notes past their `end_date` → flag for retro / close.
- **Milestone slippage:** Milestone notes with `target_date` past and < 80% of linked Tasks `done` → flag.
- **Decision in limbo:** `proposed` Decision notes older than **14 days** → flag for resolution.
- **Index size:** any `index.md` section > **40 notes** → group by area/status.
- **Log rotation:** `log.md` > **400 entries** OR > **80 KB** → rotate to `log-YYYY-Qn.md` (quarter-based archive).

GROW thresholds (skill detects clusters; vault declares N):
- **Tasks without milestone:** 5+ Tasks in the same area with no Milestone linkage → suggest creating Milestone.
- **Sprints without retrospective:** completed Sprint with no retrospective notes → suggest writing one.
- **Recurring blockers:** same blocker name appearing on 3+ Tasks → suggest extracting as a Decision or escalation note.

### Audit scope — folders excluded

| Folder | Reason for exclusion |
|---|---|
| `_audits/` | Audit reports |
| `_dailies/` | Standup logs (intentionally untyped) |
| `archive/` | Closed projects / completed sprints |
| `.obsidian/` | Plugin config |

## Maintenance workflows

| Mode | When | Pipeline |
|---|---|---|
| ingest | New Task / Decision / Milestone request | Classify → Confirm → Create → Index → Propagate (link to Sprint/Milestone) → Log |
| query | "what's blocked", "show this sprint", "decisions about X" | Orient → Search → Read → Synthesize |
| audit | Daily standup support + on-demand | LINK → LINT (status enum check) → GROW |

### Maintenance cadence

- After every Task creation/update → skill auto-updates `index.md` and appends to `log.md`.
- Daily (standup time) → `audit lint` (stale tasks, blockers, overdue).
- End of sprint → `audit grow` (milestone progress, suggest retrospectives).
- Quarterly → review log size and rotate.

### Search backend

QMD collection `<QMD Collection>`. Run `qmd update -c <QMD Collection> &&
qmd embed` after each ingest cycle.
