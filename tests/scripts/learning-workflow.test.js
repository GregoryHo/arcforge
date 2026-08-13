// tests/scripts/learning-workflow.test.js
//
// Replaces tests/scripts/{diary,reflect,recall}.test.js, which tested the
// skill-local scripts deleted in v6/P5 (diary.js / reflect.js / recall.js). The
// logic moved to scripts/lib/learning-workflow.js and is reached through
// `arcforge learn diary|reflect|recall`.
//
// Coverage carried over: diary path resolution, the missing-argument errors for
// every command, the usage output, and both save-record cases (record written to
// <home>/.arcforge/{reflections,recalls}/<project>/, plus the two required-field
// rejections for each).
// Coverage ADDED: diary write + draft finalization (finalize had no test at
// all), reflect scan strategy/ready composition, processed.log update, and CLI
// exit codes for the whole new subgroup surface.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  REFLECT_READY_MIN_DIARIES,
  resolveDiaryPath,
  writeDiary,
  finalizeDiaryDraft,
  scanForReflection,
  checkReflectReady,
  recordReflection,
  recordRecall,
} = require('../../scripts/lib/learning-workflow');

const CLI = path.join(__dirname, '../../scripts/cli.js');

/** Run the CLI with an isolated ARCFORGE_HOME. Throws on non-zero exit. */
function runCli(args, home) {
  return execFileSync('node', [CLI, ...args], {
    encoding: 'utf-8',
    stdio: 'pipe',
    env: { ...process.env, ARCFORGE_HOME: home },
  });
}

describe('learning-workflow diary operations', () => {
  let home;
  let previousHome;
  const key = { project: 'diary-proj', date: '2026-08-13', session: 'sess-1' };

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-diary-'));
    previousHome = process.env.ARCFORGE_HOME;
    process.env.ARCFORGE_HOME = home;
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.ARCFORGE_HOME;
    else process.env.ARCFORGE_HOME = previousHome;
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('resolves the final diary path under the diaries root', () => {
    const resolved = resolveDiaryPath(key);
    expect(resolved).toBe(
      path.join(home, 'diaries', key.project, key.date, `diary-${key.session}.md`),
    );
  });

  it('resolves the draft path when asked for the draft', () => {
    expect(resolveDiaryPath({ ...key, draft: true })).toBe(
      path.join(home, 'diaries', key.project, key.date, `diary-${key.session}-draft.md`),
    );
  });

  it.each([
    ['project', { ...key, project: '' }],
    ['date', { ...key, date: '' }],
    ['session', { ...key, session: '' }],
  ])('rejects a blank %s', (name, badKey) => {
    expect(() => resolveDiaryPath(badKey)).toThrow(
      new RegExp(`${name} must be a non-empty string`),
    );
  });

  it('writes a diary and creates its parent directories', () => {
    const result = writeDiary({ ...key, content: '# Session diary\n' });
    expect(fs.readFileSync(result.path, 'utf-8')).toContain('# Session diary');
  });

  it('rejects a diary write with no content', () => {
    expect(() => writeDiary({ ...key, content: '' })).toThrow(/content must be a non-empty string/);
  });

  it('finalize renames the draft to the final path', () => {
    const draftPath = resolveDiaryPath({ ...key, draft: true });
    fs.mkdirSync(path.dirname(draftPath), { recursive: true });
    fs.writeFileSync(draftPath, '# enriched draft\n');

    const result = finalizeDiaryDraft(key);

    expect(result.path).toBe(resolveDiaryPath(key));
    expect(fs.existsSync(draftPath)).toBe(false);
    expect(fs.readFileSync(result.path, 'utf-8')).toContain('# enriched draft');
  });

  it('finalize does not merge — the draft content survives verbatim', () => {
    const draftPath = resolveDiaryPath({ ...key, draft: true });
    fs.mkdirSync(path.dirname(draftPath), { recursive: true });
    const body = '# draft\n\n## Session Metrics\n\n- tool calls: 42\n';
    fs.writeFileSync(draftPath, body);

    const result = finalizeDiaryDraft(key);
    expect(fs.readFileSync(result.path, 'utf-8')).toBe(body);
  });

  it('finalize names the missing draft path when there is nothing to promote', () => {
    expect(() => finalizeDiaryDraft(key)).toThrow(/No diary draft found at/);
    expect(() => finalizeDiaryDraft(key)).toThrow(/-draft\.md/);
  });
});

describe('learning-workflow reflection scan', () => {
  let home;
  let previousHome;
  const project = 'reflect-proj';

  const writeDiaries = (count) => {
    for (let i = 0; i < count; i++) {
      writeDiary({
        project,
        date: '2026-08-13',
        session: `sess-${i}`,
        content: `# diary ${i}\n`,
      });
    }
  };

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-reflect-'));
    previousHome = process.env.ARCFORGE_HOME;
    process.env.ARCFORGE_HOME = home;
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.ARCFORGE_HOME;
    else process.env.ARCFORGE_HOME = previousHome;
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('rejects a blank project', () => {
    expect(() => scanForReflection('')).toThrow(/project must be a non-empty string/);
  });

  it('returns a known strategy and an empty diary list for a fresh project', () => {
    const result = scanForReflection(project);
    expect(['unprocessed', 'project_focused', 'recent_window']).toContain(result.strategy);
    expect(result.count).toBe(0);
    expect(result.ready).toBe(false);
  });

  it('reports not-ready below the diary floor', () => {
    writeDiaries(REFLECT_READY_MIN_DIARIES - 1);
    const result = scanForReflection(project);
    expect(result.count).toBe(REFLECT_READY_MIN_DIARIES - 1);
    expect(result.ready).toBe(false);
  });

  it('reports ready at the diary floor', () => {
    writeDiaries(REFLECT_READY_MIN_DIARIES);
    const result = scanForReflection(project);
    expect(result.count).toBe(REFLECT_READY_MIN_DIARIES);
    expect(result.ready).toBe(true);
    expect(result.diaries).toHaveLength(REFLECT_READY_MIN_DIARIES);
  });

  it('checkReflectReady agrees with scanForReflection', () => {
    writeDiaries(REFLECT_READY_MIN_DIARIES);
    const scan = scanForReflection(project);
    expect(checkReflectReady(project)).toEqual({
      ready: scan.ready,
      strategy: scan.strategy,
      count: scan.count,
    });
  });
});

describe('learning-workflow operation records', () => {
  let home;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-records-'));
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('writes a reflection record under <home>/.arcforge/reflections/<project>/', () => {
    const reflectId = 'reflect-20260813T010000Z-abcd1234';
    const result = recordReflection({
      project: 'test-project',
      reflectId,
      session: 'session-abc',
      diaries: ['diary-a.md', 'diary-b.md'],
      summary: 'Found a grep-before-edit pattern',
      homeDir: home,
    });

    const expectedPath = path.join(
      home,
      '.arcforge',
      'reflections',
      'test-project',
      `${reflectId}.md`,
    );
    expect(fs.existsSync(expectedPath)).toBe(true);
    const content = fs.readFileSync(expectedPath, 'utf-8');
    expect(content).toContain(`reflect_id: ${reflectId}`);
    expect(content).toContain('Found a grep-before-edit pattern');
    expect(content).toContain('diary-a.md');
    expect(result.diaryCount).toBe(2);
  });

  it('skips the processed.log update when no reflection filename is given', () => {
    const result = recordReflection({
      project: 'test-project',
      reflectId: 'reflect-no-log',
      diaries: ['diary-a.md'],
      homeDir: home,
    });
    expect(result.processedLog).toBeNull();
  });

  it('updates processed.log when a reflection filename is given', () => {
    const previousHome = process.env.ARCFORGE_HOME;
    process.env.ARCFORGE_HOME = path.join(home, '.arcforge');
    try {
      const result = recordReflection({
        project: 'test-project',
        reflectId: 'reflect-with-log',
        diaries: ['diary-a.md', 'diary-b.md'],
        reflection: '2026-08-reflection-1.md',
        homeDir: home,
      });
      expect(result.processedLog).not.toBeNull();
      const log = fs.readFileSync(result.processedLog, 'utf-8');
      expect(log).toContain('diary-a.md');
      expect(log).toContain('2026-08-reflection-1.md');
    } finally {
      if (previousHome === undefined) delete process.env.ARCFORGE_HOME;
      else process.env.ARCFORGE_HOME = previousHome;
    }
  });

  it('rejects a reflection record with a blank project', () => {
    expect(() => recordReflection({ project: '', reflectId: 'reflect-x', homeDir: home })).toThrow(
      /project must be a non-empty string/,
    );
  });

  it('rejects a reflection record with a blank id', () => {
    expect(() => recordReflection({ project: 'p', reflectId: '', homeDir: home })).toThrow(
      /reflectId must be a non-empty string/,
    );
  });

  it('rejects a reflection id lacking the curator-matched prefix', () => {
    expect(() => recordReflection({ project: 'p', reflectId: 'no-prefix', homeDir: home })).toThrow(
      /must start with "reflect-"/,
    );
  });

  it('rejects a non-array diaries value', () => {
    expect(() =>
      recordReflection({ project: 'p', reflectId: 'reflect-x', diaries: 'a,b', homeDir: home }),
    ).toThrow(/diaries must be an array/);
  });

  it('writes a recall record under <home>/.arcforge/recalls/<project>/', () => {
    const recallId = 'recall-20260813T010000Z-abcd1234';
    const result = recordRecall({
      project: 'test-project',
      recallId,
      session: 'session-abc',
      query: 'grep patterns',
      instinctIds: ['grep-before-edit'],
      summary: 'Found grep instinct',
      homeDir: home,
    });

    const expectedPath = path.join(home, '.arcforge', 'recalls', 'test-project', `${recallId}.md`);
    expect(fs.existsSync(expectedPath)).toBe(true);
    const content = fs.readFileSync(expectedPath, 'utf-8');
    expect(content).toContain(`recall_id: ${recallId}`);
    expect(content).toContain('Found grep instinct');
    expect(content).toContain('grep-before-edit');
    expect(result.instinctCount).toBe(1);
  });

  it('rejects a recall record with a blank project', () => {
    expect(() => recordRecall({ project: '', recallId: 'recall-x', homeDir: home })).toThrow(
      /project must be a non-empty string/,
    );
  });

  it('rejects a recall record with a blank id', () => {
    expect(() => recordRecall({ project: 'p', recallId: '', homeDir: home })).toThrow(
      /recallId must be a non-empty string/,
    );
  });

  it('rejects a recall id lacking the curator-matched prefix', () => {
    expect(() => recordRecall({ project: 'p', recallId: 'no-prefix', homeDir: home })).toThrow(
      /must start with "recall-"/,
    );
  });

  it('rejects a non-array instinctIds value', () => {
    expect(() =>
      recordRecall({ project: 'p', recallId: 'recall-x', instinctIds: 'a,b', homeDir: home }),
    ).toThrow(/instinctIds must be an array/);
  });
});

describe('learn workflow CLI surface', () => {
  let home;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-cli-'));
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  const expectFailure = (args, pattern) => {
    let err;
    try {
      runCli(args, home);
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.status).toBe(1);
    expect(`${err.stdout || ''}${err.stderr || ''}`).toMatch(pattern);
  };

  it('prints the diary path', () => {
    const out = runCli(
      ['learn', 'diary', 'path', '--project', 'p', '--date', '2026-08-13', '--session', 's'],
      home,
    );
    expect(out.trim()).toBe(path.join(home, 'diaries', 'p', '2026-08-13', 'diary-s.md'));
  });

  it('prints the draft path with --draft', () => {
    const out = runCli(
      [
        'learn',
        'diary',
        'path',
        '--project',
        'p',
        '--date',
        '2026-08-13',
        '--session',
        's',
        '--draft',
      ],
      home,
    );
    expect(out.trim()).toContain('-draft.md');
  });

  it('saves a diary through the CLI', () => {
    runCli(
      [
        'learn',
        'diary',
        'save',
        '--project',
        'p',
        '--date',
        '2026-08-13',
        '--session',
        's',
        '--content',
        '# via cli',
      ],
      home,
    );
    const written = path.join(home, 'diaries', 'p', '2026-08-13', 'diary-s.md');
    expect(fs.readFileSync(written, 'utf-8')).toContain('# via cli');
  });

  it('prints usage and exits 1 for a group with no action', () => {
    expectFailure(['learn', 'diary'], /Usage: arcforge learn <group> <action>/);
  });

  it('exits 1 when a diary command has no resolvable session', () => {
    let err;
    try {
      execFileSync('node', [CLI, 'learn', 'diary', 'path', '--project', 'p'], {
        encoding: 'utf-8',
        stdio: 'pipe',
        env: { ...process.env, ARCFORGE_HOME: home, CLAUDE_SESSION_ID: '' },
      });
    } catch (e) {
      err = e;
    }
    expect(err.status).toBe(1);
    expect(`${err.stderr}`).toMatch(/--session is required/);
  });

  it('exits 1 when diary save has no content', () => {
    expectFailure(
      ['learn', 'diary', 'save', '--project', 'p', '--date', '2026-08-13', '--session', 's'],
      /--content is required/,
    );
  });

  it('exits 1 when reflect record has no id', () => {
    expectFailure(['learn', 'reflect', 'record', '--project', 'p'], /A reflection id is required/);
  });

  it('exits 1 when recall record has no id', () => {
    expectFailure(['learn', 'recall', 'record', '--project', 'p'], /A recall id is required/);
  });

  it('exits 1 for an unknown action in a known group', () => {
    expectFailure(['learn', 'instinct', 'bogus'], /Unknown 'learn instinct' action: bogus/);
  });

  it('reports reflect scan as strategy, count and readiness', () => {
    const out = runCli(['learn', 'reflect', 'scan', '--project', 'p'], home);
    expect(out).toMatch(/strategy: (unprocessed|project_focused|recent_window)/);
    expect(out).toMatch(/diaries: 0/);
    expect(out).toMatch(/ready: false/);
  });

  it('emits machine-readable reflect scan output with --json', () => {
    const parsed = JSON.parse(
      runCli(['learn', 'reflect', 'scan', '--project', 'p', '--json'], home),
    );
    expect(parsed).toMatchObject({ project: 'p', count: 0, ready: false });
    expect(Array.isArray(parsed.diaries)).toBe(true);
  });

  it('saves an instinct and reports it as a duplicate afterwards', () => {
    runCli(
      [
        'learn',
        'instinct',
        'save',
        'cli-saved',
        '--project',
        'p',
        '--trigger',
        'when x',
        '--action',
        'do y',
      ],
      home,
    );
    expect(runCli(['learn', 'instinct', 'check', 'cli-saved', '--project', 'p'], home)).toContain(
      'duplicate|project|',
    );
  });

  it('caps a reflection-sourced instinct below the manual cap', () => {
    const manual = runCli(
      [
        'learn',
        'instinct',
        'save',
        'cap-manual',
        '--project',
        'p',
        '--trigger',
        't',
        '--action',
        'a',
        '--evidence-count',
        '20',
      ],
      home,
    );
    const reflection = runCli(
      [
        'learn',
        'instinct',
        'save',
        'cap-reflect',
        '--project',
        'p',
        '--trigger',
        't',
        '--action',
        'a',
        '--source',
        'reflection',
        '--evidence-count',
        '20',
      ],
      home,
    );
    expect(manual).toContain('0.90');
    expect(reflection).toContain('0.85');
  });

  it('rejects an unknown --source', () => {
    expectFailure(
      [
        'learn',
        'instinct',
        'save',
        'bad-source',
        '--project',
        'p',
        '--trigger',
        't',
        '--action',
        'a',
        '--source',
        'telepathy',
      ],
      /--source must be 'manual' or 'reflection'/,
    );
  });

  it('leaves the lifecycle subcommands reachable', () => {
    const parsed = JSON.parse(runCli(['learn', 'status', '--json'], home));
    expect(parsed).toHaveProperty('project');
    expect(parsed).toHaveProperty('global');
  });
});
