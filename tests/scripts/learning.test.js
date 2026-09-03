// tests/scripts/learning.test.js

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const {
  getLearningConfigPath,
  isLearningEnabled,
  isLearningEnabledAnyScope,
  isInjectActivatedInstinctsEnabled,
  learningEnabledSince,
  readLearningConfig,
  setLearningEnabled,
} = require('../../scripts/lib/learning');

describe('the learning opt-in', () => {
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

  describe('isLearningEnabledAnyScope', () => {
    it('is false when neither scope is enabled', () => {
      expect(isLearningEnabledAnyScope({ projectRoot, homeDir })).toBe(false);
    });

    it('is true when only the project scope is enabled', () => {
      setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir });
      expect(isLearningEnabledAnyScope({ projectRoot, homeDir })).toBe(true);
    });

    it('is true when only the global scope is enabled', () => {
      setLearningEnabled({ scope: 'global', enabled: true, projectRoot, homeDir });
      expect(isLearningEnabledAnyScope({ projectRoot, homeDir })).toBe(true);
    });

    it('is true when both scopes are enabled', () => {
      setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir });
      setLearningEnabled({ scope: 'global', enabled: true, projectRoot, homeDir });
      expect(isLearningEnabledAnyScope({ projectRoot, homeDir })).toBe(true);
    });
  });

  // The stale-draft healthcheck needs "since when", not just "is it on":
  // drafts from a learning-off period are by-design stubs (D-009).
  describe('learningEnabledSince', () => {
    const EARLY = '2026-01-01T00:00:00.000Z';
    const LATE = '2026-06-01T00:00:00.000Z';

    it('is null when neither scope is enabled', () => {
      expect(learningEnabledSince({ projectRoot, homeDir })).toBeNull();
    });

    it("returns the enabled scope's updated_at", () => {
      setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir, now: LATE });
      expect(learningEnabledSince({ projectRoot, homeDir })).toBe(Date.parse(LATE));
    });

    it('returns the EARLIEST scope — when enrichment first became authorized', () => {
      setLearningEnabled({ scope: 'global', enabled: true, projectRoot, homeDir, now: EARLY });
      setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir, now: LATE });
      expect(learningEnabledSince({ projectRoot, homeDir })).toBe(Date.parse(EARLY));
    });

    // `learn enable --project` is a copy-paste step in four user-facing
    // surfaces, so re-running it on an already-enabled scope is routine. It
    // stamps no transition and must not move the floor.
    it('does not move when an already-enabled scope is enabled again', () => {
      setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir, now: EARLY });
      const config = setLearningEnabled({
        scope: 'project',
        enabled: true,
        projectRoot,
        homeDir,
        now: LATE,
      });
      // The CLI prints this returned config, so it carries the same stamp.
      expect(config.updated_at).toBe(EARLY);
      expect(learningEnabledSince({ projectRoot, homeDir })).toBe(Date.parse(EARLY));
    });

    // The documented accepted cost: a real consent toggle DOES move the floor.
    it('moves when a scope is disabled and re-enabled', () => {
      setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir, now: EARLY });
      setLearningEnabled({ scope: 'project', enabled: false, projectRoot, homeDir, now: EARLY });
      setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir, now: LATE });
      expect(learningEnabledSince({ projectRoot, homeDir })).toBe(Date.parse(LATE));
    });

    // Accepted cost, pinned: disabling the scope that carries the earliest
    // opt-in advances the floor even though any-scope authorization never
    // lapsed. A scope's `updated_at` records its latest transition, so the
    // disable overwrites the enable it replaced (D-009 Residual).
    it('advances to the surviving scope when the earliest-enabled scope is disabled', () => {
      const MIDDLE = '2026-03-01T00:00:00.000Z';
      setLearningEnabled({ scope: 'global', enabled: true, projectRoot, homeDir, now: EARLY });
      setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir, now: MIDDLE });
      expect(learningEnabledSince({ projectRoot, homeDir })).toBe(Date.parse(EARLY));
      setLearningEnabled({ scope: 'global', enabled: false, projectRoot, homeDir, now: LATE });
      expect(learningEnabledSince({ projectRoot, homeDir })).toBe(Date.parse(MIDDLE));
    });

    it('ignores a disabled scope, however recently it was written', () => {
      setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir, now: EARLY });
      setLearningEnabled({ scope: 'global', enabled: false, projectRoot, homeDir, now: LATE });
      expect(learningEnabledSince({ projectRoot, homeDir })).toBe(Date.parse(EARLY));
    });

    it.each([
      ['missing', { scope: 'project', enabled: true }],
      ['unparseable', { scope: 'project', enabled: true, updated_at: 'garbage' }],
      ['not a string', { scope: 'project', enabled: true, updated_at: {} }],
    ])('falls back to the config mtime when updated_at is %s', (_label, config) => {
      const configPath = getLearningConfigPath({ scope: 'project', projectRoot, homeDir });
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(config));
      expect(learningEnabledSince({ projectRoot, homeDir })).toBe(fs.statSync(configPath).mtimeMs);
    });

    // Writing an unstamped config MOVES its mtime, so the fallback above has to
    // be captured before the write rather than re-derived after it — otherwise
    // an idempotent re-enable silently retires every draft that failed
    // enrichment between the old mtime and the repeated command.
    function writeUnstampedConfig(enabled = true) {
      const configPath = getLearningConfigPath({ scope: 'project', projectRoot, homeDir });
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify({ scope: 'project', enabled }));
      fs.utimesSync(configPath, new Date(EARLY), new Date(EARLY));
      return configPath;
    }

    it('preserves the mtime fallback when an unstamped enabled scope is enabled again', () => {
      writeUnstampedConfig();
      const config = setLearningEnabled({
        scope: 'project',
        enabled: true,
        projectRoot,
        homeDir,
        now: LATE,
      });
      // The CLI prints this returned config, so it carries the preserved stamp.
      expect(config.updated_at).toBe(EARLY);
      expect(learningEnabledSince({ projectRoot, homeDir })).toBe(Date.parse(EARLY));
    });

    it('still stamps the transition when an unstamped scope is actually toggled', () => {
      writeUnstampedConfig();
      setLearningEnabled({ scope: 'project', enabled: false, projectRoot, homeDir, now: LATE });
      setLearningEnabled({ scope: 'project', enabled: true, projectRoot, homeDir, now: LATE });
      expect(learningEnabledSince({ projectRoot, homeDir })).toBe(Date.parse(LATE));
    });

    // The preservation keys on "the state did not change", not on "the state is
    // on", so a no-op DISABLE materializes the mtime as well. That is inert, and
    // this pins WHY rather than just the field: `learningEnabledSince` skips a
    // scope whose `enabled` is not true, so nothing ever reads the stamp a
    // disabled config carries. If the floor is ever widened to disabled scopes,
    // this case fails and names the coupling instead of letting a materialized
    // mtime quietly become a floor.
    it('materializes the mtime on a no-op disable, where the floor ignores it', () => {
      writeUnstampedConfig(false);
      const config = setLearningEnabled({
        scope: 'project',
        enabled: false,
        projectRoot,
        homeDir,
        now: LATE,
      });
      expect(config.updated_at).toBe(EARLY);
      expect(learningEnabledSince({ projectRoot, homeDir })).toBeNull();
    });
  });

  describe('inject_activated_instincts kill-switch (ICL-4)', () => {
    function writeGlobalConfig(obj) {
      const configPath = getLearningConfigPath({ scope: 'global', homeDir });
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(obj), 'utf8');
    }

    it('defaults ON when no config exists', () => {
      expect(isInjectActivatedInstinctsEnabled({ homeDir })).toBe(true);
    });

    it('defaults ON when the field is absent', () => {
      writeGlobalConfig({ scope: 'global', enabled: true });
      expect(isInjectActivatedInstinctsEnabled({ homeDir })).toBe(true);
    });

    it('stays ON when explicitly true', () => {
      writeGlobalConfig({ scope: 'global', inject_activated_instincts: true });
      expect(isInjectActivatedInstinctsEnabled({ homeDir })).toBe(true);
    });

    it('turns OFF only on explicit false', () => {
      writeGlobalConfig({ scope: 'global', inject_activated_instincts: false });
      expect(isInjectActivatedInstinctsEnabled({ homeDir })).toBe(false);
    });

    it('global config path honors ARCFORGE_HOME when no homeDir is passed (eval-trial isolation)', () => {
      const prev = process.env.ARCFORGE_HOME;
      try {
        process.env.ARCFORGE_HOME = path.join(homeDir, 'isolated-arcforge');
        expect(getLearningConfigPath({ scope: 'global' })).toBe(
          path.join(homeDir, 'isolated-arcforge', 'learning', 'config.json'),
        );
      } finally {
        if (prev === undefined) delete process.env.ARCFORGE_HOME;
        else process.env.ARCFORGE_HOME = prev;
      }
    });

    it('global config path is byte-identical to ~/.arcforge when ARCFORGE_HOME is unset', () => {
      const prev = process.env.ARCFORGE_HOME;
      try {
        delete process.env.ARCFORGE_HOME;
        expect(getLearningConfigPath({ scope: 'global' })).toBe(
          path.join(os.homedir(), '.arcforge', 'learning', 'config.json'),
        );
      } finally {
        if (prev !== undefined) process.env.ARCFORGE_HOME = prev;
      }
    });

    it('explicit homeDir takes precedence over ARCFORGE_HOME (tests stay byte-identical)', () => {
      const prev = process.env.ARCFORGE_HOME;
      try {
        process.env.ARCFORGE_HOME = path.join(homeDir, 'should-be-ignored');
        expect(getLearningConfigPath({ scope: 'global', homeDir })).toBe(
          path.join(homeDir, '.arcforge', 'learning', 'config.json'),
        );
      } finally {
        if (prev === undefined) delete process.env.ARCFORGE_HOME;
        else process.env.ARCFORGE_HOME = prev;
      }
    });
  });

  it('observe redaction removes common secrets before observations are stored', () => {
    // redactObservationText moved to scripts/lib/sanitize-observation (Slice C)
    delete require.cache[require.resolve('../../scripts/lib/sanitize-observation')];
    const { redactObservationText } = require('../../scripts/lib/sanitize-observation');

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

    // Sanitizer preserves delimiter context: api_key="value" → api_key="[REDACTED]"
    // and password: "value" → password: "[REDACTED]"
    expect(redacted).not.toContain(apiKey);
    expect(redacted).not.toContain(password);
    expect(redacted).not.toContain(bearer);
    expect(redacted).not.toContain(token);
    expect(redacted).toContain('[REDACTED]');
    expect(redacted).toContain('Authorization: Bearer [REDACTED]');
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

  it('does not contain the old release-specific analyzer entrypoint', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../scripts/lib/learning.js'), 'utf8');

    expect(source).not.toContain('releaseSignalScore');
    expect(source).not.toContain('buildReleaseCandidate');
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
    expect(
      fs.existsSync(path.join(homeDir, '.arcforge', 'learning', 'candidates', 'queue.jsonl')),
    ).toBe(false);
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

// ---------------------------------------------------------------------------
// The `learn` candidate commands over the canonical Layer-5 queue (D-011, D-012).
//
// Before the unification there were two disjoint queues. The curator wrote
// `<arcforge home>/learning/candidates/queue.jsonl` — an append-only event log,
// records keyed `candidate_id` + `lifecycle.status`, `scope` an object. The CLI
// read `<project>/.arcforge/learning/candidates/queue.jsonl`, matching on `id`
// and `status`, and nothing shipped ever wrote to it. So the CLI managed an
// empty queue, `--global` reads printed the curator's records verbatim
// (`scope.project_id` and `body` included), and `--global` list commands
// silently matched nothing.
// ---------------------------------------------------------------------------

describe('learn candidate commands over the canonical queue', () => {
  // Distinctive sentinels: asserting on the literal field names would break on
  // any output that legitimately carries a redacted preview.
  const BODY_CANARY = 'CANARY-BODY-must-never-be-printed-5f2a';
  const PROJECT_ID_CANARY = 'canaryprojectid0';
  const PROJECT_ID = 'proj_test';
  // `--project` matches `scope.project` against the project directory's own
  // name, so the temp project root is named for the project the records carry.
  const PROJECT_NAME = 'arcforge';
  const OTHER_PROJECT_CANDIDATE_ID = 'cand_instinct_20260901T030000Z_c3d4e5f6a1b2';
  const CANDIDATE_ID = 'cand_instinct_20260901T010000Z_a1b2c3d4e5f6';
  const GLOBAL_CANDIDATE_ID = 'cand_instinct_20260901T020000Z_b2c3d4e5f6a1';

  const originalArcforgeHome = process.env.ARCFORGE_HOME;
  let testDir;
  let projectRoot;
  let arcforgeHome;
  let cli;
  let env;

  function makeRecord(overrides = {}) {
    return {
      schema_version: 1,
      candidate_id: CANDIDATE_ID,
      created_at: '2026-09-01T01:00:00.000Z',
      updated_at: '2026-09-01T01:00:00.000Z',
      artifact_type: 'instinct',
      scope: { kind: 'project', project: PROJECT_NAME, project_id: PROJECT_ID },
      source: { source_type: 'layer4_llm_curator' },
      name: 'grep-before-editing',
      summary: 'Grep for existing patterns before making edits',
      rationale: 'Prevents duplicate code and missed context',
      domain: 'workflow',
      body: 'When editing files, first grep for existing patterns to avoid duplication',
      body_source: 'llm_curator',
      evidence: [
        {
          evidence_id: 'ev_abc123',
          evidence_type: 'observation',
          relevance: 'User repeatedly grepped before editing files',
          summary: 'Observed grep-first pattern 5 times across 3 sessions',
        },
      ],
      evidence_quality: 'medium',
      lifecycle: { status: 'pending_review', status_changed_at: '2026-09-01T01:00:00.000Z' },
      ...overrides,
    };
  }

  /** Append a raw `candidate.created` event, the shape readCurrentCandidates replays. */
  function seed(record) {
    const queuePath = path.join(arcforgeHome, 'learning', 'candidates', 'queue.jsonl');
    fs.mkdirSync(path.dirname(queuePath), { recursive: true });
    fs.appendFileSync(
      queuePath,
      `${JSON.stringify({
        schema_version: 1,
        event_id: `evt_${record.candidate_id}`,
        ts: record.created_at,
        candidate_id: record.candidate_id,
        event_type: 'candidate.created',
        actor: { layer: 5, actor_type: 'validator' },
        record,
      })}\n`,
      'utf8',
    );
  }

  // spawnSync, not execFileSync: the activate path writes its behavior-change
  // warning to stderr on the SUCCESS path, which execFileSync discards.
  function runCli(args) {
    const result = spawnSync('node', [cli, 'learn', ...args], { env, encoding: 'utf8' });
    return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
  }

  function runJson(args) {
    const result = runCli([...args, '--json']);
    expect(result.status).toBe(0);
    return JSON.parse(result.stdout);
  }

  /**
   * Retire an activated candidate. `deactivate` is a dashboard-only action —
   * the CLI has no verb for it — so drive the canonical handler in a child
   * process that inherits the same ARCFORGE_HOME the CLI runs against.
   */
  function deactivate(candidateId) {
    const dashboard = path.join(__dirname, '../../scripts/lib/learning-dashboard.js');
    const script = `
      const { handleDashboardAction } = require(${JSON.stringify(dashboard)});
      const result = handleDashboardAction({
        action: 'deactivate',
        candidate_id: ${JSON.stringify(candidateId)},
        expected_current_status: 'activated',
        safety_ack: { reviewer_saw_behavior_change_warning: true },
        actor: { layer: 8, actor_type: 'dashboard', reviewer: 'local_user' },
      });
      if (!result.accepted) { console.error(JSON.stringify(result)); process.exit(1); }
    `;
    const result = spawnSync('node', ['-e', script], { env, encoding: 'utf8' });
    expect(result.status).toBe(0);
  }

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-candidates-'));
    projectRoot = path.join(testDir, PROJECT_NAME);
    arcforgeHome = path.join(testDir, 'home', '.arcforge');
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.mkdirSync(arcforgeHome, { recursive: true });

    cli = path.join(__dirname, '../../scripts/cli.js');
    env = {
      ...process.env,
      ARCFORGE_HOME: arcforgeHome,
      CLAUDE_PROJECT_DIR: projectRoot,
    };
    process.env.ARCFORGE_HOME = arcforgeHome;
  });

  afterEach(() => {
    if (originalArcforgeHome === undefined) delete process.env.ARCFORGE_HOME;
    else process.env.ARCFORGE_HOME = originalArcforgeHome;
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  describe('reads', () => {
    it('lists the canonical queue as sanitized cards, keyed candidate_id/lifecycle_status', () => {
      seed(makeRecord());

      const review = runJson(['review', '--project']);

      expect(review.count).toBe(1);
      expect(review.candidates[0]).toMatchObject({
        candidate_id: CANDIDATE_ID,
        artifact_type: 'instinct',
        lifecycle_status: 'pending_review',
        available_actions: expect.arrayContaining(['approve', 'dismiss']),
      });
    });

    it('prints neither the candidate body nor the project id', () => {
      seed(
        makeRecord({
          body: BODY_CANARY,
          scope: { kind: 'project', project: PROJECT_NAME, project_id: PROJECT_ID_CANARY },
        }),
      );

      const raw = JSON.stringify(runJson(['review', '--project']));

      expect(raw).not.toContain(BODY_CANARY);
      expect(raw).not.toContain(PROJECT_ID_CANARY);
    });

    it('shows only the project-scoped records — global candidates stay dashboard-only', () => {
      seed(makeRecord());
      seed(
        makeRecord({
          candidate_id: GLOBAL_CANDIDATE_ID,
          scope: { kind: 'global' },
          created_at: '2026-09-01T02:00:00.000Z',
        }),
      );

      const review = runJson(['review', '--project']);

      expect(review.count).toBe(1);
      expect(review.candidates[0].candidate_id).toBe(CANDIDATE_ID);
    });

    it('refuses to inspect a global candidate by id from the project scope', () => {
      seed(makeRecord({ candidate_id: GLOBAL_CANDIDATE_ID, scope: { kind: 'global' } }));

      const result = runCli(['inspect', GLOBAL_CANDIDATE_ID, '--project', '--json']);

      expect(result.status).not.toBe(0);
      expect(JSON.parse(result.stdout).error).toMatch(/candidate not found/);
      expect(JSON.parse(result.stdout).error).toMatch(/global-scoped candidate/);
    });

    // The canonical queue is home-global, so `--project` has to say WHICH
    // project: without this filter every project on the machine listed — and
    // could activate — every other project's candidates.
    it("shows only this project — another project's candidates stay out", () => {
      seed(makeRecord());
      seed(
        makeRecord({
          candidate_id: OTHER_PROJECT_CANDIDATE_ID,
          scope: { kind: 'project', project: 'some-other-project', project_id: 'proj_other' },
          created_at: '2026-09-01T03:00:00.000Z',
        }),
      );

      const review = runJson(['review', '--project']);

      expect(review.count).toBe(1);
      expect(review.candidates[0].candidate_id).toBe(CANDIDATE_ID);
      expect(runJson(['inbox', '--project']).count).toBe(1);
    });

    // Every producer keys the project on the SANITIZED basename (`getProjectName()`
    // — the same slug as `observations/<slug>/` and `instincts/<slug>/`). The CLI
    // used to take the raw basename, so from any project root the sanitizer
    // rewrites (`My Project` → `My-Project`) the whole front end came back empty.
    it('matches the sanitized project slug, not the raw directory name', () => {
      const rawRoot = path.join(testDir, 'My Project');
      fs.mkdirSync(rawRoot, { recursive: true });
      seed(
        makeRecord({ scope: { kind: 'project', project: 'My-Project', project_id: PROJECT_ID } }),
      );
      const rawRootEnv = { ...env, CLAUDE_PROJECT_DIR: rawRoot };

      const run = (args) => {
        const result = spawnSync('node', [cli, 'learn', ...args, '--json'], {
          env: rawRootEnv,
          encoding: 'utf8',
        });
        expect(result.status).toBe(0);
        return JSON.parse(result.stdout);
      };

      const inbox = run(['inbox', '--project']);
      expect(inbox.count).toBe(1);
      expect(inbox.candidates[0].candidate_id).toBe(CANDIDATE_ID);
      expect(run(['review', '--project']).count).toBe(1);
    });

    it("names the owning project when an id belongs to another project's queue", () => {
      seed(
        makeRecord({
          candidate_id: OTHER_PROJECT_CANDIDATE_ID,
          scope: { kind: 'project', project: 'some-other-project', project_id: 'proj_other' },
        }),
      );

      const result = runCli(['activate', OTHER_PROJECT_CANDIDATE_ID, '--project', '--json']);

      expect(result.status).not.toBe(0);
      expect(JSON.parse(result.stdout).error).toMatch(
        /belongs to the project "some-other-project", not to "arcforge"/,
      );
      expect(fs.existsSync(path.join(arcforgeHome, 'instincts'))).toBe(false);
    });

    it('groups the inbox by status and artifact type with the next command for each', () => {
      seed(makeRecord());

      const inbox = runJson(['inbox', '--project']);

      expect(inbox.counts).toEqual({ pending_review: 1 });
      expect(inbox.groups.by_status.pending_review).toEqual([CANDIDATE_ID]);
      expect(inbox.groups.by_artifact_type.instinct).toEqual([CANDIDATE_ID]);
      expect(inbox.candidates[0].next_command).toBe(
        `arcforge learn approve ${CANDIDATE_ID} --project`,
      );
      expect(inbox.candidates[0].next_actions[0]).toMatch(/approve or reject/);
    });

    it('points an approved instinct candidate at materialize', () => {
      seed(makeRecord());
      runJson(['approve', CANDIDATE_ID, '--project']);

      const inbox = runJson(['inbox', '--project']);

      expect(inbox.candidates[0].next_command).toBe(
        `arcforge learn materialize ${CANDIDATE_ID} --project`,
      );
    });

    // The dashboard's `evolve` action writes a project-scoped `skill` record
    // into the same canonical queue, so an approved non-instinct candidate is
    // reachable. The matrix allows `materialize` from `approved` — it is keyed
    // on status alone — but the CLI refuses it for that artifact type, so the
    // inbox must not name it as the next step.
    it('never recommends a command the artifact-type narrowing would refuse', () => {
      seed(makeRecord({ artifact_type: 'skill' }));
      runJson(['approve', CANDIDATE_ID, '--project']);

      const card = runJson(['inbox', '--project']).candidates[0];

      expect(card.available_actions).toContain('materialize');
      expect(card.next_command).toBe(`arcforge learn inspect ${CANDIDATE_ID} --project`);
      expect(card.next_actions[0]).toMatch(/materializes instinct candidates only/);
      expect(card.next_actions[1]).toMatch(/leave it queued/);

      // The advertised next step has to run: drop the leading `arcforge learn`.
      const argv = card.next_command.split(' ').slice(2);
      expect(runCli([...argv, '--json']).status).toBe(0);
    });

    // The narrowing only has something to say where the status prose names a
    // build step. A terminal status names none, so it keeps its own prose.
    it('leaves a status that names no build step on its own prose', () => {
      seed(makeRecord({ artifact_type: 'skill' }));
      runJson(['reject', CANDIDATE_ID, '--project']);

      const card = runJson(['inbox', '--project']).candidates[0];

      expect(card.lifecycle_status).toBe('dismissed');
      expect(card.next_actions).toEqual(['dismissed — no action available']);
    });

    it('inspects one candidate with a redacted body preview and no project id', () => {
      seed(makeRecord());

      const detail = runJson(['inspect', CANDIDATE_ID, '--project']);

      expect(detail.candidate.candidate_id).toBe(CANDIDATE_ID);
      expect(detail.candidate.body_preview.text).toContain('grep for existing patterns');
      expect(detail.candidate.scope).toEqual({ kind: 'project', project: 'arcforge' });
      expect(JSON.stringify(detail)).not.toContain(PROJECT_ID);
      expect(detail.next_actions[0]).toMatch(/approve or reject/);
    });

    it('lists only materialized candidates under drafts, with their draft paths', () => {
      seed(makeRecord());
      expect(runJson(['drafts', '--project']).count).toBe(0);

      runJson(['approve', CANDIDATE_ID, '--project']);
      runJson(['materialize', CANDIDATE_ID, '--project']);

      const drafts = runJson(['drafts', '--project']);
      expect(drafts.count).toBe(1);
      expect(drafts.drafts[0].lifecycle_status).toBe('materialized');
      expect(drafts.drafts[0].draft_paths[0]).toContain(
        path.join('learning', 'drafts', CANDIDATE_ID),
      );
    });
  });

  // -------------------------------------------------------------------------
  // --global fails closed (D-011)
  // -------------------------------------------------------------------------

  describe('--global', () => {
    for (const [name, args] of [
      ['review', ['review', '--global', '--json']],
      ['inbox', ['inbox', '--global', '--json']],
      ['inspect', ['inspect', CANDIDATE_ID, '--global', '--json']],
      ['drafts', ['drafts', '--global', '--json']],
      ['approve', ['approve', CANDIDATE_ID, '--global', '--json']],
      ['activate', ['activate', CANDIDATE_ID, '--global', '--json']],
    ]) {
      it(`learn ${name} --global exits non-zero and points at the dashboard`, () => {
        seed(makeRecord({ body: BODY_CANARY }));

        const result = runCli(args);

        // With --json the CLI renders a thrown error as `{ "error": ... }` on
        // stdout (scripts/cli.js), so asserting the whole envelope proves the
        // refusal is the ONLY thing printed.
        expect(result.status).not.toBe(0);
        expect(JSON.parse(result.stdout)).toEqual({
          error: expect.stringContaining('arcforge learn dashboard'),
        });
        expect(`${result.stdout}${result.stderr}`).not.toContain(BODY_CANARY);
      });
    }

    it('still requires an explicit scope', () => {
      const result = runCli(['review']);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/--project or --global/);
    });
  });

  // -------------------------------------------------------------------------
  // Transitions — dispatched through handleDashboardAction
  // -------------------------------------------------------------------------

  describe('transitions', () => {
    it('drives approve → materialize → activate and writes the active instinct', () => {
      seed(makeRecord());

      expect(runJson(['approve', CANDIDATE_ID, '--project']).next_status).toBe('approved');

      const materialized = runJson(['materialize', CANDIDATE_ID, '--project']);
      expect(materialized.next_status).toBe('materialized');
      expect(fs.existsSync(materialized.draft_paths[0])).toBe(true);

      const activated = runJson(['activate', CANDIDATE_ID, '--project']);
      expect(activated.next_status).toBe('activated');
      expect(activated.candidate.lifecycle_status).toBe('activated');
      expect(
        fs.existsSync(path.join(arcforgeHome, 'instincts', 'arcforge', `${CANDIDATE_ID}.md`)),
      ).toBe(true);
    });

    it('records every action in the shared audit log, attributed to the CLI', () => {
      seed(makeRecord());
      runJson(['approve', CANDIDATE_ID, '--project']);

      const auditLog = fs.readFileSync(
        path.join(arcforgeHome, 'learning', 'dashboard', 'actions.jsonl'),
        'utf8',
      );
      const entries = auditLog
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));

      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        accepted: true,
        action: 'approve',
        candidate_id: CANDIDATE_ID,
        actor: { layer: 6, actor_type: 'cli', reviewer: 'local_user' },
      });
    });

    it('maps `reject` onto the matrix action `dismiss`', () => {
      seed(makeRecord());

      expect(runJson(['reject', CANDIDATE_ID, '--project']).next_status).toBe('dismissed');
    });

    it('refuses a transition the Action × Status matrix forbids, naming what is legal', () => {
      seed(makeRecord());
      runJson(['approve', CANDIDATE_ID, '--project']);

      const result = runCli(['reject', CANDIDATE_ID, '--project', '--json']);

      expect(result.status).not.toBe(0);
      expect(JSON.parse(result.stdout).error).toMatch(/policy_violation/);
      expect(JSON.parse(result.stdout).error).toMatch(/is approved.*allows: materialize/);
    });

    it('names the instinct-only narrowing when asked to materialize another type', () => {
      seed(makeRecord({ artifact_type: 'skill' }));
      runJson(['approve', CANDIDATE_ID, '--project']);

      const result = runCli(['materialize', CANDIDATE_ID, '--project', '--json']);

      expect(result.status).not.toBe(0);
      expect(JSON.parse(result.stdout).error).toMatch(
        /supports instinct candidates only.*is a skill candidate/s,
      );
    });

    it('warns on stderr before activating, so the safety ack it sends is true', () => {
      seed(makeRecord());
      runJson(['approve', CANDIDATE_ID, '--project']);
      runJson(['materialize', CANDIDATE_ID, '--project']);

      const result = runCli(['activate', CANDIDATE_ID, '--project', '--json']);

      expect(result.status).toBe(0);
      expect(result.stderr).toMatch(/changes how future sessions behave/);
      expect(result.stderr).toMatch(/target: the draft at .*becomes an active instinct/s);
    });

    it('accepts by approving and materializing, and never activates', () => {
      seed(makeRecord());

      const accepted = runJson(['accept', CANDIDATE_ID, '--project']);

      expect(accepted.candidate.lifecycle_status).toBe('materialized');
      expect(fs.existsSync(accepted.draft_paths[0])).toBe(true);
      expect(fs.existsSync(path.join(arcforgeHome, 'instincts'))).toBe(false);
    });

    // `accept` used to pin the materialize dispatch to a literal `approved`, so
    // every starting status other than pending_review came back as a
    // `stale_status` race that had not happened — and re-running, which is what
    // that message tells you to do, could never clear it.
    it('accepts a deactivated candidate, which the matrix allows to materialize', () => {
      seed(makeRecord());
      runJson(['approve', CANDIDATE_ID, '--project']);
      runJson(['materialize', CANDIDATE_ID, '--project']);
      runJson(['activate', CANDIDATE_ID, '--project']);
      deactivate(CANDIDATE_ID);

      const accepted = runJson(['accept', CANDIDATE_ID, '--project']);

      // The dispatch goes through and hands back the draft.
      expect(accepted.materialization_id).toBeTruthy();
      expect(fs.existsSync(accepted.draft_paths[0])).toBe(true);

      // The re-materialization transition lands even though L7-11 hands back the
      // manifest it already wrote, so the candidate re-enters the drafts queue
      // rather than reporting success while still reading `deactivated`.
      expect(accepted.candidate.lifecycle_status).toBe('materialized');

      const drafts = runJson(['drafts', '--project']);
      expect(drafts.count).toBe(1);
      expect(drafts.drafts[0].candidate_id).toBe(CANDIDATE_ID);
    });

    it('refuses to accept an activated candidate as a policy violation, not a race', () => {
      seed(makeRecord());
      runJson(['accept', CANDIDATE_ID, '--project']);
      runJson(['activate', CANDIDATE_ID, '--project']);

      const result = runCli(['accept', CANDIDATE_ID, '--project', '--json']);

      expect(result.status).not.toBe(0);
      const { error } = JSON.parse(result.stdout);
      expect(error).toMatch(/policy_violation/);
      expect(error).toMatch(/is activated.*allows: deactivate/);
      expect(error).not.toMatch(/stale_status|re-run/);
    });

    it('reports an unknown candidate id rather than acting on nothing', () => {
      const result = runCli(['approve', 'cand_missing', '--project', '--json']);

      expect(result.status).not.toBe(0);
      expect(JSON.parse(result.stdout).error).toMatch(/candidate not found/);
    });
  });
});
