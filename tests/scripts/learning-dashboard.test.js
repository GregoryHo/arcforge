// tests/scripts/learning-dashboard.test.js
//
// Tests for the user-facing learning dashboard:
// - safe dashboard model (no raw evidence/transcript leakage, user-facing labels)
// - HTTP route handlers for dismiss / draft / apply with scope + artifact_type gating
// - hook notification builder/writer (privacy-safe, only safe fields)

const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  appendCandidate,
  setLearningEnabled,
  loadCandidates,
} = require('../../scripts/lib/learning');

const {
  artifactTypeLabel,
  statusLabel,
  nextUserAction,
  sanitizeDashboardCandidate,
  createDashboardModel,
  sanitizeDashboardDetail,
  handleDashboardAction,
  createRouter,
  hasDashboardWriteHeader,
  buildLearningNotification,
  writeLearningNotification,
} = require('../../scripts/lib/learning-dashboard');

describe('learning-dashboard', () => {
  let testDir;
  let projectRoot;
  let homeDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-learning-dash-'));
    projectRoot = path.join(testDir, 'project');
    homeDir = path.join(testDir, 'home');
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.mkdirSync(homeDir, { recursive: true });
    setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir });
    setLearningEnabled({ scope: 'global', enabled: true, projectRoot, homeDir });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function candidate(overrides = {}) {
    return {
      id: 'arc-learned-project-edit-bash-workflow',
      scope: 'project',
      artifact_type: 'skill',
      name: 'arc-learned-edit-bash-workflow',
      summary: 'Project behavior repeated across 3 sessions: Edit → Bash.',
      trigger: 'when this project work repeatedly follows the Edit → Bash tool workflow',
      evidence: [
        {
          session_id: 'session-1',
          source: 'observation',
          reason: 'Repeated Edit → Bash workflow in project observations',
        },
      ],
      confidence: 0.7,
      status: 'pending',
      created_at: '2026-05-01T00:00:00Z',
      updated_at: '2026-05-01T00:00:00Z',
      ...overrides,
    };
  }

  async function routeRequest(router, { method = 'GET', url = '/', headers = {}, body = '' } = {}) {
    const req = new EventEmitter();
    req.method = method;
    req.url = url;
    req.headers = { host: '127.0.0.1', ...headers };
    req.destroy = () => req.emit('error', new Error('destroyed'));

    const res = {
      statusCode: undefined,
      headers: undefined,
      body: '',
      writeHead(statusCode, responseHeaders) {
        this.statusCode = statusCode;
        this.headers = responseHeaders;
      },
      end(chunk = '') {
        this.body += chunk;
      },
    };

    const promise = router(req, res);
    process.nextTick(() => {
      if (body) req.emit('data', Buffer.isBuffer(body) ? body : Buffer.from(body));
      req.emit('end');
    });
    await promise;
    return res;
  }

  // ── Labels & action prose ─────────────────────────────────────────────────

  it('exposes user-facing labels for every artifact type', () => {
    expect(artifactTypeLabel('skill')).toBe('Skill suggestion');
    expect(artifactTypeLabel('instinct')).toBe('Instinct / habit');
    expect(artifactTypeLabel('command')).toBe('Command suggestion');
    expect(artifactTypeLabel('agent')).toBe('Agent suggestion');
    expect(artifactTypeLabel('eval')).toBe('Eval suggestion');
    expect(artifactTypeLabel('repo_convention_patch')).toBe(
      'CLAUDE.md / repo convention suggestion',
    );
  });

  it('translates internal lifecycle statuses to user-facing labels', () => {
    expect(statusLabel('pending')).toBe('New');
    expect(statusLabel('approved')).toBe('Saved');
    expect(statusLabel('materialized')).toBe('Drafted');
    expect(statusLabel('activated')).toBe('Applied');
    expect(statusLabel('rejected')).toBe('Dismissed');
    expect(statusLabel('<img src=x onerror=alert(1)>')).toBe('Unknown');
  });

  it('next user action avoids internal lifecycle jargon', () => {
    const actionPending = nextUserAction(candidate());
    expect(actionPending).toMatch(/draft|review|dismiss/i);
    expect(actionPending).not.toMatch(/materialize|activate|approve/i);

    const actionPatch = nextUserAction(
      candidate({ artifact_type: 'repo_convention_patch', status: 'materialized' }),
    );
    expect(actionPatch).toMatch(/manual|review/i);
    expect(actionPatch).not.toMatch(/activate/i);
  });

  // ── Sanitized card model ──────────────────────────────────────────────────

  it('sanitized dashboard candidate omits raw evidence, draft paths, and trigger text', () => {
    const c = candidate();
    const card = sanitizeDashboardCandidate(c);

    expect(card.id).toBe(c.id);
    expect(card.artifact_type_label).toBe('Skill suggestion');
    expect(card.status_label).toBe('New');
    expect(card.evidence_count).toBe(1);
    expect(card.next_user_action).toBeTruthy();

    // Privacy-critical: no raw evidence array, no draft_paths, no trigger text.
    expect(card.evidence).toBeUndefined();
    expect(card.draft_paths).toBeUndefined();
    expect(card.active_paths).toBeUndefined();
    expect(card.trigger).toBeUndefined();

    // Stringification must not contain raw evidence reason text.
    expect(JSON.stringify(card)).not.toContain(
      'Repeated Edit → Bash workflow in project observations',
    );
  });

  it('sanitized dashboard candidate redacts unsafe display text from manual or legacy records', () => {
    const card = sanitizeDashboardCandidate(
      candidate({
        name: 'token=supersecretvalue /Users/greg/private/project/file.js',
        summary: 'Use /Users/greg/private/project/file.js with api_key="abc123456789"',
        status: '<img src=x onerror=alert(1)>',
      }),
    );

    const serialized = JSON.stringify(card);
    expect(card.status_label).toBe('Unknown');
    expect(serialized).not.toContain('supersecretvalue');
    expect(serialized).not.toContain('abc123456789');
    expect(serialized).not.toContain('/Users/greg/private');
    expect(card.name).toContain('[path]');
    expect(card.summary).toContain('[REDACTED]');
  });

  it('sanitized card flags eligible actions per scope and artifact_type', () => {
    const projectPending = sanitizeDashboardCandidate(candidate({ status: 'pending' }));
    expect(projectPending.can_dismiss).toBe(true);
    expect(projectPending.can_draft).toBe(true);
    expect(projectPending.can_apply).toBe(false);

    const projectDrafted = sanitizeDashboardCandidate(candidate({ status: 'materialized' }));
    expect(projectDrafted.can_apply).toBe(false);

    const globalPending = sanitizeDashboardCandidate(candidate({ scope: 'global' }));
    expect(globalPending.can_dismiss).toBe(true);
    expect(globalPending.can_draft).toBe(false);
    expect(globalPending.can_apply).toBe(false);

    const patch = sanitizeDashboardCandidate(
      candidate({ artifact_type: 'repo_convention_patch', status: 'pending' }),
    );
    expect(patch.can_draft).toBe(true);
    // repo_convention_patch never auto-applies — even from project scope.
    expect(patch.can_apply).toBe(false);

    const activated = sanitizeDashboardCandidate(candidate({ status: 'activated' }));
    expect(activated.can_dismiss).toBe(false);
    expect(activated.can_draft).toBe(false);
    expect(activated.can_apply).toBe(false);

    const rejected = sanitizeDashboardCandidate(candidate({ status: 'rejected' }));
    expect(rejected.can_dismiss).toBe(false);
    expect(rejected.can_draft).toBe(false);
    expect(rejected.can_apply).toBe(false);
  });

  // ── Compact model for GET /api/learning ──────────────────────────────────

  it('createDashboardModel returns sanitized cards plus counts', () => {
    appendCandidate(candidate({ id: 'a' }), { scope: 'project', projectRoot, homeDir });
    appendCandidate(candidate({ id: 'b', status: 'pending' }), {
      scope: 'project',
      projectRoot,
      homeDir,
    });

    const model = createDashboardModel({ scope: 'project', projectRoot, homeDir });

    expect(model.scope).toBe('project');
    expect(model.count).toBe(2);
    expect(model.candidates).toHaveLength(2);
    for (const card of model.candidates) {
      expect(card).not.toHaveProperty('evidence');
      expect(card).not.toHaveProperty('trigger');
      expect(card.artifact_type_label).toBeTruthy();
      expect(card.status_label).toBeTruthy();
    }
  });

  // ── Detail sanitizer ──────────────────────────────────────────────────────

  it('sanitizeDashboardDetail strips raw evidence reasons and exposes only counts', () => {
    appendCandidate(candidate(), { scope: 'project', projectRoot, homeDir });
    const detail = sanitizeDashboardDetail(candidate().id, {
      scope: 'project',
      projectRoot,
      homeDir,
    });

    expect(detail.candidate.id).toBe(candidate().id);
    expect(detail.candidate.evidence_count).toBe(1);
    // No raw evidence array in detail either.
    expect(detail.candidate).not.toHaveProperty('evidence');
    expect(detail.candidate).not.toHaveProperty('trigger');
    expect(detail.next_user_action).toBeTruthy();
  });

  // ── POST action handler ───────────────────────────────────────────────────

  it('requires the dashboard write header for browser-facing POST routes', () => {
    expect(hasDashboardWriteHeader({ headers: {} })).toBe(false);
    expect(hasDashboardWriteHeader({ headers: { 'x-arcforge-dashboard': '1' } })).toBe(false);
    expect(
      hasDashboardWriteHeader(
        { headers: { 'x-arcforge-dashboard': '1', 'x-arcforge-dashboard-token': 'wrong' } },
        'expected',
      ),
    ).toBe(false);
    expect(
      hasDashboardWriteHeader(
        { headers: { 'x-arcforge-dashboard': '1', 'x-arcforge-dashboard-token': 'expected' } },
        'expected',
      ),
    ).toBe(true);
  });

  it('HTTP write route requires the per-server dashboard token', async () => {
    appendCandidate(candidate(), { scope: 'project', projectRoot, homeDir });
    const router = createRouter({
      projectRoot,
      homeDir,
      htmlBody: '<html></html>',
      writeToken: 'expected-token',
    });

    const res = await routeRequest(router, {
      method: 'POST',
      url: `/api/candidates/${candidate().id}/dismiss?scope=project`,
      headers: { 'x-arcforge-dashboard': '1', 'x-arcforge-dashboard-token': 'wrong' },
      body: '{}',
    });

    expect(res.statusCode).toBe(403);
    const records = loadCandidates({ scope: 'project', projectRoot, homeDir });
    expect(records[0].status).toBe('pending');
  });

  it('HTTP write route rejects oversized bodies before mutating state', async () => {
    appendCandidate(candidate(), { scope: 'project', projectRoot, homeDir });
    const router = createRouter({
      projectRoot,
      homeDir,
      htmlBody: '<html></html>',
      writeToken: 'expected-token',
    });

    const res = await routeRequest(router, {
      method: 'POST',
      url: `/api/candidates/${candidate().id}/dismiss?scope=project`,
      headers: {
        'x-arcforge-dashboard': '1',
        'x-arcforge-dashboard-token': 'expected-token',
      },
      body: Buffer.alloc(70 * 1024, 'x'),
    });

    expect(res.statusCode).toBe(400);
    const records = loadCandidates({ scope: 'project', projectRoot, homeDir });
    expect(records[0].status).toBe('pending');
  });

  it('dismiss action transitions candidate to rejected', () => {
    appendCandidate(candidate(), { scope: 'project', projectRoot, homeDir });
    const result = handleDashboardAction({
      action: 'dismiss',
      id: candidate().id,
      scope: 'project',
      projectRoot,
      homeDir,
    });
    expect(result.ok).toBe(true);
    const records = loadCandidates({ scope: 'project', projectRoot, homeDir });
    expect(records[0].status).toBe('rejected');
  });

  it('dismiss action refuses already-applied suggestions', () => {
    appendCandidate(candidate({ status: 'activated' }), { scope: 'project', projectRoot, homeDir });
    const result = handleDashboardAction({
      action: 'dismiss',
      id: candidate().id,
      scope: 'project',
      projectRoot,
      homeDir,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/cannot be dismissed|current state/i);
    const records = loadCandidates({ scope: 'project', projectRoot, homeDir });
    expect(records[0].status).toBe('activated');
  });

  it('draft action is project-only — global scope refuses', () => {
    appendCandidate(candidate({ scope: 'global', id: 'g1' }), {
      scope: 'global',
      projectRoot,
      homeDir,
    });
    const result = handleDashboardAction({
      action: 'draft',
      id: 'g1',
      scope: 'global',
      projectRoot,
      homeDir,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/project/i);
  });

  it('draft action approves+materializes a project candidate via accept', () => {
    appendCandidate(candidate(), { scope: 'project', projectRoot, homeDir });
    const result = handleDashboardAction({
      action: 'draft',
      id: candidate().id,
      scope: 'project',
      projectRoot,
      homeDir,
    });
    expect(result.ok).toBe(true);
    const records = loadCandidates({ scope: 'project', projectRoot, homeDir });
    expect(records[0].status).toBe('materialized');
  });

  it('draft action refuses candidates that are already drafted or otherwise ineligible', () => {
    appendCandidate(candidate(), { scope: 'project', projectRoot, homeDir });
    const first = handleDashboardAction({
      action: 'draft',
      id: candidate().id,
      scope: 'project',
      projectRoot,
      homeDir,
    });
    expect(first.ok).toBe(true);

    const second = handleDashboardAction({
      action: 'draft',
      id: candidate().id,
      scope: 'project',
      projectRoot,
      homeDir,
    });
    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/draft|current state/i);
    const records = loadCandidates({ scope: 'project', projectRoot, homeDir });
    expect(records[0].status).toBe('materialized');
  });

  it('draft action rolls back pending status when draft materialization fails', () => {
    appendCandidate(candidate(), { scope: 'project', projectRoot, homeDir });
    const draftPath = path.join(projectRoot, 'skills', candidate().name, 'SKILL.md.draft');
    fs.mkdirSync(path.dirname(draftPath), { recursive: true });
    fs.writeFileSync(draftPath, '# user edited draft\n', 'utf8');

    const result = handleDashboardAction({
      action: 'draft',
      id: candidate().id,
      scope: 'project',
      projectRoot,
      homeDir,
    });
    expect(result.ok).toBe(false);
    expect(result.error).not.toContain(projectRoot);
    const records = loadCandidates({ scope: 'project', projectRoot, homeDir });
    expect(records[0].status).toBe('pending');
  });

  it('dashboard apply action is intentionally disabled for every scope and state', () => {
    appendCandidate(candidate(), { scope: 'project', projectRoot, homeDir });
    const result = handleDashboardAction({
      action: 'apply',
      id: candidate().id,
      scope: 'project',
      projectRoot,
      homeDir,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(result.requires_review).toBe(true);
    expect(result.error).toMatch(/disabled|draft|review/i);
    const records = loadCandidates({ scope: 'project', projectRoot, homeDir });
    expect(records[0].status).toBe('pending');
  });

  it('dashboard apply action stays disabled after a project draft is saved', () => {
    appendCandidate(candidate(), { scope: 'project', projectRoot, homeDir });
    const draft = handleDashboardAction({
      action: 'draft',
      id: candidate().id,
      scope: 'project',
      projectRoot,
      homeDir,
    });
    expect(draft.ok).toBe(true);

    const result = handleDashboardAction({
      action: 'apply',
      id: candidate().id,
      scope: 'project',
      projectRoot,
      homeDir,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(result.error).toMatch(/disabled|draft|review/i);
    const records = loadCandidates({ scope: 'project', projectRoot, homeDir });
    expect(records[0].status).toBe('materialized');
  });

  it('dashboard action errors are generic and do not leak filesystem paths', () => {
    appendCandidate(candidate(), { scope: 'project', projectRoot, homeDir });
    const draft = handleDashboardAction({
      action: 'draft',
      id: candidate().id,
      scope: 'project',
      projectRoot,
      homeDir,
    });
    expect(draft.ok).toBe(true);

    const result = handleDashboardAction({
      action: 'draft',
      id: candidate().id,
      scope: 'project',
      projectRoot,
      homeDir,
    });
    expect(result.ok).toBe(false);
    expect(result.error).not.toContain(projectRoot);
  });

  it('rejects unknown action names', () => {
    appendCandidate(candidate(), { scope: 'project', projectRoot, homeDir });
    const result = handleDashboardAction({
      action: 'erase-everything',
      id: candidate().id,
      scope: 'project',
      projectRoot,
      homeDir,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unknown|invalid/i);
  });

  // ── Hook notification builder/writer ──────────────────────────────────────

  it('buildLearningNotification returns null when no candidates were emitted', () => {
    const note = buildLearningNotification({
      result: {
        project: { scope: 'project', enabled: true, emitted: 0, candidates: [] },
        global: { scope: 'global', enabled: false, emitted: 0, candidates: [] },
      },
      now: '2026-05-07T12:00:00Z',
    });
    expect(note).toBeNull();
  });

  it('buildLearningNotification only includes safe summary fields', () => {
    const note = buildLearningNotification({
      result: {
        project: {
          scope: 'project',
          enabled: true,
          emitted: 2,
          candidates: [candidate(), candidate({ id: 'i1', artifact_type: 'instinct' })],
        },
        global: { scope: 'global', enabled: false, emitted: 0, candidates: [] },
      },
      now: '2026-05-07T12:00:00Z',
    });
    expect(note).not.toBeNull();
    expect(note.total).toBe(2);
    expect(note.by_scope).toEqual({ project: 2, global: 0 });
    expect(note.by_artifact_type).toEqual({ skill: 1, instinct: 1 });
    expect(note.dashboard_command).toMatch(/learn dashboard/);
    expect(note.message).toMatch(/2 candidate/);
    expect(note.ts).toBe('2026-05-07T12:00:00Z');

    // Privacy: never include raw evidence, raw transcript, or candidate body.
    const serialized = JSON.stringify(note);
    expect(serialized).not.toContain('Repeated Edit → Bash workflow');
    expect(serialized).not.toContain('session-1');
    expect(note).not.toHaveProperty('candidates');
    expect(note).not.toHaveProperty('evidence');
  });

  it('writeLearningNotification appends a JSONL line to project state', () => {
    const note = buildLearningNotification({
      result: {
        project: {
          scope: 'project',
          enabled: true,
          emitted: 1,
          candidates: [candidate()],
        },
        global: { scope: 'global', enabled: false, emitted: 0, candidates: [] },
      },
      now: '2026-05-07T12:00:00Z',
    });
    const filePath = writeLearningNotification(note, { projectRoot, homeDir });
    expect(filePath).toBeTruthy();
    expect(filePath.startsWith(path.join(homeDir, '.arcforge', 'learning', 'notifications'))).toBe(
      true,
    );
    expect(filePath.startsWith(projectRoot)).toBe(false);
    expect(fs.existsSync(filePath)).toBe(true);
    const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.total).toBe(1);
    expect(parsed.message).toMatch(/learn dashboard/);
  });

  it('writeLearningNotification is a no-op for null notifications', () => {
    const result = writeLearningNotification(null, { projectRoot, homeDir });
    expect(result).toBeNull();
    const filePath = path.join(homeDir, '.arcforge', 'learning', 'notifications');
    expect(fs.existsSync(filePath)).toBe(false);
  });
});
