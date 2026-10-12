/**
 * eval-skill-staging-per-trial.test.js - A staged skill copy belongs to one
 * trial (B-19): each trial is staged a copy of its own, and a write into it
 * spoils that trial, not the run. The `claude` subprocess is stubbed; no
 * session is spawned.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

jest.mock('../../scripts/lib/utils', () => {
  const actual = jest.requireActual('../../scripts/lib/utils');
  return { ...actual, execCommand: jest.fn() };
});
const mockUtils = require('../../scripts/lib/utils');
const { runSkillEval, stopIfTrialWroteRepo } = require('../../scripts/lib/eval');
const { baselineArm, digestSkillDir } = require('../../scripts/lib/eval-skill-staging');

const DONE_STREAM = [
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Done' }] } }),
  JSON.stringify({ type: 'result', result: 'Done' }),
].join('\n');
const SCENARIO = {
  name: 'staging-per-trial',
  scenario: 'Test.',
  context: 'A fixture.',
  assertions: [],
  grader: 'code',
  graderConfig: 'true',
};
const BASE_LINE = /^## Context\nBase directory for this skill: (.+)\n\n/;

/** Write a skill directory: the skill file and a reference. */
function writeSkill(root, name, body) {
  const dir = path.join(root, 'skills', name);
  fs.mkdirSync(path.join(dir, 'references'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), body);
  fs.writeFileSync(path.join(dir, 'references', 'verify.sh'), `echo ${name}\n`);
  return path.join(dir, 'SKILL.md');
}

/** The staged copies this process has on disk. */
function copiesOnDisk() {
  const mine = `arcforge-eval-skill-${process.pid}-`;
  return fs
    .readdirSync(os.tmpdir())
    .filter((name) => name.startsWith(mine))
    .map((name) => path.join(os.tmpdir(), name));
}

describe('a staged skill copy belongs to one trial (B-19)', () => {
  let tempDir;
  let skillFile;
  let skillDir;
  let trials;
  let rows;
  let onTrial;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-staging-trial-'));
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
      const staged = opts.input.match(BASE_LINE)?.[1];
      trials.push({
        staged,
        // What the arm is given, and what is on disk, while its trial runs.
        digest: staged ? digestSkillDir(staged) : null,
        stagedFiles: staged ? fs.readdirSync(staged, { recursive: true }).sort() : null,
        onDisk: copiesOnDisk(),
      });
      onTrial(trials.at(-1), trials.length);
      return { stdout: DONE_STREAM, stderr: '', exitCode: 0 };
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const run = (k, options = {}) =>
    runSkillEval(SCENARIO, k, {
      projectRoot: tempDir,
      skillInstruction: 'BODY',
      skillFile,
      stageSkillFiles: true,
      onTrialComplete: (label, t, row) => rows.push({ label, t, ...row }),
      ...options,
    });
  const treatmentRows = () => rows.filter((r) => r.label === 'treatment');
  const stagedTrials = () => trials.filter((t) => t.staged);
  const PRISTINE = ['SKILL.md', 'references', path.join('references', 'verify.sh')];

  it('stages each trial of an arm a copy of its own, with one digest', () => {
    run(2);
    const [first, second] = stagedTrials();
    expect(second.staged).not.toBe(first.staged);
    expect(first.digest).toBe(digestSkillDir(skillDir));
    expect(second.digest).toBe(first.digest);
    // The digest every row records is the one taken before the first trial.
    expect(treatmentRows().map((r) => r.skillFilesHash)).toEqual([first.digest, first.digest]);
    // Only the running trial's copy exists: the one before it is already gone.
    expect(first.onDisk).toEqual([first.staged]);
    expect(second.onDisk).toEqual([second.staged]);
    // And none while the baseline, injected with nothing, runs.
    expect(trials.filter((t) => !t.staged).map((t) => t.onDisk)).toEqual([[], []]);
  });

  it('leaves no copy on disk after the run', () => {
    run(2);
    expect(stagedTrials()).toHaveLength(2);
    expect(copiesOnDisk()).toEqual([]);
  });

  it('leaves no copy on disk after a run that throws', () => {
    onTrial = (trial) => {
      if (trial.staged) throw new Error('spawn failed');
    };
    expect(() => run(2)).toThrow('spawn failed');
    expect(stagedTrials()).toHaveLength(1);
    expect(copiesOnDisk()).toEqual([]);
  });

  it('a write into a trial copy spoils that trial, and the next one runs on a fresh copy', () => {
    onTrial = (trial) => {
      // Trial 1 of the treatment, as a skill that does `cd "$BASE/references"` would.
      if (trial === stagedTrials()[0]) {
        fs.writeFileSync(path.join(trial.staged, 'references', 'new.txt'), 'x');
      }
    };
    run(2);
    const [first, second] = treatmentRows();
    expect(first).toEqual(
      expect.objectContaining({ errorType: 'trial_wrote_skill_files', infraError: true }),
    );
    expect(first.error).toContain(path.join(stagedTrials()[0].staged, 'references', 'new.txt'));
    expect(second.errorType).toBeUndefined();
    expect(second.infraError).toBeUndefined();
    expect(second.passed).toBe(true);
    expect(stagedTrials()[1].stagedFiles).toEqual(PRISTINE);
    expect(stagedTrials()[1].digest).toBe(digestSkillDir(skillDir));
    expect(copiesOnDisk()).toEqual([]);
  });

  it('a write the write check does not see spoils that trial alone too', () => {
    // The write check compares mtime, size and mode: all three are put back here.
    const rewriteUnseen = (copy) => {
      const file = path.join(copy, 'references', 'verify.sh');
      const kept = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'test-kept-')), 'verify.sh');
      execFileSync('cp', ['-p', file, kept]);
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('echo', 'ECHO'));
      execFileSync('touch', ['-r', kept, file]);
      fs.rmSync(path.dirname(kept), { recursive: true });
    };
    onTrial = (trial) => {
      if (trial === stagedTrials()[0]) rewriteUnseen(trial.staged);
    };
    run(2);
    const [first, second] = treatmentRows();
    expect(first).toEqual(
      expect.objectContaining({ errorType: 'trial_wrote_skill_files', infraError: true }),
    );
    expect(first.error).toContain(stagedTrials()[0].staged);
    expect(second.errorType).toBeUndefined();
    expect(stagedTrials()[1].digest).toBe(digestSkillDir(skillDir));
  });

  it('a trial that removes its copy is spoiled, and the next one is staged again', () => {
    onTrial = (trial) => {
      if (trial === stagedTrials()[0]) fs.rmSync(trial.staged, { recursive: true });
    };
    run(2);
    expect(treatmentRows().map((r) => r.errorType)).toEqual(['trial_wrote_skill_files', undefined]);
    expect(stagedTrials()[1].stagedFiles).toEqual(PRISTINE);
  });

  it('still stops the run on a write into the project root', () => {
    onTrial = (trial) => {
      if (trial.staged) fs.writeFileSync(path.join(tempDir, 'leaked.txt'), 'x');
    };
    expect(() => run(2)).toThrow(/treatment trial 1 wrote outside its directory: .*leaked\.txt/);
    expect(treatmentRows()).toHaveLength(1);
    expect(treatmentRows()[0].errorType).toBe('trial_wrote_repo');
    expect(stagedTrials()).toHaveLength(1);
    expect(copiesOnDisk()).toEqual([]);
  });

  it('stops the run when a trial wrote into both its copy and the project root', () => {
    onTrial = (trial) => {
      if (!trial.staged) return;
      fs.writeFileSync(path.join(trial.staged, 'new.txt'), 'x');
      fs.writeFileSync(path.join(tempDir, 'leaked.txt'), 'x');
    };
    expect(() => run(2)).toThrow(/treatment trial 1 wrote outside its directory: .*leaked\.txt/);
    expect(treatmentRows()[0].errorType).toBe('trial_wrote_repo');
  });

  it('stopIfTrialWroteRepo stops on trial_wrote_repo and not on trial_wrote_skill_files', () => {
    const wroteRepo = {
      errorType: 'trial_wrote_repo',
      error: 'Trial wrote outside its directory: /repo/leaked.txt',
    };
    expect(() => stopIfTrialWroteRepo(wroteRepo, 'baseline trial 2')).toThrow(
      /baseline trial 2 wrote outside its directory: \/repo\/leaked\.txt\. The run is stopped/,
    );
    const wroteCopy = {
      errorType: 'trial_wrote_skill_files',
      error: 'Trial changed the staged skill files: /tmp/copy/new.txt',
    };
    expect(() => stopIfTrialWroteRepo(wroteCopy, 'baseline trial 2')).not.toThrow();
  });

  describe('with a baseline text (B-20)', () => {
    let oldFile;
    const twoText = (k, options = {}) =>
      run(k, { baselineSkillInstruction: 'OLD', baselineSkillFile: oldFile, ...options });

    beforeEach(() => {
      oldFile = writeSkill(tempDir, 'demo-old', 'OLD');
    });

    it('gives a trial its own arm copy and no other, both arms recording the baseline digest', () => {
      twoText(2, { interleave: true });
      expect(trials).toHaveLength(4);
      expect(new Set(trials.map((t) => t.staged)).size).toBe(4);
      for (const trial of trials) expect(trial.onDisk).toEqual([trial.staged]);
      const oldDigest = digestSkillDir(path.dirname(oldFile));
      expect(trials.map((t) => t.digest)).toEqual([
        oldDigest,
        digestSkillDir(skillDir),
        oldDigest,
        digestSkillDir(skillDir),
      ]);
      expect(rows.map((r) => r.baselineSkillFilesHash)).toEqual(Array(4).fill(oldDigest));
      expect(copiesOnDisk()).toEqual([]);
    });

    it('a baseline trial that wrote into its copy leaves the rest of both arms to run', () => {
      onTrial = (trial, n) => {
        if (n === 1) fs.writeFileSync(path.join(trial.staged, 'SKILL.md'), 'edited');
      };
      twoText(2);
      expect(rows.map((r) => `${r.label} ${r.t} ${r.errorType}`)).toEqual([
        'baseline 1 trial_wrote_skill_files',
        'baseline 2 undefined',
        'treatment 1 undefined',
        'treatment 2 undefined',
      ]);
    });

    it('refuses a directory that cannot be staged before any trial runs', () => {
      fs.symlinkSync('/etc/hosts', path.join(skillDir, 'escape'));
      expect(() => twoText(2)).toThrow(/Cannot stage .*escape: its link target \/etc\/hosts/);
      expect(trials).toHaveLength(0);
      expect(copiesOnDisk()).toEqual([]);
    });
  });

  it('refuses to go on when the skill directory changed under the run', () => {
    // Outside the project root, where the write check does not look.
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'test-staging-elsewhere-'));
    const file = writeSkill(elsewhere, 'demo', 'BODY');
    const dir = path.dirname(file);
    onTrial = (trial) => {
      if (trial === stagedTrials()[0]) {
        fs.writeFileSync(path.join(dir, 'references', 'verify.sh'), 'echo edited\n');
      }
    };
    try {
      expect(() => run(2, { skillFile: file })).toThrow(
        new RegExp(`Skill files in ${dir} changed during the run: .*[0-9a-f]{16}.*[0-9a-f]{16}`),
      );
    } finally {
      fs.rmSync(elsewhere, { recursive: true, force: true });
    }
    expect(stagedTrials()).toHaveLength(1);
    expect(copiesOnDisk()).toEqual([]);
  });

  describe('baselineArm, the baseline `eval preflight` runs', () => {
    it('stages each trial a copy of its own, removed by that trial', () => {
      const { arm } = baselineArm(SCENARIO, { text: 'BODY', skillFile, stage: true });
      const first = arm();
      const firstDir = first.skillInjection.baseDir;
      expect(copiesOnDisk()).toEqual([firstDir]);
      expect(first.scenario.context).toBe(
        `Base directory for this skill: ${firstDir}\n\nBODY\n\nA fixture.`,
      );
      expect(first.skillInjection.copies).toEqual([
        { dir: firstDir, filesHash: digestSkillDir(skillDir) },
      ]);
      first.remove();
      expect(copiesOnDisk()).toEqual([]);

      const second = arm();
      expect(second.skillInjection.baseDir).not.toBe(firstDir);
      expect(second.skillInjection.filesHash).toBe(first.skillInjection.filesHash);
      expect(second.skillInjection.baselineFilesHash).toBe(digestSkillDir(skillDir));
      second.remove();
      expect(copiesOnDisk()).toEqual([]);
    });
  });
});
