# Eval: evolve-quality

**Status**: Active — Dashboard [Evolve] structural integrity gate.

## Scope
learning

## Target
scripts/lib/learning-dashboard.js

## Scenario
This is a code-grader-only eval (no Claude agent trial). It validates the structural
output of the Dashboard `[Evolve]` action against the Layer 5 and Layer 6 contracts.

The eval:
1. Writes a pre-built `queue.jsonl` with an `approved` instinct candidate as the source
2. Calls `applyDashboardAction({ candidateId, action: 'evolve', homeDir })` directly via Node
3. Reads the resulting `queue.jsonl` and verifies the evolved candidate's structure

**Scope of this eval (Slice H.1)**: structural assertions only — `artifact_type`, `relationships`,
`body_source`, and source status preservation. The body content quality (whether the evolved
skill body is meaningfully distinct from the source instinct body) is NOT asserted here.

**Future enhancement note**: After a later slice adds an LLM-rewrite step to `[Evolve]`,
add a model-grader assertion that the evolved skill body is a coherent skill-shaped expansion
of the source instinct, not a verbatim copy. That assertion would FAIL on the current
implementation (which simply copies the source body) and should be added only after the
evolve-body LLM rewrite is implemented.

Constraints:
- All file I/O is directed to TRIAL_DIR (no writes to real HOME).
- The source candidate must be in `approved` status (legal per the action × status matrix).
- Grader invokes the dashboard function directly — no HTTP server needed.

## Context
From `layer-5-candidate-queue-lifecycle.md`, the action × status matrix:

```
status \ action  │ evolve
─────────────────────────
approved         │   ✓
```

And from the Relationships spec:

```ts
type CandidateRelationships = {
  evolved_from_candidate_ids?: string[];
  evolved_to_candidate_id?: string;
};
```

The `[Evolve]` action is candidate-producing, not status-changing. The source candidate's
`lifecycle.status` must remain `approved` after the evolve action.

This eval is the integration gate ensuring the dashboard correctly creates the evolved
candidate record with the right `artifact_type`, `relationships`, and `body_source` values,
and that the source candidate is not inadvertently mutated.

## Preflight
skip

## Verdict Policy
non-regression

## Setup
node - <<'JS'
const path = require('path');
const fs = require('fs');

const trialDir = process.env.TRIAL_DIR || process.cwd();
const projectRoot = process.env.PROJECT_ROOT || path.join(__dirname, '../..');

process.env.HOME = trialDir;

// Build the candidates directory and queue.jsonl with an approved instinct candidate
const candidatesDir = path.join(trialDir, '.arcforge', 'learning', 'candidates');
fs.mkdirSync(candidatesDir, { recursive: true });

const now = new Date().toISOString();
const sourceCandidateId = 'cand_instinct_source_evolve_001';

const sourceRecord = {
  schema_version: 1,
  candidate_id: sourceCandidateId,
  artifact_type: 'instinct',
  scope: { kind: 'project', project: 'test-project', project_id: 'proj_test_001' },
  source: { source_type: 'layer4_llm_curator' },
  name: 'always-verify-before-commit',
  summary: 'Run tests before every git commit.',
  rationale: 'Observed in 3 sessions where commits skipped tests.',
  body: 'Always run tests before committing. If tests fail, fix them before proceeding with the commit.',
  body_source: 'llm_curator',
  domain: 'workflow',
  evidence: [
    { evidence_id: 'ev-001', evidence_type: 'observation', relevance: 'direct', summary: 'test skip observed' }
  ],
  evidence_quality: 'low',
  evidence_quality_metadata: { rule_version: 'v1', basis: { project_obs_count: 50 } },
  lifecycle: { status: 'approved', status_changed_at: now },
  safety: {
    raw_prompt_included: false,
    raw_response_included: false,
    raw_hook_payloads_included: false,
    raw_transcripts_included: false,
    edit_bodies_included: false,
    skill_args_included: false,
  },
  dedupe: {
    dedupe_key: 'always-verify-before-commit-v1',
    dedupe_basis: {
      scope_kind: 'project',
      artifact_type: 'instinct',
      normalized_name: 'always-verify-before-commit',
      normalized_body_hash: 'abc123def',
    }
  },
  created_at: now,
  updated_at: now,
};

const createdEvent = {
  schema_version: 1,
  event_id: 'evt_source_001',
  ts: now,
  candidate_id: sourceCandidateId,
  event_type: 'candidate.created',
  actor: { layer: 5, actor_type: 'validator' },
  record: sourceRecord,
};

const approvedEvent = {
  schema_version: 1,
  event_id: 'evt_source_002',
  ts: now,
  candidate_id: sourceCandidateId,
  event_type: 'candidate.transitioned',
  actor: { layer: 6, actor_type: 'dashboard' },
  previous_status: 'pending_review',
  next_status: 'approved',
  transition: { action_id: 'dash_approve_fixture_001' },
};

const queuePath = path.join(candidatesDir, 'queue.jsonl');
fs.writeFileSync(queuePath, [createdEvent, approvedEvent].map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');

// Save context for grader
const ctx = { sourceCandidateId, homeDir: trialDir, queuePath };
fs.writeFileSync(path.join(trialDir, '_eval_ctx.json'), JSON.stringify(ctx, null, 2), 'utf8');

console.log(`Setup complete: source candidate ${sourceCandidateId} written to ${queuePath}`);
JS

## Assertions
- [ ] A1: Evolved candidate has `artifact_type === 'skill'` (evolve converts instinct → skill shape).
- [ ] A2: Evolved candidate's `relationships.evolved_from_candidate_id` or `relationships.evolved_from_candidate_ids` references the source candidate ID.
- [ ] A3: Evolved candidate's `body_source === 'dashboard_evolve'`.
- [ ] A4: Source candidate's `lifecycle.status` remains `approved` after the evolve action (evolve is candidate-producing, not status-changing).

## Grader
code

## Grader Config
node - <<'JS'
const path = require('path');
const fs = require('fs');

const trialDir = process.env.TRIAL_DIR || process.cwd();
const projectRoot = process.env.PROJECT_ROOT || path.join(__dirname, '../..');

process.env.HOME = trialDir;

function emit(label, ok, reason) {
  if (ok) {
    process.stdout.write(`${label}:PASS\n`);
  } else {
    process.stdout.write(`${label}:FAIL:${reason || ''}\n`);
  }
}

let allPass = true;

try {
  const ctxPath = path.join(trialDir, '_eval_ctx.json');
  if (!fs.existsSync(ctxPath)) {
    ['A1','A2','A3','A4'].forEach(l => emit(l, false, 'missing _eval_ctx.json — setup did not complete'));
    process.exit(1);
  }

  const { sourceCandidateId, homeDir } = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));

  // Invoke the dashboard evolve action.
  // The real export is `handleDashboardAction` with `candidate_id` snake_case
  // and no homeDir param — the function uses os.homedir() at call time which
  // we've redirected via `process.env.HOME = trialDir` above.
  const { handleDashboardAction } = require(path.join(projectRoot, 'scripts/lib/learning-dashboard.js'));
  const result = handleDashboardAction({
    candidate_id: sourceCandidateId,
    action: 'evolve',
  });

  if (!result || !result.accepted) {
    ['A1','A2','A3','A4'].forEach(l => emit(l, false, `applyDashboardAction returned: ${JSON.stringify(result)}`));
    process.exit(1);
  }

  const newCandidateId = result.new_candidate_id;

  // Replay queue.jsonl to get current candidate states
  const queuePath = path.join(homeDir, '.arcforge', 'learning', 'candidates', 'queue.jsonl');
  const lines = fs.readFileSync(queuePath, 'utf8').trim().split('\n').filter(Boolean);
  const events = lines.map(l => JSON.parse(l));

  // Reconstruct current view by replaying events
  const candidateMap = {};
  for (const evt of events) {
    if (evt.event_type === 'candidate.created' && evt.record) {
      candidateMap[evt.candidate_id] = JSON.parse(JSON.stringify(evt.record));
    } else if (evt.event_type === 'candidate.transitioned' && candidateMap[evt.candidate_id]) {
      candidateMap[evt.candidate_id].lifecycle = {
        ...candidateMap[evt.candidate_id].lifecycle,
        status: evt.next_status,
        status_changed_at: evt.ts,
      };
    } else if (evt.event_type === 'candidate.related' && candidateMap[evt.candidate_id] && evt.patch) {
      candidateMap[evt.candidate_id].relationships = {
        ...(candidateMap[evt.candidate_id].relationships || {}),
        ...evt.patch,
      };
    }
  }

  const evolvedCandidate = candidateMap[newCandidateId];
  const sourceCandidate = candidateMap[sourceCandidateId];

  if (!evolvedCandidate) {
    ['A1','A2','A3','A4'].forEach(l => emit(l, false, `evolved candidate ${newCandidateId} not found in queue`));
    process.exit(1);
  }

  // A1: artifact_type === 'skill'
  const a1 = evolvedCandidate.artifact_type === 'skill';
  emit('A1', a1, a1 ? '' : `artifact_type=${evolvedCandidate.artifact_type}, expected 'skill'`);
  if (!a1) allPass = false;

  // A2: relationships.evolved_from_candidate_id or evolved_from_candidate_ids references source
  const rels = evolvedCandidate.relationships || {};
  const evolvedFromId = rels.evolved_from_candidate_id;
  const evolvedFromIds = Array.isArray(rels.evolved_from_candidate_ids) ? rels.evolved_from_candidate_ids : [];
  const a2 = evolvedFromId === sourceCandidateId || evolvedFromIds.includes(sourceCandidateId);
  emit('A2', a2, a2 ? '' : `relationships=${JSON.stringify(rels)} does not reference source ${sourceCandidateId}`);
  if (!a2) allPass = false;

  // A3: body_source === 'dashboard_evolve'
  const a3 = evolvedCandidate.body_source === 'dashboard_evolve';
  emit('A3', a3, a3 ? '' : `body_source=${evolvedCandidate.body_source}, expected 'dashboard_evolve'`);
  if (!a3) allPass = false;

  // A4: source candidate lifecycle.status unchanged (still 'approved')
  const sourceStatus = sourceCandidate ? sourceCandidate.lifecycle.status : null;
  const a4 = sourceStatus === 'approved';
  emit('A4', a4, a4 ? '' : `source candidate status=${sourceStatus}, expected 'approved' (evolve must not change source status)`);
  if (!a4) allPass = false;

} catch (err) {
  ['A1','A2','A3','A4'].forEach(l => emit(l, false, `grader exception: ${err.message}`));
  process.exit(1);
}

process.exit(allPass ? 0 : 1);
JS

## Trials
3

## Version
1
