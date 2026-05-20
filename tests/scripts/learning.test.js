// tests/scripts/learning.test.js

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');

const {
  acceptCandidate,
  activateCandidate,
  appendCandidate,
  assertCanMaterialize,
  getCandidateQueuePath,
  inspectCandidate,
  isLearningEnabled,
  listLearningInbox,
  loadCandidates,
  materializeCandidate,
  readLearningConfig,
  setLearningEnabled,
  transitionCandidate,
  triggerAutomaticLearning,
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

  function writeGlobalProjectObservations(projectName, projectPath, records) {
    const { getProjectId } = require('../../scripts/lib/learning');
    const observationPath = path.join(
      homeDir,
      '.arcforge',
      'observations',
      projectName,
      'observations.jsonl',
    );
    fs.mkdirSync(path.dirname(observationPath), { recursive: true });
    fs.writeFileSync(
      observationPath,
      `${records
        .map((record) => JSON.stringify({ project_id: getProjectId(projectPath), ...record }))
        .join('\n')}\n`,
      'utf8',
    );
    return observationPath;
  }

  it('does not contain the old release-specific analyzer entrypoint', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../scripts/lib/learning.js'), 'utf8');

    expect(source).not.toContain('releaseSignalScore');
    expect(source).not.toContain('buildReleaseCandidate');
  });

  it('analyzes repeated project behavior into a pending learned workflow candidate', () => {
    const { analyzeLearning } = require('../../scripts/lib/learning');
    setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir });
    writeObservations([
      {
        ts: '2026-05-01T00:00:00Z',
        event: 'tool_start',
        tool: 'Read',
        session: 'session-workflow-a',
        project: path.basename(projectRoot),
        input: JSON.stringify({ file_path: 'scripts/lib/example.js' }),
      },
      {
        ts: '2026-05-01T00:01:00Z',
        event: 'tool_start',
        tool: 'Edit',
        session: 'session-workflow-a',
        project: path.basename(projectRoot),
        input: JSON.stringify({ file_path: 'scripts/lib/example.js' }),
      },
      {
        ts: '2026-05-01T00:02:00Z',
        event: 'tool_start',
        tool: 'Bash',
        session: 'session-workflow-a',
        project: path.basename(projectRoot),
        input: JSON.stringify({ command: 'npm run test:scripts -- learning.test.js' }),
      },
      {
        ts: '2026-05-01T01:00:00Z',
        event: 'tool_start',
        tool: 'Read',
        session: 'session-workflow-b',
        project: path.basename(projectRoot),
        input: JSON.stringify({ file_path: 'scripts/lib/other.js' }),
      },
      {
        ts: '2026-05-01T01:01:00Z',
        event: 'tool_start',
        tool: 'Edit',
        session: 'session-workflow-b',
        project: path.basename(projectRoot),
        input: JSON.stringify({ file_path: 'scripts/lib/other.js' }),
      },
      {
        ts: '2026-05-01T01:02:00Z',
        event: 'tool_start',
        tool: 'Bash',
        session: 'session-workflow-b',
        project: path.basename(projectRoot),
        input: JSON.stringify({ command: 'npm run test:scripts -- other.test.js' }),
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
      scope: 'project',
      artifact_type: 'skill',
      status: 'pending',
      pattern_key: JSON.stringify(['read', 'edit', 'bash']),
    });
    expect(result.candidates[0].name).toMatch(/^arc-learned-read-edit-bash-[a-f0-9]{8}-workflow$/);
    expect(result.candidates[0].id).toMatch(
      /^arc-learned-project-read-edit-bash-[a-f0-9]{8}-workflow$/,
    );
    expect(result.candidates[0].trigger).toContain('Read → Edit → Bash');
    expect(result.candidates[0].summary).not.toMatch(/release/i);
    expect(result.candidates[0].evidence.map((item) => item.session_id).sort()).toEqual([
      'session-workflow-a',
      'session-workflow-b',
    ]);
    expect(result.candidates[0].evidence[0]).not.toHaveProperty('input');

    const queued = loadCandidates({ scope: 'project', projectRoot, homeDir });
    expect(queued).toHaveLength(1);
    expect(queued[0].name).toMatch(/^arc-learned-read-edit-bash-[a-f0-9]{8}-workflow$/);
  });

  it('reads active and archived observations when analyzing project behavior', () => {
    const { analyzeLearning } = require('../../scripts/lib/learning');
    setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir });
    const observationPath = writeObservations([
      {
        ts: '2026-05-01T00:00:00Z',
        event: 'tool_start',
        tool: 'Read',
        session: 'session-archive-a',
        project: path.basename(projectRoot),
        input: '{}',
      },
      {
        ts: '2026-05-01T00:01:00Z',
        event: 'tool_start',
        tool: 'Edit',
        session: 'session-archive-a',
        project: path.basename(projectRoot),
        input: '{}',
      },
    ]);
    const archiveDir = path.join(path.dirname(observationPath), 'archive');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(
      path.join(archiveDir, 'observations-2026-05-01.jsonl'),
      `${[
        {
          project_id: require('../../scripts/lib/learning').getProjectId(projectRoot),
          ts: '2026-05-01T01:00:00Z',
          event: 'tool_start',
          tool: 'Read',
          session: 'session-archive-b',
          project: path.basename(projectRoot),
          input: '{}',
        },
        {
          project_id: require('../../scripts/lib/learning').getProjectId(projectRoot),
          ts: '2026-05-01T01:01:00Z',
          event: 'tool_start',
          tool: 'Edit',
          session: 'session-archive-b',
          project: path.basename(projectRoot),
          input: '{}',
        },
      ]
        .map((record) => JSON.stringify(record))
        .join('\n')}\n`,
      'utf8',
    );

    const result = analyzeLearning({ scope: 'project', projectRoot, homeDir });

    expect(result.emitted).toBe(1);
    expect(result.candidates[0].name).toMatch(/^arc-learned-read-edit-[a-f0-9]{8}-workflow$/);
    expect(result.candidates[0].evidence.map((item) => item.session_id).sort()).toEqual([
      'session-archive-a',
      'session-archive-b',
    ]);
  });

  it('does not emit candidates when learning is disabled or evidence is below threshold', () => {
    const { analyzeLearning } = require('../../scripts/lib/learning');
    writeObservations([
      {
        ts: '2026-05-01T00:00:00Z',
        event: 'tool_start',
        tool: 'Read',
        session: 'session-workflow-a',
        project: path.basename(projectRoot),
        input: '{}',
      },
      {
        ts: '2026-05-01T00:01:00Z',
        event: 'tool_start',
        tool: 'Edit',
        session: 'session-workflow-a',
        project: path.basename(projectRoot),
        input: '{}',
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
        tool: 'Read',
        session: 'session-workflow-a',
        project: path.basename(projectRoot),
        input: '{}',
      },
      {
        ts: '2026-05-01T00:01:00Z',
        event: 'tool_start',
        tool: 'Edit',
        session: 'session-workflow-a',
        project: path.basename(projectRoot),
        input: '{}',
      },
      {
        ts: '2026-05-01T01:00:00Z',
        event: 'tool_start',
        tool: 'Read',
        session: 'session-workflow-b',
        project: path.basename(projectRoot),
        input: '{}',
      },
      {
        ts: '2026-05-01T01:01:00Z',
        event: 'tool_start',
        tool: 'Edit',
        session: 'session-workflow-b',
        project: path.basename(projectRoot),
        input: '{}',
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
        tool: 'Read',
        session: 'session-workflow-a',
        project: path.basename(projectRoot),
        input: '{}',
      },
      {
        project_id: getProjectId(otherProjectRoot),
        ts: '2026-05-01T00:01:00Z',
        event: 'tool_start',
        tool: 'Edit',
        session: 'session-workflow-a',
        project: path.basename(projectRoot),
        input: '{}',
      },
      {
        project_id: getProjectId(otherProjectRoot),
        ts: '2026-05-01T01:00:00Z',
        event: 'tool_start',
        tool: 'Read',
        session: 'session-workflow-b',
        project: path.basename(projectRoot),
        input: '{}',
      },
      {
        project_id: getProjectId(otherProjectRoot),
        ts: '2026-05-01T01:01:00Z',
        event: 'tool_start',
        tool: 'Edit',
        session: 'session-workflow-b',
        project: path.basename(projectRoot),
        input: '{}',
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
        tool: 'Read',
        session: 'session-workflow-a',
        project: path.basename(projectRoot),
        input: '{}',
      },
      {
        ts: '2026-05-01T00:01:00Z',
        event: 'tool_start',
        tool: 'Edit',
        session: 'session-workflow-a',
        project: path.basename(projectRoot),
        input: '{}',
      },
      {
        ts: '2026-05-01T01:00:00Z',
        event: 'tool_start',
        tool: 'Read',
        session: 'session-workflow-b',
        project: path.basename(projectRoot),
        input: '{}',
      },
      {
        ts: '2026-05-01T01:01:00Z',
        event: 'tool_start',
        tool: 'Edit',
        session: 'session-workflow-b',
        project: path.basename(projectRoot),
        input: '{}',
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
    expect(queued[0].id).toMatch(/^arc-learned-project-read-edit-[a-f0-9]{8}-workflow$/);
  });

  it('CLI learn analyze is deprecated and exits non-zero with a dashboard pointer', () => {
    setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir });
    const cli = path.join(__dirname, '../../scripts/cli.js');
    const env = { ...process.env, HOME: homeDir, CLAUDE_PROJECT_DIR: projectRoot };

    let stderr = '';
    let exitCode = 0;
    try {
      execFileSync('node', [cli, 'learn', 'analyze', '--project'], { env, encoding: 'utf8' });
    } catch (err) {
      exitCode = err.status;
      stderr = err.stderr || '';
    }

    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/deprecated/i);
    expect(stderr).toMatch(/arc learn dashboard/);
    // After deprecation, the analyzer must not silently enqueue candidates.
    expect(loadCandidates({ scope: 'project', projectRoot, homeDir })).toHaveLength(0);
  });

  it('global analyzer emits cross-project learned behavior candidates', () => {
    const { analyzeLearning, getProjectId } = require('../../scripts/lib/learning');
    const alphaRoot = path.join(testDir, 'alpha');
    const betaRoot = path.join(testDir, 'beta');
    const recordsByProject = [
      { root: alphaRoot, project: 'alpha', session: 'alpha-session' },
      { root: betaRoot, project: 'beta', session: 'beta-session' },
    ];
    for (const item of recordsByProject) {
      const dir = path.join(homeDir, '.arcforge', 'observations', item.project);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'observations.jsonl'),
        `${[
          {
            project_id: getProjectId(item.root),
            ts: '2026-05-01T00:00:00Z',
            event: 'tool_start',
            tool: 'Read',
            session: item.session,
            project: item.project,
            input: '{}',
          },
          {
            project_id: getProjectId(item.root),
            ts: '2026-05-01T00:01:00Z',
            event: 'tool_start',
            tool: 'Edit',
            session: item.session,
            project: item.project,
            input: '{}',
          },
        ]
          .map((record) => JSON.stringify(record))
          .join('\n')}\n`,
        'utf8',
      );
    }
    setLearningEnabled({ scope: 'global', enabled: true, projectRoot, homeDir });

    const result = analyzeLearning({ scope: 'global', projectRoot, homeDir });

    expect(result.enabled).toBe(true);
    expect(result.emitted).toBe(1);
    expect(result.candidates[0]).toMatchObject({
      scope: 'global',
      status: 'pending',
      pattern_key: JSON.stringify(['read', 'edit']),
    });
    expect(result.candidates[0].name).toMatch(/^arc-global-read-edit-[a-f0-9]{8}-workflow$/);
    expect(result.candidates[0].summary).toContain('2 projects');
    expect(result.candidates[0].evidence.map((item) => item.session_id).sort()).toEqual([
      'alpha-session',
      'beta-session',
    ]);
    expect(loadCandidates({ scope: 'global', projectRoot, homeDir })).toHaveLength(1);
  });

  it('global analyzer trusts observation directory identity over spoofable record project fields', () => {
    const { analyzeLearning } = require('../../scripts/lib/learning');
    const alphaRoot = path.join(testDir, 'alpha');
    writeGlobalProjectObservations('alpha', alphaRoot, [
      {
        ts: '2026-05-01T00:00:00Z',
        event: 'tool_start',
        tool: 'Read',
        session: 'alpha-session-a',
        project: 'alpha',
        input: '{}',
      },
      {
        ts: '2026-05-01T00:01:00Z',
        event: 'tool_start',
        tool: 'Edit',
        session: 'alpha-session-a',
        project: 'alpha',
        input: '{}',
      },
      {
        ts: '2026-05-01T01:00:00Z',
        event: 'tool_start',
        tool: 'Read',
        session: 'alpha-session-b',
        project: 'spoofed-beta',
        project_id: 'spoofed-beta-project-id',
        input: '{}',
      },
      {
        ts: '2026-05-01T01:01:00Z',
        event: 'tool_start',
        tool: 'Edit',
        session: 'alpha-session-b',
        project: 'spoofed-beta',
        project_id: 'spoofed-beta-project-id',
        input: '{}',
      },
    ]);
    setLearningEnabled({ scope: 'global', enabled: true, projectRoot, homeDir });

    const result = analyzeLearning({ scope: 'global', projectRoot, homeDir });

    expect(result.emitted).toBe(0);
    expect(loadCandidates({ scope: 'global', projectRoot, homeDir })).toHaveLength(0);
  });

  it('global analyzer treats identical session ids in different projects as separate evidence', () => {
    const { analyzeLearning } = require('../../scripts/lib/learning');
    writeGlobalProjectObservations('alpha', path.join(testDir, 'alpha'), [
      {
        ts: '2026-05-01T00:00:00Z',
        event: 'tool_start',
        tool: 'Read',
        session: 'same-session',
        project: 'alpha',
        input: '{}',
      },
      {
        ts: '2026-05-01T00:01:00Z',
        event: 'tool_start',
        tool: 'Edit',
        session: 'same-session',
        project: 'alpha',
        input: '{}',
      },
    ]);
    writeGlobalProjectObservations('beta', path.join(testDir, 'beta'), [
      {
        ts: '2026-05-01T00:00:00Z',
        event: 'tool_start',
        tool: 'Read',
        session: 'same-session',
        project: 'beta',
        input: '{}',
      },
      {
        ts: '2026-05-01T00:01:00Z',
        event: 'tool_start',
        tool: 'Edit',
        session: 'same-session',
        project: 'beta',
        input: '{}',
      },
    ]);
    setLearningEnabled({ scope: 'global', enabled: true, projectRoot, homeDir });

    const result = analyzeLearning({ scope: 'global', projectRoot, homeDir });

    expect(result.emitted).toBe(1);
    expect(result.candidates[0].evidence.map((item) => item.source).sort()).toEqual([
      'project:alpha',
      'project:beta',
    ]);
  });

  it('normalizes analyzer-generated tool workflow names so candidates can materialize', () => {
    const { analyzeLearning } = require('../../scripts/lib/learning');
    setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir });
    writeObservations([
      {
        ts: '2026-05-01T00:00:00Z',
        event: 'tool_start',
        tool: 'mcp__server__tool',
        session: 'session-a',
        project: path.basename(projectRoot),
        input: '{}',
      },
      {
        ts: '2026-05-01T00:01:00Z',
        event: 'tool_start',
        tool: 'Edit',
        session: 'session-a',
        project: path.basename(projectRoot),
        input: '{}',
      },
      {
        ts: '2026-05-01T01:00:00Z',
        event: 'tool_start',
        tool: 'mcp__server__tool',
        session: 'session-b',
        project: path.basename(projectRoot),
        input: '{}',
      },
      {
        ts: '2026-05-01T01:01:00Z',
        event: 'tool_start',
        tool: 'Edit',
        session: 'session-b',
        project: path.basename(projectRoot),
        input: '{}',
      },
    ]);

    const result = analyzeLearning({ scope: 'project', projectRoot, homeDir });
    const candidateId = result.candidates[0].id;
    transitionCandidate(candidateId, 'approved', { scope: 'project', projectRoot, homeDir });
    const materialized = materializeCandidate(candidateId, {
      scope: 'project',
      projectRoot,
      homeDir,
    });

    expect(result.candidates[0].name).toMatch(
      /^arc-learned-mcp-server-tool-edit-[a-f0-9]{8}-workflow$/,
    );
    expect(materialized.draft_paths[0]).toBe(`skills/${result.candidates[0].name}/SKILL.md.draft`);
  });

  it('keeps distinct tool sequences separate even when their human slugs would collide', () => {
    const { analyzeLearning } = require('../../scripts/lib/learning');
    setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir });
    const records = [];
    for (const [session, tools] of [
      ['ab-c-a', ['a-b', 'c']],
      ['ab-c-b', ['a-b', 'c']],
      ['a-bc-a', ['a', 'b-c']],
      ['a-bc-b', ['a', 'b-c']],
    ]) {
      tools.forEach((tool) => {
        records.push({
          ts: `2026-05-01T00:0${records.length}:00Z`,
          event: 'tool_start',
          tool,
          session,
          project: path.basename(projectRoot),
          input: '{}',
        });
      });
    }
    writeObservations(records);

    const result = analyzeLearning({ scope: 'project', projectRoot, homeDir });
    const ids = result.candidates.map((candidate) => candidate.id);

    expect(result.emitted).toBe(2);
    expect(new Set(ids).size).toBe(2);
    expect(ids.every((id) => id.startsWith('arc-learned-project-a-b-c'))).toBe(true);
  });

  it('does not duplicate an existing workflow when a slug-colliding pattern appears in a later analysis run', () => {
    const { analyzeLearning } = require('../../scripts/lib/learning');
    setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir });
    const recordsFor = (sessions) => {
      const records = [];
      for (const [session, tools] of sessions) {
        tools.forEach((tool) => {
          records.push({
            ts: `2026-05-01T00:${String(records.length).padStart(2, '0')}:00Z`,
            event: 'tool_start',
            tool,
            session,
            project: path.basename(projectRoot),
            input: '{}',
          });
        });
      }
      return records;
    };

    writeObservations(
      recordsFor([
        ['ab-c-a', ['a-b', 'c']],
        ['ab-c-b', ['a-b', 'c']],
      ]),
    );
    const firstRun = analyzeLearning({ scope: 'project', projectRoot, homeDir });
    expect(firstRun.emitted).toBe(1);
    const firstCandidate = loadCandidates({ scope: 'project', projectRoot, homeDir })[0];
    expect(firstCandidate.id).toMatch(/^arc-learned-project-a-b-c-[a-f0-9]{8}-workflow$/);
    expect(firstCandidate.pattern_key).toBe(JSON.stringify(['a-b', 'c']));

    writeObservations(
      recordsFor([
        ['ab-c-a', ['a-b', 'c']],
        ['ab-c-b', ['a-b', 'c']],
        ['a-bc-a', ['a', 'b-c']],
        ['a-bc-b', ['a', 'b-c']],
      ]),
    );
    const secondRun = analyzeLearning({ scope: 'project', projectRoot, homeDir });
    const queued = loadCandidates({ scope: 'project', projectRoot, homeDir });

    expect(secondRun.emitted).toBe(1);
    expect(queued).toHaveLength(2);
    expect(queued.map((candidate) => candidate.id)).toContain(firstCandidate.id);
    expect(new Set(queued.map((candidate) => candidate.pattern_key)).size).toBe(2);
  });

  it('automatically analyzes enabled project and global learning after new observations without activating artifacts', () => {
    setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir });
    setLearningEnabled({ scope: 'global', enabled: true, projectRoot, homeDir });
    writeObservations([
      {
        ts: '2026-05-01T00:00:00Z',
        event: 'tool_start',
        tool: 'Read',
        session: 'session-workflow-a',
        project: path.basename(projectRoot),
        input: '{}',
      },
      {
        ts: '2026-05-01T00:01:00Z',
        event: 'tool_start',
        tool: 'Edit',
        session: 'session-workflow-a',
        project: path.basename(projectRoot),
        input: '{}',
      },
      {
        ts: '2026-05-01T01:00:00Z',
        event: 'tool_start',
        tool: 'Read',
        session: 'session-workflow-b',
        project: path.basename(projectRoot),
        input: '{}',
      },
      {
        ts: '2026-05-01T01:01:00Z',
        event: 'tool_start',
        tool: 'Edit',
        session: 'session-workflow-b',
        project: path.basename(projectRoot),
        input: '{}',
      },
    ]);

    const result = triggerAutomaticLearning({
      projectRoot,
      homeDir,
      now: '2026-05-01T02:00:00Z',
    });

    expect(result.project.enabled).toBe(true);
    expect(result.project.emitted).toBe(1);
    expect(result.global.enabled).toBe(true);
    expect(result.global.emitted).toBe(0);
    const queued = loadCandidates({ scope: 'project', projectRoot, homeDir });
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      status: 'pending',
    });
    expect(queued[0].name).toMatch(/^arc-learned-read-edit-[a-f0-9]{8}-workflow$/);
    expect(fs.existsSync(path.join(projectRoot, 'skills', queued[0].name, 'SKILL.md'))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, 'skills', queued[0].name, 'SKILL.md.draft'))).toBe(
      false,
    );
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

  it('lists an actionable learning inbox grouped by status and artifact type', () => {
    appendCandidate(
      candidate({ id: 'pending-instinct', artifact_type: 'instinct', name: 'prefer-tests' }),
      {
        scope: 'project',
        projectRoot,
        homeDir,
      },
    );
    appendCandidate(
      candidate({
        id: 'approved-command',
        artifact_type: 'command',
        name: 'arc-fast-review',
        status: 'approved',
        confidence: 0.91,
      }),
      { scope: 'project', projectRoot, homeDir },
    );
    appendCandidate(
      candidate({
        id: 'rejected-skill',
        artifact_type: 'skill',
        name: 'obsolete-flow',
        status: 'rejected',
        confidence: 0.99,
      }),
      { scope: 'project', projectRoot, homeDir },
    );

    const inbox = listLearningInbox({ scope: 'project', projectRoot, homeDir });

    expect(inbox.counts).toEqual({ pending: 1, approved: 1, rejected: 1 });
    expect(inbox.groups.by_status.pending).toEqual(['pending-instinct']);
    expect(inbox.groups.by_artifact_type.command).toEqual(['approved-command']);
    expect(inbox.candidates.map((entry) => entry.id)).toEqual([
      'approved-command',
      'pending-instinct',
      'rejected-skill',
    ]);
    expect(inbox.candidates[0]).toMatchObject({
      id: 'approved-command',
      next_command: 'arc learn materialize approved-command --project',
    });
    expect(inbox.candidates[0].evidence).toBeUndefined();
  });

  it('accepts a pending project candidate by approving and materializing drafts without activation', () => {
    appendCandidate(candidate(), { scope: 'project', projectRoot, homeDir });

    const result = acceptCandidate('arc-releasing-20260501-001', {
      scope: 'project',
      projectRoot,
      homeDir,
      now: '2026-05-01T00:05:00Z',
    });

    expect(result.scope).toBe('project');
    expect(result.candidate.status).toBe('materialized');
    expect(result.candidate.draft_paths).toEqual([
      'skills/arc-releasing/SKILL.md.draft',
      'tests/skills/test_skill_arc_releasing.py.draft',
    ]);
    expect(fs.existsSync(path.join(projectRoot, 'skills/arc-releasing/SKILL.md.draft'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'skills/arc-releasing/SKILL.md'))).toBe(false);
  });

  it('keeps the accept shortcut project-only and fails closed for global candidates', () => {
    appendCandidate(candidate({ scope: 'global' }), { scope: 'global', projectRoot, homeDir });

    expect(() =>
      acceptCandidate('arc-releasing-20260501-001', {
        scope: 'global',
        projectRoot,
        homeDir,
      }),
    ).toThrow('only project candidate accept flow is supported');
    expect(fs.existsSync(path.join(projectRoot, 'skills/arc-releasing/SKILL.md.draft'))).toBe(
      false,
    );
  });

  it('points approved global inbox entries to inspection instead of unsupported materialization', () => {
    appendCandidate(candidate({ scope: 'global', status: 'approved' }), {
      scope: 'global',
      projectRoot,
      homeDir,
    });

    const inbox = listLearningInbox({ scope: 'global', projectRoot, homeDir });

    expect(inbox.candidates[0]).toMatchObject({
      id: 'arc-releasing-20260501-001',
      next_command: 'arc learn inspect arc-releasing-20260501-001 --global',
    });
  });

  it('CLI learn inbox and accept support the compact review flow', () => {
    appendCandidate(candidate(), { scope: 'project', projectRoot, homeDir });
    const cli = path.join(__dirname, '../../scripts/cli.js');
    const env = { ...process.env, HOME: homeDir, CLAUDE_PROJECT_DIR: projectRoot };

    const inbox = JSON.parse(
      execFileSync('node', [cli, 'learn', 'inbox', '--project', '--json'], {
        env,
        encoding: 'utf8',
      }),
    );
    expect(inbox.candidates[0].next_command).toBe(
      'arc learn approve arc-releasing-20260501-001 --project',
    );

    const accepted = JSON.parse(
      execFileSync(
        'node',
        [cli, 'learn', 'accept', 'arc-releasing-20260501-001', '--project', '--json'],
        {
          env,
          encoding: 'utf8',
        },
      ),
    );
    expect(accepted.candidate.status).toBe('materialized');
    expect(fs.existsSync(path.join(projectRoot, 'skills/arc-releasing/SKILL.md.draft'))).toBe(true);
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

describe('learning subsystem MVP-2: multi-artifact-type, outcomes, transcripts', () => {
  let testDir;
  let projectRoot;
  let homeDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-learning-mvp2-'));
    projectRoot = path.join(testDir, 'project');
    homeDir = path.join(testDir, 'home');
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.mkdirSync(homeDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function baseCandidate(overrides = {}) {
    return {
      id: 'arc-learned-project-test-001',
      scope: 'project',
      artifact_type: 'instinct',
      name: 'arc-learned-test',
      summary: 'Test learned habit summary.',
      trigger: 'when this scenario recurs',
      evidence: [
        { session_id: 'session-1', source: 'observation', reason: 'recurs across sessions' },
      ],
      confidence: 0.6,
      status: 'pending',
      created_at: '2026-05-01T00:00:00Z',
      updated_at: '2026-05-01T00:00:00Z',
      ...overrides,
    };
  }

  describe('artifact_type validation', () => {
    it('accepts the five new artifact types and rejects unknown ones', () => {
      const learning = require('../../scripts/lib/learning');
      for (const t of ['skill', 'instinct', 'command', 'agent', 'eval', 'repo_convention_patch']) {
        expect(
          learning.validateCandidate(baseCandidate({ artifact_type: t, name: 'arc-test' })).ok,
        ).toBe(true);
      }
      const invalid = learning.validateCandidate(
        baseCandidate({ artifact_type: 'arbitrary-type' }),
      );
      expect(invalid.ok).toBe(false);
      expect(invalid.errors.some((m) => /artifact_type/.test(m))).toBe(true);
    });
  });

  describe('materialization across artifact types', () => {
    function approvedCandidate(artifactType, name) {
      return baseCandidate({
        id: `arc-learned-project-${artifactType}-${name}`,
        artifact_type: artifactType,
        name,
        status: 'approved',
      });
    }

    it('materializes an instinct candidate as a draft markdown file under the instincts dir', () => {
      const learning = require('../../scripts/lib/learning');
      const c = approvedCandidate('instinct', 'arc-learned-instinct-x');
      learning.appendCandidate(c, { scope: 'project', projectRoot, homeDir });
      const result = learning.materializeCandidate(c.id, {
        scope: 'project',
        projectRoot,
        homeDir,
      });
      expect(result.candidate.draft_paths).toEqual([
        '.arcforge/learning/instincts/arc-learned-instinct-x.md.draft',
      ]);
      expect(
        fs.existsSync(
          path.join(projectRoot, '.arcforge/learning/instincts/arc-learned-instinct-x.md.draft'),
        ),
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(projectRoot, '.arcforge/learning/instincts/arc-learned-instinct-x.md'),
        ),
      ).toBe(false);
    });

    it('materializes command/agent/eval candidates as inactive drafts under their dirs', () => {
      const learning = require('../../scripts/lib/learning');
      const cases = [
        { type: 'command', name: 'arc-learned-cmd', expected: 'commands/arc-learned-cmd.md.draft' },
        { type: 'agent', name: 'arc-learned-agent', expected: 'agents/arc-learned-agent.md.draft' },
        {
          type: 'eval',
          name: 'arc-learned-eval',
          expected: 'evals/arc-learned-eval/EVAL.md.draft',
        },
      ];
      for (const c of cases) {
        const cand = approvedCandidate(c.type, c.name);
        learning.appendCandidate(cand, { scope: 'project', projectRoot, homeDir });
        const result = learning.materializeCandidate(cand.id, {
          scope: 'project',
          projectRoot,
          homeDir,
        });
        expect(result.candidate.draft_paths).toEqual([c.expected]);
        expect(fs.existsSync(path.join(projectRoot, c.expected))).toBe(true);
        // Active path must not exist after materialization.
        expect(fs.existsSync(path.join(projectRoot, c.expected.replace('.draft', '')))).toBe(false);
      }
    });

    it('materializes repo_convention_patch candidates only as draft text proposals', () => {
      const learning = require('../../scripts/lib/learning');
      const c = approvedCandidate('repo_convention_patch', 'arc-learned-convention-x');
      learning.appendCandidate(c, { scope: 'project', projectRoot, homeDir });
      const result = learning.materializeCandidate(c.id, {
        scope: 'project',
        projectRoot,
        homeDir,
      });
      expect(result.candidate.draft_paths).toEqual([
        '.arcforge/learning/patches/arc-learned-convention-x.patch.draft',
      ]);
      expect(
        fs.existsSync(
          path.join(projectRoot, '.arcforge/learning/patches/arc-learned-convention-x.patch.draft'),
        ),
      ).toBe(true);
    });
  });

  describe('activation across artifact types', () => {
    function setupMaterialized(artifactType, name) {
      const learning = require('../../scripts/lib/learning');
      const c = baseCandidate({
        id: `arc-learned-project-${artifactType}-${name}`,
        artifact_type: artifactType,
        name,
        status: 'approved',
      });
      learning.appendCandidate(c, { scope: 'project', projectRoot, homeDir });
      learning.materializeCandidate(c.id, { scope: 'project', projectRoot, homeDir });
      return c.id;
    }

    it('activates instinct/command/agent/eval drafts by promoting to active artifacts', () => {
      const learning = require('../../scripts/lib/learning');
      const cases = [
        {
          type: 'instinct',
          name: 'arc-learned-instinct-y',
          active: '.arcforge/learning/instincts/arc-learned-instinct-y.md',
        },
        { type: 'command', name: 'arc-learned-cmd-y', active: 'commands/arc-learned-cmd-y.md' },
        { type: 'agent', name: 'arc-learned-agent-y', active: 'agents/arc-learned-agent-y.md' },
        { type: 'eval', name: 'arc-learned-eval-y', active: 'evals/arc-learned-eval-y/EVAL.md' },
      ];
      for (const c of cases) {
        const id = setupMaterialized(c.type, c.name);
        const result = learning.activateCandidate(id, { scope: 'project', projectRoot, homeDir });
        expect(result.candidate.status).toBe('activated');
        expect(result.candidate.active_paths).toEqual([c.active]);
        expect(fs.existsSync(path.join(projectRoot, c.active))).toBe(true);
        expect(fs.existsSync(path.join(projectRoot, `${c.active}.draft`))).toBe(false);
      }
    });

    it('refuses activation for repo_convention_patch — draft-only artifact type', () => {
      const learning = require('../../scripts/lib/learning');
      const id = setupMaterialized('repo_convention_patch', 'arc-learned-convention-y');
      expect(() =>
        learning.activateCandidate(id, { scope: 'project', projectRoot, homeDir }),
      ).toThrow(/draft-only|cannot be activated|refus/i);
      // Draft must remain on disk.
      expect(
        fs.existsSync(
          path.join(projectRoot, '.arcforge/learning/patches/arc-learned-convention-y.patch.draft'),
        ),
      ).toBe(true);
    });
  });

  describe('path safety', () => {
    it('refuses activation when the candidate name escapes the artifact dir', () => {
      const learning = require('../../scripts/lib/learning');
      // Inject a hostile candidate directly into the queue file (skipping append validation
      // which already rejects bad names).
      const queuePath = learning.getCandidateQueuePath({ scope: 'project', projectRoot, homeDir });
      fs.mkdirSync(path.dirname(queuePath), { recursive: true });
      fs.writeFileSync(
        queuePath,
        `${JSON.stringify(
          baseCandidate({
            id: 'evil-1',
            artifact_type: 'instinct',
            name: '../../escape',
            status: 'materialized',
            draft_paths: ['../../escape.md.draft'],
          }),
        )}\n`,
        'utf8',
      );
      expect(() =>
        learning.activateCandidate('evil-1', { scope: 'project', projectRoot, homeDir }),
      ).toThrow(/lowercase kebab-case|relative|parent|normalized/i);
    });
  });

  describe('global scoring metadata', () => {
    it('attaches distinct_project_count, session_count, and score to global candidates', () => {
      const learning = require('../../scripts/lib/learning');
      const alphaRoot = path.join(testDir, 'alpha');
      const betaRoot = path.join(testDir, 'beta');
      for (const item of [
        { root: alphaRoot, project: 'alpha', session: 'alpha-session' },
        { root: betaRoot, project: 'beta', session: 'beta-session' },
      ]) {
        const dir = path.join(homeDir, '.arcforge', 'observations', item.project);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          path.join(dir, 'observations.jsonl'),
          `${[
            {
              project_id: learning.getProjectId(item.root),
              ts: '2026-05-01T00:00:00Z',
              event: 'tool_start',
              tool: 'Read',
              session: item.session,
              project: item.project,
            },
            {
              project_id: learning.getProjectId(item.root),
              ts: '2026-05-01T00:01:00Z',
              event: 'tool_start',
              tool: 'Edit',
              session: item.session,
              project: item.project,
            },
          ]
            .map((r) => JSON.stringify(r))
            .join('\n')}\n`,
          'utf8',
        );
      }
      learning.setLearningEnabled({ scope: 'global', enabled: true, projectRoot, homeDir });

      const result = learning.analyzeLearning({ scope: 'global', projectRoot, homeDir });
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].distinct_project_count).toBe(2);
      expect(result.candidates[0].session_count).toBe(2);
      expect(result.candidates[0].score).toBeGreaterThan(0);
      expect(result.candidates[0].score_factors).toMatchObject({
        project_diversity: expect.any(Number),
        session_diversity: expect.any(Number),
        recency: expect.any(Number),
        outcome: expect.any(Number),
        user_confirmation: expect.any(Number),
        contradiction_absence: expect.any(Number),
        project_specificity: expect.any(Number),
        privacy_risk: expect.any(Number),
      });
      expect(result.candidates[0].status).toBe('pending');
    });
  });

  describe('outcome-aware learning', () => {
    it('emits an instinct candidate from an error → edit → success workflow', () => {
      const learning = require('../../scripts/lib/learning');
      learning.setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir });
      const projectId = learning.getProjectId(projectRoot);
      const observationPath = learning.getObservationPath({ projectRoot, homeDir });
      fs.mkdirSync(path.dirname(observationPath), { recursive: true });
      const events = [
        // session 1 — error then edit then bash success
        {
          ts: '2026-05-01T00:00:00Z',
          event: 'tool_end',
          tool: 'Bash',
          outcome: 'error',
          session: 's1',
          project_id: projectId,
        },
        {
          ts: '2026-05-01T00:00:30Z',
          event: 'tool_start',
          tool: 'Edit',
          session: 's1',
          project_id: projectId,
        },
        {
          ts: '2026-05-01T00:00:45Z',
          event: 'tool_start',
          tool: 'Bash',
          session: 's1',
          project_id: projectId,
          semantic: { command_kind: 'test', payload_saved: false },
        },
        {
          ts: '2026-05-01T00:01:00Z',
          event: 'tool_end',
          tool: 'Bash',
          outcome: 'success',
          session: 's1',
          project_id: projectId,
        },
        // session 2 — same shape
        {
          ts: '2026-05-01T01:00:00Z',
          event: 'tool_end',
          tool: 'Bash',
          outcome: 'error',
          session: 's2',
          project_id: projectId,
        },
        {
          ts: '2026-05-01T01:00:30Z',
          event: 'tool_start',
          tool: 'Edit',
          session: 's2',
          project_id: projectId,
        },
        {
          ts: '2026-05-01T01:00:45Z',
          event: 'tool_start',
          tool: 'Bash',
          session: 's2',
          project_id: projectId,
          semantic: { command_kind: 'build', payload_saved: false },
        },
        {
          ts: '2026-05-01T01:01:00Z',
          event: 'tool_end',
          tool: 'Bash',
          outcome: 'success',
          session: 's2',
          project_id: projectId,
        },
      ];
      fs.writeFileSync(
        observationPath,
        `${events.map((e) => JSON.stringify(e)).join('\n')}\n`,
        'utf8',
      );

      const result = learning.analyzeOutcomeRepair({
        scope: 'project',
        projectRoot,
        homeDir,
        now: '2026-05-01T02:00:00Z',
      });

      expect(result.emitted).toBe(1);
      const c = result.candidates[0];
      expect(c.artifact_type).toBe('instinct');
      expect(c.status).toBe('pending');
      expect(c.evidence.length).toBeGreaterThanOrEqual(2);
      // Privacy: no raw payload words allowed in evidence reasons.
      const evidenceText = JSON.stringify(c.evidence);
      expect(evidenceText).not.toContain('npm');
      expect(evidenceText).toMatch(/test command passed after edit/);
    });

    it('does not emit when there is no error→edit→success sequence', () => {
      const learning = require('../../scripts/lib/learning');
      learning.setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir });
      const projectId = learning.getProjectId(projectRoot);
      const observationPath = learning.getObservationPath({ projectRoot, homeDir });
      fs.mkdirSync(path.dirname(observationPath), { recursive: true });
      fs.writeFileSync(
        observationPath,
        `${JSON.stringify({
          ts: '2026-05-01T00:00:00Z',
          event: 'tool_start',
          tool: 'Read',
          session: 's1',
          project_id: projectId,
        })}\n`,
        'utf8',
      );
      const result = learning.analyzeOutcomeRepair({ scope: 'project', projectRoot, homeDir });
      expect(result.emitted).toBe(0);
    });
    it('does not emit when a non-test bash command succeeds after the edit', () => {
      const learning = require('../../scripts/lib/learning');
      learning.setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir });
      const projectId = learning.getProjectId(projectRoot);
      const observationPath = learning.getObservationPath({ projectRoot, homeDir });
      fs.mkdirSync(path.dirname(observationPath), { recursive: true });
      const events = [
        {
          ts: '2026-05-01T00:00:00Z',
          event: 'tool_end',
          tool: 'Bash',
          outcome: 'error',
          session: 's1',
          project_id: projectId,
        },
        {
          ts: '2026-05-01T00:00:30Z',
          event: 'tool_start',
          tool: 'Edit',
          session: 's1',
          project_id: projectId,
        },
        {
          ts: '2026-05-01T00:00:45Z',
          event: 'tool_start',
          tool: 'Bash',
          session: 's1',
          project_id: projectId,
          semantic: { command_kind: 'git', payload_saved: false },
        },
        {
          ts: '2026-05-01T00:01:00Z',
          event: 'tool_end',
          tool: 'Bash',
          outcome: 'success',
          session: 's1',
          project_id: projectId,
        },
      ];
      fs.writeFileSync(
        observationPath,
        `${events.map((e) => JSON.stringify(e)).join('\n')}\n`,
        'utf8',
      );
      const result = learning.analyzeOutcomeRepair({ scope: 'project', projectRoot, homeDir });
      expect(result.emitted).toBe(0);
    });

    it('does not merge same session ids across projects in global outcome learning', () => {
      const learning = require('../../scripts/lib/learning');
      learning.setLearningEnabled({ scope: 'global', enabled: true, projectRoot, homeDir });
      const root = path.join(homeDir, '.arcforge', 'observations');
      const alphaPath = path.join(root, 'alpha', 'observations.jsonl');
      const betaPath = path.join(root, 'beta', 'observations.jsonl');
      fs.mkdirSync(path.dirname(alphaPath), { recursive: true });
      fs.mkdirSync(path.dirname(betaPath), { recursive: true });
      fs.writeFileSync(
        alphaPath,
        `${[
          {
            ts: '2026-05-01T00:00:00Z',
            event: 'tool_end',
            tool: 'Bash',
            outcome: 'error',
            session: 'same',
          },
          { ts: '2026-05-01T00:00:30Z', event: 'tool_start', tool: 'Edit', session: 'same' },
        ]
          .map((e) => JSON.stringify(e))
          .join('\n')}\n`,
        'utf8',
      );
      fs.writeFileSync(
        betaPath,
        `${[
          {
            ts: '2026-05-01T00:00:45Z',
            event: 'tool_start',
            tool: 'Bash',
            session: 'same',
            semantic: { command_kind: 'test', payload_saved: false },
          },
          {
            ts: '2026-05-01T00:01:00Z',
            event: 'tool_end',
            tool: 'Bash',
            outcome: 'success',
            session: 'same',
          },
        ]
          .map((e) => JSON.stringify(e))
          .join('\n')}\n`,
        'utf8',
      );

      const result = learning.analyzeOutcomeRepair({ scope: 'global', projectRoot, homeDir });
      expect(result.emitted).toBe(0);
    });
  });

  describe('transcript habit extraction', () => {
    function writeTranscript(lines) {
      const transcriptPath = path.join(testDir, 'transcript.jsonl');
      fs.writeFileSync(transcriptPath, lines.map((l) => JSON.stringify(l)).join('\n'), 'utf8');
      return transcriptPath;
    }

    it('extracts privacy-safe instinct candidates from corrections in user messages', () => {
      const learning = require('../../scripts/lib/learning');
      learning.setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir });
      const transcriptPath = writeTranscript([
        { type: 'user', message: { content: "don't push to main without review" } },
        { type: 'assistant', message: { content: [{ type: 'text', text: 'understood' }] } },
        { type: 'user', message: { content: 'always run tests before commit' } },
      ]);

      const result = learning.analyzeTranscriptHabits({
        transcriptPath,
        sessionId: 'session-x',
        scope: 'project',
        projectRoot,
        homeDir,
        now: '2026-05-01T00:00:00Z',
      });

      expect(result.emitted).toBe(2);
      const types = result.candidates.map((c) => c.artifact_type);
      expect(types).toEqual(['instinct', 'instinct']);
      const reasons = result.candidates.flatMap((c) => c.evidence.map((item) => item.reason));
      // Evidence reasons stay bounded — no full text echoes.
      for (const r of reasons) expect(r.length).toBeLessThan(220);
      for (const c of result.candidates) {
        expect(c.evidence[0].source).toBe('transcript');
        expect(c.status).toBe('pending');
      }
    });

    it('emits a repo_convention_patch candidate for "from now on" preferences', () => {
      const learning = require('../../scripts/lib/learning');
      learning.setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir });
      const transcriptPath = writeTranscript([
        { type: 'user', message: { content: 'from now on, prefer kebab-case for filenames' } },
      ]);

      const result = learning.analyzeTranscriptHabits({
        transcriptPath,
        sessionId: 'session-x',
        scope: 'project',
        projectRoot,
        homeDir,
      });

      expect(result.emitted).toBe(1);
      expect(result.candidates[0].artifact_type).toBe('repo_convention_patch');
      expect(result.candidates[0].status).toBe('pending');
    });

    it('extracts Traditional Chinese correction and preference habits', () => {
      const learning = require('../../scripts/lib/learning');
      learning.setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir });
      const transcriptPath = writeTranscript([
        { type: 'user', message: { content: '不要自動重啟 Hermes gateway' } },
        { type: 'user', message: { content: '以後 repo convention 要先提出 AGENTS.md patch' } },
      ]);

      const result = learning.analyzeTranscriptHabits({
        transcriptPath,
        sessionId: 'session-zh',
        scope: 'project',
        projectRoot,
        homeDir,
      });

      expect(result.emitted).toBe(2);
      expect(result.candidates.map((c) => c.artifact_type)).toEqual([
        'instinct',
        'repo_convention_patch',
      ]);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('Hermes gateway');
      expect(serialized).not.toContain('AGENTS.md patch');
    });

    it('does not persist raw transcript text in candidate evidence', () => {
      const learning = require('../../scripts/lib/learning');
      learning.setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir });
      const secret = "don't leak super-secret-token-abcdef123";
      const transcriptPath = writeTranscript([{ type: 'user', message: { content: secret } }]);
      const result = learning.analyzeTranscriptHabits({
        transcriptPath,
        sessionId: 's1',
        scope: 'project',
        projectRoot,
        homeDir,
      });
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('super-secret-token-abcdef123');
      const contentHash = crypto
        .createHash('sha256')
        .update('leak super-secret-token-abcdef123')
        .digest('hex')
        .slice(0, 8);
      expect(serialized).not.toContain(contentHash);
      expect(result.candidates[0].id).toMatch(
        /arc-learned-project-habit-instinct-habit-[a-f0-9]{8}$/,
      );
      expect(result.candidates[0].pattern_key).toMatch(/^transcript:instinct:habit-[a-f0-9]{8}$/);
    });

    it('does not derive transcript candidate identifiers from captured text', () => {
      const learning = require('../../scripts/lib/learning');
      learning.setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir });
      const firstTranscript = writeTranscript([
        { type: 'user', message: { content: "don't expose alpha-secret-value" } },
      ]);
      const first = learning.analyzeTranscriptHabits({
        transcriptPath: firstTranscript,
        sessionId: 's1',
        scope: 'project',
        projectRoot,
        homeDir,
      });

      fs.rmSync(path.join(projectRoot, '.arcforge', 'learning', 'candidates'), {
        recursive: true,
        force: true,
      });
      const secondTranscript = writeTranscript([
        { type: 'user', message: { content: "don't expose beta-secret-value" } },
      ]);
      const second = learning.analyzeTranscriptHabits({
        transcriptPath: secondTranscript,
        sessionId: 's2',
        scope: 'project',
        projectRoot,
        homeDir,
      });

      expect(first.candidates[0].id).toBe(second.candidates[0].id);
      expect(first.candidates[0].name).toBe(second.candidates[0].name);
      expect(first.candidates[0].pattern_key).toBe(second.candidates[0].pattern_key);
    });

    it('does nothing when learning is disabled', () => {
      const learning = require('../../scripts/lib/learning');
      const transcriptPath = writeTranscript([
        { type: 'user', message: { content: 'never use arrow functions' } },
      ]);
      const result = learning.analyzeTranscriptHabits({
        transcriptPath,
        sessionId: 's1',
        scope: 'project',
        projectRoot,
        homeDir,
      });
      expect(result.enabled).toBe(false);
      expect(result.emitted).toBe(0);
    });
  });
});
