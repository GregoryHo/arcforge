/**
 * learning-dashboard-http.js — HTTP layer for the Layer 6 dashboard.
 *
 * Hosts the request router + security headers + write-token check + server
 * lifecycle. The wire-model and action handlers live in `learning-dashboard.js`;
 * this module wires HTTP request/response shapes around those pure builders.
 */

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');

const {
  createDashboardModel,
  sanitizeDashboardDetail,
  handleDashboardAction,
} = require('./learning-dashboard');

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

    if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      return sendHtml(res, htmlBody);
    }

    if (method === 'GET' && pathname === '/api/candidates') {
      try {
        return sendJson(res, createDashboardModel());
      } catch {
        return sendError(res, 500, 'dashboard failed to load candidates');
      }
    }

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
  hasDashboardWriteHeader,
  createRouter,
  startServer,
};
