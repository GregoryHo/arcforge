/**
 * eval-skill-staging.test.js - Staged skill files for the injected arm (B-19)
 * and an A/B between two skill texts (B-20). The `claude` subprocess is
 * stubbed; no session is spawned.
 */

const { execFileSync, spawn } = require('node:child_process');
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
  digestSkillDir,
  hashSkillText,
  removeStagedDir,
  skillDirOf,
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

/** Record every directory staged while `fn` runs, whether or not a trial saw it. */
function recordingStaged(fn) {
  const made = [];
  const realMkdtemp = fs.mkdtempSync;
  jest.spyOn(fs, 'mkdtempSync').mockImplementation((prefix, ...rest) => {
    const dir = realMkdtemp(prefix, ...rest);
    if (path.basename(dir).startsWith('arcforge-eval-skill-')) made.push(dir);
    return dir;
  });
  try {
    fn(made);
  } finally {
    fs.mkdtempSync.mockRestore();
  }
  return made;
}

describe('staged skill files for the injected arm (B-19)', () => {
  let tempDir;
  let skillFile;
  let skillDir;
  let trials;
  let rows;
  let onTrial;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-staging-'));
    skillFile = writeSkill(tempDir, 'demo', 'BODY');
    skillDir = path.dirname(skillFile);
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

  describe('a write the write check does not see', () => {
    // The write check compares mtime, size and mode: all three are put back here.
    const rewriteUnseen = (copy) => {
      const file = path.join(copy, 'references', 'verify.sh');
      const kept = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'test-kept-')), 'verify.sh');
      execFileSync('cp', ['-p', file, kept]);
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('echo', 'ECHO'));
      execFileSync('touch', ['-r', kept, file]);
      fs.rmSync(path.dirname(kept), { recursive: true });
    };

    it('stops the run on a trial that left the staged copy with other content', () => {
      onTrial = (trial) => trial.staged && rewriteUnseen(trial.staged);
      expect(() => run({ stageSkillFiles: true })).toThrow(
        /treatment trial 1 changed the staged skill files: .*arcforge-eval-skill-/,
      );
      expect(rows[1]).toEqual(
        expect.objectContaining({ errorType: 'trial_wrote_skill_files', infraError: true }),
      );
      expect(rows[1].error).toContain(trials[1].staged);
      expect(fs.existsSync(trials[1].staged)).toBe(false);
    });

    it('checks every staged copy after every trial, whichever arm it was staged for', () => {
      const oldFile = writeSkill(tempDir, 'demo-old', 'OLD');
      recordingStaged((dirs) => {
        onTrial = (trial) => rewriteUnseen(dirs.find((dir) => dir !== trial.staged));
        expect(() =>
          run({
            stageSkillFiles: true,
            baselineSkillInstruction: 'OLD',
            baselineSkillFile: oldFile,
          }),
        ).toThrow(/baseline trial 1 changed the staged skill files/);
      });
      expect(trials).toHaveLength(1);
      expect(rows[0].errorType).toBe('trial_wrote_skill_files');
    });

    it('does not see a write confined to a directory the digest leaves out', () => {
      onTrial = (trial) => {
        if (!trial.staged) return;
        fs.mkdirSync(path.join(trial.staged, 'node_modules', 'dep'), { recursive: true });
        fs.writeFileSync(path.join(trial.staged, 'node_modules', 'dep', 'index.js'), 'x');
      };
      run({ stageSkillFiles: true });
      expect(rows.map((r) => r.errorType)).toEqual([undefined, undefined]);
    });
  });

  describe('with a baseline text (B-20)', () => {
    let oldFile;
    const twoText = (options = {}) =>
      run({ baselineSkillInstruction: 'OLD BODY', baselineSkillFile: oldFile, ...options });

    beforeEach(() => {
      oldFile = writeSkill(tempDir, 'demo-old', 'OLD BODY');
    });

    it('injects each arm with its own text, the argv identical', () => {
      twoText();
      const [baseline, treatment] = trials;
      expect(baseline.prompt).toBe('## Context\nOLD BODY\n\nA fixture.\n\n## Task\nTest.');
      expect(treatment.prompt).toBe('## Context\nBODY\n\nA fixture.\n\n## Task\nTest.');
      expect(treatment.argv).toEqual(baseline.argv);
    });

    it('records the baseline text hash on both arms and each arm own text hash', () => {
      twoText();
      const oldHash = hashSkillText('OLD BODY');
      expect(rows.map((r) => r.baselineSkillHash)).toEqual([oldHash, oldHash]);
      expect(rows.map((r) => r.skillTextHash)).toEqual([oldHash, hashSkillText('BODY')]);
      for (const row of rows) expect(row).not.toHaveProperty('stageSkillFiles');
    });

    it('records no baseline text hash when the baseline was given none', () => {
      run({ stageSkillFiles: true });
      for (const row of rows) {
        expect(row).not.toHaveProperty('baselineSkillHash');
        expect(row).not.toHaveProperty('baselineSkillFilesHash');
      }
      expect(rows.map((r) => r.skillFilesHash)).toEqual([undefined, digestSkillDir(skillDir)]);
    });

    it('records each arm staged digest, and the baseline digest on both arms', () => {
      twoText({ stageSkillFiles: true });
      const oldDigest = digestSkillDir(path.dirname(oldFile));
      const newDigest = digestSkillDir(skillDir);
      expect(oldDigest).not.toBe(newDigest);
      expect(rows.map((r) => r.skillFilesHash)).toEqual([oldDigest, newDigest]);
      expect(rows.map((r) => r.baselineSkillFilesHash)).toEqual([oldDigest, oldDigest]);
    });

    it('records no digest when nothing is staged', () => {
      twoText();
      for (const row of rows) {
        expect(row).not.toHaveProperty('skillFilesHash');
        expect(row).not.toHaveProperty('baselineSkillFilesHash');
      }
    });

    it('one text over other staged files is another baseline, the same files the same one', () => {
      // Three directories with one SKILL.md text; only a references file differs.
      const a = writeSkill(tempDir, 'same-a', 'ONE TEXT');
      const b = writeSkill(tempDir, 'same-b', 'ONE TEXT');
      const c = writeSkill(tempDir, 'same-c', 'ONE TEXT');
      for (const file of [a, b, c]) {
        const grid = file === c ? '220' : '200';
        fs.writeFileSync(
          path.join(path.dirname(file), 'references', 'verify.sh'),
          `grid=${grid}\n`,
        );
      }
      const baselineIdentity = (file) => {
        rows = [];
        run({
          baselineSkillInstruction: 'ONE TEXT',
          baselineSkillFile: file,
          stageSkillFiles: true,
        });
        expect(rows[0].baselineSkillFilesHash).toBe(rows[1].baselineSkillFilesHash);
        return [rows[0].baselineSkillHash, rows[0].baselineSkillFilesHash];
      };
      const [textA, filesA] = baselineIdentity(a);
      const [textB, filesB] = baselineIdentity(b);
      const [textC, filesC] = baselineIdentity(c);
      expect([textB, textC]).toEqual([textA, textA]);
      expect(filesB).toBe(filesA);
      expect(filesC).not.toBe(filesA);
    });

    it('stages a directory of its own for each arm, taken from where its file sits', () => {
      twoText({ stageSkillFiles: true });
      const [baseline, treatment] = trials;
      expect(baseline.prompt).toBe(
        `## Context\nBase directory for this skill: ${baseline.staged}\n\nOLD BODY\n\nA fixture.\n\n## Task\nTest.`,
      );
      expect(treatment.prompt).toMatch(BASE_LINE);
      expect(baseline.staged).not.toBe(treatment.staged);
      for (const { staged } of trials) {
        expect(staged.startsWith(os.tmpdir())).toBe(true);
        expect(staged).not.toContain('.eval-trials');
      }
      // Each arm's advisory names its own directory, and only that one.
      expect(baseline.advisory.match(ADVISORY_EXCEPTION)[1]).toBe(baseline.staged);
      expect(baseline.advisory).not.toContain(treatment.staged);
      expect(treatment.advisory.match(ADVISORY_EXCEPTION)[1]).toBe(treatment.staged);
      const strip = (argv) => argv.map((a) => a.replace(ADVISORY_EXCEPTION, ''));
      expect(strip(treatment.argv)).toEqual(strip(baseline.argv));
      expect(rows.map((r) => r.stageSkillFiles)).toEqual([true, true]);
    });

    it('removes both copies when the run ends, and when it throws', () => {
      twoText({ stageSkillFiles: true });
      for (const { staged } of trials) expect(fs.existsSync(staged)).toBe(false);

      // The first trial throws: the treatment's copy was staged but never used.
      onTrial = () => {
        throw new Error('spawn failed');
      };
      const made = recordingStaged(() => {
        expect(() => twoText({ stageSkillFiles: true })).toThrow('spawn failed');
      });
      expect(made).toHaveLength(2);
      for (const dir of made) expect(fs.existsSync(dir)).toBe(false);
    });

    it('stops the run when the baseline writes into the copy staged for the treatment', () => {
      const made = recordingStaged((dirs) => {
        onTrial = (trial) => {
          const other = dirs.find((dir) => dir !== trial.staged);
          fs.writeFileSync(path.join(other, 'SKILL.md'), 'edited by the baseline');
        };
        expect(() => twoText({ stageSkillFiles: true })).toThrow(
          /baseline trial 1 wrote outside its directory: .*SKILL\.md/,
        );
      });
      expect(made).toHaveLength(2);
      expect(trials).toHaveLength(1);
    });
  });

  it('the baseline watches the staged copy too', () => {
    recordingStaged((dirs) => {
      onTrial = () => fs.writeFileSync(path.join(dirs[0], 'SKILL.md'), 'edited by the baseline');
      expect(() => run({ stageSkillFiles: true })).toThrow(
        /baseline trial 1 wrote outside its directory: .*SKILL\.md/,
      );
    });
    expect(trials).toHaveLength(1);
  });
});

describe('buildInjection', () => {
  it('injects nothing, and stages nothing, for an arm given no text', () => {
    expect(buildInjection({ stage: true, skillFile: '/nowhere/SKILL.md' })).toEqual({
      text: null,
      textHash: null,
      baseDir: null,
      filesHash: null,
    });
    expect(buildInjection({ text: 'BODY' }).filesHash).toBeNull();
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

  describe('digestSkillDir', () => {
    let root;
    let dir;

    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-digest-'));
      dir = path.dirname(writeSkill(root, 'demo', 'BODY'));
    });

    afterEach(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });

    it('is the same for the source directory and its staged copy', () => {
      fs.writeFileSync(path.join(dir, '.hidden'), 'dotfile');
      fs.symlinkSync('references/verify.sh', path.join(dir, 'link.sh'));
      const staged = stageSkillDir(path.join(dir, 'SKILL.md'));
      try {
        expect(digestSkillDir(staged)).toBe(digestSkillDir(dir));
        expect(digestSkillDir(dir)).toMatch(/^[0-9a-f]{16}$/);
      } finally {
        removeStagedDir(staged);
      }
    });

    it('moves with a file content, name, executable bit, dotfile or symlink target', () => {
      const digests = [digestSkillDir(dir)];
      const changed = () => {
        digests.push(digestSkillDir(dir));
        expect(new Set(digests).size).toBe(digests.length);
      };
      fs.writeFileSync(path.join(dir, 'references', 'verify.sh'), 'echo changed\n');
      changed();
      fs.renameSync(
        path.join(dir, 'references', 'verify.sh'),
        path.join(dir, 'references', 'v.sh'),
      );
      changed();
      fs.chmodSync(path.join(dir, 'references', 'v.sh'), 0o755);
      changed();
      fs.writeFileSync(path.join(dir, '.hidden'), 'dotfile');
      changed();
      fs.symlinkSync('references/v.sh', path.join(dir, 'link.sh'));
      changed();
      fs.rmSync(path.join(dir, 'link.sh'));
      fs.symlinkSync('SKILL.md', path.join(dir, 'link.sh'));
      changed();
    });

    it('ignores what staging leaves out, empty directories and timestamps', () => {
      const before = digestSkillDir(dir);
      fs.writeFileSync(path.join(dir, 'node_modules', 'dep', 'index.js'), 'changed');
      fs.writeFileSync(path.join(dir, 'references', '.venv', 'pyvenv.cfg'), 'changed');
      fs.mkdirSync(path.join(dir, 'empty'));
      fs.utimesSync(path.join(dir, 'SKILL.md'), new Date(0), new Date(0));
      expect(digestSkillDir(dir)).toBe(before);
    });

    it('refuses an entry that is neither a file nor a symlink', () => {
      const fifo = path.join(dir, 'references', 'pipe');
      execFileSync('mkfifo', [fifo]);
      expect(() => digestSkillDir(dir)).toThrow(`Cannot digest ${fifo}: not a file or a symlink`);
    });
  });

  describe('stageSkillDir and symlinks', () => {
    let root;
    let dir;

    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-stage-links-'));
      dir = path.dirname(writeSkill(root, 'demo', 'BODY'));
      fs.writeFileSync(path.join(root, 'outside.txt'), 'not the skill');
    });

    afterEach(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });

    const stagedBy = (link) =>
      recordingStaged(() => {
        expect(() => stageSkillDir(path.join(dir, 'SKILL.md'))).toThrow(
          `Cannot stage ${path.join(dir, link)}`,
        );
      });

    it.each([
      ['an absolute target', 'abs', () => path.join(dir, 'SKILL.md'), /is an absolute path/],
      ['a target above the directory', 'up', () => '../../outside.txt', /outside the skill dir/],
      ['a target that does not resolve', 'gone', () => 'references/nothing', /does not resolve/],
    ])('refuses a link with %s, and leaves no copy behind', (_what, name, target, reason) => {
      fs.symlinkSync(target(), path.join(dir, name));
      const [staged] = stagedBy(name);
      expect(() => stageSkillDir(path.join(dir, 'SKILL.md'))).toThrow(reason);
      expect(fs.existsSync(staged)).toBe(false);
    });

    it('refuses a target that leaves the directory through another link', () => {
      // Read as text, references/top/../outside.txt is a file inside; followed, it is not.
      fs.writeFileSync(path.join(dir, 'references', 'outside.txt'), 'inside');
      fs.writeFileSync(path.join(dir, '..', 'outside.txt'), 'not the skill');
      fs.symlinkSync('..', path.join(dir, 'references', 'top'));
      fs.symlinkSync('references/top/../outside.txt', path.join(dir, 'via'));
      expect(fs.readFileSync(path.join(dir, 'via'), 'utf8')).toBe('not the skill');
      expect(() => stageSkillDir(path.join(dir, 'SKILL.md'))).toThrow(
        new RegExp(`Cannot stage ${path.join(dir, 'via')}: .* outside the skill dir`),
      );
    });

    it('refuses a target that stays inside only by naming the directory itself', () => {
      // Resolves in the source; in the copy, whose name differs, it is a path outside.
      fs.mkdirSync(path.join(dir, 'sub'));
      fs.symlinkSync('../../demo/references/verify.sh', path.join(dir, 'sub', 'link.sh'));
      expect(fs.readFileSync(path.join(dir, 'sub', 'link.sh'), 'utf8')).toBe('echo demo\n');
      const [staged] = stagedBy(path.join('sub', 'link.sh'));
      expect(() => stageSkillDir(path.join(dir, 'SKILL.md'))).toThrow(
        /once the directory is copied/,
      );
      expect(fs.existsSync(staged)).toBe(false);
    });

    it('keeps a link whose target is inside the directory', () => {
      fs.symlinkSync('references/verify.sh', path.join(dir, 'link.sh'));
      const staged = stageSkillDir(path.join(dir, 'SKILL.md'));
      try {
        expect(fs.readlinkSync(path.join(staged, 'link.sh'))).toBe('references/verify.sh');
        expect(fs.readFileSync(path.join(staged, 'link.sh'), 'utf8')).toBe('echo demo\n');
      } finally {
        removeStagedDir(staged);
      }
    });

    it('stages a skill whose own directory is reached through a link', () => {
      fs.symlinkSync('demo', path.join(path.dirname(dir), 'alias'));
      const staged = stageSkillDir(path.join(path.dirname(dir), 'alias', 'SKILL.md'));
      try {
        expect(fs.lstatSync(staged).isDirectory()).toBe(true);
        expect(fs.readFileSync(path.join(staged, 'SKILL.md'), 'utf8')).toBe('BODY');
        expect(digestSkillDir(staged)).toBe(digestSkillDir(dir));
      } finally {
        removeStagedDir(staged);
      }
    });

    it('resolves a linked skill directory to the one that is digested and copied', () => {
      fs.symlinkSync('demo', path.join(path.dirname(dir), 'alias'));
      const viaLink = path.join(path.dirname(dir), 'alias', 'SKILL.md');
      expect(skillDirOf(viaLink)).toBe(fs.realpathSync.native(dir));
      expect(buildInjection({ text: 'BODY', skillFile: viaLink }).filesHash).toBeNull();
      const { baseDir, filesHash } = buildInjection({
        text: 'BODY',
        skillFile: viaLink,
        stage: true,
      });
      try {
        expect(filesHash).toBe(digestSkillDir(skillDirOf(viaLink)));
      } finally {
        removeStagedDir(baseDir);
      }
    });

    it('names an entry that is neither a file nor a symlink before anything is copied', () => {
      const fifo = path.join(fs.realpathSync.native(dir), 'references', 'pipe');
      execFileSync('mkfifo', [fifo]);
      const made = recordingStaged(() => {
        expect(() => stageSkillDir(path.join(dir, 'SKILL.md'))).toThrow(
          `Cannot digest ${fifo}: not a file or a symlink`,
        );
      });
      expect(made).toEqual([]);
    });

    it('checks the copy without walking through a link to a directory', () => {
      // Two links back to the root: a walk that follows them never comes back.
      fs.mkdirSync(path.join(dir, 'sub'));
      fs.symlinkSync('..', path.join(dir, 'sub', 'a'));
      fs.symlinkSync('..', path.join(dir, 'sub', 'b'));
      const readdir = fs.readdirSync;
      jest.spyOn(fs, 'readdirSync').mockImplementation((target, options) => {
        // A recursive readdir follows directory links, so the test fails here and does not hang.
        if (options?.recursive) throw new Error(`recursive readdir of ${target}`);
        return readdir(target, options);
      });
      let staged;
      try {
        staged = stageSkillDir(path.join(dir, 'SKILL.md'));
        expect(fs.readlinkSync(path.join(staged, 'sub', 'a'))).toBe('..');
        expect(fs.readlinkSync(path.join(staged, 'sub', 'b'))).toBe('..');
      } finally {
        fs.readdirSync.mockRestore();
        removeStagedDir(staged);
      }
    });
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

describe('a staged copy outlives no run (B-19)', () => {
  const STAGING = path.join(__dirname, '../../scripts/lib/eval-skill-staging');
  let root;
  let skillFile;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-stage-exit-'));
    skillFile = writeSkill(root, 'demo', 'BODY');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  /** Stage in a child process, which then runs `then`; resolves once it is gone. */
  const stageInChild = (then, onStaged = () => {}) =>
    new Promise((resolve, reject) => {
      const script = `const staged = require(process.argv[1]).stageSkillDir(process.argv[2]);
        console.log(staged); ${then}`;
      const child = spawn(process.execPath, ['-e', script, STAGING, skillFile]);
      let staged = '';
      child.stdout.on('data', (chunk) => {
        staged += chunk;
        if (staged.endsWith('\n')) onStaged(child);
      });
      child.on('error', reject);
      child.on('exit', (code, signal) => resolve({ staged: staged.trim(), code, signal }));
    });

  it('names the copy after the process that staged it', () => {
    const staged = stageSkillDir(skillFile);
    try {
      expect(path.basename(staged)).toMatch(new RegExp(`^arcforge-eval-skill-${process.pid}-`));
    } finally {
      removeStagedDir(staged);
    }
  });

  it('removes the copy when the process exits without reaching its cleanup', async () => {
    const { staged, code } = await stageInChild('process.exit(3);');
    expect(code).toBe(3);
    expect(path.basename(staged)).toMatch(/^arcforge-eval-skill-/);
    expect(fs.existsSync(staged)).toBe(false);
  });

  it('removes the copy of a killed run at the next staging, and leaves a live run its own', async () => {
    const { staged, signal } = await stageInChild('setInterval(() => {}, 1000);', (child) =>
      child.kill('SIGTERM'),
    );
    // No handler stands between the signal and the process: a run stays killable.
    expect(signal).toBe('SIGTERM');
    expect(fs.existsSync(staged)).toBe(true);

    const mine = stageSkillDir(skillFile);
    try {
      expect(fs.existsSync(staged)).toBe(false);
      const second = stageSkillDir(skillFile);
      expect(fs.existsSync(mine)).toBe(true);
      removeStagedDir(second);
    } finally {
      removeStagedDir(mine);
    }
  });
});
