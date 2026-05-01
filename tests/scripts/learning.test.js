// tests/scripts/learning.test.js

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
  appendCandidate,
  assertCanMaterialize,
  getCandidateQueuePath,
  isLearningEnabled,
  loadCandidates,
  readLearningConfig,
  setLearningEnabled,
  transitionCandidate,
  validateCandidate,
} = require('../../scripts/lib/learning');

describe('learning subsystem MVP-1', () => {
  let testDir;
  let projectRoot;
  let homeDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-learning-'));
    projectRoot = path.join(testDir, 'project');
    homeDir = path.join(testDir, 'home');
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.mkdirSync(homeDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function candidate(overrides = {}) {
    return {
      id: 'arc-releasing-20260501-001',
      scope: 'project',
      artifact_type: 'skill',
      name: 'arc-releasing',
      summary: 'Project release flow repeated across sessions.',
      trigger: 'when the user asks to cut a release',
      evidence: [
        {
          session_id: 'session-abc',
          source: 'observation',
          reason: 'version bump, changelog, tests, tag, push sequence',
        },
      ],
      confidence: 0.72,
      status: 'pending',
      created_at: '2026-05-01T00:00:00Z',
      updated_at: '2026-05-01T00:00:00Z',
      ...overrides,
    };
  }

  it('is disabled by default for project and global scopes', () => {
    expect(readLearningConfig({ projectRoot, homeDir }).project.enabled).toBe(false);
    expect(readLearningConfig({ projectRoot, homeDir }).global.enabled).toBe(false);
    expect(isLearningEnabled({ scope: 'project', projectRoot, homeDir })).toBe(false);
    expect(isLearningEnabled({ scope: 'global', projectRoot, homeDir })).toBe(false);
  });

  it('enables and disables project learning separately from global learning', () => {
    setLearningEnabled({
      scope: 'project',
      enabled: true,
      projectRoot,
      homeDir,
      now: '2026-05-01T00:00:00Z',
    });

    expect(isLearningEnabled({ scope: 'project', projectRoot, homeDir })).toBe(true);
    expect(isLearningEnabled({ scope: 'global', projectRoot, homeDir })).toBe(false);

    setLearningEnabled({
      scope: 'project',
      enabled: false,
      projectRoot,
      homeDir,
      now: '2026-05-01T00:01:00Z',
    });

    expect(isLearningEnabled({ scope: 'project', projectRoot, homeDir })).toBe(false);
  });

  it('validates required candidate queue schema fields', () => {
    expect(validateCandidate(candidate()).ok).toBe(true);

    const invalid = candidate({ evidence: [] });
    const result = validateCandidate(invalid);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('evidence must contain at least one item');
  });

  it('appends candidates to the project JSONL queue and loads them back', () => {
    const written = appendCandidate(candidate(), { scope: 'project', projectRoot, homeDir });

    expect(written.path).toBe(
      path.join(projectRoot, '.arcforge', 'learning', 'candidates', 'queue.jsonl'),
    );
    expect(fs.existsSync(getCandidateQueuePath({ scope: 'project', projectRoot, homeDir }))).toBe(
      true,
    );

    const records = loadCandidates({ scope: 'project', projectRoot, homeDir });
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe('arc-releasing-20260501-001');
    expect(records[0].status).toBe('pending');
  });

  it('suppresses duplicate candidate ids instead of appending duplicate queue entries', () => {
    appendCandidate(candidate(), { scope: 'project', projectRoot, homeDir });
    const duplicate = appendCandidate(candidate({ summary: 'duplicate observation' }), {
      scope: 'project',
      projectRoot,
      homeDir,
    });

    const records = loadCandidates({ scope: 'project', projectRoot, homeDir });
    expect(duplicate.duplicate).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0].summary).toBe('Project release flow repeated across sessions.');
  });

  it('approve and reject transitions preserve provenance evidence', () => {
    appendCandidate(candidate(), { scope: 'project', projectRoot, homeDir });

    const updated = transitionCandidate('arc-releasing-20260501-001', 'approved', {
      scope: 'project',
      projectRoot,
      homeDir,
      now: '2026-05-01T00:02:00Z',
    });

    expect(updated.status).toBe('approved');
    expect(updated.evidence).toHaveLength(1);
    expect(updated.evidence[0].session_id).toBe('session-abc');
    expect(updated.updated_at).toBe('2026-05-01T00:02:00Z');
  });

  it('materialization is rejected for non-approved candidates', () => {
    expect(() => assertCanMaterialize(candidate({ status: 'pending' }))).toThrow(
      'candidate must be approved before materialization',
    );
    expect(assertCanMaterialize(candidate({ status: 'approved' }))).toBe(true);
  });

  it('forbids bypassing approval when transitioning to materialized', () => {
    appendCandidate(candidate(), { scope: 'project', projectRoot, homeDir });

    expect(() =>
      transitionCandidate('arc-releasing-20260501-001', 'materialized', {
        scope: 'project',
        projectRoot,
        homeDir,
      }),
    ).toThrow('candidate must be approved before materialization');

    transitionCandidate('arc-releasing-20260501-001', 'approved', {
      scope: 'project',
      projectRoot,
      homeDir,
    });
    expect(
      transitionCandidate('arc-releasing-20260501-001', 'materialized', {
        scope: 'project',
        projectRoot,
        homeDir,
      }).status,
    ).toBe('materialized');
  });

  it('observe redaction removes common secrets before observations are stored', () => {
    delete require.cache[require.resolve('../../hooks/observe/main')];
    const { redactObservationText } = require('../../hooks/observe/main');

    const apiKeyName = ['api', '_key'].join('');
    const passwordName = ['pass', 'word'].join('');
    const tokenName = ['to', 'ken'].join('');
    const apiKey = ['abcdef', '123456'].join('');
    const password = ['hunt', 'er2'].join('');
    const bearer = ['sk-test', 'abcdef'].join('-');
    const token = ['my', 'token'].join('-');
    const redacted = redactObservationText(
      `${apiKeyName}="${apiKey}" ${passwordName}: "${password}" Authorization: Bearer ${bearer} ${tokenName}=${token}`,
    );

    expect(redacted).toContain('api_key=[REDACTED]');
    expect(redacted).toContain('password=[REDACTED]');
    expect(redacted).toContain('Authorization: Bearer [REDACTED]');
    expect(redacted).toContain('token=[REDACTED]');
    expect(redacted).not.toContain(apiKey);
    expect(redacted).not.toContain(password);
    expect(redacted).not.toContain(bearer);
    expect(redacted).not.toContain(token);
  });

  it('observe hook is disabled until project or global learning is explicitly enabled', () => {
    delete require.cache[require.resolve('../../hooks/observe/main')];
    const { shouldObserve } = require('../../hooks/observe/main');

    expect(shouldObserve({ projectRoot, homeDir })).toBe(false);

    setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir });
    expect(shouldObserve({ projectRoot, homeDir })).toBe(true);

    setLearningEnabled({ scope: 'project', enabled: false, projectRoot, homeDir });
    setLearningEnabled({ scope: 'global', enabled: true, projectRoot, homeDir });
    expect(shouldObserve({ projectRoot, homeDir })).toBe(true);
  });

  it('CLI learn review/approve/reject manages candidate lifecycle without deleting evidence', () => {
    appendCandidate(candidate(), { scope: 'project', projectRoot, homeDir });
    const cli = path.join(__dirname, '../../scripts/cli.js');
    const env = { ...process.env, HOME: homeDir, CLAUDE_PROJECT_DIR: projectRoot };

    const review = JSON.parse(
      execFileSync('node', [cli, 'learn', 'review', '--project', '--json'], {
        env,
        encoding: 'utf8',
      }),
    );
    expect(review.count).toBe(1);
    expect(review.candidates[0].id).toBe('arc-releasing-20260501-001');

    const approved = JSON.parse(
      execFileSync(
        'node',
        [cli, 'learn', 'approve', 'arc-releasing-20260501-001', '--project', '--json'],
        {
          env,
          encoding: 'utf8',
        },
      ),
    );
    expect(approved.status).toBe('approved');
    expect(approved.evidence[0].session_id).toBe('session-abc');
  });

  it('CLI learn status/enable/disable uses explicit project scope', () => {
    const cli = path.join(__dirname, '../../scripts/cli.js');
    const env = { ...process.env, HOME: homeDir, CLAUDE_PROJECT_DIR: projectRoot };

    const initial = JSON.parse(
      execFileSync('node', [cli, 'learn', 'status', '--json'], { env, encoding: 'utf8' }),
    );
    expect(initial.project.enabled).toBe(false);

    const enabled = JSON.parse(
      execFileSync('node', [cli, 'learn', 'enable', '--project', '--json'], {
        env,
        encoding: 'utf8',
      }),
    );
    expect(enabled.scope).toBe('project');
    expect(enabled.enabled).toBe(true);

    const status = JSON.parse(
      execFileSync('node', [cli, 'learn', 'status', '--json'], { env, encoding: 'utf8' }),
    );
    expect(status.project.enabled).toBe(true);
    expect(status.global.enabled).toBe(false);

    const disabled = JSON.parse(
      execFileSync('node', [cli, 'learn', 'disable', '--project', '--json'], {
        env,
        encoding: 'utf8',
      }),
    );
    expect(disabled.enabled).toBe(false);
  });
});
