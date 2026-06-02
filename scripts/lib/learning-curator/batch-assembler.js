/**
 * batch-assembler.js — Layer 3 CuratorBatch assembler.
 *
 * Exports:
 *   assembleBatch({ project, homeDir? })
 *     → { batch_id, batch_hash, manifest_path, prompt_path, project }
 *
 * Paths derive from homeDir (or os.homedir() at call time) so tests can redirect HOME.
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
const os = require('node:os');

const { sanitizeObservationPayload, SANITIZER_POLICY_VERSION } = require('../sanitize-observation');
const { atomicWriteFile, sha256Truncated } = require('../utils');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Per Section 4 Slice E + Layer 3 open question #2: first-slice bounds
const MAX_OBSERVATIONS = 200;
const MAX_DIARIES = 5;
const MAX_REFLECTS = 10;
const MAX_RECALLS = 10;
const MAX_CHARS_PER_ITEM = 1000;
const MAX_CHARS_TOTAL = 100000;
const SELECTION_POLICY_VERSION = 'v1';

// ---------------------------------------------------------------------------
// Path helpers — evaluated at call time so tests can redirect HOME
// ---------------------------------------------------------------------------

function getArcforgeDir(homeDir) {
  return path.join(homeDir, '.arcforge');
}

function getObsDir(homeDir) {
  return path.join(getArcforgeDir(homeDir), 'observations');
}

function getDiariesDir(homeDir) {
  return path.join(getArcforgeDir(homeDir), 'diaries');
}

function getReflectionsDir(homeDir) {
  return path.join(getArcforgeDir(homeDir), 'reflections');
}

function getRecallsDir(homeDir) {
  return path.join(getArcforgeDir(homeDir), 'recalls');
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

// ---------------------------------------------------------------------------
// Walk a directory recursively, collecting files matching a name pattern.
// Returns { path, mtime } sorted by mtime descending.
// ---------------------------------------------------------------------------

function walkFilesByMtime(dir, namePattern) {
  const files = [];
  function walk(d) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && namePattern.test(entry.name)) {
        let mtime = 0;
        try {
          mtime = fs.statSync(full).mtimeMs;
        } catch {
          // unreadable; sort to the end
        }
        files.push({ path: full, mtime });
      }
    }
  }
  walk(dir);
  files.sort((a, b) => b.mtime - a.mtime);
  return files;
}

// ---------------------------------------------------------------------------
// Read recent typed-evidence files (diary / reflect / recall)
// ---------------------------------------------------------------------------

// Per-kind config: dir resolver, filename regex, max-count, ID field name on the item,
// and a builder for the kind-specific extra fields. Shared shape across all three is
// applied in readRecentEvidence below.
//
// Note: evidence_id is derived from filePath (sha256[:12]). It's stable across runs
// for the same file, but not content-addressed — content rename = same id. Content
// identity is captured separately by source_ref.content_hash.
const EVIDENCE_KIND_CONFIG = {
  diary: {
    getDir: getDiariesDir,
    pattern: /^diary-.*\.md$/,
    maxN: () => MAX_DIARIES,
    idField: 'diary_id',
    store: 'diary',
    buildExtra: (sanitized) => ({ summary: sanitized }),
  },
  reflect: {
    getDir: getReflectionsDir,
    pattern: /^reflect-.*\.md$/,
    maxN: () => MAX_REFLECTS,
    idField: 'reflect_id',
    store: 'reflect',
    buildExtra: (sanitized) => ({
      pattern_summary: sanitized,
      supporting_sessions: [],
      support_count: 0,
    }),
  },
  recall: {
    getDir: getRecallsDir,
    pattern: /^recall-.*\.md$/,
    maxN: () => MAX_RECALLS,
    idField: 'recall_id',
    store: 'recall',
    buildExtra: (sanitized) => ({ user_authored: true, summary: sanitized }),
  },
};

function readRecentEvidence(kind, homeDir, project) {
  const cfg = EVIDENCE_KIND_CONFIG[kind];
  if (!cfg) throw new Error(`readRecentEvidence: unknown kind "${kind}"`);

  const dir = path.join(cfg.getDir(homeDir), project);
  if (!fs.existsSync(dir)) return { items: [], scanned: 0, selected: 0 };

  const allFiles = walkFilesByMtime(dir, cfg.pattern);
  const scanned = allFiles.length;
  const selected = allFiles.slice(0, cfg.maxN());

  const items = [];
  for (const { path: filePath } of selected) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const sanitized = sanitizeObservationPayload(raw, 2000);
      const itemId = path.basename(filePath, '.md');

      items.push({
        evidence_id: `evd-${kind}-${sha256Truncated(filePath, 12)}`,
        evidence_type: kind,
        [cfg.idField]: itemId,
        project,
        project_id: '',
        created_at: '',
        ...cfg.buildExtra(sanitized),
        source_ref: {
          store: cfg.store,
          path_hash: sha256Truncated(filePath, 16),
          content_hash: sha256Truncated(raw, 16),
        },
      });
    } catch {
      // skip unreadable files
    }
  }

  return { items, scanned, selected: items.length };
}

const readRecentDiaries = (homeDir, project) => readRecentEvidence('diary', homeDir, project);
const readRecentReflects = (homeDir, project) => readRecentEvidence('reflect', homeDir, project);
const readRecentRecalls = (homeDir, project) => readRecentEvidence('recall', homeDir, project);

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

    // Build sanitized summary fields
    const inputSummary =
      typeof rec.input_summary === 'string'
        ? sanitizeObservationPayload(rec.input_summary, MAX_CHARS_PER_ITEM)
        : undefined;
    const pathSummary =
      typeof rec.path_summary === 'string'
        ? sanitizeObservationPayload(rec.path_summary, 300)
        : undefined;
    const patternSummary =
      typeof rec.pattern_summary === 'string'
        ? sanitizeObservationPayload(rec.pattern_summary, 300)
        : undefined;

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
  const promptTemplatePath = path.join(
    __dirname,
    '../../../skills/arc-observing/scripts/observer-prompt.md',
  );

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
      if (item.skill) lines.push(`**skill**: ${item.skill}`);
      if (item.outcome) lines.push(`**outcome**: ${item.outcome}`);
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
 * @returns {{ batch_id, batch_hash, manifest_path, prompt_path, project }}
 */
function assembleBatch({ project, homeDir: homeOverride } = {}) {
  if (typeof project !== 'string' || !project.trim()) {
    throw new Error('assembleBatch: project must be a non-empty string');
  }

  const homeDir = homeOverride || os.homedir();
  const now = new Date();
  const createdAt = now.toISOString();

  // Read evidence
  const allObs = readObservations(homeDir, project);
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
  } = readRecentDiaries(homeDir, project);
  const {
    items: reflectItems,
    scanned: reflectScanned,
    selected: reflectSelected,
  } = readRecentReflects(homeDir, project);
  const {
    items: recallItems,
    scanned: recallScanned,
    selected: recallSelected,
  } = readRecentRecalls(homeDir, project);

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
  const h = homeDir || os.homedir();
  const manifestPath = path.join(getBatchesDir(h), `${batchId}.manifest.json`);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Batch manifest not found: ${manifestPath}`);
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

module.exports = { assembleBatch, readBatchManifest };
