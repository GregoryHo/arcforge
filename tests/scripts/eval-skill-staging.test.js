/**
 * eval-skill-staging.test.js - Staged skill files for the injected arm (B-19).
 * The `claude` subprocess is stubbed; no session is spawned.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

jest.mock('../../scripts/lib/utils', () => {
  const actual = jest.requireActual('../../scripts/lib/utils');
  return { ...actual, execCommand: jest.fn() };
});
const mockUtils = require('../../scripts/lib/utils');
const { runSkillEval } = require('../../scripts/lib/eval');
const {
  buildInjection,
  hashSkillText,
  removeStagedDir,
  stageSkillDir,
} = require('../../scripts/lib/eval-skill-staging');

const DONE_STREAM = [
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Done' }] } }),
  JSON.stringify({ type: 'result', result: 'Done' }),
].join('\n');
const SCENARIO = {
  name: 'staging',
  scenario: 'Test.',
  context: 'A fixture.',
  assertions: [],
  grader: 'code',
  graderConfig: 'true',
};
const BASE_LINE = /^## Context\nBase directory for this skill: (.+)\n\n/;
const ADVISORY_EXCEPTION = / The one exception is (\S+), the base directory of the skill[^.]*\./;

/** Write a skill directory: the skill file, a reference, and installed dependencies. */
function writeSkill(root, name, body) {
  const dir = path.join(root, 'skills', name);
  fs.mkdirSync(path.join(dir, 'references'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'node_modules', 'dep'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'references', '.venv'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), body);
  fs.writeFileSync(path.join(dir, 'references', 'verify.sh'), `echo ${name}\n`);
  fs.writeFileSync(path.join(dir, 'node_modules', 'dep', 'index.js'), '');
  fs.writeFileSync(path.join(dir, 'references', '.venv', 'pyvenv.cfg'), '');
  return path.join(dir, 'SKILL.md');
}

describe('staged skill files for the injected arm (B-19)', () => {
  let tempDir;
  let skillFile;
  let trials;
  let rows;
  let onTrial;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-staging-'));
    skillFile = writeSkill(tempDir, 'demo', 'BODY');
    trials = [];
    rows = [];
    onTrial = () => {};
    mockUtils.execCommand.mockReset();
    mockUtils.execCommand.mockImplementation((cmd, args, opts) => {
      if (path.basename(cmd) === 'claude' && args[0] === 'plugin') {
        return { stdout: '[]', stderr: '', exitCode: 0 };
      }
      if (path.basename(cmd) !== 'claude') return { stdout: '', stderr: '', exitCode: 0 };
      const advisory = args[args.indexOf('--append-system-prompt') + 1];
      const staged = opts.input.match(BASE_LINE)?.[1];
      trials.push({
        prompt: opts.input,
        cwd: opts.cwd,
        // The advisory names each trial's own directory; that is not an arm difference.
        argv: args.map((a) => a.split(opts.cwd).join('<TRIAL_DIR>')),
        advisory,
        staged,
        // What the arm can reach while its trial runs.
        stagedFiles: staged ? fs.readdirSync(staged, { recursive: true }).sort() : null,
      });
      onTrial(trials.at(-1));
      return { stdout: DONE_STREAM, stderr: '', exitCode: 0 };
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const run = (options = {}) =>
    runSkillEval(SCENARIO, 1, {
      projectRoot: tempDir,
      skillInstruction: 'BODY',
      skillFile,
      onTrialComplete: (_label, _t, row) => rows.push(row),
      ...options,
    });

  it('opens the treatment injection with the base-directory line; the baseline has none', () => {
    run({ stageSkillFiles: true });
    const [baseline, treatment] = trials;
    expect(treatment.prompt).toMatch(BASE_LINE);
    expect(treatment.prompt).toBe(
      `## Context\nBase directory for this skill: ${treatment.staged}\n\nBODY\n\nA fixture.\n\n## Task\nTest.`,
    );
    expect(baseline.prompt).toBe('## Context\nA fixture.\n\n## Task\nTest.');
    expect(baseline.prompt).not.toContain('Base directory');
  });

  it('copies the skill directory under the system temp dir, outside the trial tree', () => {
    run({ stageSkillFiles: true });
    const { staged, stagedFiles, cwd } = trials[1];
    expect(staged.startsWith(os.tmpdir())).toBe(true);
    expect(staged).not.toContain('.eval-trials');
    expect(path.relative(tempDir, staged).startsWith('..')).toBe(true);
    expect(cwd).toContain(path.join(tempDir, '.eval-trials'));
    // The skill's own files, without version control or installed dependencies.
    expect(stagedFiles).toEqual(['SKILL.md', 'references', path.join('references', 'verify.sh')]);
    expect(fs.existsSync(path.dirname(skillFile))).toBe(true);
  });

  it('removes the copy when the run ends', () => {
    run({ stageSkillFiles: true });
    expect(fs.existsSync(trials[1].staged)).toBe(false);
  });

  it('removes the copy when the run throws', () => {
    onTrial = (trial) => {
      if (trial.staged) throw new Error('spawn failed');
    };
    expect(() => run({ stageSkillFiles: true })).toThrow('spawn failed');
    expect(trials[1].staged).toBeDefined();
    expect(fs.existsSync(trials[1].staged)).toBe(false);
  });

  it('names the staged directory as the one exception to staying in the trial directory', () => {
    run({ stageSkillFiles: true });
    const [baseline, treatment] = trials;
    expect(baseline.advisory).not.toMatch(/exception/);
    expect(treatment.advisory.match(ADVISORY_EXCEPTION)[1]).toBe(treatment.staged);
    // The arms' argv differ by that sentence alone: no flag grants the directory.
    const withoutException = treatment.argv.map((a) => a.replace(ADVISORY_EXCEPTION, ''));
    expect(withoutException).toEqual(baseline.argv);
  });

  it('records staging on both arms and the injected text hash on the injected arm', () => {
    run({ stageSkillFiles: true });
    expect(rows.map((r) => r.stageSkillFiles)).toEqual([true, true]);
    expect(rows.map((r) => r.skillTextHash)).toEqual([undefined, hashSkillText('BODY')]);
  });

  it('stages nothing and records no staging without the flag', () => {
    run();
    const [baseline, treatment] = trials;
    expect(treatment.prompt).toBe('## Context\nBODY\n\nA fixture.\n\n## Task\nTest.');
    expect(treatment.argv).toEqual(baseline.argv);
    for (const row of rows) expect(row).not.toHaveProperty('stageSkillFiles');
    expect(rows[1].skillTextHash).toBe(hashSkillText('BODY'));
  });

  it('stops the run when a trial writes into the staged copy', () => {
    onTrial = (trial) => {
      if (trial.staged) fs.writeFileSync(path.join(trial.staged, 'references', 'new.txt'), 'x');
    };
    expect(() => run({ stageSkillFiles: true })).toThrow(
      /treatment trial 1 wrote outside its directory: .*new\.txt/,
    );
    expect(rows[1].errorType).toBe('trial_wrote_repo');
    expect(fs.existsSync(trials[1].staged)).toBe(false);
  });

  it('the baseline watches the staged copy too', () => {
    let staged;
    const realMkdtemp = fs.mkdtempSync;
    jest.spyOn(fs, 'mkdtempSync').mockImplementation((prefix, ...rest) => {
      const dir = realMkdtemp(prefix, ...rest);
      if (path.basename(dir).startsWith('arcforge-eval-skill-')) staged = dir;
      return dir;
    });
    onTrial = () => fs.writeFileSync(path.join(staged, 'SKILL.md'), 'edited by the baseline');
    try {
      expect(() => run({ stageSkillFiles: true })).toThrow(
        /baseline trial 1 wrote outside its directory: .*SKILL\.md/,
      );
    } finally {
      fs.mkdtempSync.mockRestore();
    }
    expect(trials).toHaveLength(1);
  });
});

describe('buildInjection', () => {
  it('injects nothing, and stages nothing, for an arm given no text', () => {
    expect(buildInjection({ stage: true, skillFile: '/nowhere/SKILL.md' })).toEqual({
      text: null,
      textHash: null,
      baseDir: null,
    });
  });

  it('hashes the skill text alone, so the hash does not move with the staged path', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-injection-'));
    const file = writeSkill(root, 'demo', 'BODY');
    const first = buildInjection({ text: 'BODY', skillFile: file, stage: true });
    const second = buildInjection({ text: 'BODY', skillFile: file, stage: true });
    try {
      expect(first.baseDir).not.toBe(second.baseDir);
      expect(first.textHash).toBe(second.textHash);
      expect(first.textHash).toBe(buildInjection({ text: 'BODY' }).textHash);
      expect(first.textHash).toMatch(/^[0-9a-f]{16}$/);
    } finally {
      removeStagedDir(first.baseDir);
      removeStagedDir(second.baseDir);
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses to stage without the skill file path', () => {
    expect(() => buildInjection({ text: 'BODY', stage: true })).toThrow(/path of the skill file/);
    expect(() => stageSkillDir('relative/SKILL.md')).toThrow(/absolute path/);
  });

  it('removes only a directory it staged', () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'test-not-staged-'));
    removeStagedDir(other);
    expect(fs.existsSync(other)).toBe(true);
    fs.rmSync(other, { recursive: true, force: true });
  });
});
