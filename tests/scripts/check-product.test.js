/**
 * check-product.test.js — the product linter's own falsifiability suite.
 *
 * `npm run check:product` runs green on the live corpus by construction, so a
 * passing run proves nothing about the rules. Every rule below therefore gets a
 * synthetic corpus that satisfies it and a mutant that breaks exactly one
 * clause — if a rule ever stops firing, its negative case turns green and this
 * suite goes red.
 */

const fs = require('node:fs');
const path = require('node:path');

const { validateProduct } = require('../../scripts/check-product');

const PRODUCT_DIR = path.join(__dirname, '..', '..', 'product');

const TABLE_HEADER = [
  '| Version | Tag | Milestone | Status | What & why | Spec |',
  '|---|---|---|---|---|---|',
];

function row({ version = '1.0.0', status = 'shipped', here = true, specs = ['alpha'] } = {}) {
  const statusCell = here ? `**${status} ${'← we are here'}**` : `**${status}**`;
  const specCell = specs.map((s) => `[${s}](specs/${s}.md)`).join(' · ');
  return `| ${version} | \`v${version}\` | milestone | ${statusCell} | what & why | ${specCell} |`;
}

function decision({ id = 'D-001', title = 'a choice', status = 'Accepted', extra = [] } = {}) {
  return [
    `### ${id} — ${title}`,
    '- Date: 2026-01-01',
    '- Version: process',
    ...extra,
    `- Status: ${status}`,
    '- Decision: the choice, in one sentence.',
    '- Why: the tradeoff a future reader needs.',
    '',
  ].join('\n');
}

function roadmap({ rows = [row()], decisions = [decision()], fold = [] } = {}) {
  const folded =
    fold.length === 0
      ? []
      : ['<details>', '<summary>Superseded</summary>', '', ...fold, '</details>', ''];
  return [
    '# Roadmap — fixture',
    '',
    '## Roadmap',
    '',
    ...TABLE_HEADER,
    ...rows,
    '',
    '## Decision Log',
    '',
    ...decisions,
    ...folded,
  ].join('\n');
}

function spec({ name = 'alpha', status = 'shipped v1.0.0', cites = [] } = {}) {
  const header = status === null ? '' : `> Status: ${status} · [ROADMAP](../ROADMAP.md)\n`;
  const decisions = cites.map((d) => `- **${d}** — pins a choice here.`).join('\n');
  return {
    name,
    content: `# ${name} — spec\n\n${header}\n## Purpose\n\nWhat it does.\n\n## Decisions\n\n${decisions}\n`,
  };
}

/** Errors raised by one rule, so a fixture can isolate the clause under test. */
function of(rule, errors) {
  return errors.filter((e) => e.startsWith(rule));
}

function run(overrides = {}) {
  return validateProduct({
    roadmap: roadmap(overrides.roadmap),
    specs: overrides.specs ?? [spec()],
  });
}

describe('check-product', () => {
  describe('the live corpus', () => {
    it('is consistent', () => {
      const specs = fs
        .readdirSync(path.join(PRODUCT_DIR, 'specs'))
        .filter((f) => f.endsWith('.md'))
        .map((f) => ({
          name: f.slice(0, -3),
          content: fs.readFileSync(path.join(PRODUCT_DIR, 'specs', f), 'utf8'),
        }));
      const content = fs.readFileSync(path.join(PRODUCT_DIR, 'ROADMAP.md'), 'utf8');
      expect(validateProduct({ roadmap: content, specs })).toEqual([]);
    });

    it('does not throw on an empty product state', () => {
      expect(() => validateProduct({})).not.toThrow();
    });
  });

  describe('C1 — exactly one `we are here` marker', () => {
    it('accepts a single marked row', () => {
      expect(of('C1', run())).toEqual([]);
    });

    it('rejects a roadmap with no marker', () => {
      const errors = of('C1', run({ roadmap: { rows: [row({ here: false })] } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/found 0/);
    });

    it('rejects two marked rows', () => {
      const rows = [row({ version: '1.0.0' }), row({ version: '1.1.0', status: 'building' })];
      const specs = [spec({ status: 'shipped v1.0.0 · extended by 1.1.0 (building)' })];
      const errors = of('C1', validateProduct({ roadmap: roadmap({ rows }), specs }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/found 2/);
    });
  });

  describe('C2 — Decision Log numbering', () => {
    it('accepts zero-padded ids ascending from D-001', () => {
      const decisions = [decision({ id: 'D-001' }), decision({ id: 'D-002' })];
      expect(of('C2', run({ roadmap: { decisions } }))).toEqual([]);
    });

    it('rejects a gap in the sequence', () => {
      const decisions = [decision({ id: 'D-001' }), decision({ id: 'D-003' })];
      const errors = of('C2', run({ roadmap: { decisions } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/expected D-002, found D-003/);
    });

    it('rejects an out-of-order body entry', () => {
      const decisions = [decision({ id: 'D-002' }), decision({ id: 'D-001' })];
      expect(of('C2', run({ roadmap: { decisions } }))).toContainEqual(
        expect.stringMatching(/out of order: D-001/),
      );
    });

    it('rejects a duplicate id', () => {
      const decisions = [decision({ id: 'D-001' }), decision({ id: 'D-001', title: 'again' })];
      expect(of('C2', run({ roadmap: { decisions } }))).toContainEqual(
        expect.stringMatching(/duplicate Decision Log id D-001/),
      );
    });

    it('rejects an id that is not zero-padded to three digits', () => {
      const decisions = [decision({ id: 'D-001' }), decision({ id: 'D-2' })];
      expect(of('C2', run({ roadmap: { decisions } }))).toContainEqual(
        expect.stringMatching(/malformed Decision Log heading/),
      );
    });

    it('ignores the folded index when checking ascending order', () => {
      const decisions = [decision({ id: 'D-001' }), decision({ id: 'D-003' })];
      const fold = [decision({ id: 'D-002', status: 'Superseded-by: D-003' })];
      expect(of('C2', run({ roadmap: { decisions, fold } }))).toEqual([]);
    });
  });

  describe('C3 — a supersession carries its flip', () => {
    const supersedingLog = (supersedesLine, victimStatus) => [
      decision({ id: 'D-001', status: victimStatus }),
      decision({ id: 'D-002', extra: [supersedesLine] }),
    ];

    it('accepts the bare form with its flip', () => {
      const decisions = supersedingLog('- Supersedes: D-001', 'Superseded-by: D-002');
      expect(of('C3', run({ roadmap: { decisions } }))).toEqual([]);
    });

    it('rejects the bare form when the superseded entry was never flipped', () => {
      const decisions = supersedingLog('- Supersedes: D-001', 'Accepted');
      const errors = of('C3', run({ roadmap: { decisions } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/expected it to carry "Superseded-by: D-002"/);
    });

    it('accepts the clause-scoped form with its partial flip', () => {
      const decisions = supersedingLog(
        '- Supersedes: D-001 (clause 2)',
        'Accepted · partially superseded by D-002',
      );
      expect(of('C3', run({ roadmap: { decisions } }))).toEqual([]);
    });

    it('rejects a clause-scoped supersede flipped as if it were total', () => {
      const decisions = supersedingLog('- Supersedes: D-001 (clause 2)', 'Superseded-by: D-002');
      const errors = of('C3', run({ roadmap: { decisions } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/expected it to carry "partially superseded by D-002"/);
    });

    it('rejects a Supersedes naming a decision that does not exist', () => {
      const decisions = [
        decision({ id: 'D-001' }),
        decision({ id: 'D-002', extra: ['- Supersedes: D-009'] }),
      ];
      const errors = of('C3', run({ roadmap: { decisions } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/names a decision that does not exist/);
    });

    it('requires no flip for Refines: or Extends:', () => {
      const decisions = [
        decision({ id: 'D-001' }),
        decision({ id: 'D-002', extra: ['- Refines: D-001'] }),
        decision({ id: 'D-003', extra: ['- Extends: D-001'] }),
      ];
      expect(of('C3', run({ roadmap: { decisions } }))).toEqual([]);
    });
  });

  describe('C4 — a spec header matches its governing row', () => {
    it('accepts a shipped row with a shipped header', () => {
      expect(of('C4', run())).toEqual([]);
    });

    it('rejects a header claiming to build a version that shipped', () => {
      const errors = of('C4', run({ specs: [spec({ status: 'building v1.0.0' })] }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/makes it "shipped v1\.0\.0"/);
    });

    it('maps a building row to a building header', () => {
      const rows = [row({ status: 'building' })];
      const specs = [spec({ status: 'building v1.0.0' })];
      expect(of('C4', validateProduct({ roadmap: roadmap({ rows }), specs }))).toEqual([]);
    });

    it('maps a next row to a draft header', () => {
      const rows = [row({ status: 'next' })];
      const specs = [spec({ status: 'draft' })];
      expect(of('C4', validateProduct({ roadmap: roadmap({ rows }), specs }))).toEqual([]);
    });

    it('requires the compound form while a later row extends a shipped spec', () => {
      const rows = [
        row({ version: '1.0.0', here: false }),
        row({ version: '1.1.0', status: 'building' }),
      ];
      const specs = [spec({ status: 'shipped v1.0.0 · extended by 1.1.0 (building)' })];
      expect(of('C4', validateProduct({ roadmap: roadmap({ rows }), specs }))).toEqual([]);
    });

    it('rejects a header left un-extended while a later row is building it', () => {
      const rows = [
        row({ version: '1.0.0', here: false }),
        row({ version: '1.1.0', status: 'building' }),
      ];
      const specs = [spec({ status: 'shipped v1.0.0' })];
      const errors = of('C4', validateProduct({ roadmap: roadmap({ rows }), specs }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/extended by 1\.1\.0 \(building\)/);
    });

    it('collapses the compound form once the extending row ships', () => {
      const rows = [row({ version: '1.0.0', here: false }), row({ version: '1.1.0' })];
      const specs = [spec({ status: 'shipped v1.1.0' })];
      expect(of('C4', validateProduct({ roadmap: roadmap({ rows }), specs }))).toEqual([]);
    });

    it('rejects a spec no roadmap row links', () => {
      const specs = [spec(), spec({ name: 'orphan' })];
      const errors = of('C4', validateProduct({ roadmap: roadmap(), specs }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/specs\/orphan\.md: no roadmap row links it/);
    });

    it('rejects a roadmap link to a spec that does not exist', () => {
      const rows = [row({ specs: ['alpha', 'ghost'] })];
      const errors = of('C4', validateProduct({ roadmap: roadmap({ rows }), specs: [spec()] }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/links specs\/ghost\.md, which does not exist/);
    });

    it('rejects a spec with no Status header line', () => {
      const errors = of('C4', run({ specs: [spec({ status: null })] }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/missing the "> Status:" header line/);
    });
  });

  describe('C5 — a spec only cites decisions that exist', () => {
    it('accepts a citation of a recorded decision', () => {
      expect(of('C5', run({ specs: [spec({ cites: ['D-001'] })] }))).toEqual([]);
    });

    it('rejects a citation of a decision the log does not carry', () => {
      const errors = of('C5', run({ specs: [spec({ cites: ['D-009'] })] }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/cites D-009/);
    });
  });

  describe('C6 — sanity floor', () => {
    it('is met by a corpus with a row, a decision, and a spec', () => {
      expect(of('C6', run())).toEqual([]);
    });

    it('fails when the roadmap table has no rows', () => {
      expect(
        of('C6', validateProduct({ roadmap: roadmap({ rows: [] }), specs: [spec()] })),
      ).toEqual(['C6 sanity floor: the roadmap table has no rows']);
    });

    it('fails when the Decision Log is empty', () => {
      expect(
        of('C6', validateProduct({ roadmap: roadmap({ decisions: [] }), specs: [spec()] })),
      ).toEqual(['C6 sanity floor: the Decision Log has no entries']);
    });

    it('fails when specs/ is empty', () => {
      expect(of('C6', validateProduct({ roadmap: roadmap(), specs: [] }))).toEqual([
        'C6 sanity floor: specs/ holds no spec',
      ]);
    });
  });
});
