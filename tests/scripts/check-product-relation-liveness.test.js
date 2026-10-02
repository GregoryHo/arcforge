/**
 * check-product-relation-liveness.test.js — C3's liveness clause for `Refines:`
 * and `Extends:` (D-050), split out of `check-product.test.js`, which sits at its
 * pinned size ceiling.
 *
 * A relation must not name a decision already wholly superseded when the relation
 * was written. The log is append-only, so the rule is order-sensitive: it fires
 * only when the target's `Superseded-by: D-SSS` carries a `D-id` lower than the
 * relating entry's own. Every positive here runs the whole linter and expects no
 * error at all; every negative expects exactly one C3 error naming the relation,
 * the target, and the superseder.
 */

const { validateProduct } = require('../../scripts/lib/product-lint');

function decision({ id, status = 'Accepted', extra = [] }) {
  return [
    `### ${id} — a choice`,
    '- Date: 2026-01-01',
    '- Version: process',
    ...extra,
    `- Status: ${status}`,
    '- Decision: the choice, in one sentence.',
    '- Why: the tradeoff a future reader needs.',
    '',
  ];
}

function run(decisions, fold = []) {
  const folded =
    fold.length === 0
      ? []
      : ['<details>', '<summary>Superseded</summary>', '', ...fold.flat(), '</details>', ''];
  const roadmap = [
    '# Roadmap — fixture',
    '',
    '## Roadmap',
    '',
    '| Version | Tag | Milestone | Status | What & why | Spec |',
    '|---|---|---|---|---|---|',
    '| 1.0.0 | `v1.0.0` | milestone | **shipped ← we are here** | what & why | [alpha](specs/alpha.md) |',
    '',
    '## Decision Log',
    '',
    ...decisions.flat(),
    ...folded,
  ].join('\n');
  const content = [
    '# alpha — spec',
    '',
    '> Status: shipped v1.0.0 · [ROADMAP](../ROADMAP.md)',
    '',
    ...['Purpose', 'Scope', 'Behavior', 'Data / domain model', 'Decisions'].flatMap((h) => [
      `## ${h}`,
      '',
      'Text.',
      '',
    ]),
  ].join('\n');
  return validateProduct({ roadmap, specs: [{ name: 'alpha', content }] });
}

describe('check-product C3 — a Refines/Extends target was live when the relation was written', () => {
  describe.each(['Refines', 'Extends'])('%s:', (kind) => {
    it('rejects a target a lower D-id had already wholly superseded', () => {
      const errors = run([
        decision({ id: 'D-001', status: 'Superseded-by: D-002' }),
        decision({ id: 'D-002', extra: ['- Supersedes: D-001'] }),
        decision({ id: 'D-003', extra: [`- ${kind}: D-001`] }),
      ]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toBe(
        `C3 D-003: "${kind}: D-001" names a decision whose Status carries "Superseded-by: D-002", lower than D-003 — it was already dead when this relation was written`,
      );
    });

    it('accepts a target a higher D-id superseded after the relation was written', () => {
      const errors = run([
        decision({ id: 'D-001', status: 'Superseded-by: D-003' }),
        decision({ id: 'D-002', extra: [`- ${kind}: D-001`] }),
        decision({ id: 'D-003', extra: ['- Supersedes: D-001'] }),
      ]);
      expect(errors).toEqual([]);
    });

    it('accepts a target only partially superseded by a lower D-id', () => {
      const errors = run([
        decision({ id: 'D-001', status: 'Accepted · partially superseded by D-002' }),
        decision({ id: 'D-002', extra: ['- Supersedes: D-001 (clause 2)'] }),
        decision({ id: 'D-003', extra: [`- ${kind}: D-001`] }),
      ]);
      expect(errors).toEqual([]);
    });

    it('accepts a Proposed target', () => {
      const errors = run([
        decision({ id: 'D-001', status: 'Proposed' }),
        decision({ id: 'D-002', extra: [`- ${kind}: D-001`] }),
      ]);
      expect(errors).toEqual([]);
    });

    it('accepts a live target', () => {
      const errors = run([
        decision({ id: 'D-001' }),
        decision({ id: 'D-002', extra: [`- ${kind}: D-001`] }),
      ]);
      expect(errors).toEqual([]);
    });
  });

  describe('a target folded into the <details> index is judged by D-id, not position', () => {
    it('rejects a relation written after the folded target died', () => {
      const errors = run(
        [
          decision({ id: 'D-002', extra: ['- Supersedes: D-001'] }),
          decision({ id: 'D-003', extra: ['- Refines: D-001'] }),
        ],
        [decision({ id: 'D-001', status: 'Superseded-by: D-002' })],
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(
        /^C3 D-003: "Refines: D-001" .*"Superseded-by: D-002", lower than D-003/,
      );
    });

    it('accepts a relation written before the folded target died', () => {
      const errors = run(
        [
          decision({ id: 'D-002', extra: ['- Extends: D-001'] }),
          decision({ id: 'D-003', extra: ['- Supersedes: D-001'] }),
        ],
        [decision({ id: 'D-001', status: 'Superseded-by: D-003' })],
      );
      expect(errors).toEqual([]);
    });
  });

  it('claims only the flip it read when that flip names a decision that never superseded the target', () => {
    // D-002 carries no "Supersedes: D-001": the pairing check reports that, and
    // the liveness message must not assert that D-002 superseded anything.
    const errors = run([
      decision({ id: 'D-001', status: 'Superseded-by: D-002' }),
      decision({ id: 'D-002' }),
      decision({ id: 'D-003', extra: ['- Refines: D-001'] }),
    ]);
    expect(errors).toEqual([
      'C3 D-003: "Refines: D-001" names a decision whose Status carries "Superseded-by: D-002", lower than D-003 — it was already dead when this relation was written',
      'C3 D-001: Status carries "Superseded-by: D-002" but D-002 carries no "Supersedes: D-001" — a reversal is two edits, and this is only one',
    ]);
  });

  it('does not report an entry that supersedes and refines the same target (equal D-id)', () => {
    // D-050's recorded residual: the comparison is strict.
    const errors = run([
      decision({ id: 'D-001', status: 'Superseded-by: D-002' }),
      decision({ id: 'D-002', extra: ['- Supersedes: D-001', '- Refines: D-001'] }),
    ]);
    expect(errors).toEqual([]);
  });
});
