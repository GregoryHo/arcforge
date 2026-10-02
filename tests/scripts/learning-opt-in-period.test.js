// tests/scripts/learning-opt-in-period.test.js
//
// The input contract of the opt-in period arithmetic (learning B-19). Two
// kinds of bad input, two answers:
//   - a bad STAMP inside a config is data — a hand edit, another engine — and
//     yields no period, the conservative direction (covered end to end in
//     learning-enabled-since.test.js);
//   - a bad ARGUMENT is a caller bug, and throws with context. A NaN start
//     would otherwise flow out as the effective opt-in, silencing the
//     stale-draft warning and handing the curator an invalid date.

const {
  effectiveOptIn,
  scopePeriod,
  startsAtEnabledAt,
} = require('../../scripts/lib/learning-opt-in-period');

const T1 = '2026-01-01T00:00:00.000Z';
const T2 = '2026-03-01T00:00:00.000Z';

describe('learning-opt-in-period input guards', () => {
  const badConfigs = [
    ['null', null],
    ['an array', []],
    ['a string', 'config'],
  ];
  const badStarts = [
    ['NaN', Number.NaN],
    ['Infinity', Infinity],
    ['a string', '0'],
    ['undefined', undefined],
  ];

  describe.each([
    ['scopePeriod', scopePeriod],
    ['startsAtEnabledAt', startsAtEnabledAt],
  ])('%s', (name, fn) => {
    it.each(badConfigs)(`throws on a config that is %s`, (_label, config) => {
      expect(() => fn(config, 0)).toThrow(new RegExp(`${name}: config must be an object`));
    });

    it.each(badStarts)(`throws on a legacyStart that is %s`, (_label, legacyStart) => {
      expect(() => fn({ enabled: true }, legacyStart)).toThrow(
        new RegExp(`${name}: legacyStart must be a finite number`),
      );
    });
  });

  describe('effectiveOptIn', () => {
    it('throws when periods is not an array', () => {
      expect(() => effectiveOptIn(null)).toThrow(/effectiveOptIn: periods must be an array/);
    });

    it.each([
      ['a NaN start', { start: Number.NaN, end: Infinity }],
      ['a string start', { start: '0', end: Infinity }],
      ['an infinite start', { start: -Infinity, end: Infinity }],
      ['a NaN end', { start: 0, end: Number.NaN }],
      ['a negative infinite end', { start: 0, end: -Infinity }],
      ['an end before its start', { start: 5, end: 1 }],
      ['not an object', 7],
    ])('throws on a period with %s', (_label, period) => {
      expect(() => effectiveOptIn([period])).toThrow(/effectiveOptIn: period 0 must be/);
    });

    it('accepts null entries as scopes with no period', () => {
      expect(effectiveOptIn([null, { start: 3, end: Infinity }])).toBe(3);
      expect(effectiveOptIn([null, null])).toBeNull();
    });
  });

  // The valid inputs the engine actually passes still work.
  it('reads a well-formed enabled and disabled scope', () => {
    const live = scopePeriod({ enabled: true, enabled_at: T2, updated_at: T2 }, Date.parse(T2));
    const ended = scopePeriod(
      { enabled: false, enabled_at: T1, updated_at: '2026-04-01T00:00:00.000Z' },
      0,
    );
    expect(ended).toBeNull(); // no disabled_at marker
    expect(effectiveOptIn([live, ended])).toBe(Date.parse(T2));
  });
});
