/**
 * eval-preflight-baseline-text.test.js - A preflight record is keyed on the
 * text its baseline was given (B-20).
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  computeScenarioHash,
  preflightFilename,
  runPreflight,
  checkPreflightGate,
} = require('../../scripts/lib/eval-preflight');

const SCENARIO_CONTENT =
  '# Eval: test-scenario\n\n## Scope\nskill\n\n## Assertions\n- [ ] does something\n';

describe('preflight is keyed on the text the baseline was given (B-20)', () => {
  const OLD = '0123456789abcdef';
  const OTHER = 'fedcba9876543210';
  const FILES = '1111111111111111';
  const OTHER_FILES = '2222222222222222';
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-preflight-text-'));
    const scenarios = path.join(tempDir, 'evals', 'scenarios');
    fs.mkdirSync(scenarios, { recursive: true });
    fs.writeFileSync(path.join(scenarios, 'test-scenario.md'), SCENARIO_CONTENT);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const preflightUnder = (conditions) =>
    runPreflight('test-scenario', tempDir, {
      runTrial: () => ({ passed: false, score: 0 }),
      gradeResult: (r) => r,
      conditions,
    });
  const gate = (conditions) => checkPreflightGate('test-scenario', tempDir, { conditions });

  test('the baseline text hash, and its staged files digest, are part of the file name', () => {
    const hash = computeScenarioHash(SCENARIO_CONTENT);
    expect(preflightFilename(hash, 'opus', { baselineSkillHash: OLD })).toBe(
      `${hash}-opus-b${OLD}.json`,
    );
    expect(
      preflightFilename(hash, 'opus', {
        effort: 'high',
        baselineSkillHash: OLD,
        baselineSkillFilesHash: FILES,
      }),
    ).toBe(`${hash}-opus-ehigh-b${OLD}-s${FILES}.json`);
    // A baseline given no text has nothing staged for it: the plain record.
    expect(preflightFilename(hash, 'opus', { baselineSkillFilesHash: FILES })).toBe(
      `${hash}-opus.json`,
    );
  });

  test('a PASS for one baseline text unlocks an A/B with that baseline (hit)', () => {
    const record = preflightUnder({ baselineSkillHash: OLD });
    expect(record.baseline_skill_hash).toBe(OLD);
    expect(record.baseline_skill_files_hash).toBeNull();
    expect(gate({ baselineSkillHash: OLD })).toBeNull();
  });

  test('it does not unlock a no-text baseline, another text, or staged files (miss)', () => {
    preflightUnder({ baselineSkillHash: OLD });
    expect(gate({})).toMatch(/No preflight record found/);
    expect(gate({})).toMatch(new RegExp(`recorded under: .*baseline text ${OLD}`));

    const other = gate({ baselineSkillHash: OTHER, baselineSkillFile: 'old/SKILL.md' });
    expect(other).toMatch(new RegExp(`ceiling 900000 ms, baseline text ${OTHER}\\)`));
    expect(other).toContain(
      'Run: arcforge eval preflight test-scenario --baseline-skill-file old/SKILL.md\n',
    );

    const staged = gate({
      baselineSkillHash: OLD,
      baselineSkillFile: 'old/SKILL.md',
      baselineSkillFilesHash: FILES,
    });
    expect(staged).toMatch(new RegExp(`baseline text ${OLD} with staged files ${FILES}\\)`));
    expect(staged).toContain(
      'Run: arcforge eval preflight test-scenario --baseline-skill-file old/SKILL.md --stage-skill-files\n',
    );
  });

  test('the suggested command quotes a path a shell would split or expand', () => {
    const spaced = gate({ baselineSkillHash: OLD, baselineSkillFile: 'old versions/SKILL.md' });
    expect(spaced).toContain(
      "Run: arcforge eval preflight test-scenario --baseline-skill-file 'old versions/SKILL.md'\n",
    );
    const quoted = gate({
      baselineSkillHash: OLD,
      baselineSkillFile: "it's $HOME/SKILL.md",
      pluginDir: '/some plugin',
    });
    expect(quoted).toContain(
      "--plugin-dir '/some plugin' --baseline-skill-file 'it'\\''s $HOME/SKILL.md'\n",
    );
  });

  test('a no-text PASS does not unlock a two-text A/B, and records no baseline text', () => {
    const record = preflightUnder({});
    expect(record).not.toHaveProperty('baseline_skill_hash');
    expect(record).not.toHaveProperty('baseline_skill_files_hash');
    expect(gate({ baselineSkillHash: OLD })).toMatch(/No preflight record found/);
    // Staging alone does not reach a baseline that is given nothing.
    expect(gate({ baselineSkillFilesHash: FILES })).toBeNull();
  });

  test('a PASS for one staged content unlocks that content only (B-20)', () => {
    const staged = { baselineSkillHash: OLD, baselineSkillFile: 'old/SKILL.md' };
    const record = preflightUnder({ ...staged, baselineSkillFilesHash: FILES });
    expect(record.baseline_skill_files_hash).toBe(FILES);
    expect(gate({ ...staged, baselineSkillFilesHash: FILES })).toBeNull();

    // The same text over other files, or over none, is another baseline.
    const other = gate({ ...staged, baselineSkillFilesHash: OTHER_FILES });
    expect(other).toMatch(/No preflight record found/);
    expect(other).toMatch(new RegExp(`with staged files ${OTHER_FILES}\\)`));
    expect(other).toMatch(new RegExp(`recorded under: .*with staged files ${FILES}\\.`));
    expect(gate(staged)).toMatch(/No preflight record found/);
  });
});
