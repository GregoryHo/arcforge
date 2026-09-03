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

function row({
  version = '1.0.0',
  status = 'shipped',
  here = true,
  specs = ['alpha'],
  tag = status === 'shipped' ? `\`v${version}\`` : '—',
} = {}) {
  const statusCell = here ? `**${status} ${'← we are here'}**` : `**${status}**`;
  const specCell = specs.map((s) => `[${s}](specs/${s}.md)`).join(' · ');
  return `| ${version} | ${tag} | milestone | ${statusCell} | what & why | ${specCell} |`;
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

/**
 * `intro` and `appendix` sit outside the `## Decision Log` section — before it
 * and after it — so a fixture can put decision-shaped prose where the log is not.
 */
function roadmap({
  rows = [row()],
  decisions = [decision()],
  fold = [],
  intro = [],
  appendix = [],
} = {}) {
  const folded =
    fold.length === 0
      ? []
      : ['<details>', '<summary>Superseded</summary>', '', ...fold, '</details>', ''];
  const appended = appendix.length === 0 ? [] : ['## Appendix', '', ...appendix];
  return [
    '# Roadmap — fixture',
    '',
    ...intro,
    '## Roadmap',
    '',
    ...TABLE_HEADER,
    ...rows,
    '',
    '## Decision Log',
    '',
    ...decisions,
    ...folded,
    ...appended,
  ].join('\n');
}

/**
 * `intro` sits above `## Purpose`, outside the `## Decisions` section; `extra`
 * is appended inside it, below the citations — so a fixture can put
 * decisions-shaped prose on either side of the section boundary.
 */
function spec({
  name = 'alpha',
  status = 'shipped v1.0.0',
  cites = [],
  intro = [],
  extra = [],
} = {}) {
  const header = status === null ? '' : `> Status: ${status} · [ROADMAP](../ROADMAP.md)\n`;
  const decisions = cites.map((d) => `- **${d}** — pins a choice here.`).join('\n');
  return {
    name,
    content: [
      `# ${name} — spec`,
      '',
      header,
      ...intro,
      '## Purpose',
      '',
      'What it does.',
      '',
      '## Decisions',
      '',
      decisions,
      ...extra,
      '',
    ].join('\n'),
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

    it('does not let a fenced `## Roadmap` illustration stand in for the table', () => {
      // The roadmap is sliced by the same fence-aware `section`, so an example
      // table above it is prose — read fence-blind, its rows become the roadmap.
      const intro = [
        [
          '```markdown',
          '## Roadmap',
          '',
          ...TABLE_HEADER,
          row({ version: '9.9.9', specs: [] }),
          '```',
          '',
        ].join('\n'),
      ];
      expect(run({ roadmap: { intro } })).toEqual([]);
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

    it('does not read a decision heading inside a fenced code block', () => {
      // The illustration would otherwise enter the log as D-009 and open a
      // D-002…D-008 gap, so an example entry could never be shown in the log.
      const decisions = [
        decision({ id: 'D-001' }),
        ['```markdown', '### D-009 — an illustration', '- Status: banana', '```', ''].join('\n'),
      ];
      expect(run({ roadmap: { decisions } })).toEqual([]);
    });

    it('reports an indented decision heading instead of skipping it', () => {
      // Last on purpose: a skipped trailing entry is the one position the gap
      // check cannot cover for, because nothing follows it to expose the hole.
      const decisions = [
        decision({ id: 'D-001' }),
        ['   ### D-002 — an indented entry', '- Status: Accepted', ''].join('\n'),
      ];
      const errors = of('C2', run({ roadmap: { decisions } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/indented Decision Log heading/);
    });

    it('does not read a decision heading inside an indented code block', () => {
      // Four spaces is an indented code block, not a heading — the widened
      // detector stops at three so an illustration stays out of the log.
      const decisions = [decision({ id: 'D-001' }), '    ### D-009 — an illustration\n'];
      expect(run({ roadmap: { decisions } })).toEqual([]);
    });

    it('does not read a decision heading before the Decision Log', () => {
      // The log is the `## Decision Log` section, not the file. Read whole-file,
      // an intro heading would satisfy C2, C6 and a spec citation on a log that
      // is actually empty.
      const errors = run({
        roadmap: { intro: [decision({ id: 'D-001' })], decisions: [] },
        specs: [spec({ cites: ['D-001'] })],
      });
      expect(errors).toContainEqual(
        expect.stringMatching(/C6 sanity floor: the Decision Log has no entries/),
      );
      expect(of('C5', errors)).toContainEqual(
        expect.stringMatching(/cites D-001, which is not in the Decision Log/),
      );
    });

    it('does not read a decision heading in a section after the log', () => {
      const errors = run({
        roadmap: {
          decisions: [decision({ id: 'D-001' })],
          appendix: [decision({ id: 'D-002', title: 'illustrative, not a real decision' })],
        },
        specs: [spec({ cites: ['D-002'] })],
      });
      expect(of('C2', errors)).toEqual([]);
      expect(of('C5', errors)).toContainEqual(
        expect.stringMatching(/cites D-002, which is not in the Decision Log/),
      );
    });

    it('does not report a duplicate for a decision heading re-listed outside the log', () => {
      // The false-positive half: an appendix that re-shows a real entry must not
      // make it a duplicate or put the log out of order.
      const errors = run({
        roadmap: {
          decisions: [decision({ id: 'D-001' })],
          appendix: [decision({ id: 'D-001', title: 'the same entry, quoted' })],
        },
      });
      expect(of('C2', errors)).toEqual([]);
    });

    it('does not let a fenced `##` line inside the log truncate it', () => {
      // The section boundary is found fence-aware. Read fence-blind, the log
      // would end inside this worked example and every entry below it — the
      // shape `product/AGENTS.md`'s own few-shots use — would leave the log.
      const decisions = [
        decision({ id: 'D-001' }),
        ['```markdown', '## Decision Log', '### D-009 — a worked example', '```', ''].join('\n'),
        decision({ id: 'D-002' }),
      ];
      expect(run({ roadmap: { decisions }, specs: [spec({ cites: ['D-002'] })] })).toEqual([]);
    });

    it('still checks an entry below a fenced `##` line', () => {
      // The silent half of the same truncation: a dropped entry takes its
      // broken relation out of the checked history with no error at all.
      const decisions = [
        decision({ id: 'D-001' }),
        ['```markdown', '## Decision Log', '```', ''].join('\n'),
        decision({ id: 'D-002', extra: ['- Refines: D-009'] }),
      ];
      expect(of('C3', run({ roadmap: { decisions } }))).toContainEqual(
        expect.stringMatching(/"Refines: D-009" names a decision that does not exist/),
      );
    });

    it('does not let a fenced `## Decision Log` illustration stand in for the log', () => {
      // The hijack half: the first *unfenced* heading opens the section, so an
      // illustration of the log above it is prose, not the log.
      const intro = [
        ['```markdown', '## Decision Log', '', decision({ id: 'D-009' }), '```', ''].join('\n'),
      ];
      expect(run({ roadmap: { intro, decisions: [decision({ id: 'D-001' })] } })).toEqual([]);
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

    it('rejects a total flip that left the entry Accepted as well', () => {
      const decisions = supersedingLog('- Supersedes: D-001', 'Accepted · Superseded-by: D-002');
      const errors = of('C3', run({ roadmap: { decisions } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/no longer "Accepted"/);
    });

    it('rejects a flip buried in a longer sentence', () => {
      const decisions = supersedingLog(
        '- Supersedes: D-001',
        'Superseded-by: D-002 but not really',
      );
      const errors = of('C3', run({ roadmap: { decisions } }));
      // The trailing words make it neither the flip nor a clause the vocabulary
      // knows, so both halves of C3 report it.
      expect(errors).toHaveLength(2);
      expect(errors[0]).toMatch(/expected it to carry "Superseded-by: D-002"/);
      expect(errors[1]).toMatch(/is not one of Accepted \| Proposed/);
    });

    it('rejects a clause outside the status vocabulary', () => {
      const decisions = supersedingLog('- Supersedes: D-001', 'Superseded-by: D-002 · lol');
      const errors = of('C3', run({ roadmap: { decisions } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/is not one of Accepted \| Proposed/);
    });

    it('rejects a partial flip that dropped the live clause', () => {
      const decisions = supersedingLog(
        '- Supersedes: D-001 (clause 2)',
        'partially superseded by D-002',
      );
      const errors = of('C3', run({ roadmap: { decisions } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/keeps exactly one "Accepted"/);
    });

    it('rejects an entry superseded outright twice', () => {
      const decisions = [
        decision({ id: 'D-001', status: 'Superseded-by: D-002 · Superseded-by: D-003' }),
        decision({ id: 'D-002', extra: ['- Supersedes: D-001'] }),
        decision({ id: 'D-003', extra: ['- Supersedes: D-001'] }),
      ];
      const errors = of('C3', run({ roadmap: { decisions } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/a decision dies once/);
    });

    it('rejects a flip appended beside the status line it should replace', () => {
      // Two `Status:` lines are the same self-contradiction as
      // `Accepted · Superseded-by: D-002`, spelled with a newline instead of a
      // `·`. Without this the last one silently wins and every clause goes green.
      const decisions = [
        decision({ id: 'D-001', extra: ['- Status: Accepted'], status: 'Superseded-by: D-002' }),
        decision({ id: 'D-002', extra: ['- Supersedes: D-001'] }),
      ];
      const errors = of('C3', run({ roadmap: { decisions } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/a second "- Status:" line/);
    });

    it('rejects a duplicate status on an entry nothing supersedes', () => {
      // The rule is structural, not victim-scoped: counting fields needs no
      // vocabulary, so it fires on an entry no `Supersedes:` names.
      const decisions = [decision({ id: 'D-001', extra: ['- Status: Proposed'] })];
      const errors = of('C3', run({ roadmap: { decisions } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/a second "- Status:" line/);
    });

    it('reports an incoherent status once, not once per superseding entry', () => {
      const decisions = [
        decision({ id: 'D-001', status: 'Accepted · Superseded-by: D-002' }),
        decision({ id: 'D-002', extra: ['- Supersedes: D-001'] }),
        decision({ id: 'D-003', extra: ['- Supersedes: D-001'] }),
      ];
      const errors = of('C3', run({ roadmap: { decisions } }));
      expect(errors.filter((e) => /no longer "Accepted"/.test(e))).toHaveLength(1);
    });

    it('accepts a Proposed entry carrying a partial flip', () => {
      const decisions = supersedingLog(
        '- Supersedes: D-001 (clause 2)',
        'Proposed · partially superseded by D-002',
      );
      expect(of('C3', run({ roadmap: { decisions } }))).toEqual([]);
    });

    it('accepts two clause-scoped flips from different decisions', () => {
      const decisions = [
        decision({
          id: 'D-001',
          status: 'Accepted · partially superseded by D-002 · partially superseded by D-003',
        }),
        decision({ id: 'D-002', extra: ['- Supersedes: D-001 (clause 1)'] }),
        decision({ id: 'D-003', extra: ['- Supersedes: D-001 (clause 2)'] }),
      ];
      expect(of('C3', run({ roadmap: { decisions } }))).toEqual([]);
    });

    it('accepts a partially superseded entry that a later decision then killed outright', () => {
      const decisions = [
        decision({
          id: 'D-001',
          status: 'Superseded-by: D-003 · partially superseded by D-002',
        }),
        decision({ id: 'D-002', extra: ['- Supersedes: D-001 (clause 1)'] }),
        decision({ id: 'D-003', extra: ['- Supersedes: D-001'] }),
      ];
      expect(of('C3', run({ roadmap: { decisions } }))).toEqual([]);
    });

    it('rejects an entry both wholly and partially superseded by the same decision', () => {
      const decisions = [
        decision({ id: 'D-001', status: 'Superseded-by: D-002 · partially superseded by D-002' }),
        decision({
          id: 'D-002',
          extra: ['- Supersedes: D-001', '- Supersedes: D-001 (clause 1)'],
        }),
      ];
      const errors = of('C3', run({ roadmap: { decisions } }));
      expect(
        errors.filter((e) => /exclusive for one superseder\/victim pair/.test(e)),
      ).toHaveLength(1);
    });

    it('rejects both flips from one decision even when it claims only one form', () => {
      // The mirror pass is deliberately form-blind, so the stale `partially
      // superseded by` left behind when a partial reversal is upgraded to a
      // total one has to be caught on the victim's own Status.
      const decisions = [
        decision({ id: 'D-001', status: 'Superseded-by: D-002 · partially superseded by D-002' }),
        decision({ id: 'D-002', extra: ['- Supersedes: D-001'] }),
      ];
      const errors = of('C3', run({ roadmap: { decisions } }));
      expect(
        errors.filter((e) => /exclusive for one superseder\/victim pair/.test(e)),
      ).toHaveLength(1);
    });

    it('rejects a clause id that is not a number', () => {
      const decisions = supersedingLog(
        '- Supersedes: D-001 (clause two)',
        'Accepted · partially superseded by D-002',
      );
      const errors = of('C3', run({ roadmap: { decisions } }));
      // The malformed line is dropped, so the log no longer records the
      // supersession at all — D-001's flip is then genuinely unclaimed and the
      // mirror half of C3 reports it too.
      expect(errors).toHaveLength(2);
      expect(errors[0]).toMatch(/malformed relation line/);
      expect(errors[1]).toMatch(/carries no "Supersedes: D-001"/);
    });

    it('rejects a Supersedes pointing at a later decision even when it carries the flip', () => {
      const decisions = [
        decision({ id: 'D-001', extra: ['- Supersedes: D-002'] }),
        decision({ id: 'D-002', status: 'Superseded-by: D-001' }),
      ];
      const errors = of('C3', run({ roadmap: { decisions } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/"Supersedes: D-002" must name an earlier decision/);
    });

    it('rejects a Refines pointing at a later decision', () => {
      const decisions = [
        decision({ id: 'D-001', extra: ['- Refines: D-002'] }),
        decision({ id: 'D-002' }),
      ];
      const errors = of('C3', run({ roadmap: { decisions } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/"Refines: D-002" must name an earlier decision/);
    });

    it('rejects an Extends naming its own entry', () => {
      const decisions = [
        decision({ id: 'D-001' }),
        decision({ id: 'D-002', extra: ['- Extends: D-002'] }),
      ];
      const errors = of('C3', run({ roadmap: { decisions } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/"Extends: D-002" must name an earlier decision/);
    });

    it('accepts a supersession whose superseded entry is parked in the fold', () => {
      const decisions = [decision({ id: 'D-002', extra: ['- Supersedes: D-001'] })];
      const fold = [decision({ id: 'D-001', status: 'Superseded-by: D-002' })];
      expect(of('C3', run({ roadmap: { decisions, fold } }))).toEqual([]);
    });

    it('rejects a flip whose named decision never claimed the supersession', () => {
      const decisions = [
        decision({ id: 'D-001', status: 'Superseded-by: D-002' }),
        decision({ id: 'D-002' }),
      ];
      const errors = of('C3', run({ roadmap: { decisions } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/carries no "Supersedes: D-001" — a reversal is two edits/);
    });

    it('rejects a partial flip whose named decision never claimed it', () => {
      const decisions = [
        decision({ id: 'D-001', status: 'Accepted · partially superseded by D-002' }),
        decision({ id: 'D-002' }),
      ];
      const errors = of('C3', run({ roadmap: { decisions } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/carries no "Supersedes: D-001"/);
    });

    it('rejects a flip naming a decision the log does not carry', () => {
      const decisions = [
        decision({ id: 'D-001', status: 'Superseded-by: D-009' }),
        decision({ id: 'D-002' }),
      ];
      const errors = of('C3', run({ roadmap: { decisions } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/D-009 is not in the Decision Log/);
    });

    it('rejects an entry flipped as superseded by itself', () => {
      const decisions = [
        decision({ id: 'D-001', status: 'Superseded-by: D-001' }),
        decision({ id: 'D-002' }),
      ];
      const errors = of('C3', run({ roadmap: { decisions } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/carries no "Supersedes: D-001"/);
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

    it('accepts a Refines: or Extends: naming a decision that has since been superseded', () => {
      // C3 tests a relation edge, never its target's current status: the target
      // has to exist and be earlier, and that is the whole promise.
      const decisions = [
        decision({ id: 'D-001', status: 'Superseded-by: D-002' }),
        decision({ id: 'D-002', extra: ['- Supersedes: D-001'] }),
        decision({ id: 'D-003', extra: ['- Refines: D-001'] }),
        decision({ id: 'D-004', extra: ['- Extends: D-001'] }),
      ];
      expect(of('C3', run({ roadmap: { decisions } }))).toEqual([]);
    });

    it('accepts a Refines: written while its target was still live', () => {
      // D-002 refined a live D-001; D-003 killed D-001 afterwards. The log is
      // append-only, so D-002 cannot be edited in hindsight — any future
      // tightening here has to stay order-sensitive and keep this case green.
      const decisions = [
        decision({ id: 'D-001', status: 'Superseded-by: D-003' }),
        decision({ id: 'D-002', extra: ['- Refines: D-001'] }),
        decision({ id: 'D-003', extra: ['- Supersedes: D-001'] }),
      ];
      expect(of('C3', run({ roadmap: { decisions } }))).toEqual([]);
    });

    it('rejects a Refines naming a decision that does not exist', () => {
      const decisions = [
        decision({ id: 'D-001' }),
        decision({ id: 'D-002', extra: ['- Refines: D-009'] }),
      ];
      const errors = of('C3', run({ roadmap: { decisions } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/"Refines: D-009" names a decision that does not exist/);
    });

    it('rejects an Extends naming a decision that does not exist', () => {
      const decisions = [
        decision({ id: 'D-001' }),
        decision({ id: 'D-002', extra: ['- Extends: D-009'] }),
      ];
      const errors = of('C3', run({ roadmap: { decisions } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/"Extends: D-009" names a decision that does not exist/);
    });

    it('rejects a relation line that misses the strict form instead of ignoring it', () => {
      const decisions = [
        decision({ id: 'D-001' }),
        decision({ id: 'D-002', extra: ['- Supersedes: D-1'] }),
      ];
      const errors = of('C3', run({ roadmap: { decisions } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/malformed relation line "- Supersedes: D-1"/);
    });

    it('rejects a relation line with a space before the colon', () => {
      const decisions = [
        decision({ id: 'D-001' }),
        decision({ id: 'D-002', extra: ['- Supersedes : D-001'] }),
      ];
      const errors = of('C3', run({ roadmap: { decisions } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/malformed relation line "- Supersedes : D-001"/);
    });

    it('rejects a lowercase relation label', () => {
      const decisions = [
        decision({ id: 'D-001' }),
        decision({ id: 'D-002', extra: ['- supersedes: D-001'] }),
      ];
      const errors = of('C3', run({ roadmap: { decisions } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/malformed relation line "- supersedes: D-001"/);
    });

    it('rejects a relation line on a non-dash markdown bullet', () => {
      const decisions = [
        decision({ id: 'D-001' }),
        decision({ id: 'D-002', extra: ['* Refines: D-001'] }),
      ];
      const errors = of('C3', run({ roadmap: { decisions } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/malformed relation line "\* Refines: D-001"/);
    });

    it('does not see a relation label it cannot recognize', () => {
      // The boundary, pinned so a later reader does not assume closure: the
      // detector keys on the three labels, and matching on the value instead
      // would false-fire on prose fields that legitimately cite a `D-id`.
      const decisions = [
        decision({ id: 'D-001' }),
        decision({ id: 'D-002', extra: ['- Superseds: D-001'] }),
      ];
      expect(of('C3', run({ roadmap: { decisions } }))).toEqual([]);
    });

    it('does not read a relation line inside a fenced code block', () => {
      // A decision may show a worked example of the rules it is subject to, the
      // way `product/AGENTS.md` does. The illustration is not a relation line,
      // so a deliberately wrong form inside a fence must not hard-fail C3.
      const decisions = [
        decision({ id: 'D-001' }),
        decision({ id: 'D-002', extra: ['```markdown', '- Supersedes : D-001', '```'] }),
      ];
      expect(of('C3', run({ roadmap: { decisions } }))).toEqual([]);
    });

    it('does not read a relation line inside an indented code block', () => {
      // The unfenced form of the illustration above: four spaces puts the bullet
      // outside the field column, so the widened detector stops at three and the
      // example does not hard-fail C3 either.
      const decisions = [
        decision({ id: 'D-001' }),
        decision({ id: 'D-002', extra: ['    - Supersedes : D-001'] }),
      ];
      expect(of('C3', run({ roadmap: { decisions } }))).toEqual([]);
    });

    it('reports a relation line indented one to three spaces', () => {
      // The other side of that bound: still close enough to the field column
      // that a reader sees a field, so the linter must not drop it.
      const decisions = [
        decision({ id: 'D-001' }),
        decision({ id: 'D-002', extra: ['   - Supersedes: D-001'] }),
      ];
      const errors = of('C3', run({ roadmap: { decisions } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/malformed relation line "- Supersedes: D-001"/);
    });

    it('rejects a Supersedes naming two decisions on one line', () => {
      const decisions = [
        decision({ id: 'D-001' }),
        decision({ id: 'D-002', extra: ['- Supersedes: D-001, D-001'] }),
      ];
      const errors = of('C3', run({ roadmap: { decisions } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/malformed relation line/);
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

    it.each([
      'D-1',
      'D-01',
      'D-0001',
      'D-9999',
      'D-001a',
    ])('rejects the malformed citation %s instead of skipping it', (id) => {
      const errors = of('C5', run({ specs: [spec({ cites: [id] })] }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/not a zero-padded D-NNN id/);
    });

    it('still reads the citations below a fenced `##` line', () => {
      // A spec's `## Decisions` is sliced by the same fence-aware `section`:
      // read fence-blind, the section ends inside this example and the citation
      // below it goes unchecked.
      const specs = [
        spec({
          cites: ['D-001'],
          extra: [
            '```markdown',
            '## Decisions',
            'how a citation is written.',
            '```',
            '- **D-009** — cites a decision the log does not carry.',
          ],
        }),
      ];
      const errors = of('C5', validateProduct({ roadmap: roadmap(), specs }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/cites D-009/);
    });

    it('does not let a fenced `## Decisions` illustration stand in for the section', () => {
      const specs = [
        spec({
          cites: ['D-009'],
          intro: ['```markdown', '## Decisions', '- **D-001** — an example citation.', '```', ''],
        }),
      ];
      const errors = of('C5', validateProduct({ roadmap: roadmap(), specs }));
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

  describe('C7 — the Tag cell matches the row Status', () => {
    it('accepts a shipped row tagged with its own version', () => {
      expect(of('C7', run())).toEqual([]);
    });

    it('accepts an unshipped row carrying the em-dash placeholder', () => {
      const rows = [row({ status: 'building' })];
      const specs = [spec({ status: 'building v1.0.0' })];
      expect(of('C7', validateProduct({ roadmap: roadmap({ rows }), specs }))).toEqual([]);
    });

    it('accepts a shipped row alongside an unshipped one extending it', () => {
      const rows = [
        row({ version: '1.0.0', here: false }),
        row({ version: '1.1.0', status: 'building' }),
      ];
      const specs = [spec({ status: 'shipped v1.0.0 · extended by 1.1.0 (building)' })];
      expect(of('C7', validateProduct({ roadmap: roadmap({ rows }), specs }))).toEqual([]);
    });

    it('rejects a shipped row whose Tag cell was left empty', () => {
      const errors = of('C7', run({ roadmap: { rows: [row({ tag: '' })] } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/Tag is "" but a shipped row must carry "v1\.0\.0"/);
    });

    it('rejects a shipped row still carrying the unshipped placeholder', () => {
      const errors = of('C7', run({ roadmap: { rows: [row({ tag: '—' })] } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/must carry "v1\.0\.0"/);
    });

    it('rejects a Tag naming a version other than the row it sits on', () => {
      const errors = of('C7', run({ roadmap: { rows: [row({ tag: '`v9.9.9`' })] } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/Tag is "v9\.9\.9"/);
    });

    it('rejects an unshipped row already tagged as if it had shipped', () => {
      const rows = [row({ status: 'building', tag: '`v1.0.0`' })];
      const specs = [spec({ status: 'building v1.0.0' })];
      const errors = of('C7', validateProduct({ roadmap: roadmap({ rows }), specs }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/a building row must carry "—"/);
    });
  });
});
