# Eval: daemon-candidate-generation

**Status**: Active — Layer 3→4→5 pipeline produces a valid Candidate v1 record.

## Scope
learning

## Target
scripts/lib/learning-curator/batch-assembler.js, scripts/lib/learning-curator/proposal-ingestor.js

## Scenario
This is a code-grader-only eval (no Claude agent trial). It validates that the
Layer 3 → Layer 5 pipeline (batch assembly + proposal ingestion) produces a
valid Candidate v1 entry in `queue.jsonl` when given fixture observations.

The eval:
1. Writes fixture observations to `$HOME/.arcforge/observations/test-project/observations.jsonl`
2. Calls `assembleBatch({ project: 'test-project', homeDir })` to create a batch manifest
3. Writes a stub LLM response file (no real LLM invoked) with a syntactically valid proposal
4. Calls `ingestProposal({ batchId, responseFile, homeDir })` to run Layer 5 validation
5. Reads `queue.jsonl` and verifies the resulting candidate record

No Claude agent session is required — all assertions are deterministic code checks.

Constraints:
- All file I/O is directed to TRIAL_DIR (no writes to real HOME).
- The stub LLM response must use evidence_ids from the assembled batch manifest.
- The resulting candidate must pass validateCandidateV1.

## Context
This eval is the integration gate for the daemon-curator path. It does not test the
LLM step (Layer 4 is stubbed) — it tests that Layer 3 produces a valid batch and that
Layer 5 accepts a correctly-shaped proposal from that batch.

Key invariants being verified:
- `lifecycle.status === 'pending_review'` — accepted candidates always start here
- `candidate_id` matches the `cand_<type>_<ts>_<hash>` pattern
- `evidence_quality` field is populated
- Safety flags (`raw_prompt_included: false`, etc.) are all false
- No raw observation paths or secrets in body/evidence

## Preflight
skip

## Verdict Policy
non-regression

## Setup
node - <<'JS'
// Purely deterministic setup — no Claude agent needed.
// This script pre-builds the fixture so the Grader Config can validate it.
// If this setup script exits non-zero, the trial setup fails.

const path = require('path');
const fs = require('fs');
const os = require('os');

const trialDir = process.env.TRIAL_DIR || process.cwd();
const projectRoot = process.env.PROJECT_ROOT || path.join(__dirname, '../..');

// Redirect HOME so all learning artifacts go to TRIAL_DIR
process.env.HOME = trialDir;

// Write fixture observations (sanitized — no raw content, no secrets)
const obsDir = path.join(trialDir, '.arcforge', 'observations', 'test-project');
fs.mkdirSync(obsDir, { recursive: true });

const now = new Date().toISOString();
const observations = [
  {
    schema_version: 1,
    obs_id: 'obs_001',
    ts: now,
    event: 'tool_end',
    session: 'sess_fixture_a',
    project: 'test-project',
    project_id: 'proj_test_fixture',
    tool: 'Bash',
    source: { collector: 'hooks/observe/main.js', hook_event: 'PostToolUse' },
    evidence_status: 'present',
    tool_summary: 'bash command completed',
  },
  {
    schema_version: 1,
    obs_id: 'obs_002',
    ts: now,
    event: 'tool_end',
    session: 'sess_fixture_b',
    project: 'test-project',
    project_id: 'proj_test_fixture',
    tool: 'Edit',
    source: { collector: 'hooks/observe/main.js', hook_event: 'PostToolUse' },
    evidence_status: 'present',
    tool_summary: 'file edit completed',
  },
  {
    schema_version: 1,
    obs_id: 'obs_003',
    ts: now,
    event: 'tool_end',
    session: 'sess_fixture_c',
    project: 'test-project',
    project_id: 'proj_test_fixture',
    tool: 'Bash',
    source: { collector: 'hooks/observe/main.js', hook_event: 'PostToolUse' },
    evidence_status: 'present',
    tool_summary: 'bash command completed',
  },
];
fs.writeFileSync(
  path.join(obsDir, 'observations.jsonl'),
  observations.map(o => JSON.stringify(o)).join('\n') + '\n',
  'utf8',
);

// Call assembleBatch
const { assembleBatch } = require(path.join(projectRoot, 'scripts/lib/learning-curator/batch-assembler.js'));
const batchResult = assembleBatch({ project: 'test-project', homeDir: trialDir });

if (!batchResult || !batchResult.batch_id) {
  console.error('Setup FAILED: assembleBatch did not return a batch_id');
  process.exit(1);
}

const batchId = batchResult.batch_id;
const batchHash = batchResult.batch_hash;

// Read the batch manifest to get actual evidence_ids
const batchesDir = path.join(trialDir, '.arcforge', 'learning', 'curator-batches');
const batchManifestPath = path.join(batchesDir, `${batchId}.manifest.json`);
const batchManifest = JSON.parse(fs.readFileSync(batchManifestPath, 'utf8'));
const evidenceIds = batchManifest.evidence_ids || [];

if (evidenceIds.length === 0) {
  console.error('Setup FAILED: batch manifest has no evidence_ids');
  process.exit(1);
}

// Write stub LLM response file (simulates claude --json-schema output)
const stubPayload = {
  schema_version: 1,
  source: {
    layer: 4,
    curator: 'claude-sonnet',
    run_id: `run_fixture_${Date.now()}`,
    created_at: now,
    batch_id: batchId,
    batch_hash: batchHash,
    prompt_policy_version: 'v1',
    output_schema_version: 1,
  },
  proposals: [
    {
      proposal_index: 0,
      artifact_type: 'instinct',
      proposed_scope: { kind: 'project', project_id: 'proj_test_fixture' },
      name: 'prefer-edit-over-bash-for-file-writes',
      summary: 'Use Edit tool for file writes rather than Bash redirect commands.',
      rationale: 'Observed in multiple sessions that Edit tool produces cleaner diffs.',
      domain: 'tool-preference',
      body: 'When writing to files, prefer the Edit tool over Bash redirect commands. This produces cleaner git diffs and safer partial-file edits.',
      body_source: 'llm_curator',
      evidence_refs: [
        { evidence_id: evidenceIds[0], evidence_type: 'observation', relevance: 'direct' },
      ],
      llm_confidence: 'medium',
      risk_notes: [],
      uncertainty_notes: ['Based on limited observation sample.'],
      recommended_review_action: 'review',
    },
  ],
};

// The daemon wraps the payload in a CLI envelope { structured_output: payload }
const cliEnvelope = { structured_output: stubPayload };
const responseFile = path.join(trialDir, 'stub_llm_response.json');
fs.writeFileSync(responseFile, JSON.stringify(cliEnvelope, null, 2), 'utf8');

// Save batchId + responseFile for the grader
const ctx = { batchId, responseFile, homeDir: trialDir };
fs.writeFileSync(path.join(trialDir, '_eval_ctx.json'), JSON.stringify(ctx, null, 2), 'utf8');

console.log(`Setup complete: batchId=${batchId}, evidenceIds=${evidenceIds.length}`);
JS

## Assertions
- [ ] A1: A new `queue.jsonl` entry exists with a `candidate_id` matching the `cand_instinct_` pattern.
- [ ] A2: The candidate validates against `validateCandidateV1` (no validation errors).
- [ ] A3: `lifecycle.status === 'pending_review'` on the accepted candidate.
- [ ] A4: No secret-shaped strings (API keys, tokens) appear in candidate body or evidence fields.
- [ ] A5: Safety flags (`raw_prompt_included`, `raw_response_included`, etc.) are all `false` in the candidate's safety metadata.

## Grader
code

## Grader Config
node - <<'JS'
const path = require('path');
const fs = require('fs');

const trialDir = process.env.TRIAL_DIR || process.cwd();
const projectRoot = process.env.PROJECT_ROOT || path.join(__dirname, '../..');

// The grader CALLS the pipeline and checks the result.
// It does NOT run a Claude agent — pure Node determinism.

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
  // Load eval context from setup
  const ctxPath = path.join(trialDir, '_eval_ctx.json');
  if (!fs.existsSync(ctxPath)) {
    emit('A1', false, 'missing _eval_ctx.json — setup did not complete');
    emit('A2', false, 'setup incomplete');
    emit('A3', false, 'setup incomplete');
    emit('A4', false, 'setup incomplete');
    emit('A5', false, 'setup incomplete');
    process.exit(1);
  }

  const { batchId, responseFile, homeDir } = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));

  // Run ingestProposal
  const { ingestProposal } = require(path.join(projectRoot, 'scripts/lib/learning-curator/proposal-ingestor.js'));
  const result = ingestProposal({ batchId, responseFile, homeDir });

  if (!result || result.accepted < 1) {
    emit('A1', false, `ingestProposal returned accepted=${result?.accepted ?? 0}`);
    allPass = false;
  }

  // Read queue.jsonl
  const queuePath = path.join(homeDir, '.arcforge', 'learning', 'candidates', 'queue.jsonl');
  if (!fs.existsSync(queuePath)) {
    emit('A1', false, 'queue.jsonl does not exist after ingestProposal');
    emit('A2', false, 'no queue to validate');
    emit('A3', false, 'no queue to check');
    emit('A4', false, 'no queue to scan');
    emit('A5', false, 'no queue to inspect');
    process.exit(1);
  }

  const lines = fs.readFileSync(queuePath, 'utf8').trim().split('\n').filter(Boolean);
  const events = lines.map(l => JSON.parse(l));

  // Find the candidate.created event
  const createdEvent = events.find(e => e.event_type === 'candidate.created' && e.record);
  const candidate = createdEvent ? createdEvent.record : null;

  // A1: candidate_id pattern cand_instinct_...
  const a1 = candidate && /^cand_instinct_/.test(candidate.candidate_id);
  emit('A1', a1, a1 ? '' : `candidate_id=${candidate?.candidate_id} does not match cand_instinct_ pattern`);
  if (!a1) allPass = false;

  // A2: validateCandidateV1
  if (candidate) {
    const { validateCandidateV1 } = require(path.join(projectRoot, 'scripts/lib/learning-curator/schema.js'));
    const validResult = validateCandidateV1(candidate);
    const a2 = validResult.ok === true;
    emit('A2', a2, a2 ? '' : `validateCandidateV1 failed: ${JSON.stringify(validResult.reasons?.slice(0,3))}`);
    if (!a2) allPass = false;
  } else {
    emit('A2', false, 'no candidate record in queue.jsonl');
    allPass = false;
  }

  // A3: lifecycle.status === 'pending_review'
  const a3 = candidate && candidate.lifecycle && candidate.lifecycle.status === 'pending_review';
  emit('A3', a3, a3 ? '' : `lifecycle.status=${candidate?.lifecycle?.status}`);
  if (!a3) allPass = false;

  // A4: no secret-shaped strings in body / evidence summary fields
  const secretPattern = /sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}|Bearer [a-zA-Z0-9+/]{20,}|api[_-]?key[_-]?[:=][^\s]{8,}/i;
  const bodyText = candidate ? (candidate.body || '') : '';
  const evidenceText = candidate ? JSON.stringify(candidate.evidence || []) : '';
  const a4 = !secretPattern.test(bodyText) && !secretPattern.test(evidenceText);
  emit('A4', a4, a4 ? '' : 'secret-shaped string found in candidate body or evidence');
  if (!a4) allPass = false;

  // A5: safety flags are all false
  const safety = candidate ? candidate.safety : null;
  const safetyFlagNames = [
    'raw_prompt_included',
    'raw_response_included',
    'raw_hook_payloads_included',
    'raw_transcripts_included',
    'edit_bodies_included',
    'skill_args_included',
  ];
  const badFlags = safetyFlagNames.filter(f => safety && safety[f] !== false);
  const a5 = safety !== null && safety !== undefined && badFlags.length === 0;
  emit('A5', a5, a5 ? '' : `safety flags not false: ${badFlags.join(', ')} (safety=${JSON.stringify(safety)})`);
  if (!a5) allPass = false;

} catch (err) {
  emit('A1', false, `grader exception: ${err.message}`);
  emit('A2', false, 'grader exception');
  emit('A3', false, 'grader exception');
  emit('A4', false, 'grader exception');
  emit('A5', false, 'grader exception');
  process.exit(1);
}

process.exit(allPass ? 0 : 1);
JS

## Trials
3

## Version
1
