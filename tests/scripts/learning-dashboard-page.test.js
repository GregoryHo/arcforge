// tests/scripts/learning-dashboard-page.test.js
//
// #173 — the dashboard page's Activate and Deactivate buttons. The page's own
// script runs in a vm with a minimal DOM stub, and its fetch goes through the
// real router into the real action handler, so what is asserted is the page
// showing the behavior-change warning (and, for activate, the active target
// path) and then sending the safety_ack for exactly what it showed — the
// round trip that used to come back `missing_safety_ack`.

const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const HTML_PATH = path.join(__dirname, '../../scripts/lib/learning-dashboard.html');
const TOKEN = 'tok';

let tmpDir;
let homedirSpy;
let appendCandidate;
let readCurrentCandidates;
let appendTransitionEvent;
let handleDashboardAction;
let createRouter;
let buildActiveInstinctPath;

beforeEach(() => {
  jest.resetModules();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-dash-page-'));
  homedirSpy = jest.spyOn(os, 'homedir').mockReturnValue(tmpDir);
  ({
    appendCandidate,
    readCurrentCandidates,
  } = require('../../scripts/lib/learning-curator/queue-writer'));
  ({ appendTransitionEvent } = require('../../scripts/lib/learning-curator/dashboard-events'));
  ({ handleDashboardAction, createRouter } = require('../../scripts/lib/learning-dashboard'));
  ({ buildActiveInstinctPath } = require('../../scripts/lib/learning-curator/activate'));
});

afterEach(() => {
  homedirSpy.mockRestore();
  jest.resetModules();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeCandidateRecord(id) {
  return {
    schema_version: 1,
    candidate_id: id,
    artifact_type: 'instinct',
    scope: { kind: 'project', project: 'test-project', project_id: 'proj-abc123' },
    source: { source_type: 'layer4_llm_curator' },
    name: 'use-edit-bash-workflow',
    summary: 'Prefer Edit before Bash in the same turn.',
    rationale: 'Observed in 3 sessions.',
    body: 'When editing files, prefer Edit then Bash.',
    body_source: 'llm_curator',
    domain: 'workflow',
    evidence: [
      { evidence_id: 'ev-001', evidence_type: 'observation', relevance: 'a', summary: 'a' },
      { evidence_id: 'ev-002', evidence_type: 'observation', relevance: 'b', summary: 'b' },
    ],
    evidence_quality: 'low',
    evidence_quality_metadata: { rule_version: 'v1', basis: { project_obs_count: 5 } },
    lifecycle: { status: 'pending_review', status_changed_at: '2026-05-01T00:00:00Z' },
    safety: {
      validator_version: 'v1',
      sanitizer_policy_version: 'v1',
      sanitizer_module: 'scripts/lib/sanitize-observation.js',
      raw_prompt_included: false,
      raw_response_included: false,
      raw_hook_payloads_included: false,
      raw_transcripts_included: false,
      edit_bodies_included: false,
      skill_args_included: false,
      secret_scan: { status: 'passed', rule_version: 'v1' },
      activation_claim_scan: { status: 'passed' },
      file_write_claim_scan: { status: 'passed' },
    },
    dedupe: { dedupe_key: 'use-edit-bash-workflow-v1', dedupe_basis: { name_hash: 'abc' } },
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
  };
}

function materializedCandidate() {
  const record = makeCandidateRecord('cand-page-001');
  appendCandidate(record);
  appendTransitionEvent(record.candidate_id, 'approve', 'approved');
  const mat = handleDashboardAction({ action: 'materialize', candidate_id: record.candidate_id });
  expect(mat.accepted).toBe(true);
  return record;
}

function statusOf(id) {
  return readCurrentCandidates()[id].lifecycle.status;
}

async function routeRequest(router, { method = 'GET', url = '/', headers = {}, body = '' }) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = { host: '127.0.0.1', ...headers };
  req.destroy = () => req.emit('error', new Error('destroyed'));
  const res = {
    statusCode: undefined,
    body: '',
    writeHead(statusCode) {
      this.statusCode = statusCode;
    },
    end(chunk = '') {
      this.body += chunk;
    },
  };
  const promise = router(req, res);
  process.nextTick(() => {
    if (body) req.emit('data', Buffer.from(body));
    req.emit('end');
  });
  await promise;
  return res;
}

function fakeElement() {
  return {
    children: [],
    firstChild: null,
    style: {},
    dataset: {},
    className: '',
    textContent: '',
    disabled: false,
    appendChild(child) {
      this.children.push(child);
      this.firstChild = this.children[0];
      return child;
    },
    removeChild(child) {
      this.children = this.children.filter((c) => c !== child);
      this.firstChild = this.children[0] || null;
    },
    addEventListener() {},
    querySelector() {
      return null;
    },
    remove() {},
  };
}

/** Run the page's script against the real router; `confirmAnswer` is the reviewer's reply. */
async function loadPage({ confirmAnswer }) {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const script = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>'));
  const router = createRouter({ htmlBody: html, writeToken: TOKEN });
  const shown = { confirms: [], alerts: [], posts: [] };

  async function fetchStub(url, opts = {}) {
    const headers = {};
    for (const [k, v] of Object.entries(opts.headers || {})) headers[k.toLowerCase()] = v;
    if (opts.method === 'POST') shown.posts.push(JSON.parse(opts.body));
    const res = await routeRequest(router, {
      method: opts.method || 'GET',
      url,
      headers,
      body: opts.body || '',
    });
    return {
      ok: res.statusCode < 400,
      status: res.statusCode,
      json: async () => JSON.parse(res.body),
    };
  }

  const context = vm.createContext({
    document: {
      getElementById: () => fakeElement(),
      createElement: () => fakeElement(),
      createTextNode: (text) => ({ textContent: text }),
    },
    fetch: fetchStub,
    confirm: (message) => {
      shown.confirms.push(message);
      return confirmAnswer;
    },
    alert: (message) => shown.alerts.push(message),
    encodeURIComponent,
    JSON,
    Object,
  });
  vm.runInContext(script.replace(/__ARCFORGE_DASHBOARD_TOKEN__/g, TOKEN), context);
  await new Promise((resolve) => setImmediate(resolve));
  return { page: context, shown };
}

describe('dashboard page — Activate', () => {
  it('shows the warning and the active target path, then activates', async () => {
    const record = materializedCandidate();
    const { page, shown } = await loadPage({ confirmAnswer: true });

    await page.performAction(record.candidate_id, 'activate', fakeElement());

    expect(shown.confirms).toHaveLength(1);
    expect(shown.confirms[0]).toContain('changes how future sessions behave');
    const target = buildActiveInstinctPath(path.join(tmpDir, '.arcforge'), record);
    expect(shown.confirms[0]).toContain(target);
    expect(shown.posts.at(-1).safety_ack).toEqual({
      reviewer_saw_behavior_change_warning: true,
      reviewer_saw_target_path_summary: true,
    });
    expect(shown.alerts).toEqual([]);
    expect(statusOf(record.candidate_id)).toBe('activated');
    expect(fs.existsSync(target)).toBe(true);
  });

  it('sends nothing when the reviewer declines', async () => {
    const record = materializedCandidate();
    const { page, shown } = await loadPage({ confirmAnswer: false });

    await page.performAction(record.candidate_id, 'activate', fakeElement());

    expect(shown.confirms).toHaveLength(1);
    expect(shown.posts).toEqual([]);
    expect(statusOf(record.candidate_id)).toBe('materialized');
  });
});

describe('dashboard page — Deactivate', () => {
  it('shows the warning, then deactivates', async () => {
    const record = materializedCandidate();
    const act = handleDashboardAction({
      action: 'activate',
      candidate_id: record.candidate_id,
      safety_ack: {
        reviewer_saw_behavior_change_warning: true,
        reviewer_saw_target_path_summary: true,
      },
    });
    expect(act.accepted).toBe(true);
    const { page, shown } = await loadPage({ confirmAnswer: true });

    await page.performAction(record.candidate_id, 'deactivate', fakeElement());

    expect(shown.confirms).toHaveLength(1);
    expect(shown.confirms[0]).toContain('changes how future sessions behave');
    expect(shown.posts.at(-1).safety_ack).toEqual({ reviewer_saw_behavior_change_warning: true });
    expect(shown.alerts).toEqual([]);
    expect(statusOf(record.candidate_id)).toBe('deactivated');
  });
});

describe('dashboard page — actions that change nothing about behavior', () => {
  it('approve asks for no acknowledgement and sends none', async () => {
    const record = makeCandidateRecord('cand-page-002');
    appendCandidate(record);
    const { page, shown } = await loadPage({ confirmAnswer: true });

    await page.performAction(record.candidate_id, 'approve', fakeElement());

    expect(shown.confirms).toEqual([]);
    expect(shown.posts.at(-1)).toEqual({ action: 'approve' });
    expect(statusOf(record.candidate_id)).toBe('approved');
  });
});
