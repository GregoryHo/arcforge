/**
 * learning-dashboard.js — Layer 6 dashboard control plane (Slice F, 3.1 schema v1).
 *
 * Responsibilities:
 *   - Build allowlisted DashboardCandidateCard / DashboardCandidateDetail wire models
 *     from Layer 5 canonical candidates (readCurrentCandidates).
 *   - Validate and dispatch reviewer actions via the Layer 5 Action × Status matrix.
 *   - Write an append-only audit log to ~/.arcforge/learning/dashboard/actions.jsonl.
 *   - Serve a minimal HTTP server (createRouter / startServer).
 *
 * Privacy invariants:
 *   - Wire model is allowlist-based. body, raw evidence, project_id, and all
 *     raw payloads are NEVER served.
 *   - Sanitizer (sanitize-observation.js) is applied to name/summary/rationale/body
 *     before slicing into preview windows.
 *
 * Layer 6 does NOT write active skill / instinct / command files. Layer 7/8 own those.
 */

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { readCurrentCandidates, appendCandidate } = require('./learning-curator/queue-writer');
const {
  appendTransitionEvent,
  appendRelatedEvent,
} = require('./learning-curator/dashboard-events');
const {
  isLegalAction,
  applyTransition,
  ACTIONS,
  LIFECYCLE_ACTION,
} = require('./learning-curator/lifecycle');
const { redactObservationText } = require('./sanitize-observation');
const { materialize, defaultRenderPolicy } = require('./learning-curator/materialize');
const {
  activate: activateLayer8,
  deactivate: deactivateLayer8,
  defaultActivationPolicy,
  findLatestActivation,
  findLatestMaterialization,
} = require('./learning-curator/activate');

// ---------------------------------------------------------------------------
// Arcforge root — used by materialize/activate handlers
// ---------------------------------------------------------------------------

function getArcforgeRoot() {
  return path.join(os.homedir(), '.arcforge');
}

// ---------------------------------------------------------------------------
// Wire model limits
// ---------------------------------------------------------------------------

const CARD_SUMMARY_MAX = 200;
const CARD_NAME_MAX = 120;
const DETAIL_RATIONALE_MAX = 500;
const DETAIL_BODY_PREVIEW_MAX = 500;

// ---------------------------------------------------------------------------
// Sanitization helpers
// ---------------------------------------------------------------------------

function sanitizeText(value, maxLen) {
  if (!value) return '';
  return redactObservationText(String(value)).slice(0, maxLen);
}

// ---------------------------------------------------------------------------
// Layer 6 DashboardCandidateCard wire model builder
//
// Allowlisted fields only. project_id is NEVER included in the scope object.
// lifecycle.status is flattened to lifecycle_status.
// Raw body, raw evidence array, dedupe, safety, source are excluded.
// ---------------------------------------------------------------------------

function buildCardScope(scope) {
  if (!scope) return { kind: 'global' };
  const result = { kind: scope.kind };
  if (scope.kind === 'project' && scope.project) {
    result.project = scope.project;
    // project_id intentionally excluded (no project_id leak — criterion 1)
  }
  return result;
}

function countEvidenceByType(evidence) {
  if (!Array.isArray(evidence)) return { total: 0, by_type: {} };
  const byType = {};
  for (const ev of evidence) {
    const key = typeof ev?.evidence_type === 'string' ? ev.evidence_type : 'unknown';
    byType[key] = (byType[key] || 0) + 1;
  }
  return { total: evidence.length, by_type: byType };
}

function legalActionsFor(status) {
  if (!status) return [];
  return ACTIONS.filter((action) => isLegalAction(status, action));
}

/**
 * Derive the evidence_quality_chip value from evidence_quality.
 * Returns undefined if evidence_quality is not one of the known values.
 */
function evidenceQualityChip(quality) {
  const map = { low: 'low_signal', medium: 'medium_signal', high: 'high_signal' };
  return map[quality];
}

/**
 * Build a DashboardCandidateCard from a CandidateQueueRecord per Layer 6 spec.
 * Returns only allowlisted fields. project_id intentionally excluded.
 *
 * @param {object} record — CandidateQueueRecord (from readCurrentCandidates)
 * @returns {object} DashboardCandidateCard
 */
function sanitizeDashboardCard(record) {
  const status = record.lifecycle ? record.lifecycle.status : undefined;
  const llmAssessment = record.llm_assessment || {};

  const card = {
    schema_version: 1,
    candidate_id: record.candidate_id,
    artifact_type: record.artifact_type,
    scope: buildCardScope(record.scope),
    name: sanitizeText(record.name, CARD_NAME_MAX),
    summary: sanitizeText(record.summary, CARD_SUMMARY_MAX),
    domain: record.domain,
    lifecycle_status: status,
    created_at: record.created_at,
    updated_at: record.updated_at,
    evidence_quality: record.evidence_quality,
    evidence_counts: countEvidenceByType(record.evidence),
    risk_note_count: Array.isArray(llmAssessment.risk_notes) ? llmAssessment.risk_notes.length : 0,
    uncertainty_note_count: Array.isArray(llmAssessment.uncertainty_notes)
      ? llmAssessment.uncertainty_notes.length
      : 0,
    available_actions: legalActionsFor(status),
  };

  // Criterion 1: evidence_quality_chip (derived, omitted if quality unknown)
  const chip = evidenceQualityChip(record.evidence_quality);
  if (chip !== undefined) card.evidence_quality_chip = chip;

  // Criterion 1: relationships (copied if present, omitted otherwise)
  if (record.relationships !== undefined && record.relationships !== null) {
    card.relationships = record.relationships;
  }

  return card;
}

/**
 * Build a DashboardCandidateDetail (extends card with rationale + body_preview).
 *
 * @param {string} candidateId
 * @returns {object} DashboardCandidateDetail
 * @throws {Error} with code 'NOT_FOUND' if candidateId not in current candidates
 */
function sanitizeDashboardDetail(candidateId) {
  const candidates = readCurrentCandidates();
  const record = candidates[candidateId];
  if (!record) {
    const err = new Error(`candidate not found: ${candidateId}`);
    err.code = 'NOT_FOUND';
    throw err;
  }

  const card = sanitizeDashboardCard(record);

  const fullBody = typeof record.body === 'string' ? redactObservationText(record.body) : '';
  const bodyTruncated = fullBody.length > DETAIL_BODY_PREVIEW_MAX;
  const bodyPreviewText = fullBody.slice(0, DETAIL_BODY_PREVIEW_MAX);

  const rationaleText = sanitizeText(record.rationale, DETAIL_RATIONALE_MAX);

  // Criterion 5: evidence_summaries — map evidence[] to sanitized summary objects
  const evidenceSummaries = Array.isArray(record.evidence)
    ? record.evidence.map((ev) => ({
        evidence_id: ev.evidence_id,
        evidence_type: ev.evidence_type,
        relevance: sanitizeText(ev.relevance, 200),
        summary: sanitizeText(ev.summary, 300),
      }))
    : [];

  const detail = {
    ...card,
    rationale: rationaleText,
    body_preview: {
      text: bodyPreviewText,
      truncated: bodyTruncated,
    },
    evidence_summaries: evidenceSummaries,
  };

  // Criterion 5: llm_assessment — copy if present
  if (record.llm_assessment !== undefined) {
    detail.llm_assessment = record.llm_assessment;
  }

  // Criterion 5: materialization + activation — copy from lifecycle if present
  if (record.lifecycle && record.lifecycle.materialization !== undefined) {
    detail.materialization = record.lifecycle.materialization;
  }
  if (record.lifecycle && record.lifecycle.activation !== undefined) {
    detail.activation = record.lifecycle.activation;
  }

  return detail;
}

// ---------------------------------------------------------------------------
// Dashboard model (list view)
// ---------------------------------------------------------------------------

/**
 * Build the full dashboard model from current Layer 5 candidates.
 *
 * @returns {{ count: number, candidates: object[] }}
 */
function createDashboardModel() {
  const candidates = readCurrentCandidates();
  const cards = Object.values(candidates).map(sanitizeDashboardCard);
  return {
    count: cards.length,
    candidates: cards,
  };
}

// ---------------------------------------------------------------------------
// Audit log — ~/.arcforge/learning/dashboard/actions.jsonl
// ---------------------------------------------------------------------------

function getAuditLogPath() {
  return path.join(os.homedir(), '.arcforge', 'learning', 'dashboard', 'actions.jsonl');
}

function writeAuditEntry(entry) {
  const logPath = getAuditLogPath();
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
}

// ---------------------------------------------------------------------------
// Action handler
//
// Contract per Slice F spec:
//   1. Validate input shape (candidate_id present, action in ACTIONS enum)
//   2. Read current candidate state via readCurrentCandidates()
//   3. Look up candidate — 404 if not found
//   4. Check isLegalAction — 400 + policy_violation if illegal
//   5. Status-changing: applyTransition, then appendTransitionEvent
//   6. Candidate-producing (promote/evolve): create new record, appendCandidate,
//      appendRelatedEvent on source
//   7. Always write audit log
// ---------------------------------------------------------------------------

function generateActionId() {
  return `act_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

/**
 * Handle a dashboard reviewer action request.
 *
 * @param {{ action: string, candidate_id: string, expected_current_status?: string,
 *           safety_ack?: object, actor?: object, reason?: string }} opts
 * @returns {{ accepted: boolean, action_id: string, reason?: string, ... }}
 */
function handleDashboardAction({
  action,
  candidate_id: candidateId,
  expected_current_status: expectedStatus,
  safety_ack: safetyAck,
  actor: incomingActor,
  reason,
} = {}) {
  const actionId = generateActionId();
  const requestedAt = new Date().toISOString();

  // Criterion 4: default actor
  const actor = incomingActor || { layer: 6, actor_type: 'dashboard', reviewer: 'local_user' };

  function reject(rejectionReason, extra = {}) {
    const result = {
      accepted: false,
      action_id: actionId,
      requested_at: requestedAt,
      action,
      candidate_id: candidateId,
      actor,
      reason: rejectionReason,
      ...extra,
    };
    writeAuditEntry(result);
    return result;
  }

  function accept(extra = {}) {
    const result = {
      accepted: true,
      action_id: actionId,
      requested_at: requestedAt,
      action,
      candidate_id: candidateId,
      actor,
      ...extra,
    };
    // Criterion 4: include user-supplied reason in audit log
    if (reason !== undefined) result.reason = reason;
    writeAuditEntry(result);
    return result;
  }

  // Step 1: validate input shape
  if (!action || !ACTIONS.includes(action)) {
    return reject('action_not_available');
  }
  if (!candidateId || typeof candidateId !== 'string') {
    return reject('candidate_not_found');
  }

  // Step 2: read current state
  const candidates = readCurrentCandidates();

  // Step 3: look up candidate
  const candidate = candidates[candidateId];
  if (!candidate) {
    return reject('candidate_not_found');
  }

  const currentStatus = candidate.lifecycle ? candidate.lifecycle.status : undefined;

  // Criterion 2: optimistic concurrency guard — check expected_current_status
  if (expectedStatus !== undefined && expectedStatus !== null) {
    if (expectedStatus !== currentStatus) {
      return reject('stale_status', { expected: expectedStatus, current: currentStatus });
    }
  }

  // Step 4: check Action × Status matrix (before safety_ack so illegal actions fail fast)
  if (!isLegalAction(currentStatus, action)) {
    return reject('policy_violation');
  }

  // Criterion 3: safety_ack gate for activate and deactivate (only after policy check passes)
  if (action === LIFECYCLE_ACTION.ACTIVATE) {
    const ack = safetyAck || {};
    if (!ack.reviewer_saw_behavior_change_warning || !ack.reviewer_saw_target_path_summary) {
      return reject('missing_safety_ack');
    }
  }
  if (action === LIFECYCLE_ACTION.DEACTIVATE) {
    const ack = safetyAck || {};
    if (!ack.reviewer_saw_behavior_change_warning) {
      return reject('missing_safety_ack');
    }
  }

  // Step 5/6: dispatch by action type

  if (action === LIFECYCLE_ACTION.PROMOTE) {
    // Candidate-producing: create a global-scope copy of the source candidate.
    // Source candidate's status does NOT change.
    const newId = `cand_promoted_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();
    const newRecord = {
      ...candidate,
      candidate_id: newId,
      scope: { kind: 'global' },
      source: { source_type: 'dashboard_promote' },
      lifecycle: { status: 'pending_review', status_changed_at: now },
      relationships: {
        ...(candidate.relationships || {}),
        promoted_from_candidate_id: candidateId,
      },
      created_at: now,
      updated_at: now,
    };
    // Remove project_id from new global scope
    delete newRecord.scope.project_id;
    delete newRecord.scope.project;

    appendCandidate(newRecord, { actor });
    appendRelatedEvent(candidateId, { promoted_to_candidate_id: newId }, actor);

    return accept({ new_candidate_id: newId });
  }

  if (action === LIFECYCLE_ACTION.EVOLVE) {
    // Candidate-producing: create a new skill candidate derived from source.
    // Source candidate's status does NOT change.
    const newId = `cand_evolved_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();
    const newRecord = {
      ...candidate,
      candidate_id: newId,
      artifact_type: 'skill',
      source: { source_type: 'dashboard_evolve' },
      body_source: 'dashboard_evolve',
      lifecycle: { status: 'pending_review', status_changed_at: now },
      relationships: {
        ...(candidate.relationships || {}),
        evolved_from_candidate_id: candidateId,
      },
      created_at: now,
      updated_at: now,
    };

    appendCandidate(newRecord, { actor });
    appendRelatedEvent(candidateId, { evolved_to_candidate_id: newId }, actor);

    return accept({ new_candidate_id: newId });
  }

  // DH-1: materialize — delegates to Layer 7 materialize.js
  if (action === LIFECYCLE_ACTION.MATERIALIZE) {
    const arcforgeRoot = getArcforgeRoot();
    const matResult = materialize({
      candidate,
      sourceActionId: actionId,
      requestedArtifactType: candidate.artifact_type,
      renderPolicy: defaultRenderPolicy(),
      arcforgeRoot,
    });
    if (!matResult.ok) {
      return reject(matResult.failure.reason, { module_failure: matResult.failure });
    }
    return accept({
      next_status: 'materialized',
      materialization_id: matResult.record.materialization_id,
    });
  }

  // DH-2: activate — delegates to Layer 8 activate.js
  if (action === LIFECYCLE_ACTION.ACTIVATE) {
    const arcforgeRoot = getArcforgeRoot();
    // Find the latest materialization record on disk for this candidate
    const materializationRecord = findLatestMaterialization(arcforgeRoot, candidateId);
    if (!materializationRecord) {
      return reject('materialization_missing', {
        detail: 'No materialization record found for this candidate',
      });
    }
    // DH-4: synthesize reviewer_ack from dashboard click context
    const reviewerAck = { confirmed_behavior_change: true, saw_target_summary: true };
    const activationRequest = {
      schema_version: 1,
      request_id: actionId,
      requested_at: requestedAt,
      source_action_id: actionId,
      action: 'activate',
      candidate_id: candidateId,
      expected_candidate_status: 'materialized',
      target: { target_kind: candidate.artifact_type },
      reviewer_ack: reviewerAck,
    };
    const actResult = activateLayer8({
      candidate,
      materializationRecord,
      activationRequest,
      activationPolicy: defaultActivationPolicy(arcforgeRoot),
      arcforgeRoot,
    });
    if (!actResult.ok) {
      return reject(actResult.failure.reason, { module_failure: actResult.failure });
    }
    return accept({
      next_status: 'activated',
      activation_id: actResult.record.activation_id,
    });
  }

  // DH-6: deactivate — delegates to Layer 8 deactivate.js
  if (action === LIFECYCLE_ACTION.DEACTIVATE) {
    const arcforgeRoot = getArcforgeRoot();
    // Find the latest activation record on disk for this candidate
    const activationRecord = findLatestActivation(arcforgeRoot, candidateId);
    const deactivationRequest = {
      schema_version: 1,
      request_id: actionId,
      requested_at: requestedAt,
      source_action_id: actionId,
      action: 'deactivate',
      candidate_id: candidateId,
      expected_candidate_status: 'activated',
      reviewer_ack: { confirmed_behavior_change: true, saw_target_summary: true },
    };
    const deactResult = deactivateLayer8({
      candidate,
      activationRecord,
      activationRequest: deactivationRequest,
      activationPolicy: defaultActivationPolicy(arcforgeRoot),
      arcforgeRoot,
    });
    if (!deactResult.ok) {
      return reject(deactResult.failure.reason, { module_failure: deactResult.failure });
    }
    return accept({
      next_status: 'deactivated',
      activation_id: deactResult.record.activation_id,
    });
  }

  // Status-changing actions: dismiss, approve (materialize, activate, deactivate handled above)
  const nextStatus = applyTransition(currentStatus, action);
  appendTransitionEvent(candidateId, action, nextStatus, actor);

  return accept({ next_status: nextStatus });
}

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
  'X-Content-Type-Options': 'nosniff',
};

// ---------------------------------------------------------------------------
// HTTP utilities
// ---------------------------------------------------------------------------

function sendJson(res, data, status = 200) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function sendHtml(res, html) {
  res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function sendError(res, status, message) {
  sendJson(res, { error: message }, status);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 64 * 1024) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Validate the per-server write token header.
 *
 * @param {object} req
 * @param {string} writeToken
 * @returns {boolean}
 */
function hasDashboardWriteHeader(req, writeToken) {
  if (!writeToken || typeof writeToken !== 'string') return false;
  if (req.headers['x-arcforge-dashboard'] !== '1') return false;
  return req.headers['x-arcforge-dashboard-token'] === writeToken;
}

// ---------------------------------------------------------------------------
// HTTP router
// ---------------------------------------------------------------------------

/**
 * Create a request handler for the dashboard HTTP server.
 *
 * Routes:
 *   GET  /                         → HTML dashboard
 *   GET  /api/candidates           → DashboardCandidateCard[] list
 *   GET  /api/candidates/:id       → DashboardCandidateDetail
 *   POST /api/candidates/:id/action → action dispatch (requires write token)
 *
 * @param {{ htmlBody: string, writeToken: string }} options
 * @returns {function}
 */
function createRouter({ htmlBody, writeToken }) {
  return async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = url.pathname;
    const method = req.method || 'GET';

    // GET / — HTML dashboard
    if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      return sendHtml(res, htmlBody);
    }

    // GET /api/candidates — list
    if (method === 'GET' && pathname === '/api/candidates') {
      try {
        return sendJson(res, createDashboardModel());
      } catch {
        return sendError(res, 500, 'dashboard failed to load candidates');
      }
    }

    // GET /api/candidates/:id — detail
    const detailMatch = pathname.match(/^\/api\/candidates\/([^/]+)$/);
    if (method === 'GET' && detailMatch) {
      try {
        const detail = sanitizeDashboardDetail(detailMatch[1]);
        return sendJson(res, detail);
      } catch (err) {
        if (err.code === 'NOT_FOUND') return sendError(res, 404, 'candidate not found');
        return sendError(res, 500, 'dashboard failed to load candidate');
      }
    }

    // POST /api/candidates/:id/action — action dispatch
    const actionMatch = pathname.match(/^\/api\/candidates\/([^/]+)\/action$/);
    if (method === 'POST' && actionMatch) {
      if (!hasDashboardWriteHeader(req, writeToken)) {
        return sendError(res, 403, 'dashboard write header required');
      }

      let body;
      try {
        body = await readRequestBody(req);
      } catch (err) {
        return sendError(res, 400, err.message);
      }

      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        return sendError(res, 400, 'invalid JSON body');
      }

      const result = handleDashboardAction({
        action: parsed.action,
        candidate_id: actionMatch[1],
        expected_current_status: parsed.expected_current_status,
        safety_ack: parsed.safety_ack,
        actor: parsed.actor,
        reason: parsed.reason,
      });

      let status = 200;
      if (!result.accepted) {
        if (result.reason === 'candidate_not_found') status = 404;
        else if (result.reason === 'stale_status') status = 409;
        else status = 400;
      }
      return sendJson(res, result, status);
    }

    return sendError(res, 404, 'Not found');
  };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

function loadHtml(writeToken = '') {
  const htmlPath = path.join(__dirname, 'learning-dashboard.html');
  try {
    return fs.readFileSync(htmlPath, 'utf8').replace(/__ARCFORGE_DASHBOARD_TOKEN__/g, writeToken);
  } catch {
    return '<!doctype html><meta charset="utf-8"><title>ArcForge learning</title><h1>Dashboard UI missing</h1>';
  }
}

function startServer(options = {}) {
  const { port = 3334, host = '127.0.0.1' } = options;
  const writeToken = crypto.randomBytes(24).toString('hex');
  const htmlBody = loadHtml(writeToken);
  const router = createRouter({ htmlBody, writeToken });

  const server = http.createServer(async (req, res) => {
    try {
      await router(req, res);
    } catch {
      sendError(res, 500, 'learning dashboard server error');
    }
  });

  server.listen(port, host, () => {
    console.log(`ArcForge learning dashboard: http://${host}:${port}`);
    console.log('Press Ctrl+C to stop');
  });

  const shutdown = () => {
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
}

module.exports = {
  sanitizeDashboardCard,
  sanitizeDashboardDetail,
  createDashboardModel,
  handleDashboardAction,
  hasDashboardWriteHeader,
  createRouter,
  startServer,
};
