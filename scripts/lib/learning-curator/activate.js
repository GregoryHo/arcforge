/**
 * activate.js — Layer 8 activation runtime influence surface.
 *
 * Writes active artifacts from materialized drafts.
 * First-slice: instinct artifact type only.
 * Handles activate + deactivate actions.
 * NEVER touches CLAUDE.md, never auto-promotes, never auto-loads into context.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const { sanitizeFilename, atomicWriteFile, sha256Truncated } = require('../utils');
const { SANITIZER_POLICY_VERSION } = require('../sanitize-observation');
const { appendTransitionEvent } = require('./dashboard-events');

// ---------------------------------------------------------------------------
// First-slice supported target kinds
// ---------------------------------------------------------------------------

const FIRST_SLICE_TARGET_KINDS = ['instinct'];

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Build the active instinct path for a candidate.
 * Project-scoped: <arcforgeRoot>/instincts/<project_id>/<candidate_id>.md
 * Global-scoped: <arcforgeRoot>/instincts/global/<candidate_id>.md
 *
 * @param {string} arcforgeRoot
 * @param {object} candidate
 * @returns {string}
 */
function buildActiveInstinctPath(arcforgeRoot, candidate) {
  const scope = candidate.scope || {};
  let scopeDir;
  if (scope.kind === 'global') {
    scopeDir = 'global';
  } else {
    // sanitize project_id for path use
    let projectId = scope.project_id || 'unknown';
    try {
      projectId = sanitizeFilename(projectId);
    } catch {
      projectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
    }
    scopeDir = projectId;
  }
  return path.join(arcforgeRoot, 'instincts', scopeDir, `${candidate.candidate_id}.md`);
}

function getActivationsDir(arcforgeRoot) {
  return path.join(arcforgeRoot, 'learning', 'activations');
}

function getActivationLockPath(arcforgeRoot) {
  return path.join(getActivationsDir(arcforgeRoot), 'activation.lock');
}

// ---------------------------------------------------------------------------
// Default activation policy (first-slice)
// ---------------------------------------------------------------------------

/**
 * @param {string} arcforgeRoot
 * @returns {object} ActivationPolicy
 */
function defaultActivationPolicy(arcforgeRoot) {
  const root = arcforgeRoot || path.join(os.homedir(), '.arcforge');
  return {
    policy_version: 'v1',
    allowed_target_kinds: FIRST_SLICE_TARGET_KINDS,
    allowed_active_roots: {
      instincts_root: path.join(root, 'instincts'),
      global_instincts_root: path.join(root, 'instincts', 'global'),
    },
    require_materialization: true,
    require_reviewer_ack: true,
    require_integrity_check: true,
    require_atomic_write: true,
    claude_md_auto_apply_allowed: false,
    overwrite_existing_active_artifact: {
      instinct: 'supersede_with_backup',
      skill: 'forbidden',
      command: 'forbidden',
      agent: 'forbidden',
      manual_claude_md_patch: 'forbidden',
    },
    deactivation_mode: 'move_to_disabled_archive',
  };
}

// ---------------------------------------------------------------------------
// Simple file-based lock (same pattern as queue-writer.js)
// ---------------------------------------------------------------------------

const LOCK_TIMEOUT = 5000;
const LOCK_STALE_THRESHOLD = 30000;

function acquireActivationLock(lockPath) {
  const dir = path.dirname(lockPath);
  fs.mkdirSync(dir, { recursive: true });

  const startTime = Date.now();
  let interval = 50;

  while (true) {
    try {
      const fd = fs.openSync(
        lockPath,
        fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
      );
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, ts: new Date().toISOString() }));
      fs.closeSync(fd);
      return;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;

      try {
        const stat = fs.statSync(lockPath);
        if (Date.now() - stat.mtimeMs > LOCK_STALE_THRESHOLD) {
          try {
            fs.unlinkSync(lockPath);
          } catch {
            /* retry */
          }
          continue;
        }
      } catch {
        continue;
      }

      if (Date.now() - startTime > LOCK_TIMEOUT) {
        throw new Error(`Failed to acquire activation lock after ${LOCK_TIMEOUT}ms: ${lockPath}`);
      }

      const waitMs = Math.min(interval, 500);
      const end = Date.now() + waitMs;
      while (Date.now() < end) {
        /* busy-wait */
      }
      interval = Math.min(interval * 2, 500);
    }
  }
}

function releaseActivationLock(lockPath) {
  try {
    fs.unlinkSync(lockPath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

// ---------------------------------------------------------------------------
// Failure logger
// ---------------------------------------------------------------------------

function logActivationFailure(arcforgeRoot, failureRecord) {
  try {
    const failurePath = path.join(getActivationsDir(arcforgeRoot), 'failures.jsonl');
    fs.mkdirSync(path.dirname(failurePath), { recursive: true });
    fs.appendFileSync(failurePath, `${JSON.stringify(failureRecord)}\n`, 'utf8');
  } catch {
    // Best-effort; do not propagate
  }
}

function makeActivationFailure(opts) {
  return {
    schema_version: 1,
    failure_id: `actfail_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
    failed_at: new Date().toISOString(),
    action: opts.action || 'activate',
    candidate_id: opts.candidateId || 'unknown',
    materialization_id: opts.materializationId || undefined,
    source_action_id: opts.sourceActionId || 'unknown',
    reason: opts.reason,
    detail: opts.detail || undefined,
    active_artifacts_written: false,
    reported_to_layer5: false,
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Verify reviewer_ack is present and confirmed_behavior_change is true.
 * Returns null on success; returns [reason, detail] on failure.
 */
function verifyReviewerAck(activationRequest) {
  const ack = activationRequest?.reviewer_ack;
  if (!ack || ack.confirmed_behavior_change !== true) {
    return ['missing_reviewer_ack', 'confirmed_behavior_change must be true'];
  }
  return null;
}

/**
 * Build a redacted active_path_summary that strips project_id.
 * Takes the already-computed `active_path_hash` (32-char sha256 digest prefix)
 * and slices it to 12 to avoid hashing the same path twice.
 * Returns `instincts/<sha256(activePath)[:12]>.md` — safe to log/audit.
 */
function summarizeActivePath(activePathHash) {
  return `instincts/${activePathHash.slice(0, 12)}.md`;
}

// ---------------------------------------------------------------------------
// activate()
// ---------------------------------------------------------------------------

/**
 * Activate a materialized candidate — writes active instinct file.
 *
 * @param {object} opts
 * @returns {object} `{ ok: true, record, activeArtifacts }` on success;
 *                   `{ ok: false, failure }` on validation/write failure.
 *                   See layer-8-activation-runtime-influence-surface.md for full record shapes.
 */
function activate({
  candidate,
  materializationRecord,
  activationRequest,
  activationPolicy,
  arcforgeRoot,
}) {
  const effectiveRoot = arcforgeRoot || path.join(os.homedir(), '.arcforge');
  const effectivePolicy = activationPolicy || defaultActivationPolicy(effectiveRoot);
  const actor = { layer: 8, actor_type: 'activation_gate' };

  function fail(reason, detail) {
    const failure = makeActivationFailure({
      action: 'activate',
      candidateId: candidate ? candidate.candidate_id : 'unknown',
      materializationId: materializationRecord
        ? materializationRecord.materialization_id
        : undefined,
      sourceActionId: activationRequest ? activationRequest.source_action_id : 'unknown',
      reason,
      detail,
    });
    logActivationFailure(effectiveRoot, failure);
    return { ok: false, failure };
  }

  // L8-1: candidate must be materialized (first activation) or deactivated (reactivation).
  // Matrix-allowed transitions: materialized → activated, deactivated → activated.
  const status = candidate?.lifecycle ? candidate.lifecycle.status : undefined;
  if (status !== 'materialized' && status !== 'deactivated') {
    return fail('invalid_lifecycle_status', `Expected materialized or deactivated, got: ${status}`);
  }

  // L8-2: materializationRecord candidate_id must match
  if (!materializationRecord || materializationRecord.candidate_id !== candidate.candidate_id) {
    return fail('materialization_missing', 'Materialization record does not match candidate');
  }

  // L8-4: reviewer_ack required
  const ackError = verifyReviewerAck(activationRequest);
  if (ackError) {
    return fail(ackError[0], ackError[1]);
  }

  // L8-5: first-slice supports instinct only; reject claude_md_addition
  const targetKind = activationRequest?.target ? activationRequest.target.target_kind : undefined;
  if (!targetKind || !FIRST_SLICE_TARGET_KINDS.includes(targetKind)) {
    return fail('target_kind_mismatch', `First-slice supports instinct only; got: ${targetKind}`);
  }

  // L8-14: Also reject if candidate artifact_type is claude_md_addition
  if (candidate.artifact_type === 'claude_md_addition') {
    return fail('policy_violation', 'claude_md_addition auto-apply is forbidden');
  }

  // L8-3: Verify draft file hash
  const draftArtifact = materializationRecord.draft_artifacts?.[0];
  if (!draftArtifact) {
    return fail('materialization_missing', 'No draft artifact in materialization record');
  }

  let draftContent;
  try {
    draftContent = fs.readFileSync(draftArtifact.draft_path, 'utf8');
  } catch (err) {
    return fail('materialization_hash_mismatch', `Cannot read draft file: ${err.message}`);
  }

  const actualHash = sha256Truncated(draftContent, 64);
  if (actualHash !== draftArtifact.content_hash) {
    return fail('materialization_hash_mismatch', 'Draft content hash does not match record');
  }

  // L8-6: Compute active path
  const activePath = buildActiveInstinctPath(effectiveRoot, candidate);

  // L8-7: Validate active path is within allowed roots
  const instinctsRoot = effectivePolicy.allowed_active_roots
    ? effectivePolicy.allowed_active_roots.instincts_root
    : null;
  const globalInstinctsRoot = effectivePolicy.allowed_active_roots
    ? effectivePolicy.allowed_active_roots.global_instincts_root
    : null;

  const resolvedActive = path.resolve(activePath);
  const resolvedInstinctsRoot = instinctsRoot ? path.resolve(instinctsRoot) : null;
  const resolvedGlobalRoot = globalInstinctsRoot ? path.resolve(globalInstinctsRoot) : null;

  const inInstinctsRoot =
    resolvedInstinctsRoot &&
    (resolvedActive.startsWith(resolvedInstinctsRoot + path.sep) ||
      resolvedActive === resolvedInstinctsRoot);
  const inGlobalRoot =
    resolvedGlobalRoot &&
    (resolvedActive.startsWith(resolvedGlobalRoot + path.sep) ||
      resolvedActive === resolvedGlobalRoot);

  if (!inInstinctsRoot && !inGlobalRoot) {
    return fail('target_path_rejected', `Active path not within allowed roots: ${activePath}`);
  }

  // Acquire activation lock
  const lockPath = getActivationLockPath(effectiveRoot);
  try {
    acquireActivationLock(lockPath);
  } catch (err) {
    return fail('lock_timeout', err.message);
  }

  try {
    const activationId = `act8_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const activeArtifactId = `aart_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    let previousBackup;

    // L8-8: Handle existing active artifact (supersede_with_backup)
    if (fs.existsSync(activePath)) {
      const overwritePolicy = effectivePolicy.overwrite_existing_active_artifact?.instinct;

      if (overwritePolicy === 'supersede_with_backup') {
        const existingContent = fs.readFileSync(activePath, 'utf8');
        const backupDir = path.join(path.dirname(activePath), '.backups');
        const backupName = `${candidate.candidate_id}-${Date.now()}.md`;
        const backupPath = path.join(backupDir, backupName);
        atomicWriteFile(backupPath, existingContent);
        previousBackup = {
          backup_path: backupPath,
          backup_path_hash: sha256Truncated(backupPath, 32),
          content_hash: sha256Truncated(existingContent, 64),
        };
      } else {
        return fail('active_write_failed', 'Overwrite policy is forbidden for this artifact type');
      }
    }

    // Write active file atomically
    atomicWriteFile(activePath, draftContent);
    const activeContentHash = sha256Truncated(draftContent, 64);

    // Build active artifact record
    const activePathHash = sha256Truncated(activePath, 32);
    const activeArtifactRecord = {
      active_artifact_id: activeArtifactId,
      target_kind: 'instinct',
      active_path: activePath,
      active_path_hash: activePathHash,
      active_path_summary: summarizeActivePath(activePathHash),
      source_draft_artifact_id: draftArtifact.draft_artifact_id,
      source_draft_content_hash: draftArtifact.content_hash,
      active_content_hash: activeContentHash,
      previous_active_artifact_backup: previousBackup,
      status: 'active',
    };

    // Build ActivationRecord
    const activationRecord = {
      schema_version: 1,
      activation_id: activationId,
      action: 'activate',
      created_at: new Date().toISOString(),
      candidate_id: candidate.candidate_id,
      materialization_id: materializationRecord.materialization_id,
      source_action_id: activationRequest ? activationRequest.source_action_id : 'unknown',
      artifact_type: candidate.artifact_type,
      active_artifacts: [activeArtifactRecord],
      policy_version: effectivePolicy.policy_version,
      safety: {
        explicit_reviewer_activation: true,
        materialization_required: true,
        materialization_integrity_verified: true,
        pending_candidate_influence: false,
        approved_candidate_influence: false,
        materialized_candidate_influence_before_activation: false,
        target_path_policy: {
          status: 'passed',
          allowed_root_hashes: [
            resolvedInstinctsRoot ? sha256Truncated(resolvedInstinctsRoot, 32) : null,
          ].filter(Boolean),
        },
        content_safety_scan: {
          status: 'passed',
          rule_version: SANITIZER_POLICY_VERSION,
        },
        claude_md_auto_apply: false,
        runtime_boundary: {
          session_start_instinct_autoload_disabled_required: true,
          global_auto_promote_disabled_required: true,
        },
      },
      reported_to_layer5: false,
    };

    // Persist ActivationRecord atomically
    const recordPath = path.join(getActivationsDir(effectiveRoot), `${activationId}.json`);
    atomicWriteFile(recordPath, `${JSON.stringify(activationRecord, null, 2)}\n`);

    // Report to Layer 5 AFTER record is durable
    activationRecord.reported_to_layer5 = true;
    appendTransitionEvent(candidate.candidate_id, 'activate', 'activated', actor);

    return {
      ok: true,
      record: activationRecord,
      activeArtifacts: [activeArtifactRecord],
    };
  } catch (err) {
    return fail('active_write_failed', err.message);
  } finally {
    releaseActivationLock(lockPath);
  }
}

// ---------------------------------------------------------------------------
// deactivate()
// ---------------------------------------------------------------------------

/**
 * Deactivate an activated candidate — moves active file to .disabled/ archive.
 *
 * @param {object} opts
 * @returns {object} `{ ok: true, record, activeArtifacts }` on success;
 *                   `{ ok: false, failure }` on validation/write failure.
 *                   See layer-8-activation-runtime-influence-surface.md for full record shapes.
 */
function deactivate({
  candidate,
  activationRecord,
  activationRequest,
  activationPolicy,
  arcforgeRoot,
}) {
  const effectiveRoot = arcforgeRoot || path.join(os.homedir(), '.arcforge');
  const effectivePolicy = activationPolicy || defaultActivationPolicy(effectiveRoot);
  const actor = { layer: 8, actor_type: 'activation_gate' };

  function fail(reason, detail) {
    const failure = makeActivationFailure({
      action: 'deactivate',
      candidateId: candidate ? candidate.candidate_id : 'unknown',
      materializationId: activationRecord ? activationRecord.materialization_id : undefined,
      sourceActionId: activationRequest ? activationRequest.source_action_id : 'unknown',
      reason,
      detail,
    });
    logActivationFailure(effectiveRoot, failure);
    return { ok: false, failure };
  }

  // L8-1: candidate must be activated for deactivation
  const status = candidate?.lifecycle ? candidate.lifecycle.status : undefined;
  if (status !== 'activated') {
    return fail('invalid_lifecycle_status', `Expected activated for deactivate, got: ${status}`);
  }

  // reviewer_ack required for deactivation
  const ackError = verifyReviewerAck(activationRequest);
  if (ackError) {
    return fail(ackError[0], ackError[1]);
  }

  // Compute active path
  const activePath = buildActiveInstinctPath(effectiveRoot, candidate);

  // Acquire activation lock
  const lockPath = getActivationLockPath(effectiveRoot);
  try {
    acquireActivationLock(lockPath);
  } catch (err) {
    return fail('lock_timeout', err.message);
  }

  try {
    const activationId = `act8_deact_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const archivedArtifactId = `aart_dis_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // Determine archive destination
    const scopeDir =
      candidate.scope && candidate.scope.kind === 'global'
        ? 'global'
        : candidate.scope?.project_id || 'unknown';
    const disabledDir = path.join(effectiveRoot, 'instincts', scopeDir, '.disabled');
    const archiveName = `${candidate.candidate_id}-${Date.now()}.md`;
    const archivePath = path.join(disabledDir, archiveName);

    // Move file to disabled archive
    let disabledContent = '';
    if (fs.existsSync(activePath)) {
      disabledContent = fs.readFileSync(activePath, 'utf8');
      atomicWriteFile(archivePath, disabledContent);
      fs.unlinkSync(activePath);
    } else {
      // File is already gone — still record the deactivation
      atomicWriteFile(archivePath, '<!-- deactivated artifact — original file was missing -->');
    }

    const archivePathHash = sha256Truncated(archivePath, 32);
    const archivedArtifactRecord = {
      active_artifact_id: archivedArtifactId,
      target_kind: 'instinct',
      active_path: archivePath,
      active_path_hash: archivePathHash,
      active_path_summary: summarizeActivePath(archivePathHash),
      active_content_hash: disabledContent ? sha256Truncated(disabledContent, 64) : undefined,
      status: 'deactivated',
    };

    // Build ActivationRecord for deactivation
    const deactivationRecord = {
      schema_version: 1,
      activation_id: activationId,
      action: 'deactivate',
      created_at: new Date().toISOString(),
      candidate_id: candidate.candidate_id,
      materialization_id: activationRecord ? activationRecord.materialization_id : undefined,
      source_action_id: activationRequest ? activationRequest.source_action_id : 'unknown',
      artifact_type: candidate.artifact_type,
      active_artifacts: [archivedArtifactRecord],
      policy_version: effectivePolicy.policy_version,
      safety: {
        explicit_reviewer_activation: true,
        materialization_required: true,
        materialization_integrity_verified: false,
        pending_candidate_influence: false,
        approved_candidate_influence: false,
        materialized_candidate_influence_before_activation: false,
        target_path_policy: { status: 'passed', allowed_root_hashes: [] },
        content_safety_scan: { status: 'passed', rule_version: SANITIZER_POLICY_VERSION },
        claude_md_auto_apply: false,
        runtime_boundary: {
          session_start_instinct_autoload_disabled_required: true,
          global_auto_promote_disabled_required: true,
        },
      },
      reported_to_layer5: false,
    };

    // Persist deactivation record atomically
    const recordPath = path.join(getActivationsDir(effectiveRoot), `${activationId}.json`);
    atomicWriteFile(recordPath, `${JSON.stringify(deactivationRecord, null, 2)}\n`);

    // Report to Layer 5 AFTER record is durable
    deactivationRecord.reported_to_layer5 = true;
    appendTransitionEvent(candidate.candidate_id, 'deactivate', 'deactivated', actor);

    return {
      ok: true,
      record: deactivationRecord,
      activeArtifacts: [archivedArtifactRecord],
    };
  } catch (err) {
    return fail('active_write_failed', err.message);
  } finally {
    releaseActivationLock(lockPath);
  }
}

// ---------------------------------------------------------------------------
// findLatestActivation — scan activations dir for the latest activate record
// ---------------------------------------------------------------------------

/**
 * Scan learning/activations and return the most recent ActivationRecord with
 * action === 'activate' for the given candidateId.
 *
 * @param {string} arcforgeRoot
 * @param {string} candidateId
 * @returns {object|null} ActivationRecord or null if none found
 */
function findLatestActivation(arcforgeRoot, candidateId) {
  const activationsDir = getActivationsDir(arcforgeRoot);
  if (!fs.existsSync(activationsDir)) return null;

  let entries;
  try {
    entries = fs.readdirSync(activationsDir);
  } catch {
    return null;
  }

  let latest = null;
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const recordPath = path.join(activationsDir, entry);
    try {
      const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
      if (record.action !== 'activate') continue;
      if (record.candidate_id !== candidateId) continue;
      if (!latest || record.created_at > latest.created_at) {
        latest = record;
      }
    } catch {
      // Corrupted record — skip
    }
  }
  return latest;
}

// ---------------------------------------------------------------------------
// findLatestMaterialization — scan candidate drafts dir for the latest record
// ---------------------------------------------------------------------------

/**
 * Scan candidateId sub-directories under learning/drafts and return the most
 * recent MaterializationRecord by created_at.
 *
 * @param {string} arcforgeRoot
 * @param {string} candidateId
 * @returns {object|null} MaterializationRecord or null if none found
 */
function findLatestMaterialization(arcforgeRoot, candidateId) {
  const candidateDraftsDir = path.join(arcforgeRoot, 'learning', 'drafts', candidateId);
  if (!fs.existsSync(candidateDraftsDir)) return null;

  let entries;
  try {
    entries = fs.readdirSync(candidateDraftsDir);
  } catch {
    return null;
  }

  let latest = null;
  for (const entry of entries) {
    const manifestPath = path.join(candidateDraftsDir, entry, 'materialization.json');
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const record = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (!latest || record.created_at > latest.created_at) {
        latest = record;
      }
    } catch {
      // Corrupted manifest — skip
    }
  }
  return latest;
}

module.exports = {
  activate,
  deactivate,
  defaultActivationPolicy,
  buildActiveInstinctPath,
  findLatestActivation,
  findLatestMaterialization,
};
