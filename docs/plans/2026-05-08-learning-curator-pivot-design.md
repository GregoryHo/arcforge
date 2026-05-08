# Learning Subsystem — Curator Pivot Design

**Date**: 2026-05-08
**Status**: Design (no code changes yet)
**Audience**: arcforge contributors

## Context

**Framing — no prior version was production.** arcforge's learning system has never reached a stable shipped state. v1, v2.x, and v3.0.x were all experimental iterations — feature-incomplete, semantically inconsistent, and never adopted by real users. **3.1 is the first attempt to ship a production-grade learning harness.** This means:

- No migration path is required from older formats
- No backward-compatible CLI / dashboard / file shapes need to be preserved
- Existing observation backlogs (142 files, 62 MB) carry no user-data continuity obligation — they may be deleted, quarantined, or ignored at the team's discretion
- Decisions below should be evaluated on production correctness alone, not on migration cost

Three versions of "learning" coexist in the repo today:

- **ECC v2.1** (`~/GitHub/AI/everything-claude-code/skills/continuous-learning-v2/`) — original blueprint. LLM-curation via background daemon (Haiku). Inspired by the Homunculus project.
- **arcforge 2.0** — fork of ECC + adds `/diary`, `/reflect`, `/recall` for LLM-authored session reflection.
- **arcforge 3.0** (this branch) — adds a parallel statistical analyzer + dashboard + 4 lifecycle gates, side-by-side with the daemon. Privacy strengthened by switching observations to enum-only `semantic` summaries.

The 3.0 pipeline produces weak template-filled drafts (verified by eval Scenarios A/B/C — all BLOCKED). Daemon (the LLM-curation side) appears stalled, partly because the 3.0 enum-only observation shape starves it of the raw `tool_input` it was designed to read.

This document captures the consolidated direction: **return to ECC's LLM-curation spirit, keep arcforge 2.0's diary/reflect/recall additions, repurpose 3.0's dashboard / 4 gates as the human-review entry point, remove all auto-anything**.

## Verified Findings (from code & git diff)

### Finding 1 — 2.0 LLM-curation infrastructure is fully intact in 3.0

`git diff v2.1.0..HEAD` returns **0 lines changed** on:
- `hooks/session-tracker/end.js` — Stop hook auto-generates diary draft + spawns Haiku enricher
- `hooks/pre-compact/main.js` — PreCompact threshold check + auto-diary trigger
- `hooks/session-tracker/inject-context.js` — SessionStart surfaces "Diary draft ready" / "N diaries ready for reflection" nudges

The user-facing /diary, /reflect, /recall, /learn slash commands and underlying scripts are all still present and unmodified.

### Finding 2 — 3.0 added a parallel pipeline

| File | Lines |
|---|---|
| `scripts/lib/learning.js` (NEW) | +1611 |
| `scripts/lib/learning-dashboard.js` (NEW) | +487 |
| `scripts/lib/learning-dashboard.html` (NEW) | +275 |
| `tests/scripts/learning.test.js` (NEW) | +2797 |
| `tests/scripts/learning-dashboard.test.js` (NEW) | +572 |
| `hooks/__tests__/observe.test.js` (NEW) | +497 |
| `hooks/observe/main.js` (modified) | +280 -12 |

The new module (`scripts/lib/learning.js`) is purely statistical / regex-based — no LLM call. It groups tool events into sequences, counts occurrences, fills templates.

### Finding 3 — Hook `observe/main.js` does two things

```js
// hooks/observe/main.js:400-401
signalDaemon();                                 // Wakes the LLM-curation daemon
runAutomaticLearningTrigger(...);               // Runs in-line statistical analyzer (3.0 addition)
```

The hook signals the daemon (correct, ECC heritage) **and** runs the new statistical analyzer in-line (3.0 addition). Two parallel pipelines fire on every tool call.

### Finding 4 — Observation shape changed in 3.0

```jsonc
// Pre-3.0 (raw input persisted)
{"event":"tool_start","tool":"Bash","input":"{\"command\":\"wc -l docs/plans/...\"}"}

// 3.0 (enum-only semantic summary, no raw input)
{"event":"tool_start","tool":"Bash","semantic":{"command_kind":"inspect","payload_saved":false}}
```

The daemon's `observer-prompt.md` was designed assuming raw input. With enum-only observations, Haiku has insufficient context to produce quality instincts. Daemon log shows recent runs producing 0 instincts; observation file has 15131 pending entries on this project.

### Finding 5 — 3.0 deleted 2.0's eval coverage

Removed in 3.0:
- `evals/scenarios/instinct-adherence.md` — tested whether activated instincts steered LLM behavior
- `evals/scenarios/reflect-pattern-detection.md` — tested /reflect's 3+ pattern threshold

Replaced by 4 evals testing only the new statistical pipeline (`eval-optional-learning-*`). The 2.0 LLM-curation path lost eval validation.

## ECC v2.1 Implementation Audit

Beyond the headline pivot, an audit of the daemon and observation hook against ECC v2.1 surfaced 14 drift points where arcforge's port differs from the original. Categorized by risk level. **3.0 did not fix any of these — `git diff v2.1.0..HEAD --stat skills/arc-observing/` returns 0 lines; daemon code is untouched.**

### What counts as drift

A drift item must be an engineering practice ECC validated and arcforge missed (e.g., re-entrancy guard, watchdog, self-loop skip filter). Naming choices, event labels, or field shape preferences are arcforge design decisions, not drift:

| Surface difference | Verdict |
|---|---|
| `ts` vs `timestamp` field name | arcforge choice — shorter, fine |
| `tool_end` vs `tool_complete` event label | arcforge choice — pairs with `tool_start`, fine |
| `project` vs `project_name` field | arcforge choice — concise, fine |
| Path-based SHA-256 vs git-remote SHA-1 for project ID | arcforge choice — see Decision 6 below |

These are not listed as drift. The audit below is engineering-only.

### 3.0 verdict on drift

The only observation-layer change in 3.0 is in `hooks/observe/main.js`:

1. Added `shouldObserve()` — binary gate that silences the hook unless learning is explicitly enabled (replaces ECC's 5-layer skip filter set with a single all-or-nothing toggle)
2. Switched observation persistence from raw `tool_input` to enum-only `semantic` summary
3. Added line 401 `runAutomaticLearningTrigger()` calling the new statistical pipeline

Net effect on the LLM-curation path: **0 fixes, 2 indirect regressions** (self-loop unguarded, raw input starved).

### High-risk drift (4 items)

| # | Item | ECC ref | arcforge ref | Status |
|---|---|---|---|---|
| 1 | 5-layer skip filters in observation hook | `hooks/observe.sh:128-162` | `hooks/observe/main.js:55-67` | MISSING — only binary `isLearningEnabled` |
| 5 | Re-entrancy guard (`ANALYZING` flag) | `agents/observer-loop.sh:264-275` | `skills/arc-observing/scripts/observer-daemon.sh:296-308` | MISSING — only cooldown |
| 11 | Watchdog (120s timeout on Haiku spawn) | `agents/observer-loop.sh:233-240` | (absent) | MISSING |
| 15 | Daemon Haiku `--max-turns` | `observer-loop.sh:228` (20, configurable) | `observer-daemon.sh:179` (3, hardcoded) | MODIFIED — too tight for instinct generation |

These four together explain the daemon health symptoms observed (15131 pending observations on this project; recent log entry `⚠ No instinct files found after analysis`; last successful analysis 7 weeks ago). Self-loop possible (#1), parallel Haiku spawns possible (#5), no timeout protection (#11), Haiku gets cut off mid-write (#15).

### Medium-risk drift (5 items)

| # | Item | Status |
|---|---|---|
| 2 | Sentinel + fail-closed on prompt detection | DIFFERENT — arcforge has mkdir-singleton lock only |
| 3 | Session lease (`.observer-sessions/*.json`) | MISSING — daemon can't tell idle from quiet |
| 6 | `session-guardian.sh` (active hours / cooldown gate) | MISSING |
| 8 | 30-day auto-purge of archive observations | MISSING |
| 14 | Lazy-start daemon from observation hook | MISSING — daemon must be manually started |

### Low-risk / equivalent (5 items)

| # | Item | Status |
|---|---|---|
| 4 | Secret scrub regex | PORTED OK (slightly different patterns, equivalent intent) |
| 7 | Tail sampling line count | MODIFIED — arcforge `tail -200`, ECC `tail -500` |
| 9 | Inline heredoc prompt vs static `.md` | MODIFIED — arcforge split prompt into `observer-prompt.md` + `observer-system-prompt.md` |
| 10 | `MIN_OBSERVATIONS` threshold | MODIFIED — arcforge 10, ECC 20 |
| 12 | `MAX_AGE` daemon lifetime | DIFFERENT — arcforge hard-stops at 7200s, ECC relies on idle timeout only |
| 13 | Project ID algorithm | DIFFERENT — arcforge `SHA-256(absolute_path).slice(0,16)`, ECC `SHA-1(git remote URL).slice(0,12)` with path fallback |

Item #13 is significant for cross-machine instinct portability but matches the pivot's "manual `[Promote]`" decision (avoids spurious cross-project matches when path differs across machines). Treated as out of scope for the pivot.

### Audit conclusion

Original hypothesis was that 3.0's enum-only observation broke the daemon. The audit shows the actual root cause is more layered: the daemon was **already** missing self-loop guards (#1), re-entrancy protection (#5), watchdog (#11), and ran with `--max-turns 3` (#15) — all inherited from the 2.x port from ECC, all unfixed in 3.0. Enum-only starvation is the most recent stressor, not the foundational issue. **Pivot must patch high-risk drift before any other change to make daemon health verifiable.**

## Four-Column Comparison

| Concept | ECC v2.1 | arcforge 2.0 | arcforge 3.0 (this branch) | Desired |
|---|---|---|---|---|
| Namespace | `~/.claude/homunculus/` | `~/.arcforge/` | (unchanged) + `.arcforge/learning/` | (unchanged) |
| Observation source | raw `input` + tool name | (inherits ECC) | enum-only `semantic` | **restore raw** |
| Observation digest | daemon (Haiku, 5min poll + SIGUSR1) | (port of ECC daemon) | + parallel statistical analyzer | **drop statistical**; daemon writes to candidate queue |
| Instinct format | YAML | MD with YAML frontmatter | (unchanged) + candidate JSON | candidate JSON; activate writes MD |
| Diary | not present | **2.0 addition** (auto-drafted on Stop/PreCompact, Haiku enricher) | (unchanged) | (unchanged) |
| Reflect | not present (daemon does it inline) | **2.0 addition** (`/reflect` cross-diary pattern detection) | (unchanged) | (unchanged) |
| Recall | not present | **2.0 addition** (`/recall` manual instinct save) | (unchanged) | (unchanged) |
| Evolve trigger | `/evolve` CLI | `/learn scan` CLI | (unchanged) | dashboard `[Evolve]` button |
| Evolve algorithm | trigger keyword dict-cluster (2+) | trigger similarity 0.6 + same domain (3+) | (unchanged) | dashboard shows cluster; **LLM-written body** |
| Evolve output | `evolved/{skills,commands,agents}/` template scaffold | `skills/`, `commands/`, `agents/` template scaffold | (unchanged) | candidate queue with LLM-written body, then activate |
| Confidence lifecycle | 0.3/0.5/0.7/0.9, confirm/contradict/decay | (inherits ECC) | (unchanged) for 2.0 path; new types in 3.0 path | (unchanged) |
| Gate #1 — Instinct → Claude context | **auto-load at ≥ 0.7** | (inherits ECC) | (unchanged) | **remove auto-load**; dashboard nudge only |
| Gate #2 — Project → Global | **auto-suggest at 2+ projects, avg ≥ 0.8** | (inherits ECC) | (unchanged) | **remove auto-criteria**; dashboard `[Promote]` button |
| Gate #3 — Instinct → Skill | `/evolve --generate` no review | `/learn generate` no review | 4 gates (approve/materialize/activate) | dashboard `[Evolve]` then 4 gates with LLM body |
| Privacy | observations local; only instincts exportable | (inherits ECC) | (unchanged) + dashboard sanitization | (unchanged) |
| Eval coverage | none (CLI unit tests only) | `instinct-adherence.md` + `reflect-pattern-detection.md` | 3.0 deleted those; added 4 statistical-pipeline evals | **restore instinct-adherence**; drop statistical evals |
| User UX | pure CLI | CLI + slash commands | + localhost dashboard | **dashboard primary**; SessionStart hook nudge |

## Lineage Summary

```
ECC v2.1                = hook → daemon → instinct(YAML) → /evolve(template) → skill/command/agent
                          ↳ auto-load ≥ 0.7 + auto-promote 2+ projects
                          UX: pure CLI

arcforge 2.0           = ECC full set + diary(LLM-written) + reflect(/reflect) + recall(manual)
                          ↳ same auto-load ≥ 0.7
                          UX: CLI + slash commands

arcforge 3.0           = 2.0 full set + parallel statistical pipeline
                          ↳ statistical analyzer → candidate queue → 4 gates → dashboard
                          side effect: observation enum-only, starves daemon
                          side effect: deleted 2 of 2.0's eval guards

Desired                = 2.0 full set (diary/reflect/recall unchanged)
                          + ECC daemon + LLM-written instincts (raw observation restored)
                          + 3.0 dashboard / 4 gates (replace auto-load and auto-promote)
                          + LLM-written evolve body (replace ECC/2.0 templates)
                          ↳ all LLM influence requires explicit human gate
```

## Locked Decisions

These were settled during the design conversation:

### Decision 1 — Restore raw observation input
- Observations re-include `tool_input` / `command` / `file_path`
- Privacy contract still holds: observations stay local, dashboard sanitizes wire model
- Wire-up uses the existing `sanitizeObservationPayload` (currently dead code in `hooks/observe/main.js:89`); see Decision 5 for keyword expansion

### Decision 2 — `instinct` is the learning atom, not the LLM-influence unit
- Activated instinct lands at `~/.arcforge/instincts/<project>/<id>.md`
- This file does **not** influence Claude directly anymore (ECC's auto-load removed)
- Influence reaches LLM only via:
  - `skill` (Claude Code auto-discovery from `skills/`)
  - `claude_md_addition` (manual append to CLAUDE.md, draft-only contract)
- Instinct's role: building block awaiting evolution into a skill

### Decision 3 — Diary auto-generation already exists, untouched
- Stop hook + PreCompact hook already trigger `auto-diary.js` and Haiku enricher
- SessionStart `inject-context.js` already surfaces "Diary draft ready" nudge
- No design change here; verify the existing pipeline is healthy

### Decision 4 — `semantic` enum is a derived view, not a persisted field
- Hook persists raw `tool_input` only (post-Decision-1 + sanitization)
- Components that need enum buckets (Bash `command_kind`, path classification, file kind) compute them on-the-fly via `summarizeToolInput()` at read time
- Removes ~30-50% jsonl bloat; enum stays available as a runtime computation for dashboard rendering and daemon prompt assembly
- Affects: dashboard wire model, daemon prompt assembly, any future statistical retries

### Decision 5 — Restore raw input must come with broader scrub keyword set
- Wire `sanitizeObservationPayload` (already in `hooks/observe/main.js:89`) into `main()`
- Expand `redactObservationText` regex keywords from current `(api_key|secret|password|passwd|token)` to also cover ECC's set: `authorization`, `credentials?`, `auth`
- Keep arcforge-specific patterns already in place (`Authorization: Bearer X`, three-quote-form variants)
- Net coverage union: `api_key, api-key, secret, password, passwd, token, authorization, credentials, credential, auth` plus explicit `Authorization: Bearer`
- Keyword tuning happens at the same commit as the rewire — never restore raw without scrubbing

### Decision 6 — Project ID stays path-based SHA-256
- Current arcforge uses `crypto.createHash('sha256').update(absolute_path).slice(0,16)` (`scripts/lib/learning.js:39-40`)
- ECC uses git-remote SHA-1 (cross-machine consistent) with path fallback
- arcforge keeps path-based: simpler, no git dependency, and matches the pivot's manual `[Promote]` decision (path-based ID never auto-matches across machines, so spurious cross-project promotion is impossible by construction)
- Trade-off accepted: a repo cloned to a different absolute path on the same machine gets a fresh learning history. Acceptable for arcforge's single-developer-per-checkout assumption.

### Decision 7 — Eval trial directories never observed
- `hooks/observe/main.js` `shouldObserve()` adds path-based exclusion before the learning-enabled check
- Patterns excluded: `[/\\]\.eval-trials[/\\]` and `-t\d+-[A-Za-z0-9]{6}$` (matches arcforge's eval harness trial-dir naming convention)
- Empirical justification (from 2026-05-08 backlog scan): 24 of 142 observation directories were eval trial dirs. They contained 5-11% suspect-keyword density (`password=`, `Authorization: Bearer ...`) — but those are **eval fixtures intentionally seeded as grader traps**, not real user activity. Letting daemon analyze them produces false-positive instincts.
- Implements the first layer of ECC's 5-layer skip filter (Drift #1) and is the highest-priority of those 5 based on real backlog data.
- Equivalent env override: `ARCFORGE_OBSERVE_SKIP_PATHS` (comma-separated path fragments) — matches ECC's `ECC_OBSERVE_SKIP_PATHS` semantics.

### Decision 8 — Candidate evidence carries a quality signal
- Each candidate's `evidence` array entries include `project` and `project_obs_count` (total observation count for that source project at curator time)
- Candidate top-level adds `evidence_quality: "high" | "medium" | "low"` derived from min/median/max of source `project_obs_count`:
  - `high`: median ≥ 1000 obs across cited projects
  - `medium`: 100 ≤ median < 1000
  - `low`: median < 100
- Dashboard renders `⚠ low signal` chip on `low` cards
- Empirical justification: backlog scan showed cc-pulseline (21k obs) vs trial dirs (30-50 obs) span 3 orders of magnitude. Candidates synthesized from sparse projects deserve different reviewer trust than candidates synthesized from saturated projects. Without this signal, dashboard treats all candidates uniformly, which masks the largest reliability variance in the system.

## Concrete Change List

### Remove
```js
// hooks/observe/main.js:401
- runAutomaticLearningTrigger(process.env.CLAUDE_PROJECT_DIR || process.cwd());
```

### Retire (keep code, no callers)
- `scripts/lib/learning.js`:
  - `analyzeLearning`, `analyzeProjectLearning`, `analyzeGlobalLearning`
  - `analyzeOutcomeRepair`
  - `extractTranscriptHabits`
  - `buildWorkflowCandidate`
  - `triggerAutomaticLearning`

### Modify

**Restore raw observation in `hooks/observe/main.js`** (per Decision 1, 4, 5):
```js
if (phase === 'pre' && input.tool_input) {
  const raw = typeof input.tool_input === 'string'
    ? input.tool_input
    : JSON.stringify(input.tool_input);
  observation.input = sanitizeObservationPayload(raw, MAX_INPUT_LENGTH);
  // semantic enum no longer persisted (Decision 4) — derived on-the-fly via
  // summarizeToolInput() when dashboard or daemon needs it
}
```

**Expand `redactObservationText` keyword set** (per Decision 5) in `hooks/observe/main.js:81-87`:
```js
// Add keywords missing relative to ECC: authorization, credentials, credential, auth
function redactObservationText(value) {
  return String(value || '')
    .replace(/\b(api[_-]?key|secret|password|passwd|token|authorization|credentials?|auth)\b\s*[:=]\s*"[^"]*"/gi, '$1="[REDACTED]"')
    .replace(/\b(api[_-]?key|secret|password|passwd|token|authorization|credentials?|auth)\b\s*[:=]\s*'[^']*'/gi, "$1='[REDACTED]'")
    .replace(/\b(api[_-]?key|secret|password|passwd|token|authorization|credentials?|auth)\b\s*[:=]\s*[^\s,}]+/gi, '$1=[REDACTED]')
    .replace(/\bAuthorization\s*:\s*Bearer\s+[^\s,}]+/gi, 'Authorization: Bearer [REDACTED]');
}
```

**Daemon writes to candidate queue** (`skills/arc-observing/scripts/observer-daemon.sh` + `observer-prompt.md`):
- Replace direct write to `~/.arcforge/instincts/<project>/<id>.md`
- Output: append candidate to `.arcforge/learning/candidates/queue.jsonl`
- Candidate shape:
  ```json
  {
    "id": "...",
    "kind": "instinct" | "skill" | "claude_md_addition",
    "trigger": "...",
    "body": "<LLM-authored>",
    "domain": "workflow | tool-preference | error-handling | code-style",
    "confidence": 0.5,
    "evidence": ["session_id", "diary_path"],
    "scope": "project",
    "status": "pending"
  }
  ```

**Daemon prompt addition** — read recent diaries as additional context:
```
## Recent diary reflections (last 5 sessions)
{cat ~/.arcforge/diaries/<project>/*/diary-*.md}
```

**SessionStart nudge** — `hooks/session-tracker/inject-context.js`:
- Add new pending action type `learning-candidate-ready` (alongside existing `diary-ready`, `reflect-ready`)
- Surface message: `"N learning candidates ready for review — arc learn dashboard"`

**Dashboard additions** — `scripts/lib/learning-dashboard.js`:
- New action: `[Promote]` (project candidate → global candidate, all manual)
- New action: `[Evolve]` (select N+ instinct candidates → emit a skill candidate with LLM-written body)
- Keep existing `[Approve] / [Materialize] / [Activate] / [Dismiss]` flow

**Activation routing** — `scripts/lib/learning.js` `getActiveArtifactPaths`:
- `instinct` activation → `~/.arcforge/instincts/<project>/<id>.md` (matches ECC/2.0 instinct path)
- `skill` activation → `skills/<name>/SKILL.md` (already correct)
- `claude_md_addition` → still draft-only, manual review (already correct)

### Eval coverage restoration

- Restore `evals/scenarios/instinct-adherence.md` (test activated instinct's behavioral influence — but only for the new path: instinct → evolved skill)
- Restore `evals/scenarios/reflect-pattern-detection.md` (test /reflect's pattern detection)
- Drop `evals/scenarios/eval-optional-learning-*.md` (×4) since they test the retired statistical pipeline
- Keep new evals only if they test the consolidated pipeline (rewrite as needed)

## Open Questions (still need decisions)

1. **Daemon prompt redesign for LLM-written candidates**
   - Current `observer-prompt.md` outputs YAML instincts directly
   - New design needs daemon to output JSON candidates (with `kind`, `body`, etc.)
   - Question: rewrite `observer-prompt.md` from scratch, or layer a translator?

2. **Daemon-emitted skill candidates vs evolve-emitted skill candidates**
   - Daemon could emit `kind: skill` directly when it sees enough convergent evidence
   - Or daemon only emits `kind: instinct` and `[Evolve]` button is the only path to skills
   - Question: which is cleaner? (recommend: daemon only emits instinct; skills come from explicit evolve)

3. **Confidence lifecycle for queue candidates**
   - Existing 3.0 candidates have status (pending/approved/...) but no confidence drift
   - Need to merge ECC's confidence lifecycle (decay, confirm/contradict) into the queue model
   - Question: store confidence lifecycle in queue.jsonl, or keep separate confidence file?

4. **What happens to existing 142-project / 62 MB observation backlog?** *(resolved 2026-05-08, no migration concern)*
   - **arcforge dev repo**: quarantined to `~/.arcforge/observations/arcforge/observations.jsonl.quarantine.<ts>` (chmod 600). 7.24 MB / 15,265 lines / 101 suspect (0.66%).
   - **All-project scan summary**: 142 projects, 67,547 lines, 210 suspect (0.31%); 36 dirty, 106 clean. Top offenders by suspect-line count: cc-pulseline (73), platform-web (28), gmux (13), gregho (12), dotfiles (11). Top keywords: `token (158), auth (74), password (35), authorization (21), secret (19), credential (17)`.
   - **No migration is required** (per Context framing — no prior version was production). Backlog can be batch-deleted, batch-quarantined, or left as-is. Daemon will create fresh `observations.jsonl` per project after health restoration; old files are inert.
   - Recommended action for 3.1 launch: batch-quarantine all 142 to `.quarantine.<ts>` before flipping daemon health on, then delete on a quiet day.

5. **`skill` vs `command` vs `agent` from evolve**
   - ECC and 2.0 both classify cluster → one of three types via heuristic
   - Should the dashboard let user choose, or auto-classify?
   - Question: keep the heuristic, or simplify to "everything evolves to skill"?

## Out of Scope (explicit)

- The diary/reflect/recall pipeline — verified intact, no design change
- Privacy guarantees — local-only observations, dashboard wire-model sanitization, draft-only patches all stay
- **Migration tooling from older versions** — none of v1, v2.x, or v3.0.x was production; 3.1 is the first production target. No `arc learn migrate` command, no schema versioning headers, no compat shims. Old observations are deleted or quarantined, not migrated.
- **Cross-machine learning portability** — Decision 6 keeps path-based project ID; instincts learned on one machine do not auto-apply on another even with same git remote.
- The `repo_convention_patch` artifact type and its draft-only contract — keep as-is
- Bubble-up logic (project → global auto-promotion) — replaced by manual dashboard `[Promote]`

## Eval Implications

After this pivot, the eval matrix becomes:

| Eval | Tests | Status |
|---|---|---|
| `instinct-adherence` (restored) | activated instinct in `~/.arcforge/instincts/...` is read and applied by /evolve flow | TODO |
| `reflect-pattern-detection` (restored) | /reflect detects 3+ patterns from diaries | TODO |
| `evolve-quality` (NEW) | LLM-written evolved skill body produces meaningful agent behavior | TODO |
| `dashboard-promote-gate` (NEW) | Dashboard promote/evolve actions write correctly to queue | TODO |
| `eval-optional-learning-*` (×4) | Statistical pipeline behavior | DROP (pipeline retired) |

## Risk Notes

- **Existing 3.0 dashboard tests pass against the statistical pipeline** — once retired, those tests need rewrite to test daemon-emitted candidates
- **The privacy regression risk**: restoring raw `input` re-introduces the storage of raw commands in observation logs. Mitigations: stays local, never persisted to wire model, dashboard sanitization layer holds.
- **Daemon health is governed by the audit findings above, not by enum-only starvation alone**. Original hypothesis blamed the 3.0 enum-only switch. The audit shows the daemon was already missing self-loop guards (#1), re-entrancy protection (#5), watchdog (#11), and ran with `--max-turns 3` (#15) — all from the 2.x port, all unfixed in 3.0. Enum-only is the most recent stressor; the foundational issues predate this branch. See "ECC v2.1 Implementation Audit" section for the full breakdown.

## Migration Order (suggested)

0. **Patch high-risk daemon drift first** (per ECC audit): add 5-layer skip equivalent (#1) including `ARCFORGE_SKIP_OBSERVE` env that the daemon sets when spawning Haiku, add `ANALYZING` re-entrancy flag (#5), wrap Haiku spawn with 120s watchdog (#11), raise `--max-turns` from 3 to 15-20 (#15). Without these, downstream changes will inherit the same daemon health problems.
1. Restore raw observation in hook (Decision 1)
2. Verify daemon produces instincts on a fresh observation stream (run a representative work session with raw observations enabled; target: ≥ 1 instinct per analysis cycle on a 100-obs minimum sample; if zero after Step 0+1, root cause is the daemon prompt or `--max-turns`, not data quality — backlog is gone, no fallback to old data)
3. Remove `runAutomaticLearningTrigger` from hook line 401
4. Update daemon prompt to write candidate JSON (not YAML/MD instinct directly)
5. Update dashboard to render LLM-authored candidates correctly
6. Add `[Promote]` and `[Evolve]` dashboard actions
7. Restore evals for instinct-adherence + reflect-pattern-detection
8. Retire 4 statistical-pipeline eval scenarios
9. (Optional) Patch medium-risk daemon drift: session lease (#3), session-guardian.sh (#6), 30-day auto-purge (#8), lazy-start daemon (#14)
10. Document in user-facing skill files (arc-observing, arc-learning)

## References

- ECC v2.1 SKILL: `~/GitHub/AI/everything-claude-code/skills/continuous-learning-v2/SKILL.md`
- ECC observer agent: `~/GitHub/AI/everything-claude-code/skills/continuous-learning-v2/agents/observer.md`
- arcforge 2.0 daemon: `skills/arc-observing/scripts/observer-daemon.sh`
- arcforge 2.0 diary auto: `skills/arc-journaling/scripts/auto-diary.js`
- arcforge 2.0 reflect: `skills/arc-reflecting/scripts/reflect.js`
- arcforge 2.0 evolve: `skills/arc-learning/scripts/learn.js`
- arcforge 3.0 statistical: `scripts/lib/learning.js`
- arcforge 3.0 dashboard: `scripts/lib/learning-dashboard.js`
- Eval results validating BLOCKED verdicts: `evals/results/eval-optional-learning-*/20260507-*/`
