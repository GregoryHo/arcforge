/**
 * learning-dashboard.js — User-facing dashboard for the optional learning loop.
 *
 * Goal: surface candidate suggestions in user-friendly language so users do not
 * need to know analyze / inbox / inspect / accept / activate.
 *
 * Privacy invariants (do NOT relax without re-reviewing learning.js evidence shape):
 *   - dashboard model is allowlisted — no raw evidence array, no trigger text
 *   - detail model never echoes evidence reasons / session ids
 *   - global scope is read/dismiss only — never auto-draft or auto-apply
 *   - repo_convention_patch is never auto-applied — manual review required
 */

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const learning = require('./learning');

const ARTIFACT_TYPE_LABELS = {
  skill: 'Skill suggestion',
  instinct: 'Instinct / habit',
  command: 'Command suggestion',
  agent: 'Agent suggestion',
  eval: 'Eval suggestion',
  repo_convention_patch: 'CLAUDE.md / repo convention suggestion',
};

const STATUS_LABELS = {
  pending: 'New',
  approved: 'Saved',
  materialized: 'Drafted',
  activated: 'Applied',
  rejected: 'Dismissed',
};

const DRAFT_ELIGIBLE_STATUSES = new Set(['pending', 'approved']);

function artifactTypeLabel(type) {
  return ARTIFACT_TYPE_LABELS[type] || 'Suggestion';
}

function normalizedArtifactType(type) {
  return ARTIFACT_TYPE_LABELS[type] ? type : 'unknown';
}

function normalizedStatus(status) {
  return STATUS_LABELS[status] ? status : 'unknown';
}

function statusLabel(status) {
  return STATUS_LABELS[status] || 'Unknown';
}

function safeDisplayText(value, { fallback = '', maxLength = 240 } = {}) {
  const text = String(value || fallback)
    .replace(/\b(api[_-]?key|secret|password|passwd|token)\b\s*[:=]\s*"[^"]*"/gi, '$1="[REDACTED]"')
    .replace(/\b(api[_-]?key|secret|password|passwd|token)\b\s*[:=]\s*'[^']*'/gi, "$1='[REDACTED]'")
    .replace(/\b(api[_-]?key|secret|password|passwd|token)\b\s*[:=]\s*[^\s,}]+/gi, '$1=[REDACTED]')
    .replace(/\/(?:[^\s/]+\/){1,}[^\s]*/g, '[path]')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

function nextUserAction(candidate) {
  const isPatch = candidate.artifact_type === 'repo_convention_patch';
  switch (candidate.status) {
    case 'pending':
      return 'Review and save as draft, or dismiss.';
    case 'approved':
      return 'Save the draft so you can review it before applying.';
    case 'materialized':
      if (isPatch) return 'Ask Claude Code to review and apply the saved patch draft manually.';
      return 'Ask Claude Code to review and apply the saved draft manually.';
    case 'activated':
      return 'Already in use — no further action.';
    case 'rejected':
      return 'Dismissed — no action available.';
    default:
      return '';
  }
}

function canDismiss(candidate) {
  return (
    candidate.status === 'pending' ||
    candidate.status === 'approved' ||
    candidate.status === 'materialized'
  );
}

function canDraft(candidate) {
  return candidate.scope === 'project' && DRAFT_ELIGIBLE_STATUSES.has(candidate.status);
}

function canApply(_candidate) {
  return false;
}

/**
 * Allowlisted card model. Anything not explicitly listed here is excluded —
 * raw evidence reasons, draft paths, and trigger text never reach the wire.
 */
function sanitizeDashboardCandidate(candidate) {
  return {
    id: candidate.id,
    scope: candidate.scope,
    artifact_type: normalizedArtifactType(candidate.artifact_type),
    artifact_type_label: artifactTypeLabel(candidate.artifact_type),
    name: safeDisplayText(candidate.name, { fallback: '(unnamed)', maxLength: 96 }),
    summary: safeDisplayText(candidate.summary),
    confidence: candidate.confidence,
    status: normalizedStatus(candidate.status),
    status_label: statusLabel(candidate.status),
    next_user_action: nextUserAction(candidate),
    evidence_count: Array.isArray(candidate.evidence) ? candidate.evidence.length : 0,
    created_at: candidate.created_at,
    updated_at: candidate.updated_at,
    can_dismiss: canDismiss(candidate),
    can_draft: canDraft(candidate),
    can_apply: canApply(candidate),
  };
}

function dashboardCounts(candidates) {
  const byStatus = {};
  const byType = {};
  for (const c of candidates) {
    const statusKey = normalizedStatus(c.status);
    const typeKey = normalizedArtifactType(c.artifact_type);
    byStatus[statusKey] = (byStatus[statusKey] || 0) + 1;
    byType[typeKey] = (byType[typeKey] || 0) + 1;
  }
  return { by_status: byStatus, by_artifact_type: byType };
}

function statusRank(status) {
  return { pending: 0, approved: 1, materialized: 2, activated: 3, rejected: 4 }[status] ?? 99;
}

function createDashboardModel({ scope = 'project', projectRoot, homeDir } = {}) {
  const all = learning
    .loadCandidates({ scope, projectRoot, homeDir })
    .filter((c) => c.scope === scope);
  const sorted = all.slice().sort((a, b) => {
    const r = statusRank(a.status) - statusRank(b.status);
    if (r !== 0) return r;
    const conf = (b.confidence || 0) - (a.confidence || 0);
    if (conf !== 0) return conf;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });
  const cards = sorted.map(sanitizeDashboardCandidate);
  return {
    scope,
    count: cards.length,
    counts: dashboardCounts(all),
    candidates: cards,
  };
}

/**
 * Sanitized candidate detail. Reuses the queue lookup but strips raw evidence
 * and lifecycle-internal fields. Never returns evidence reasons or session ids.
 */
function sanitizeDashboardDetail(id, { scope, projectRoot, homeDir } = {}) {
  const candidates = learning
    .loadCandidates({ scope, projectRoot, homeDir })
    .filter((c) => c.scope === scope);
  const found = candidates.find((c) => c.id === id);
  if (!found) {
    const err = new Error(`candidate not found: ${id}`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  return {
    scope,
    candidate: sanitizeDashboardCandidate(found),
    next_user_action: nextUserAction(found),
  };
}

// ── Action handler ─────────────────────────────────────────────────────────

const VALID_ACTIONS = new Set(['dismiss', 'draft', 'apply']);

function handleDashboardAction({ action, id, scope = 'project', projectRoot, homeDir, now } = {}) {
  if (!VALID_ACTIONS.has(action)) {
    return { ok: false, status: 400, error: `unknown action: ${action}` };
  }
  if (!id || typeof id !== 'string') {
    return { ok: false, status: 400, error: 'id required' };
  }

  try {
    if (action === 'dismiss') {
      const current = learning
        .loadCandidates({ scope, projectRoot, homeDir })
        .find((candidate) => candidate.id === id && candidate.scope === scope);
      if (!current) {
        return { ok: false, status: 404, error: `candidate not found: ${id}` };
      }
      if (!canDismiss(current)) {
        return {
          ok: false,
          status: 400,
          error: 'suggestion cannot be dismissed in its current state',
        };
      }
      const updated = learning.transitionCandidate(id, 'rejected', {
        scope,
        projectRoot,
        homeDir,
        now,
      });
      return { ok: true, status: 200, candidate: sanitizeDashboardCandidate(updated) };
    }

    if (action === 'draft') {
      if (scope !== 'project') {
        return {
          ok: false,
          status: 403,
          error:
            'draft is project-scope only — global suggestions can only be reviewed or dismissed',
        };
      }
      const current = learning
        .loadCandidates({ scope, projectRoot, homeDir })
        .find((candidate) => candidate.id === id && candidate.scope === scope);
      if (!current) {
        return { ok: false, status: 404, error: `candidate not found: ${id}` };
      }
      if (!canDraft(current)) {
        return {
          ok: false,
          status: 400,
          error: 'suggestion cannot be saved as draft in its current state',
        };
      }
      const result = learning.acceptCandidate(id, { scope, projectRoot, homeDir, now });
      return { ok: true, status: 200, candidate: sanitizeDashboardCandidate(result.candidate) };
    }

    if (action === 'apply') {
      return {
        ok: false,
        status: 403,
        error: 'dashboard apply is intentionally disabled — save a draft and review it manually',
        requires_review: true,
      };
    }

    return { ok: false, status: 400, error: `unhandled action: ${action}` };
  } catch (_err) {
    return {
      ok: false,
      status: 400,
      error: 'learning dashboard action failed; review the candidate draft state locally',
    };
  }
}

// ── Notification builder ───────────────────────────────────────────────────

function buildLearningNotification({
  result,
  now = new Date().toISOString(),
  dashboardCommand = 'arc learn dashboard',
  projectId,
} = {}) {
  const project = result?.project ?? {};
  const global = result?.global ?? {};
  const projectCandidates = Array.isArray(project.candidates) ? project.candidates : [];
  const globalCandidates = Array.isArray(global.candidates) ? global.candidates : [];
  const total = projectCandidates.length + globalCandidates.length;
  if (total === 0) return null;

  const byArtifactType = {};
  for (const c of [...projectCandidates, ...globalCandidates]) {
    byArtifactType[c.artifact_type] = (byArtifactType[c.artifact_type] || 0) + 1;
  }

  const note = {
    ts: now,
    type: 'learning_candidates',
    total,
    by_scope: { project: projectCandidates.length, global: globalCandidates.length },
    by_artifact_type: byArtifactType,
    dashboard_command: dashboardCommand,
    message: `ArcForge learned ${total} candidate suggestion(s). Open review: ${dashboardCommand}`,
  };
  if (projectId) note.project_id = projectId;
  return note;
}

function getNotificationsPath({ projectRoot = process.cwd(), homeDir } = {}) {
  const projectId = learning.getProjectId(projectRoot);
  return path.join(
    homeDir || os.homedir(),
    '.arcforge',
    'learning',
    'notifications',
    `${projectId}.jsonl`,
  );
}

function writeLearningNotification(notification, { projectRoot = process.cwd(), homeDir } = {}) {
  if (!notification) return null;
  const filePath = getNotificationsPath({ projectRoot, homeDir });
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(notification)}\n`, 'utf8');
  return filePath;
}

// ── HTTP server ────────────────────────────────────────────────────────────

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
  'X-Content-Type-Options': 'nosniff',
};

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

function parseScope(url) {
  const scope = url.searchParams.get('scope') || 'project';
  if (scope !== 'project' && scope !== 'global') return null;
  return scope;
}

function hasDashboardWriteHeader(req, writeToken) {
  if (!writeToken || typeof writeToken !== 'string') return false;
  if (req.headers['x-arcforge-dashboard'] !== '1') return false;
  return req.headers['x-arcforge-dashboard-token'] === writeToken;
}

function createRouter({ projectRoot, homeDir, htmlBody, writeToken }) {
  return async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = url.pathname;
    const method = req.method || 'GET';

    if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      return sendHtml(res, htmlBody);
    }

    if (method === 'GET' && pathname === '/api/learning') {
      const scope = parseScope(url);
      if (!scope) return sendError(res, 400, 'invalid scope');
      try {
        return sendJson(res, createDashboardModel({ scope, projectRoot, homeDir }));
      } catch {
        return sendError(res, 500, 'learning dashboard failed to load suggestions');
      }
    }

    const detailMatch = pathname.match(/^\/api\/candidates\/([^/]+)$/);
    if (method === 'GET' && detailMatch) {
      const scope = parseScope(url);
      if (!scope) return sendError(res, 400, 'invalid scope');
      try {
        return sendJson(
          res,
          sanitizeDashboardDetail(detailMatch[1], { scope, projectRoot, homeDir }),
        );
      } catch (err) {
        if (err.code === 'NOT_FOUND') return sendError(res, 404, 'candidate not found');
        return sendError(res, 500, 'learning dashboard failed to load candidate');
      }
    }

    const actionMatch = pathname.match(/^\/api\/candidates\/([^/]+)\/(dismiss|draft|apply)$/);
    if (method === 'POST' && actionMatch) {
      if (!hasDashboardWriteHeader(req, writeToken)) {
        return sendError(res, 403, 'dashboard write header required');
      }
      const scope = parseScope(url);
      if (!scope) return sendError(res, 400, 'invalid scope');
      try {
        await readRequestBody(req);
      } catch (err) {
        return sendError(res, 400, err.message);
      }
      const result = handleDashboardAction({
        action: actionMatch[2],
        id: actionMatch[1],
        scope,
        projectRoot,
        homeDir,
      });
      return sendJson(res, result, result.ok ? 200 : result.status || 400);
    }

    sendError(res, 404, 'Not found');
  };
}

function loadHtml(writeToken = '') {
  const htmlPath = path.join(__dirname, 'learning-dashboard.html');
  try {
    return fs.readFileSync(htmlPath, 'utf8').replace(/__ARCFORGE_DASHBOARD_TOKEN__/g, writeToken);
  } catch {
    return '<!doctype html><meta charset="utf-8"><title>ArcForge learning</title><h1>Dashboard UI missing</h1>';
  }
}

function startServer(options = {}) {
  const { projectRoot = process.cwd(), homeDir, port = 3334, host = '127.0.0.1' } = options;
  const writeToken = crypto.randomBytes(24).toString('hex');
  const htmlBody = loadHtml(writeToken);
  const router = createRouter({ projectRoot, homeDir, htmlBody, writeToken });

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
  ARTIFACT_TYPE_LABELS,
  STATUS_LABELS,
  artifactTypeLabel,
  statusLabel,
  nextUserAction,
  sanitizeDashboardCandidate,
  sanitizeDashboardDetail,
  createDashboardModel,
  handleDashboardAction,
  buildLearningNotification,
  writeLearningNotification,
  getNotificationsPath,
  hasDashboardWriteHeader,
  createRouter,
  startServer,
};
