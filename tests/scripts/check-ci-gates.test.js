const { isBenchmarkStale } = require('../../scripts/check-benchmark-freshness');
const { skillsNeedingEval } = require('../../scripts/check-skill-eval-annotation');

describe('isBenchmarkStale', () => {
  const PREV = '2026-05-01T00:00:00.000Z';

  it('passes on first release (no previous tag)', () => {
    expect(isBenchmarkStale('2020-01-01T00:00:00Z', null, true).stale).toBe(false);
  });

  it('passes when no eval-backed surface changed', () => {
    expect(isBenchmarkStale('2020-01-01T00:00:00Z', PREV, false).stale).toBe(false);
  });

  it('fails when eval surface changed and benchmark is older than the previous release', () => {
    expect(isBenchmarkStale('2026-04-01T00:00:00.000Z', PREV, true).stale).toBe(true);
  });

  it('passes when eval surface changed and benchmark is newer than the previous release', () => {
    expect(isBenchmarkStale('2026-05-06T00:00:00.000Z', PREV, true).stale).toBe(false);
  });

  it('fails when the benchmark has no parseable generated timestamp', () => {
    expect(isBenchmarkStale(null, PREV, true).stale).toBe(true);
    expect(isBenchmarkStale('not-a-date', PREV, true).stale).toBe(true);
  });
});

describe('skillsNeedingEval', () => {
  it('flags a SKILL.md change with no matching eval evidence', () => {
    expect(skillsNeedingEval(['skills/arc-tdd/SKILL.md'])).toEqual(['arc-tdd']);
  });

  it('does not flag when the matching test file changed', () => {
    expect(
      skillsNeedingEval(['skills/arc-tdd/SKILL.md', 'tests/skills/test_skill_arc_tdd.py']),
    ).toEqual([]);
  });

  it('does not flag when a matching eval result changed', () => {
    expect(
      skillsNeedingEval([
        'skills/arc-tdd/SKILL.md',
        'evals/results/eval-arc-tdd-test-first-gate/run.json',
      ]),
    ).toEqual([]);
  });

  it('does not flag when the benchmark was regenerated', () => {
    expect(skillsNeedingEval(['skills/arc-tdd/SKILL.md', 'evals/benchmarks/latest.json'])).toEqual(
      [],
    );
  });

  it('ignores non-skill changes', () => {
    expect(skillsNeedingEval(['scripts/lib/utils.js', 'README.md'])).toEqual([]);
  });

  it('flags only the skills lacking evidence in a mixed change set', () => {
    expect(
      skillsNeedingEval([
        'skills/arc-tdd/SKILL.md',
        'skills/arc-debugging/SKILL.md',
        'tests/skills/test_skill_arc_debugging.py',
      ]),
    ).toEqual(['arc-tdd']);
  });
});
