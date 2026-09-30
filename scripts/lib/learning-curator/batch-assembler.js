/**
 * batch-assembler.js — Layer 3 CuratorBatch assembler.
 *
 * Exports:
 *   assembleBatch({ project, homeDir? })
 *     → { batch_id, batch_hash, manifest_path, prompt_path, project }
 *
 * Paths derive from homeDir when given, else from getArcforgeHome() at call time,
 * so ARCFORGE_HOME redirects the whole tree and tests can still redirect HOME.
 *
 * PR #31 reconcile 1.9: all evidence strings pass through sanitize-observation.js before
 * they enter the prompt or manifest.
 *
 * Layer 3 contracts (layer-3-curator-batch-assembly.md):
 * - Deterministic selection, project-scope only
 * - CuratorBatchManifest persisted for every run
 * - CuratorBatch itself is ephemeral (not written to disk by default)
 * - safety metadata stamps sanitizer_policy_version = "v1"
 * - Never reads Layer 5/6/7/8; never calls LLM; never assigns candidate IDs
 */

const fs = require('node:fs');
const path = require('node:path');

const { sanitizeObservationPayload, SANITIZER_POLICY_VERSION } = require('../sanitize-observation');
const { atomicWriteFile, sha256Truncated, getArcforgeHome } = require('../utils');
const { MAX_DIARIES, MAX_REFLECTS, MAX_RECALLS, readRecentEvidence } = require('./evidence-files');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Per Section 4 Slice E + Layer 3 open question #2: first-slice bounds
const MAX_OBSERVATIONS = 200;
const MAX_CHARS_PER_ITEM = 1000;
const MAX_CHARS_TOTAL = 100000;
const SELECTION_POLICY_VERSION = 'v1';

// ---------------------------------------------------------------------------
// Path helpers — evaluated at call time so tests can redirect HOME
// ---------------------------------------------------------------------------

function getArcforgeDir(homeDir) {
  // An explicit homeDir (tests) keeps the historical <home>/.arcforge shape;
  // otherwise resolve through the shared resolver so ARCFORGE_HOME redirects the
  // whole tree. Before v6/P5 this fell back to os.homedir(), so an "isolated"
  // eval trial or probe still wrote into the real user home.
  return homeDir ? path.join(homeDir, '.arcforge') : getArcforgeHome();
}

function getObsDir(homeDir) {
  return path.join(getArcforgeDir(homeDir), 'observations');
}

function getBatchesDir(homeDir) {
  return path.join(getArcforgeDir(homeDir), 'learning', 'curator-batches');
}

// ---------------------------------------------------------------------------
// Compact UTC timestamp for IDs: 20260521T010000Z
// ---------------------------------------------------------------------------

function compactUtc(dt) {
  return dt
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

// ---------------------------------------------------------------------------
// Read observations
// ---------------------------------------------------------------------------

function readObservations(homeDir, project) {
  const obsPath = path.join(getObsDir(homeDir), project, 'observations.jsonl');
  if (!fs.existsSync(obsPath)) return [];

  const content = fs.readFileSync(obsPath, 'utf8');
  const lines = content.split('\n').filter((l) => l.trim());
  const records = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line));
    } catch {
      // skip corrupted lines
    }
  }
  return records;
}

const readRecentDiaries = (homeDir, project, sinceMs) =>
  readRecentEvidence('diary', getArcforgeDir(homeDir), project, sinceMs);
const readRecentReflects = (homeDir, project, sinceMs) =>
  readRecentEvidence('reflect', getArcforgeDir(homeDir), project, sinceMs);
const readRecentRecalls = (homeDir, project, sinceMs) =>
  readRecentEvidence('recall', getArcforgeDir(homeDir), project, sinceMs);

// ---------------------------------------------------------------------------
// Build evidence items from observation records
// ---------------------------------------------------------------------------

function buildEvidenceItems(records, projectName, projectId) {
  const items = [];
  let totalChars = 0;
  const omissions = [];
  let omittedOverLimit = 0;

  // Take the last MAX_OBSERVATIONS records (most recent)
  const candidates = records.slice(-MAX_OBSERVATIONS);
  const scanned = records.length;
  const omittedBeforeSelect = Math.max(0, records.length - MAX_OBSERVATIONS);
  if (omittedBeforeSelect > 0) {
    omissions.push({
      reason: 'over_item_limit',
      source_type: 'observation',
      count: omittedBeforeSelect,
      detail: `Only last ${MAX_OBSERVATIONS} observations selected`,
    });
  }

  for (let i = 0; i < candidates.length; i++) {
    const rec = candidates[i];

    // Build sanitized summary fields from the names the observe hook actually
    // writes. `buildObservedEvidence` (hooks/observe/main.js) emits `input`
    // (Bash command), `path` (Read/Edit/Write file) and `pattern` (Grep/Glob) —
    // it has never written `*_summary`. Reading the `*_summary` names here left
    // all three permanently undefined, so every batch reached the curator with
    // tool names and timestamps only and Layer 4 had nothing to reason about.
    // Fixed in v6/P5; `tests/scripts/curator-evidence-seam.test.js` is the lock.
    //
    // The ITEM-side names below stay `*_summary` on purpose: they describe what
    // the value is (a sanitized summary), they are what the prompt renders, and
    // `pattern_summary` is shared with reflect evidence, which populates it
    // through EVIDENCE_KIND_CONFIG.
    const inputSummary =
      typeof rec.input === 'string'
        ? sanitizeObservationPayload(rec.input, MAX_CHARS_PER_ITEM)
        : undefined;
    const pathSummary =
      typeof rec.path === 'string' ? sanitizeObservationPayload(rec.path, 300) : undefined;
    const patternSummary =
      typeof rec.pattern === 'string' ? sanitizeObservationPayload(rec.pattern, 300) : undefined;

    // Char budget check
    const itemChars =
      (inputSummary ? inputSummary.length : 0) +
      (pathSummary ? pathSummary.length : 0) +
      (patternSummary ? patternSummary.length : 0) +
      100; // overhead estimate for metadata fields

    if (totalChars + itemChars > MAX_CHARS_TOTAL) {
      omittedOverLimit++;
      continue;
    }
    totalChars += itemChars;

    const evidenceId = `ev_obs_${String(i).padStart(4, '0')}_${sha256Truncated(
      `${rec.ts || ''}${rec.session || ''}${rec.tool || ''}`,
      8,
    )}`;

    const item = {
      evidence_id: evidenceId,
      evidence_type: 'observation',
      ts: rec.ts || '',
      session: rec.session || '',
      project: rec.project || projectName,
      project_id: rec.project_id || projectId,
      event: rec.event || 'tool_start',
      tool: rec.tool || 'unknown',
      outcome: rec.outcome,
      evidence_status: rec.evidence_status || 'present',
      source_ref: {
        store: 'observations.jsonl',
      },
    };

    if (inputSummary !== undefined) item.input_summary = inputSummary;
    if (pathSummary !== undefined) item.path_summary = pathSummary;
    if (patternSummary !== undefined) item.pattern_summary = patternSummary;
    if (rec.skill) item.skill = rec.skill;
    if (rec.operation_kind) item.operation_kind = rec.operation_kind;
    if (rec.derived) item.derived = rec.derived;
    if (typeof rec.output_bytes === 'number') item.output_bytes = rec.output_bytes;

    items.push(item);
  }

  if (omittedOverLimit > 0) {
    omissions.push({
      reason: 'over_char_limit',
      source_type: 'observation',
      count: omittedOverLimit,
      detail: `Omitted to stay within ${MAX_CHARS_TOTAL} char total budget`,
    });
  }

  return { items, scanned, selected: candidates.length - omittedOverLimit, omissions };
}

// ---------------------------------------------------------------------------
// Aggregate context (deterministic, no candidate recommendations)
// ---------------------------------------------------------------------------

function buildAggregateContext(evidenceItems) {
  const toolCounts = {};
  const outcomeCounts = { success: 0, error: 0, unknown: 0 };
  const sessions = new Set();

  for (const item of evidenceItems) {
    if (item.tool) toolCounts[item.tool] = (toolCounts[item.tool] || 0) + 1;
    if (item.session) sessions.add(item.session);
    const oc = item.outcome || 'unknown';
    if (oc in outcomeCounts) outcomeCounts[oc]++;
    else outcomeCounts.unknown++;
  }

  return {
    session_count: sessions.size,
    observation_count: evidenceItems.length,
    tool_counts: toolCounts,
    outcome_counts: outcomeCounts,
  };
}

// ---------------------------------------------------------------------------
// Prompt template rendering
// ---------------------------------------------------------------------------

function renderPrompt({ projectName, batchId, batchHash, evidenceItems, diaryItems }) {
  const promptTemplatePath = path.join(__dirname, 'observer-prompt.md');

  let template;
  try {
    template = fs.readFileSync(promptTemplatePath, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read observer-prompt.md: ${err.message}`);
  }

  // Build evidence section
  const evidenceSection = evidenceItems
    .map((item) => {
      const lines = [
        `**evidence_id**: ${item.evidence_id}`,
        `**evidence_type**: ${item.evidence_type}`,
        `**ts**: ${item.ts}`,
        `**tool**: ${item.tool}`,
        `**event**: ${item.event}`,
        `**session**: ${item.session}`,
        `**project**: ${item.project}`,
      ];
      if (item.input_summary) lines.push(`**input_summary**: ${item.input_summary}`);
      if (item.path_summary) lines.push(`**path_summary**: ${item.path_summary}`);
      if (item.pattern_summary) lines.push(`**pattern_summary**: ${item.pattern_summary}`);
      // operation_kind distinguishes a read from an edit on the same path — the
      // single most useful workflow signal in the batch. It was attached to the
      // item but never rendered, so the curator could not tell them apart.
      if (item.operation_kind) lines.push(`**operation_kind**: ${item.operation_kind}`);
      if (item.skill) lines.push(`**skill**: ${item.skill}`);
      if (item.outcome) lines.push(`**outcome**: ${item.outcome}`);
      // Items whose evidence was omitted upstream stay in the batch for
      // completeness, but the ingestor rejects any proposal citing one
      // (`evidence_ref_omitted_upstream`). Rendering the status is what makes
      // that rule followable — without it the curator cannot tell which items
      // are citable, and the prompt rule would be unactionable advice.
      if (item.evidence_status && item.evidence_status !== 'present') {
        lines.push(`**evidence_status**: ${item.evidence_status} — DO NOT CITE`);
      }
      return lines.join('\n');
    })
    .join('\n\n---\n\n');

  // Build diary section from DiaryEvidenceItem[]
  let diarySection;
  if (diaryItems.length > 0) {
    diarySection = diaryItems
      .map((item, i) => {
        const body = item.summary || '';
        return `### Diary ${i + 1} (${item.evidence_id})\n\n${body}`;
      })
      .join('\n\n');
  } else {
    diarySection = 'None';
  }

  // Substitute placeholders. Use callback form for String.prototype.replace —
  // a literal-string replacement would interpret `$&`, `$1`-`$9`, `$$`, `$\``
  // inside evidence text as backrefs (see MDN). Sanitized evidence COULD
  // legitimately contain `$&` etc. as part of a command, so a literal
  // replacement is unsafe.
  const rendered = template
    .replace(/\{\{PROJECT\}\}/g, () => projectName)
    .replace(/\{\{BATCH_ID\}\}/g, () => batchId)
    .replace(/\{\{BATCH_HASH\}\}/g, () => batchHash)
    .replace(/\{\{EVIDENCE_ITEMS\}\}/g, () => evidenceSection)
    .replace(/\{\{DIARY_CONTEXT\}\}/g, () => diarySection)
    .replace(/\{\{OBSERVATION_COUNT\}\}/g, () => String(evidenceItems.length));

  return rendered;
}

// ---------------------------------------------------------------------------
// Derive project_id from observations (fall back to hash of project name)
// ---------------------------------------------------------------------------

function deriveProjectId(records, projectName) {
  // Prefer the recorded project_id from any observation — observations carry
  // project_id derived from the absolute CLAUDE_PROJECT_DIR at capture time
  // (see hooks/observe/main.js + scripts/lib/learning.js getProjectId).
  for (const rec of records) {
    if (rec.project_id && typeof rec.project_id === 'string') return rec.project_id;
  }
  // Fallback ONLY when no observation carries a project_id (legacy / empty
  // history). Hashes the observation-store dir name as a deterministic last
  // resort — this differs from learning.js getProjectId which hashes the
  // resolved project root path. The two will agree as soon as the next
  // observation lands carrying a real project_id.
  return sha256Truncated(projectName, 16);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Assemble a Layer 3 CuratorBatch for a project.
 *
 * @param {object} options
 * @param {string} options.project — project slug (directory name under observations/)
 * @param {string} [options.homeDir] — override home directory (tests use this)
 * @param {string} [options.since] — ISO instant the opt-in took effect; only
 *   observations whose `ts` is at or after it are read (learning B-1)
 * @param {number} [options.minObservations] — with fewer eligible observations
 *   nothing is written and `{ skipped: 'too_few_observations', ... }` returns
 * @returns {{ batch_id, batch_hash, manifest_path, prompt_path, project }}
 */
function assembleBatch({ project, homeDir: homeOverride, since, minObservations } = {}) {
  if (typeof project !== 'string' || !project.trim()) {
    throw new Error('assembleBatch: project must be a non-empty string');
  }
  const sinceMs = since === undefined ? null : Date.parse(since);
  if (Number.isNaN(sinceMs)) {
    throw new Error(`assembleBatch: since must be an ISO timestamp (got "${since}")`);
  }

  const homeDir = homeOverride;
  const now = new Date();
  const createdAt = now.toISOString();

  // Read evidence. Under a `since`, a row counts only when its own `ts` says it
  // was recorded under the current opt-in; an unparseable `ts` does not.
  const readObs = readObservations(homeDir, project);
  const allObs =
    sinceMs === null ? readObs : readObs.filter((rec) => Date.parse(rec.ts) >= sinceMs);
  if (Number.isInteger(minObservations) && allObs.length < minObservations) {
    return {
      skipped: 'too_few_observations',
      project,
      eligible: allObs.length,
      minimum: minObservations,
    };
  }
  const projectId = deriveProjectId(allObs, project);
  const {
    items: obsItems,
    scanned,
    selected,
    omissions,
  } = buildEvidenceItems(allObs, project, projectId);

  // Read diary, reflect, recall evidence
  const {
    items: diaryItems,
    scanned: diaryScanned,
    selected: diarySelected,
  } = readRecentDiaries(homeDir, project, sinceMs);
  const {
    items: reflectItems,
    scanned: reflectScanned,
    selected: reflectSelected,
  } = readRecentReflects(homeDir, project, sinceMs);
  const {
    items: recallItems,
    scanned: recallScanned,
    selected: recallSelected,
  } = readRecentRecalls(homeDir, project, sinceMs);

  // Merge all evidence items: observations first, then diary/reflect/recall
  const evidenceItems = [...obsItems, ...diaryItems, ...reflectItems, ...recallItems];

  // Compute batch_id components
  const idTimestamp = compactUtc(now);
  // hash = SHA-256 of (project + policy_version + sorted evidence_ids + obs_count)
  const idHashInput = `${project}|${SELECTION_POLICY_VERSION}|${evidenceItems.map((e) => e.evidence_id).join(',')}|${allObs.length}`;
  const batchIdHash = sha256Truncated(idHashInput, 12);
  const batchId = `batch_${idTimestamp}_${batchIdHash}`;

  // Aggregate context
  const aggregateContext = buildAggregateContext(obsItems);

  // Quality inputs (v1 formula: project_obs_count only)
  const qualityInputs = {
    project_observation_count: allObs.length,
    selected_evidence_count: evidenceItems.length,
    selected_by_type: {
      observation: obsItems.length,
      diary: diaryItems.length,
      reflect: reflectItems.length,
      recall: recallItems.length,
      session_summary: 0,
    },
    session_span: {
      session_count: aggregateContext.session_count,
      first_ts: obsItems.length > 0 ? obsItems[0].ts : undefined,
      last_ts: obsItems.length > 0 ? obsItems[obsItems.length - 1].ts : undefined,
    },
    signal_mix: {
      has_user_correction: false,
      has_manual_recall: recallItems.length > 0,
      has_reflect_pattern: reflectItems.length > 0,
      has_error_repair_sequence: false,
      has_repeated_observation_sequence: false,
    },
  };

  const limits = {
    max_items: MAX_OBSERVATIONS,
    max_chars_total: MAX_CHARS_TOTAL,
    max_chars_per_item: MAX_CHARS_PER_ITEM,
    truncation_applied: omissions.some((o) => o.reason === 'over_char_limit'),
  };

  const safety = {
    llm_visible: true,
    raw_hook_payloads_included: false,
    raw_transcripts_included: false,
    raw_response_bodies_included: false,
    edit_bodies_included: false,
    skill_args_included: false,
    quarantine_sources_included: false,
    sanitizer_policy_version: SANITIZER_POLICY_VERSION,
  };

  // Compute batch_hash — SHA-256 of the canonical batch body, truncated to 12 chars
  const batchBody = JSON.stringify({
    evidence_items: evidenceItems,
    scope: { kind: 'project', project, project_id: projectId },
    selection_policy_version: SELECTION_POLICY_VERSION,
    quality_inputs: qualityInputs,
  });
  const batchHash = sha256Truncated(batchBody, 12);

  // Render prompt
  const promptContent = renderPrompt({
    projectName: project,
    batchId,
    batchHash,
    evidenceItems,
    diaryItems,
  });

  // Persist manifest and prompt
  const batchesDir = getBatchesDir(homeDir);
  fs.mkdirSync(batchesDir, { recursive: true });

  const manifestPath = path.join(batchesDir, `${batchId}.manifest.json`);
  const promptPath = path.join(batchesDir, `${batchId}.prompt.txt`);

  const selectionPolicy = {
    policy_version: SELECTION_POLICY_VERSION,
    max_observations: MAX_OBSERVATIONS,
    max_diaries: MAX_DIARIES,
    max_reflections: MAX_REFLECTS,
    max_recalls: MAX_RECALLS,
    max_transcript_summaries: 0,
    ordering: 'chronological',
    selection_rules: ['recent'],
    deterministic: true,
  };

  const manifest = {
    schema_version: 1,
    batch_id: batchId,
    created_at: createdAt,
    scope: { kind: 'project', project, project_id: projectId },
    batch_hash: batchHash,
    selection_policy: selectionPolicy,
    source_windows: {
      observations: {
        store: 'observations.jsonl',
        records_scanned: scanned,
        records_selected: selected,
        records_omitted: scanned - selected,
      },
      diaries: {
        records_scanned: diaryScanned,
        records_selected: diarySelected,
      },
      reflects: {
        records_scanned: reflectScanned,
        records_selected: reflectSelected,
      },
      recalls: {
        records_scanned: recallScanned,
        records_selected: recallSelected,
      },
      transcript_summaries: {
        available: false,
        unavailable_reason: 'source_not_implemented',
      },
    },
    quality_inputs: qualityInputs,
    limits,
    omissions,
    safety,
    handed_to_layer4: false,
    snapshot_saved: false,
    // evidence_ids list: needed by ingest-proposal for evidence_ref validation
    evidence_ids: evidenceItems.map((e) => e.evidence_id),
    // evidence_status_by_id: needed by ingest-proposal for evidence_ref_omitted_upstream check
    evidence_status_by_id: Object.fromEntries(
      evidenceItems.map((e) => [e.evidence_id, e.evidence_status]),
    ),
    // evidence_type_by_id: needed by ingest-proposal for evidence_type_mismatch check
    evidence_type_by_id: Object.fromEntries(
      evidenceItems.map((e) => [e.evidence_id, e.evidence_type]),
    ),
  };

  // Atomic writes (sibling tmp + rename) prevent truncated files on crash —
  // a partial manifest would silently fail JSON.parse in proposal-ingestor.
  atomicWriteFile(manifestPath, JSON.stringify(manifest, null, 2));
  atomicWriteFile(promptPath, promptContent);

  return {
    batch_id: batchId,
    batch_hash: batchHash,
    manifest_path: manifestPath,
    prompt_path: promptPath,
    project,
  };
}

/**
 * Read a CuratorBatchManifest by batch_id.
 *
 * @param {string} batchId
 * @param {string} [homeDir]
 * @returns {object} manifest JSON
 */
function readBatchManifest(batchId, homeDir) {
  const h = homeDir;
  const manifestPath = path.join(getBatchesDir(h), `${batchId}.manifest.json`);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Batch manifest not found: ${manifestPath}`);
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

module.exports = { assembleBatch, readBatchManifest };
