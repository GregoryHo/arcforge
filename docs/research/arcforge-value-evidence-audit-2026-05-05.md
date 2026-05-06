# ArcForge value evidence audit — eval harness and observations

Date: 2026-05-05
Branch: `chore/arcforge-eval-observation-audit`

## Scope

This audit intentionally ignores plugin-install hygiene unless it blocks value measurement. The only questions are:

1. **Eval harness:** Does ArcForge produce better or safer agent behavior than baseline?
2. **Observations / self-improvement:** Does the observation pipeline produce reasonable, actionable, and verifiably useful improvements?

## Executive verdict

ArcForge currently has **credible non-regression evidence** and **some strong discriminative lift evidence**, especially for SDD/refining scenarios. It does **not yet have enough evidence to claim broad superiority** or end-to-end self-improvement.

Observation/self-improvement is currently best described as a **telemetry and conservative candidate-generation smoke test**. Live data shows the pipeline is collecting metadata, but there are no current candidates, drafts, activations, or closed-loop before/after improvements.

## 1. Eval evidence

### Claim types

Use separate claim buckets. A single `SHIP` label is not enough.

| Claim type | What it can prove | Required evidence |
|---|---|---|
| Non-regression | ArcForge always-on surface does not make ordinary work worse | Treatment passes; baseline is diagnostic only |
| Discriminative lift | ArcForge improves a known failure mode | Baseline plausibly fails, treatment passes, k is sufficient, grader is stable |
| Self-improvement | Observation-derived changes improve future behavior | observation → candidate → approval/materialize/activate → before/after eval or telemetry |
| Infra/harness | The eval mechanism itself works | isolation, transcripts, deterministic graders, no stale transcript grading |

### Stronger discriminative lift candidates

These are the scenarios most likely to support a real value claim after rerunning under the current harness and reporting baseline/treatment explicitly.

| Scenario | Latest evidence summary | Current claim |
|---|---|---|
| `sdd-brainstorming-pending-conflict-handoff` | treatment 5/5, baseline 0/5 | Strong lift for pending-conflict handoff behavior |
| `sdd-refining-deferral-invention-guard` | treatment 5/5, baseline 1/5 | Strong lift for avoiding invented criteria from deferral signals |
| `sdd-refining-r3-pending-conflict-producer` | treatment 5/5, baseline 0/5 | Strong lift for canonical pending-conflict framing |
| `eval-sessionstart-minimal-bootstrap` | treatment 5/5, baseline 1/5 | Strong signal for minimal bootstrap behavior, but partly SessionStart-specific |
| `eval-plugin-dir-other-skill-isolation` | treatment 2/2, baseline 0/2 | Promising but underpowered and plugin-infra-adjacent |
| `eval-plugin-dir-activated-release-skill` | treatment 5/5, baseline 3/5 | Some lift for activated release-skill behavior, but plugin/activation-adjacent |
| `eval-arc-managing-sessions-*` | treatment 3/3, baseline 1–2/3 | Promising session-management lift; rerun at k >= 5 |

### Non-regression / ceilinged baseline scenarios

These should not be used as “ArcForge is better” evidence. They are still useful for user-scope safety.

| Scenario | Latest evidence summary | Supported claim |
|---|---|---|
| `eval-arc-using-harness-isolation` | treatment 5/5, baseline 5/5 | Non-regression / isolation safety |
| `eval-arc-using-read-only-nonactivation` | treatment 5/5, baseline 5/5 | Read-only nonactivation safety |
| `eval-arc-verifying-stale-evidence-gate` | treatment 5/5, baseline 5/5 | Non-regression only; no lift |
| `eval-arc-evaluating-scenario-audit` | treatment 5/5, baseline 5/5 | Both arms can identify bad eval evidence |
| `eval-release-flow-destructive-action-gate` | treatment 5/5, baseline 5/5 | Safety non-regression; baseline already cautious |
| `eval-optional-learning-pending-candidate-boundary` | treatment 5/5, baseline 5/5 | Learning-boundary safety |
| `eval-optional-workflow-simple-nonactivation` | treatment 2/2, baseline 2/2 | Non-regression, underpowered |
| `eval-optional-workflow-task-fit-activation` | treatment 2/2, baseline 2/2 | Non-regression, underpowered |
| `eval-other-skill-noninterference` | treatment 2/2, baseline 2/2 | Non-interference only |
| `eval-sessionstart-grader-json-isolation` | treatment 2/2, baseline 2/2 | Infra/non-regression |
| `eval-sessionstart-tool-minimalism` | treatment 2/2, baseline 2/2 | Tool-minimalism non-regression |

### Self-improvement evals

| Scenario | Latest evidence summary | Supported claim |
|---|---|---|
| `eval-optional-learning-self-improvement-candidate` | single-arm 5/5 | Conservative candidate recommendation smoke; not full self-evolution |
| `eval-optional-learning-release-flow-active-skill` | single-arm 5/5 | Activated learned release-skill planning safety; not A/B lift |
| `eval-optional-learning-pending-candidate-boundary` | treatment 5/5, baseline 5/5 | Pending-candidate boundary safety, no lift |

Current self-improvement evals stop at recommendation / planning behavior. They do not prove the closed loop:

```text
observation → candidate → approval → materialize → activate → future task improvement → no regression
```

### Harness trust issues to fix or track

- Several grader configs still inspect the latest transcript from global result directories rather than a trial-specific `TRANSCRIPT_PATH`. This can produce stale or wrong grading under concurrent/repeated runs.
- Many active scenarios use `non-regression` verdict policy. That is correct for safety scenarios but not for value/lift claims.
- Some scenarios are underpowered (`k=2` or `k=3`) and should not be used for strong claims.
- Baseline ceiling is common. Ceilinged scenarios are still valuable safety checks, but they do not prove improvement.

### Recommended eval program

1. Split reporting into explicit dashboards or sections:
   - non-regression
   - discriminative lift
   - self-improvement
   - infra/harness
2. Promote the strongest lift suite first:
   - `sdd-brainstorming-pending-conflict-handoff`
   - `sdd-refining-deferral-invention-guard`
   - `sdd-refining-r3-pending-conflict-producer`
3. Rerun lift candidates with current harness, baseline + treatment, `k >= 5`, and stable deterministic or blind-comparator grading.
4. Redesign or relabel baseline-ceiling scenarios. Do not market them as improvement.
5. Add an end-to-end self-improvement eval chain, not just candidate recommendation.
6. Run currently no-run orchestration scenarios such as `sdd-v2-arc-implementing-delegation` if they support the product claim.

Useful commands:

```bash
node scripts/cli.js eval lint <scenario>
node scripts/cli.js eval preflight <scenario>
node scripts/cli.js eval ab <scenario> --skill-file <path> --k 5
node scripts/cli.js eval compare <scenario>
node scripts/cli.js eval report <scenario>
```

## 2. Observations / self-improvement evidence

### Current live state

Project learning is enabled for `/Users/user/code/arcforge`, global learning is disabled.

Candidate queues and drafts are empty:

```json
{
  "scope": "project",
  "count": 0,
  "candidates": []
}
```

```json
{
  "scope": "project",
  "count": 0,
  "drafts": []
}
```

The observer daemon is running, but current logs repeatedly show insufficient observations:

```text
Skipping arcforge: only 8 observations (need 10)
Skipping sdd-brainstorming-refining-closed-loop-t*: only 2 observations (need 10)
```

Current ArcForge observations:

```text
/Users/user/.arcforge/observations/arcforge/observations.jsonl
```

Summary:

- 8 JSONL lines
- 4 `tool_start`
- 4 `tool_end`
- 1 session
- tools: `Bash`, `Read`, `Grep`
- no candidate-relevant release signal
- no current candidate/draft/activation

### What the current data proves

It proves only basic telemetry smoke:

- project learning is enabled;
- observation files are written;
- daemon scans observation directories;
- thresholding prevents premature analysis;
- no self-improvement artifact has been generated or activated.

It does not prove:

- useful pattern discovery;
- candidate precision;
- human-review yield;
- draft quality;
- activation quality;
- post-activation behavioral improvement;
- closed-loop self-evolution.

### Current learning paths

There are two related systems.

#### MVP candidate lifecycle

Implemented primarily in:

- `scripts/lib/learning.js`
- `scripts/cli.js`
- `skills/arc-learning/SKILL.md`

Flow:

```text
observations
→ analyzer
→ pending project-local candidates
→ human review
→ approve/reject
→ inactive .draft artifacts
→ explicit activation
→ active artifacts
```

Safeguards:

- disabled by default;
- project-scoped enablement;
- analyzer only appends pending candidates;
- no automatic approval, materialization, activation, publish, tag, push, or runtime behavior change;
- materialization writes inactive `.draft` artifacts;
- activation requires explicit command and refuses overwrite conflicts.

Current analyzer limitation:

- only project scope;
- currently hardcoded around repeated release-flow signals for `arc-releasing`;
- requires at least two distinct sessions with release-signal score >= 2;
- emits one candidate shape with fixed confidence around `0.72`.

So this is not yet a general learner. It is a conservative release-flow candidate detector.

#### Observer daemon / instinct pipeline

Implemented primarily in:

- `skills/arc-observing/scripts/observer-daemon.sh`
- `skills/arc-observing/scripts/observer-prompt.md`
- `skills/arc-observing/scripts/observer-system-prompt.md`
- `skills/arc-learning/scripts/learn.js`

Flow:

```text
~/.arcforge/observations/<project>/observations.jsonl
→ observer daemon
→ Claude Haiku pattern detection
→ ~/.arcforge/instincts/<project>/*.md
→ optional legacy clustering/evolution
```

Thresholds:

- daemon requires `MIN_OBSERVATIONS=10` JSONL lines;
- observer prompt asks for at least 3 occurrences before creating an instinct;
- successful analysis archives observations.

Concern: the daemon threshold counts JSONL lines, so a single tool call can count twice (`tool_start` + `tool_end`). That can overstate evidence volume.

### Observation quality assessment

Privacy posture is relatively conservative:

- no response bodies for post-tool observations;
- Skill calls store skill name only in current code;
- obvious secret redaction exists;
- output is mostly metadata.

Signal is currently weak:

- tool metadata alone usually cannot prove better behavior;
- there is little semantic task intent;
- user correction / failure recovery is hard to detect;
- current live observations lack enough repeated cross-session patterns;
- Bash command input and file paths can still be sensitive.

### Recommended observation/self-improvement program

1. Treat current observations as telemetry smoke only.
2. Add a read-only `learning audit` command that reports:
   - observation counts by project/session/tool/event;
   - candidate counts by status;
   - daemon threshold state;
   - distinct-session evidence per candidate;
   - post-activation observations if any.
3. Align thresholds around evidence units, not JSONL lines:
   - minimum distinct sessions;
   - minimum completed tool calls;
   - minimum repeated semantic signals;
   - avoid counting `tool_start` and `tool_end` as two independent observations.
4. Add stable observation IDs or line references so candidate evidence can cite source records.
5. Separate telemetry levels:
   - `metadata` by default;
   - `redacted-input` opt-in;
   - `semantic-summary` opt-in.
6. Generalize candidate analyzers while keeping human gates:
   - repeated skill usage opportunities;
   - repeated tool-error recovery;
   - recurring user correction categories;
   - project workflow checklist gaps.
7. Add closed-loop metrics for activated candidates:
   - candidate id;
   - activation timestamp;
   - matching future observations;
   - before/after tool count, correction count, failed tool count, eval pass rate;
   - regression checks on unrelated tasks.
8. Reduce daemon log noise by logging threshold waits only on count changes or threshold crossings.
9. Reduce path collision risk from basename-based observation paths by including `project_id` in the path or queue partitioning.

## Minimum evidence package for a self-improvement claim

Do not claim self-evolution until one concrete loop has this shape:

1. 2–5+ distinct sessions produce observations for the same failure/opportunity.
2. Candidate evidence cites exact observation IDs/ranges and session IDs.
3. Human reviewer approves the candidate.
4. Draft artifact is materialized and inspected.
5. Artifact is explicitly activated.
6. A future task or replay eval shows improvement over baseline/pre-activation behavior.
7. Non-regression evals remain green.

Until then, say:

```text
ArcForge has conservative observation capture and pending-candidate scaffolding, but self-improvement is not yet proven end-to-end.
```

## Follow-up implementation in this branch

After this audit, the branch started closing the highest-leverage measurement gaps:

1. Scenario code graders that selected the latest transcript by mtime were changed to read the trial-specific `TRANSCRIPT_PATH`.
2. A regression test now rejects active code-graded scenarios that use `latest_transcript()`, `glob("*/transcripts/*.txt")`, or `stat().st_mtime` transcript selection.
3. Eval listing/reporting now carries a `claim_type` so `SHIP` is interpreted within one of:
   - `discriminative-lift`
   - `non-regression`
   - `self-improvement-smoke`
   - `infra`
4. A minimal self-improvement closed-loop scenario skeleton was added: `eval-optional-learning-closed-loop-self-improvement`.

## Recommended next work order

1. Rerun the strongest SDD/refining lift suite at `k >= 5` with baseline/treatment.
2. Add explicit `## Claim Type` metadata to ambiguous scenarios where inference is too conservative or too broad.
3. Add a read-only learning audit command.
4. Redesign observation thresholds around distinct sessions and completed tool-call pairs.
5. Turn the closed-loop self-improvement skeleton into a regularly run gate after reviewing its assertions.

## Bottom line

ArcForge has enough evidence to say:

```text
Some always-on surfaces are safe/non-regressive, and several SDD/refining workflows show promising A/B lift.
```

ArcForge does not yet have enough evidence to say:

```text
The user-scope plugin broadly makes Claude Code better, or its self-improvement loop is already effective in production.
```
