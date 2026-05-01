// tests/scripts/learning.test.js

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
  activateCandidate,
  appendCandidate,
  assertCanMaterialize,
  getCandidateQueuePath,
  inspectCandidate,
  isLearningEnabled,
  loadCandidates,
  materializeCandidate,
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

  it('rejects evidence items that are not plain objects with required string fields', () => {
    const validItem = {
      session_id: 'session-abc',
      source: 'observation',
      reason: 'release sequence repeated across sessions',
    };

    // Analyzer-shaped evidence with multiple items still passes.
    expect(
      validateCandidate(
        candidate({
          evidence: [
            validItem,
            { session_id: 'session-xyz', source: 'observation', reason: 'changelog edit' },
          ],
        }),
      ).ok,
    ).toBe(true);

    // Non-object evidence item (array).
    expect(validateCandidate(candidate({ evidence: [['not', 'an', 'object']] })).ok).toBe(false);

    // Null evidence item.
    expect(validateCandidate(candidate({ evidence: [null] })).ok).toBe(false);

    // Primitive evidence item.
    expect(validateCandidate(candidate({ evidence: ['just-a-string'] })).ok).toBe(false);

    // Missing session_id.
    expect(
      validateCandidate(candidate({ evidence: [{ source: 'observation', reason: 'r' }] })).ok,
    ).toBe(false);

    // Missing source.
    expect(validateCandidate(candidate({ evidence: [{ session_id: 's', reason: 'r' }] })).ok).toBe(
      false,
    );

    // Missing reason.
    expect(
      validateCandidate(candidate({ evidence: [{ session_id: 's', source: 'observation' }] })).ok,
    ).toBe(false);

    // Blank string session_id (whitespace only).
    expect(
      validateCandidate(
        candidate({
          evidence: [{ session_id: '   ', source: 'observation', reason: 'r' }],
        }),
      ).ok,
    ).toBe(false);

    // Non-string source (number).
    expect(
      validateCandidate(
        candidate({
          evidence: [{ session_id: 's', source: 7, reason: 'r' }],
        }),
      ).ok,
    ).toBe(false);

    // Nested object as a required field value.
    expect(
      validateCandidate(
        candidate({
          evidence: [{ session_id: 's', source: 'observation', reason: { nested: 'payload' } }],
        }),
      ).ok,
    ).toBe(false);

    // Nested array as a required field value.
    expect(
      validateCandidate(
        candidate({
          evidence: [{ session_id: ['s'], source: 'observation', reason: 'r' }],
        }),
      ).ok,
    ).toBe(false);

    // Extra evidence fields are rejected so raw payloads cannot persist in durable candidate records.
    expect(
      validateCandidate(
        candidate({
          evidence: [
            {
              session_id: 's',
              source: 'observation',
              reason: 'r',
              raw_tool_output: 'private terminal transcript',
            },
          ],
        }),
      ).ok,
    ).toBe(false);

    // Custom-prototype objects are not accepted as plain JSON evidence records.
    const customPrototypeItem = Object.create({ inherited: 'payload' });
    customPrototypeItem.session_id = 's';
    customPrototypeItem.source = 'observation';
    customPrototypeItem.reason = 'r';
    expect(validateCandidate(candidate({ evidence: [customPrototypeItem] })).ok).toBe(false);

    // Surface a representative error message so the contract stays explicit.
    const result = validateCandidate(
      candidate({ evidence: [{ session_id: '', source: 'observation', reason: 'r' }] }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((msg) => /evidence/i.test(msg))).toBe(true);
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

  it('materializes approved project skill candidates as inactive draft artifacts', () => {
    appendCandidate(candidate({ status: 'approved' }), { scope: 'project', projectRoot, homeDir });

    const result = materializeCandidate('arc-releasing-20260501-001', {
      scope: 'project',
      projectRoot,
      homeDir,
      now: '2026-05-01T00:03:00Z',
    });

    expect(result.candidate.status).toBe('materialized');
    expect(result.candidate.draft_paths).toEqual([
      'skills/arc-releasing/SKILL.md.draft',
      'tests/skills/test_skill_arc_releasing.py.draft',
    ]);
    expect(fs.existsSync(path.join(projectRoot, 'skills/arc-releasing/SKILL.md.draft'))).toBe(true);
    expect(
      fs.existsSync(path.join(projectRoot, 'tests/skills/test_skill_arc_releasing.py.draft')),
    ).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'skills/arc-releasing/SKILL.md'))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, 'tests/skills/test_skill_arc_releasing.py'))).toBe(
      false,
    );

    const draft = fs.readFileSync(
      path.join(projectRoot, 'skills/arc-releasing/SKILL.md.draft'),
      'utf8',
    );
    expect(draft).toContain('name: arc-releasing');
    expect(draft).toContain('candidate: arc-releasing-20260501-001');
    expect(draft).toContain('Draft artifact only');
  });

  it('refuses to materialize pending or rejected candidates', () => {
    appendCandidate(candidate(), { scope: 'project', projectRoot, homeDir });

    expect(() =>
      materializeCandidate('arc-releasing-20260501-001', {
        scope: 'project',
        projectRoot,
        homeDir,
      }),
    ).toThrow('candidate must be approved before materialization');

    transitionCandidate('arc-releasing-20260501-001', 'rejected', {
      scope: 'project',
      projectRoot,
      homeDir,
    });
    expect(() =>
      materializeCandidate('arc-releasing-20260501-001', {
        scope: 'project',
        projectRoot,
        homeDir,
      }),
    ).toThrow('candidate must be approved before materialization');
  });

  it('refuses to materialize candidates whose recorded scope does not match the queue scope', () => {
    const queuePath = getCandidateQueuePath({ scope: 'project', projectRoot, homeDir });
    fs.mkdirSync(path.dirname(queuePath), { recursive: true });
    fs.writeFileSync(
      queuePath,
      `${JSON.stringify(candidate({ status: 'approved', scope: 'global' }))}\n`,
      'utf8',
    );

    expect(() =>
      materializeCandidate('arc-releasing-20260501-001', {
        scope: 'project',
        projectRoot,
        homeDir,
      }),
    ).toThrow('candidate scope must match requested materialization scope');
    expect(fs.existsSync(path.join(projectRoot, 'skills/arc-releasing/SKILL.md.draft'))).toBe(
      false,
    );
  });

  it('CLI learn materialize writes drafts after approval without activating a skill', () => {
    appendCandidate(candidate(), { scope: 'project', projectRoot, homeDir });
    const cli = path.join(__dirname, '../../scripts/cli.js');
    const env = { ...process.env, HOME: homeDir, CLAUDE_PROJECT_DIR: projectRoot };

    execFileSync('node', [cli, 'learn', 'approve', 'arc-releasing-20260501-001', '--project'], {
      env,
      encoding: 'utf8',
    });
    const materialized = JSON.parse(
      execFileSync(
        'node',
        [cli, 'learn', 'materialize', 'arc-releasing-20260501-001', '--project', '--json'],
        { env, encoding: 'utf8' },
      ),
    );

    expect(materialized.candidate.status).toBe('materialized');
    expect(materialized.candidate.draft_paths).toContain('skills/arc-releasing/SKILL.md.draft');
    expect(fs.existsSync(path.join(projectRoot, 'skills/arc-releasing/SKILL.md.draft'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'skills/arc-releasing/SKILL.md'))).toBe(false);
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

  function writeObservations(records) {
    const { getProjectId } = require('../../scripts/lib/learning');
    const observationPath = path.join(
      homeDir,
      '.arcforge',
      'observations',
      path.basename(projectRoot),
      'observations.jsonl',
    );
    fs.mkdirSync(path.dirname(observationPath), { recursive: true });
    fs.writeFileSync(
      observationPath,
      `${records
        .map((record) => JSON.stringify({ project_id: getProjectId(projectRoot), ...record }))
        .join('\n')}\n`,
      'utf8',
    );
    return observationPath;
  }

  it('analyzes repeated release observations into one pending project skill candidate', () => {
    const { analyzeLearning } = require('../../scripts/lib/learning');
    setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir });
    writeObservations([
      {
        ts: '2026-05-01T00:00:00Z',
        event: 'tool_start',
        tool: 'Bash',
        session: 'session-release-a',
        project: path.basename(projectRoot),
        input: 'npm test && npm run lint && npm version patch && git tag v1.2.3',
      },
      {
        ts: '2026-05-01T01:00:00Z',
        event: 'tool_start',
        tool: 'Bash',
        session: 'session-release-b',
        project: path.basename(projectRoot),
        input: 'update CHANGELOG then run full tests and prepare release push',
      },
    ]);

    const result = analyzeLearning({
      scope: 'project',
      projectRoot,
      homeDir,
      now: '2026-05-01T02:00:00Z',
    });

    expect(result.enabled).toBe(true);
    expect(result.emitted).toBe(1);
    expect(result.candidates[0]).toMatchObject({
      id: 'arc-releasing-20260501-001',
      scope: 'project',
      artifact_type: 'skill',
      name: 'arc-releasing',
      status: 'pending',
    });
    expect(result.candidates[0].trigger).toContain('release');
    expect(result.candidates[0].evidence.map((item) => item.session_id).sort()).toEqual([
      'session-release-a',
      'session-release-b',
    ]);
    expect(result.candidates[0].evidence[0]).not.toHaveProperty('input');

    const queued = loadCandidates({ scope: 'project', projectRoot, homeDir });
    expect(queued).toHaveLength(1);
    expect(queued[0].name).toBe('arc-releasing');
  });

  it('does not emit candidates when learning is disabled or evidence is below threshold', () => {
    const { analyzeLearning } = require('../../scripts/lib/learning');
    writeObservations([
      {
        ts: '2026-05-01T00:00:00Z',
        event: 'tool_start',
        tool: 'Bash',
        session: 'session-release-a',
        project: path.basename(projectRoot),
        input: 'npm test && npm run lint && git tag v1.2.3',
      },
    ]);

    expect(analyzeLearning({ scope: 'project', projectRoot, homeDir }).enabled).toBe(false);
    expect(loadCandidates({ scope: 'project', projectRoot, homeDir })).toHaveLength(0);

    setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir });
    const result = analyzeLearning({ scope: 'project', projectRoot, homeDir });

    expect(result.enabled).toBe(true);
    expect(result.emitted).toBe(0);
    expect(loadCandidates({ scope: 'project', projectRoot, homeDir })).toHaveLength(0);
  });

  it('skips malformed observation lines instead of failing analyzer runs', () => {
    const { analyzeLearning } = require('../../scripts/lib/learning');
    setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir });
    const observationPath = writeObservations([
      {
        ts: '2026-05-01T00:00:00Z',
        event: 'tool_start',
        tool: 'Bash',
        session: 'session-release-a',
        project: path.basename(projectRoot),
        input: 'npm version patch && npm test && git tag v1.2.3',
      },
      {
        ts: '2026-05-01T01:00:00Z',
        event: 'tool_start',
        tool: 'Bash',
        session: 'session-release-b',
        project: path.basename(projectRoot),
        input: 'release notes and full tests before tag and push',
      },
    ]);
    fs.appendFileSync(observationPath, '{not-json}\n', 'utf8');

    const result = analyzeLearning({ scope: 'project', projectRoot, homeDir });

    expect(result.emitted).toBe(1);
    expect(loadCandidates({ scope: 'project', projectRoot, homeDir })).toHaveLength(1);
  });

  it('ignores observations from another project id even when project basenames collide', () => {
    const { analyzeLearning, getProjectId } = require('../../scripts/lib/learning');
    setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir });
    const otherProjectRoot = path.join(testDir, 'other', path.basename(projectRoot));
    writeObservations([
      {
        project_id: getProjectId(otherProjectRoot),
        ts: '2026-05-01T00:00:00Z',
        event: 'tool_start',
        tool: 'Bash',
        session: 'session-release-a',
        project: path.basename(projectRoot),
        input: 'npm version patch && npm test && git tag v1.2.3',
      },
      {
        project_id: getProjectId(otherProjectRoot),
        ts: '2026-05-01T01:00:00Z',
        event: 'tool_start',
        tool: 'Bash',
        session: 'session-release-b',
        project: path.basename(projectRoot),
        input: 'release notes and full tests before tag and push',
      },
    ]);

    const result = analyzeLearning({ scope: 'project', projectRoot, homeDir });

    expect(result.emitted).toBe(0);
    expect(loadCandidates({ scope: 'project', projectRoot, homeDir })).toHaveLength(0);
  });

  it('does not queue duplicate analyzer candidates across multiple days', () => {
    const { analyzeLearning } = require('../../scripts/lib/learning');
    setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir });
    writeObservations([
      {
        ts: '2026-05-01T00:00:00Z',
        event: 'tool_start',
        tool: 'Bash',
        session: 'session-release-a',
        project: path.basename(projectRoot),
        input: 'npm version patch && npm test && git tag v1.2.3',
      },
      {
        ts: '2026-05-01T01:00:00Z',
        event: 'tool_start',
        tool: 'Bash',
        session: 'session-release-b',
        project: path.basename(projectRoot),
        input: 'release notes and full tests before tag and push',
      },
    ]);

    expect(
      analyzeLearning({
        scope: 'project',
        projectRoot,
        homeDir,
        now: '2026-05-01T02:00:00Z',
      }).emitted,
    ).toBe(1);
    expect(
      analyzeLearning({
        scope: 'project',
        projectRoot,
        homeDir,
        now: '2026-05-02T02:00:00Z',
      }).emitted,
    ).toBe(0);

    const queued = loadCandidates({ scope: 'project', projectRoot, homeDir });
    expect(queued).toHaveLength(1);
    expect(queued[0].id).toBe('arc-releasing-20260501-001');
  });

  it('CLI learn analyze queues candidates from enabled project observations', () => {
    setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir });
    writeObservations([
      {
        ts: '2026-05-01T00:00:00Z',
        event: 'tool_start',
        tool: 'Bash',
        session: 'session-release-a',
        project: path.basename(projectRoot),
        input: 'npm version minor; update changelog; npm test; git tag v1.3.0',
      },
      {
        ts: '2026-05-01T01:00:00Z',
        event: 'tool_start',
        tool: 'Bash',
        session: 'session-release-b',
        project: path.basename(projectRoot),
        input: '準備發版: release notes, full tests, tag and push',
      },
    ]);
    const cli = path.join(__dirname, '../../scripts/cli.js');
    const env = { ...process.env, HOME: homeDir, CLAUDE_PROJECT_DIR: projectRoot };

    const analyzed = JSON.parse(
      execFileSync('node', [cli, 'learn', 'analyze', '--project', '--json'], {
        env,
        encoding: 'utf8',
      }),
    );

    expect(analyzed.emitted).toBe(1);
    expect(analyzed.candidates[0].name).toBe('arc-releasing');
    expect(loadCandidates({ scope: 'project', projectRoot, homeDir })).toHaveLength(1);
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

  it('activates a materialized project candidate by promoting drafts to active artifacts', () => {
    appendCandidate(candidate({ status: 'approved' }), { scope: 'project', projectRoot, homeDir });
    materializeCandidate('arc-releasing-20260501-001', {
      scope: 'project',
      projectRoot,
      homeDir,
      now: '2026-05-01T00:03:00Z',
    });

    const result = activateCandidate('arc-releasing-20260501-001', {
      scope: 'project',
      projectRoot,
      homeDir,
      now: '2026-05-01T00:04:00Z',
    });

    expect(result.candidate.status).toBe('activated');
    expect(result.candidate.active_paths).toEqual([
      'skills/arc-releasing/SKILL.md',
      'tests/skills/test_skill_arc_releasing.py',
    ]);
    expect(result.candidate.activated_at).toBe('2026-05-01T00:04:00Z');
    expect(result.candidate.draft_paths).toEqual([
      'skills/arc-releasing/SKILL.md.draft',
      'tests/skills/test_skill_arc_releasing.py.draft',
    ]);
    expect(result.candidate.evidence).toHaveLength(1);

    expect(fs.existsSync(path.join(projectRoot, 'skills/arc-releasing/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'tests/skills/test_skill_arc_releasing.py'))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(projectRoot, 'skills/arc-releasing/SKILL.md.draft'))).toBe(
      false,
    );
    expect(
      fs.existsSync(path.join(projectRoot, 'tests/skills/test_skill_arc_releasing.py.draft')),
    ).toBe(false);

    const persisted = loadCandidates({ scope: 'project', projectRoot, homeDir });
    expect(persisted).toHaveLength(1);
    expect(persisted[0].status).toBe('activated');
    expect(persisted[0].active_paths).toEqual([
      'skills/arc-releasing/SKILL.md',
      'tests/skills/test_skill_arc_releasing.py',
    ]);
  });

  it('refuses to activate global scope candidates in this MVP', () => {
    expect(() =>
      activateCandidate('arc-releasing-20260501-001', {
        scope: 'global',
        projectRoot,
        homeDir,
      }),
    ).toThrow(/only project candidate activation is supported/i);
  });

  it('refuses to activate candidates that are not materialized', () => {
    appendCandidate(candidate(), { scope: 'project', projectRoot, homeDir });
    expect(() =>
      activateCandidate('arc-releasing-20260501-001', {
        scope: 'project',
        projectRoot,
        homeDir,
      }),
    ).toThrow(/must be materialized/i);

    transitionCandidate('arc-releasing-20260501-001', 'approved', {
      scope: 'project',
      projectRoot,
      homeDir,
    });
    expect(() =>
      activateCandidate('arc-releasing-20260501-001', {
        scope: 'project',
        projectRoot,
        homeDir,
      }),
    ).toThrow(/must be materialized/i);
  });

  it('refuses to activate when the candidate cannot be found', () => {
    expect(() =>
      activateCandidate('nonexistent-id', { scope: 'project', projectRoot, homeDir }),
    ).toThrow(/candidate not found/i);
  });

  it('refuses to activate malformed materialized candidates before writing artifacts', () => {
    const queuePath = getCandidateQueuePath({ scope: 'project', projectRoot, homeDir });
    fs.mkdirSync(path.dirname(queuePath), { recursive: true });
    fs.writeFileSync(
      queuePath,
      `${JSON.stringify({ id: 'broken-candidate', scope: 'project', status: 'materialized' })}\n`,
      'utf8',
    );

    expect(() =>
      activateCandidate('broken-candidate', { scope: 'project', projectRoot, homeDir }),
    ).toThrow(/invalid candidate/i);
    expect(fs.existsSync(path.join(projectRoot, 'skills'))).toBe(false);
  });

  it('refuses to activate materialized candidates whose recorded draft paths are missing', () => {
    const queuePath = getCandidateQueuePath({ scope: 'project', projectRoot, homeDir });
    const draftSkillPath = path.join(projectRoot, 'skills/arc-releasing/SKILL.md.draft');
    const draftTestPath = path.join(projectRoot, 'tests/skills/test_skill_arc_releasing.py.draft');
    fs.mkdirSync(path.dirname(queuePath), { recursive: true });
    fs.mkdirSync(path.dirname(draftSkillPath), { recursive: true });
    fs.mkdirSync(path.dirname(draftTestPath), { recursive: true });
    fs.writeFileSync(draftSkillPath, '---\nname: arc-releasing\ndescription: draft\n---\n', 'utf8');
    fs.writeFileSync(draftTestPath, '# draft test\n', 'utf8');
    fs.writeFileSync(
      queuePath,
      `${JSON.stringify(candidate({ status: 'materialized' }))}\n`,
      'utf8',
    );

    expect(() =>
      activateCandidate('arc-releasing-20260501-001', { scope: 'project', projectRoot, homeDir }),
    ).toThrow(/draft paths must match/i);
    expect(fs.existsSync(draftSkillPath)).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'skills/arc-releasing/SKILL.md'))).toBe(false);
    expect(loadCandidates({ scope: 'project', projectRoot, homeDir })[0].status).toBe(
      'materialized',
    );
  });

  it('refuses to activate when stored candidate scope does not match requested scope', () => {
    const queuePath = getCandidateQueuePath({ scope: 'project', projectRoot, homeDir });
    fs.mkdirSync(path.dirname(queuePath), { recursive: true });
    fs.writeFileSync(
      queuePath,
      `${JSON.stringify(
        candidate({
          status: 'materialized',
          scope: 'global',
          draft_paths: [
            'skills/arc-releasing/SKILL.md.draft',
            'tests/skills/test_skill_arc_releasing.py.draft',
          ],
        }),
      )}\n`,
      'utf8',
    );
    expect(() =>
      activateCandidate('arc-releasing-20260501-001', {
        scope: 'project',
        projectRoot,
        homeDir,
      }),
    ).toThrow(/scope must match/i);
  });

  it('refuses to activate when draft artifacts are missing and leaves the queue untouched', () => {
    appendCandidate(candidate({ status: 'approved' }), { scope: 'project', projectRoot, homeDir });
    materializeCandidate('arc-releasing-20260501-001', {
      scope: 'project',
      projectRoot,
      homeDir,
    });

    fs.rmSync(path.join(projectRoot, 'skills/arc-releasing/SKILL.md.draft'));

    expect(() =>
      activateCandidate('arc-releasing-20260501-001', {
        scope: 'project',
        projectRoot,
        homeDir,
      }),
    ).toThrow(/draft.*missing|missing.*draft/i);

    const persisted = loadCandidates({ scope: 'project', projectRoot, homeDir });
    expect(persisted[0].status).toBe('materialized');
    expect(persisted[0].active_paths).toBeUndefined();
    expect(
      fs.existsSync(path.join(projectRoot, 'tests/skills/test_skill_arc_releasing.py.draft')),
    ).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'tests/skills/test_skill_arc_releasing.py'))).toBe(
      false,
    );
  });

  it('refuses to overwrite an existing active SKILL.md and does not move the test draft', () => {
    appendCandidate(candidate({ status: 'approved' }), { scope: 'project', projectRoot, homeDir });
    materializeCandidate('arc-releasing-20260501-001', {
      scope: 'project',
      projectRoot,
      homeDir,
    });
    const activeSkillPath = path.join(projectRoot, 'skills/arc-releasing/SKILL.md');
    fs.writeFileSync(activeSkillPath, 'pre-existing content', 'utf8');

    expect(() =>
      activateCandidate('arc-releasing-20260501-001', {
        scope: 'project',
        projectRoot,
        homeDir,
      }),
    ).toThrow(/already exists/i);

    expect(fs.readFileSync(activeSkillPath, 'utf8')).toBe('pre-existing content');
    expect(fs.existsSync(path.join(projectRoot, 'skills/arc-releasing/SKILL.md.draft'))).toBe(true);
    expect(
      fs.existsSync(path.join(projectRoot, 'tests/skills/test_skill_arc_releasing.py.draft')),
    ).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'tests/skills/test_skill_arc_releasing.py'))).toBe(
      false,
    );

    const persisted = loadCandidates({ scope: 'project', projectRoot, homeDir });
    expect(persisted[0].status).toBe('materialized');
  });

  it('refuses to overwrite an existing active test file and does not move the skill draft', () => {
    appendCandidate(candidate({ status: 'approved' }), { scope: 'project', projectRoot, homeDir });
    materializeCandidate('arc-releasing-20260501-001', {
      scope: 'project',
      projectRoot,
      homeDir,
    });
    const activeTestPath = path.join(projectRoot, 'tests/skills/test_skill_arc_releasing.py');
    fs.mkdirSync(path.dirname(activeTestPath), { recursive: true });
    fs.writeFileSync(activeTestPath, '# pre-existing test', 'utf8');

    expect(() =>
      activateCandidate('arc-releasing-20260501-001', {
        scope: 'project',
        projectRoot,
        homeDir,
      }),
    ).toThrow(/already exists/i);

    expect(fs.readFileSync(activeTestPath, 'utf8')).toBe('# pre-existing test');
    expect(fs.existsSync(path.join(projectRoot, 'skills/arc-releasing/SKILL.md.draft'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'skills/arc-releasing/SKILL.md'))).toBe(false);
  });

  it('CLI learn activate promotes a materialized candidate to active artifacts', () => {
    appendCandidate(candidate(), { scope: 'project', projectRoot, homeDir });
    const cli = path.join(__dirname, '../../scripts/cli.js');
    const env = { ...process.env, HOME: homeDir, CLAUDE_PROJECT_DIR: projectRoot };

    execFileSync('node', [cli, 'learn', 'approve', 'arc-releasing-20260501-001', '--project'], {
      env,
      encoding: 'utf8',
    });
    execFileSync('node', [cli, 'learn', 'materialize', 'arc-releasing-20260501-001', '--project'], {
      env,
      encoding: 'utf8',
    });

    const activated = JSON.parse(
      execFileSync(
        'node',
        [cli, 'learn', 'activate', 'arc-releasing-20260501-001', '--project', '--json'],
        { env, encoding: 'utf8' },
      ),
    );

    expect(activated.candidate.status).toBe('activated');
    expect(activated.candidate.active_paths).toContain('skills/arc-releasing/SKILL.md');
    expect(fs.existsSync(path.join(projectRoot, 'skills/arc-releasing/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'skills/arc-releasing/SKILL.md.draft'))).toBe(
      false,
    );
  });

  it('CLI learn activate fails closed for global scope', () => {
    const cli = path.join(__dirname, '../../scripts/cli.js');
    const env = { ...process.env, HOME: homeDir, CLAUDE_PROJECT_DIR: projectRoot };

    let exitCode = 0;
    let stderr = '';
    try {
      execFileSync('node', [cli, 'learn', 'activate', 'arc-releasing-20260501-001', '--global'], {
        env,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      exitCode = err.status;
      stderr = err.stderr ? err.stderr.toString() : '';
    }
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/only project candidate activation is supported/i);
  });

  describe('inspectCandidate (draft review workflow)', () => {
    it('requires an explicit valid scope', () => {
      expect(() =>
        inspectCandidate('arc-releasing-20260501-001', { projectRoot, homeDir }),
      ).toThrow(/scope must be one of/);
      expect(() =>
        inspectCandidate('arc-releasing-20260501-001', {
          scope: 'invalid',
          projectRoot,
          homeDir,
        }),
      ).toThrow(/scope must be one of/);
    });

    it('throws candidate not found for unknown ids', () => {
      expect(() =>
        inspectCandidate('nonexistent-id', { scope: 'project', projectRoot, homeDir }),
      ).toThrow(/candidate not found/i);
    });

    it('throws when stored candidate scope does not match requested scope', () => {
      const queuePath = getCandidateQueuePath({ scope: 'project', projectRoot, homeDir });
      fs.mkdirSync(path.dirname(queuePath), { recursive: true });
      fs.writeFileSync(
        queuePath,
        `${JSON.stringify(candidate({ status: 'approved', scope: 'global' }))}\n`,
        'utf8',
      );
      expect(() =>
        inspectCandidate('arc-releasing-20260501-001', {
          scope: 'project',
          projectRoot,
          homeDir,
        }),
      ).toThrow(/scope must match/i);
    });

    it('throws invalid candidate when stored record fails schema validation', () => {
      const queuePath = getCandidateQueuePath({ scope: 'project', projectRoot, homeDir });
      fs.mkdirSync(path.dirname(queuePath), { recursive: true });
      fs.writeFileSync(
        queuePath,
        `${JSON.stringify({ id: 'broken-id', scope: 'project', status: 'materialized' })}\n`,
        'utf8',
      );
      expect(() =>
        inspectCandidate('broken-id', { scope: 'project', projectRoot, homeDir }),
      ).toThrow(/invalid candidate/i);
    });

    it('returns review-safe summary for pending candidate (approve/reject first)', () => {
      appendCandidate(candidate(), { scope: 'project', projectRoot, homeDir });
      const summary = inspectCandidate('arc-releasing-20260501-001', {
        scope: 'project',
        projectRoot,
        homeDir,
      });

      expect(summary.scope).toBe('project');
      expect(summary.candidate.id).toBe('arc-releasing-20260501-001');
      expect(summary.candidate.status).toBe('pending');
      expect(Array.isArray(summary.next_actions)).toBe(true);
      const actionText = summary.next_actions.join(' ').toLowerCase();
      expect(actionText).toMatch(/approve/);
      expect(actionText).toMatch(/reject/);
      expect(summary.artifacts).toBeDefined();
    });

    it('returns next_action materialize for approved candidate', () => {
      appendCandidate(candidate({ status: 'approved' }), {
        scope: 'project',
        projectRoot,
        homeDir,
      });
      const summary = inspectCandidate('arc-releasing-20260501-001', {
        scope: 'project',
        projectRoot,
        homeDir,
      });
      expect(summary.candidate.status).toBe('approved');
      expect(summary.next_actions.join(' ').toLowerCase()).toMatch(/materialize/);
    });

    it('returns artifact paths with exists flags after materialization and guides explicit activation', () => {
      appendCandidate(candidate({ status: 'approved' }), {
        scope: 'project',
        projectRoot,
        homeDir,
      });
      materializeCandidate('arc-releasing-20260501-001', {
        scope: 'project',
        projectRoot,
        homeDir,
      });
      const summary = inspectCandidate('arc-releasing-20260501-001', {
        scope: 'project',
        projectRoot,
        homeDir,
      });

      expect(summary.candidate.status).toBe('materialized');
      expect(summary.artifacts.draft_paths).toEqual([
        { path: 'skills/arc-releasing/SKILL.md.draft', exists: true },
        { path: 'tests/skills/test_skill_arc_releasing.py.draft', exists: true },
      ]);
      expect(summary.artifacts.active_paths).toEqual([
        { path: 'skills/arc-releasing/SKILL.md', exists: false },
        { path: 'tests/skills/test_skill_arc_releasing.py', exists: false },
      ]);
      const actionText = summary.next_actions.join(' ').toLowerCase();
      expect(actionText).toMatch(/review/);
      expect(actionText).toMatch(/activate/);
    });

    it('does not embed file contents, unexpected raw candidate fields, or raw evidence payloads', () => {
      appendCandidate(
        candidate({
          status: 'approved',
          raw_tool_payload: 'raw terminal transcript should not be exposed in review summary',
          evidence: [
            {
              session_id: 'session-abc',
              source: 'observation',
              reason: 'sanitized release evidence',
            },
          ],
        }),
        {
          scope: 'project',
          projectRoot,
          homeDir,
        },
      );
      materializeCandidate('arc-releasing-20260501-001', {
        scope: 'project',
        projectRoot,
        homeDir,
      });
      const summary = inspectCandidate('arc-releasing-20260501-001', {
        scope: 'project',
        projectRoot,
        homeDir,
      });
      const serialized = JSON.stringify(summary);
      expect(serialized).not.toContain('Draft artifact only');
      expect(serialized).not.toContain('## Workflow');
      expect(serialized).not.toContain('raw terminal transcript');
      expect(serialized).not.toContain('private terminal transcript');
      expect(serialized).not.toContain('private nested payload');
      expect(summary.candidate.raw_tool_payload).toBeUndefined();
      expect(summary.candidate.evidence).toEqual([
        {
          session_id: 'session-abc',
          source: 'observation',
          reason: 'sanitized release evidence',
        },
      ]);
      for (const entry of summary.artifacts.draft_paths) {
        expect(Object.keys(entry).sort()).toEqual(['exists', 'path']);
      }
    });

    it('does not probe project artifact paths when inspecting global candidates', () => {
      const globalCandidate = candidate({ scope: 'global', status: 'materialized' });
      appendCandidate(globalCandidate, { scope: 'global', projectRoot, homeDir });
      const projectDraftPath = path.join(projectRoot, 'skills/arc-releasing/SKILL.md.draft');
      fs.mkdirSync(path.dirname(projectDraftPath), { recursive: true });
      fs.writeFileSync(projectDraftPath, 'project-local draft', 'utf8');

      const summary = inspectCandidate('arc-releasing-20260501-001', {
        scope: 'global',
        projectRoot,
        homeDir,
      });

      expect(summary.scope).toBe('global');
      expect(summary.candidate.scope).toBe('global');
      expect(summary.artifacts).toEqual({});
      expect(JSON.stringify(summary)).not.toContain('skills/arc-releasing/SKILL.md.draft');
    });

    it('does not echo stored artifact path fields from the candidate payload', () => {
      const queuePath = getCandidateQueuePath({ scope: 'project', projectRoot, homeDir });
      fs.mkdirSync(path.dirname(queuePath), { recursive: true });
      fs.writeFileSync(
        queuePath,
        `${JSON.stringify(
          candidate({
            status: 'materialized',
            draft_paths: ['../../outside/SKILL.md.draft'],
            active_paths: ['../../outside/SKILL.md'],
          }),
        )}\n`,
        'utf8',
      );

      const summary = inspectCandidate('arc-releasing-20260501-001', {
        scope: 'project',
        projectRoot,
        homeDir,
      });

      expect(summary.candidate.draft_paths).toBeUndefined();
      expect(summary.candidate.active_paths).toBeUndefined();
      expect(summary.artifacts.draft_paths).toEqual([
        { path: 'skills/arc-releasing/SKILL.md.draft', exists: false },
        { path: 'tests/skills/test_skill_arc_releasing.py.draft', exists: false },
      ]);
      expect(JSON.stringify(summary)).not.toContain('../../outside');
    });

    it('reports already active for activated candidates', () => {
      appendCandidate(candidate({ status: 'approved' }), {
        scope: 'project',
        projectRoot,
        homeDir,
      });
      materializeCandidate('arc-releasing-20260501-001', {
        scope: 'project',
        projectRoot,
        homeDir,
      });
      activateCandidate('arc-releasing-20260501-001', {
        scope: 'project',
        projectRoot,
        homeDir,
      });

      const summary = inspectCandidate('arc-releasing-20260501-001', {
        scope: 'project',
        projectRoot,
        homeDir,
      });
      expect(summary.candidate.status).toBe('activated');
      expect(summary.next_actions.join(' ').toLowerCase()).toMatch(/already active/);
      expect(summary.artifacts.active_paths).toEqual([
        { path: 'skills/arc-releasing/SKILL.md', exists: true },
        { path: 'tests/skills/test_skill_arc_releasing.py', exists: true },
      ]);
    });

    it('reports rejected candidates as terminal with new-candidate guidance', () => {
      appendCandidate(candidate(), { scope: 'project', projectRoot, homeDir });
      transitionCandidate('arc-releasing-20260501-001', 'rejected', {
        scope: 'project',
        projectRoot,
        homeDir,
      });
      const summary = inspectCandidate('arc-releasing-20260501-001', {
        scope: 'project',
        projectRoot,
        homeDir,
      });
      expect(summary.candidate.status).toBe('rejected');
      const actionText = summary.next_actions.join(' ').toLowerCase();
      expect(actionText).toMatch(/new candidate|create.*new/);
    });

    it('does not write or persist anything when inspecting', () => {
      appendCandidate(candidate(), { scope: 'project', projectRoot, homeDir });
      const before = fs.readFileSync(
        getCandidateQueuePath({ scope: 'project', projectRoot, homeDir }),
        'utf8',
      );
      inspectCandidate('arc-releasing-20260501-001', {
        scope: 'project',
        projectRoot,
        homeDir,
      });
      const after = fs.readFileSync(
        getCandidateQueuePath({ scope: 'project', projectRoot, homeDir }),
        'utf8',
      );
      expect(after).toBe(before);
      expect(fs.existsSync(path.join(projectRoot, 'skills/arc-releasing/SKILL.md.draft'))).toBe(
        false,
      );
    });
  });

  describe('CLI learn inspect / drafts', () => {
    it('CLI learn inspect returns review summary for a materialized candidate', () => {
      appendCandidate(candidate({ status: 'approved' }), {
        scope: 'project',
        projectRoot,
        homeDir,
      });
      materializeCandidate('arc-releasing-20260501-001', {
        scope: 'project',
        projectRoot,
        homeDir,
      });
      const cli = path.join(__dirname, '../../scripts/cli.js');
      const env = { ...process.env, HOME: homeDir, CLAUDE_PROJECT_DIR: projectRoot };

      const inspected = JSON.parse(
        execFileSync(
          'node',
          [cli, 'learn', 'inspect', 'arc-releasing-20260501-001', '--project', '--json'],
          { env, encoding: 'utf8' },
        ),
      );

      expect(inspected.scope).toBe('project');
      expect(inspected.candidate.id).toBe('arc-releasing-20260501-001');
      expect(inspected.candidate.status).toBe('materialized');
      expect(inspected.artifacts.draft_paths[0]).toEqual({
        path: 'skills/arc-releasing/SKILL.md.draft',
        exists: true,
      });
      expect(inspected.next_actions.join(' ').toLowerCase()).toMatch(/activate/);
    });

    it('CLI learn inspect requires a candidate id', () => {
      const cli = path.join(__dirname, '../../scripts/cli.js');
      const env = { ...process.env, HOME: homeDir, CLAUDE_PROJECT_DIR: projectRoot };

      let exitCode = 0;
      let stderr = '';
      try {
        execFileSync('node', [cli, 'learn', 'inspect', '--project'], {
          env,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (err) {
        exitCode = err.status;
        stderr = err.stderr ? err.stderr.toString() : '';
      }
      expect(exitCode).not.toBe(0);
      expect(stderr).toMatch(/candidate id/i);
    });

    it('CLI learn inspect fails closed without explicit scope', () => {
      appendCandidate(candidate(), { scope: 'project', projectRoot, homeDir });
      const cli = path.join(__dirname, '../../scripts/cli.js');
      const env = { ...process.env, HOME: homeDir, CLAUDE_PROJECT_DIR: projectRoot };

      let exitCode = 0;
      let stderr = '';
      try {
        execFileSync('node', [cli, 'learn', 'inspect', 'arc-releasing-20260501-001'], {
          env,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (err) {
        exitCode = err.status;
        stderr = err.stderr ? err.stderr.toString() : '';
      }
      expect(exitCode).not.toBe(0);
      expect(stderr).toMatch(/--project or --global/i);
    });

    it('CLI learn drafts lists only materialized candidates and excludes other statuses', () => {
      appendCandidate(candidate(), { scope: 'project', projectRoot, homeDir });

      const otherPending = candidate({
        id: 'arc-releasing-20260601-002',
        status: 'approved',
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-01T00:00:00Z',
      });
      appendCandidate(otherPending, { scope: 'project', projectRoot, homeDir });

      materializeCandidate('arc-releasing-20260601-002', {
        scope: 'project',
        projectRoot,
        homeDir,
      });

      const rejected = candidate({
        id: 'arc-releasing-20260701-003',
        status: 'pending',
        created_at: '2026-07-01T00:00:00Z',
        updated_at: '2026-07-01T00:00:00Z',
      });
      appendCandidate(rejected, { scope: 'project', projectRoot, homeDir });
      transitionCandidate('arc-releasing-20260701-003', 'rejected', {
        scope: 'project',
        projectRoot,
        homeDir,
      });

      const cli = path.join(__dirname, '../../scripts/cli.js');
      const env = { ...process.env, HOME: homeDir, CLAUDE_PROJECT_DIR: projectRoot };

      const drafts = JSON.parse(
        execFileSync('node', [cli, 'learn', 'drafts', '--project', '--json'], {
          env,
          encoding: 'utf8',
        }),
      );

      expect(drafts.scope).toBe('project');
      expect(drafts.count).toBe(1);
      expect(drafts.drafts).toHaveLength(1);
      expect(drafts.drafts[0].candidate.id).toBe('arc-releasing-20260601-002');
      expect(drafts.drafts[0].candidate.status).toBe('materialized');
      expect(drafts.drafts[0].artifacts.draft_paths[0].path).toBe(
        'skills/arc-releasing/SKILL.md.draft',
      );
    });

    it('CLI learn drafts with global scope does not probe project-local artifact paths', () => {
      appendCandidate(candidate({ scope: 'global', status: 'materialized' }), {
        scope: 'global',
        projectRoot,
        homeDir,
      });
      const projectDraftPath = path.join(projectRoot, 'skills/arc-releasing/SKILL.md.draft');
      fs.mkdirSync(path.dirname(projectDraftPath), { recursive: true });
      fs.writeFileSync(projectDraftPath, 'project-local draft', 'utf8');
      const cli = path.join(__dirname, '../../scripts/cli.js');
      const env = { ...process.env, HOME: homeDir, CLAUDE_PROJECT_DIR: projectRoot };

      const drafts = JSON.parse(
        execFileSync('node', [cli, 'learn', 'drafts', '--global', '--json'], {
          env,
          encoding: 'utf8',
        }),
      );

      expect(drafts.scope).toBe('global');
      expect(drafts.count).toBe(1);
      expect(drafts.drafts[0].artifacts).toEqual({});
      expect(JSON.stringify(drafts)).not.toContain('skills/arc-releasing/SKILL.md.draft');
    });

    it('CLI learn drafts returns an empty list when no materialized candidates exist', () => {
      appendCandidate(candidate(), { scope: 'project', projectRoot, homeDir });
      const cli = path.join(__dirname, '../../scripts/cli.js');
      const env = { ...process.env, HOME: homeDir, CLAUDE_PROJECT_DIR: projectRoot };

      const drafts = JSON.parse(
        execFileSync('node', [cli, 'learn', 'drafts', '--project', '--json'], {
          env,
          encoding: 'utf8',
        }),
      );

      expect(drafts.count).toBe(0);
      expect(drafts.drafts).toEqual([]);
    });

    it('CLI learn drafts requires explicit scope', () => {
      const cli = path.join(__dirname, '../../scripts/cli.js');
      const env = { ...process.env, HOME: homeDir, CLAUDE_PROJECT_DIR: projectRoot };

      let exitCode = 0;
      let stderr = '';
      try {
        execFileSync('node', [cli, 'learn', 'drafts'], {
          env,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (err) {
        exitCode = err.status;
        stderr = err.stderr ? err.stderr.toString() : '';
      }
      expect(exitCode).not.toBe(0);
      expect(stderr).toMatch(/--project or --global/i);
    });
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
