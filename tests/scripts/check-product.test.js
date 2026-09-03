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

const { validateProduct } = require('../../scripts/lib/product-lint');

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
  why = 'what & why',
  specCell = specs.map((s) => `[${s}](specs/${s}.md)`).join(' · '),
} = {}) {
  const statusCell = here ? `**${status} ${'← we are here'}**` : `**${status}**`;
  return `| ${version} | ${tag} | milestone | ${statusCell} | ${why} | ${specCell} |`;
}

/** `status: null` omits the `- Status:` line, the way `spec()` omits its header. */
function decision({ id = 'D-001', title = 'a choice', status = 'Accepted', extra = [] } = {}) {
  return [
    `### ${id} — ${title}`,
    '- Date: 2026-01-01',
    '- Version: process',
    ...extra,
    ...(status === null ? [] : [`- Status: ${status}`]),
    '- Decision: the choice, in one sentence.',
    '- Why: the tradeoff a future reader needs.',
    '',
  ].join('\n');
}

/**
 * `intro` and `appendix` sit outside the `## Decision Log` section — before it
 * and after it — so a fixture can put decision-shaped prose where the log is not.
 * `note` sits *inside* the `## Roadmap` section, below the table, so a fixture
 * can put row-shaped lines where the roadmap is. `header` is the table's frame —
 * its header and delimiter rows — so a fixture can serve rows under a broken
 * frame, or none at all. `appendixHeading` is the line that closes the log, so a
 * fixture can indent the boundary the appendix sits behind, and `logHeading` is
 * the line that closes `## Roadmap` and opens the log — the one boundary line
 * that is read at both ends.
 */
function roadmap({
  rows = [row()],
  decisions = [decision()],
  fold = [],
  intro = [],
  note = [],
  appendix = [],
  appendixHeading = '## Appendix',
  logHeading = '## Decision Log',
  header = TABLE_HEADER,
} = {}) {
  const folded =
    fold.length === 0
      ? []
      : ['<details>', '<summary>Superseded</summary>', '', ...fold, '</details>', ''];
  const appended = appendix.length === 0 ? [] : [appendixHeading, '', ...appendix];
  return [
    '# Roadmap — fixture',
    '',
    ...intro,
    '## Roadmap',
    '',
    ...header,
    ...rows,
    ...note,
    '',
    logHeading,
    '',
    ...decisions,
    ...folded,
    ...appended,
  ].join('\n');
}

/**
 * `intro` sits above `## Purpose`, outside the `## Decisions` section; `extra`
 * is appended inside it, below the citations — so a fixture can put
 * decisions-shaped prose on either side of the section boundary. `preamble`
 * sits above the header line, so a fixture can put header-shaped prose there
 * too.
 */
function spec({
  name = 'alpha',
  status = 'shipped v1.0.0',
  cites = [],
  preamble = [],
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
      ...preamble,
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

    it('does not read a fenced table row inside `## Roadmap`', () => {
      // The section boundary is fence-aware, but the rows inside it are read by
      // `unfenced` too — read fence-blind, this illustration would add a second
      // `← we are here` and a link to a spec that does not exist.
      const note = [
        '',
        '```markdown',
        ...TABLE_HEADER,
        row({ version: '9.9.9', status: 'building', specs: ['beta'] }),
        '```',
      ];
      expect(run({ roadmap: { note } })).toEqual([]);
    });

    it('does not read a row indented into a code block inside `## Roadmap`', () => {
      // The silent sibling of the fenced case: read indent-blind, this
      // illustration governs specs/alpha.md and the honest `shipped v1.0.0`
      // header is rejected in favour of a version only the example carries.
      const note = ['', `    ${row({ version: '2.0.0', status: 'building', here: false })}`];
      expect(run({ roadmap: { note } })).toEqual([]);
    });

    it('still reads a row indented one to three spaces, which the table renders', () => {
      // The bound is ` {0,3}`, not column 1: three spaces is not an exemption,
      // so the row is product state and governs the spec it links.
      const note = ['', `   ${row({ version: '2.0.0', status: 'building', here: false })}`];
      const errors = of('C4', run({ roadmap: { note } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/extended by 2\.0\.0 \(building\)/);
    });

    it('ends `## Roadmap` at an indented `## Decision Log`', () => {
      // Both halves of the boundary asymmetry in one corpus. The indented
      // heading does not *open* the log — that read is column 1, and C6 catches
      // the empty log — but it does *close* the roadmap, so the pipe-shaped line
      // below it is not a row. Read at column 1 at both ends, this illustration
      // added a second `← we are here` and a link to a spec that does not exist.
      const errors = run({
        roadmap: {
          logHeading: '  ## Decision Log',
          decisions: [row({ version: '9.9.9', status: 'building', specs: ['beta'] })],
        },
      });
      expect(of('C1', errors)).toEqual([]);
      expect(of('C4', errors)).toEqual([]);
      expect(of('C6', errors)).toContainEqual(
        expect.stringMatching(/the Decision Log has no entries/),
      );
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

    it('does not open the fold at an indented `<details>` illustration', () => {
      // Four spaces is an indented code block, where `<details>` is literal text
      // rather than the HTML block that opens a fold. Read at `\s*` it opened
      // one, exempting every live entry below it from the ascending clause
      // indefinitely — the one C2 clause the fold switches off.
      const decisions = [
        decision({ id: 'D-001' }),
        '    <details>\n',
        decision({ id: 'D-003' }),
        decision({ id: 'D-002' }),
      ];
      expect(of('C2', run({ roadmap: { decisions } }))).toContainEqual(
        expect.stringMatching(/out of order: D-002 follows D-003/),
      );
    });

    it('does not close the fold at an indented `</details>` illustration', () => {
      // The same bound in its false-positive direction: an example of the
      // closing tag, shown indented inside a real fold, ended the fold early and
      // reported entries that are genuinely folded as out of order.
      const decisions = [decision({ id: 'D-001' })];
      const fold = ['    </details>\n', decision({ id: 'D-003' }), decision({ id: 'D-002' })];
      expect(of('C2', run({ roadmap: { decisions, fold } }))).toEqual([]);
    });

    it('still opens the fold at a `<details>` indented one to three spaces', () => {
      // The lower bound, pinned so a regression to `\s*` trips on more than the
      // four-space case: an HTML block opens at three leading spaces at most, and
      // three is still a fold.
      const decisions = [
        decision({ id: 'D-001' }),
        '   <details>\n',
        decision({ id: 'D-003' }),
        decision({ id: 'D-002' }),
      ];
      expect(of('C2', run({ roadmap: { decisions } }))).toEqual([]);
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

    it('does not read a decision heading in an indented section after the log', () => {
      // The section-closing boundary spans ` {0,3}`, the bound a reader still
      // sees a heading at. Read at column 1 this appendix never ended the log,
      // so its illustration became an entry that C2 numbered and C5 resolved —
      // the same corpus above, passing with no errors at all.
      const errors = run({
        roadmap: {
          decisions: [decision({ id: 'D-001' })],
          appendixHeading: '  ## Appendix',
          appendix: [decision({ id: 'D-002', title: 'illustrative, not a real decision' })],
        },
        specs: [spec({ cites: ['D-002'] })],
      });
      expect(of('C2', errors)).toEqual([]);
      expect(of('C5', errors)).toContainEqual(
        expect.stringMatching(/cites D-002, which is not in the Decision Log/),
      );
    });

    it('does not end the log at a `##` inside an indented code block', () => {
      // The upper bound of the same constant: at four spaces the heading is an
      // indented code block, so it closes nothing and the column-1 entry below it
      // is a real log entry. Re-widen the boundary to `\s*` and this goes red.
      const errors = run({
        roadmap: {
          decisions: [decision({ id: 'D-001' })],
          appendixHeading: '    ## Appendix',
          appendix: [decision({ id: 'D-002' })],
        },
        specs: [spec({ cites: ['D-002'] })],
      });
      expect(errors).toEqual([]);
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

    it('rejects an entry with no status line at all', () => {
      // The other half of the same count. Rejecting two while accepting zero
      // reads the rule in one direction only, and zero is the case that leaves
      // a later reversal no line to flip.
      const decisions = [decision({ id: 'D-001', status: null })];
      const errors = of('C3', run({ roadmap: { decisions } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/no "- Status:" line/);
    });

    it('reports a superseded entry with no status line once, not once per superseder', () => {
      // A missing line is a property of the entry, not of each edge into it.
      const decisions = [
        decision({ id: 'D-001', status: null }),
        decision({ id: 'D-002', extra: ['- Supersedes: D-001'] }),
        decision({ id: 'D-003', extra: ['- Supersedes: D-001'] }),
      ];
      const errors = of('C3', run({ roadmap: { decisions } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/D-001: no "- Status:" line/);
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

    it('accepts two rows whose versions differ', () => {
      // The positive side of the uniqueness clause below: a spec extended by a
      // later row is the shape the compound header exists for, and nothing in
      // it is a duplicate.
      const rows = [
        row({ version: '1.0.0', here: false }),
        row({ version: '1.1.0', status: 'building' }),
      ];
      const specs = [spec({ status: 'shipped v1.0.0 · extended by 1.1.0 (building)' })];
      expect(of('C4', validateProduct({ roadmap: roadmap({ rows }), specs }))).toEqual([]);
    });

    it('rejects two rows carrying the same Version', () => {
      // "The highest-version one" names a row only while versions are unique.
      // Read without this clause, both cases below are green — the *same* pair
      // of rows accepting two contradictory headers.
      const rows = [
        row({ version: '1.0.0', here: false }),
        row({ version: '1.0.0', status: 'building' }),
      ];
      const specs = [spec({ status: 'shipped v1.0.0 · extended by 1.0.0 (building)' })];
      const errors = of('C4', validateProduct({ roadmap: roadmap({ rows }), specs }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/a second row carries this Version/);
    });

    it('rejects the same duplicate pair written the other way round', () => {
      // The tie is broken by table order, so the collapsed header is what the
      // reversed pair accepted. One rule has to reject both orders, or the
      // corpus has two truths.
      const rows = [
        row({ version: '1.0.0', status: 'building', here: false }),
        row({ version: '1.0.0' }),
      ];
      const specs = [spec({ status: 'shipped v1.0.0' })];
      const errors = of('C4', validateProduct({ roadmap: roadmap({ rows }), specs }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/a second row carries this Version/);
    });

    it('rejects two rows whose Versions differ only by a leading zero', () => {
      // `Version` admits `\d+`, so `01.0.0` and `1.0.0` are two strings that
      // `compareVersions` calls equal. Keyed on the string, this pair was the
      // duplicate the rule could not see: green written this way round, and a
      // header mismatch written the other — one version in two milestone
      // states, decided by typing order.
      const shipped = row({ version: '01.0.0' });
      const building = row({ version: '1.0.0', status: 'building', here: false });
      const specs = [spec({ status: 'shipped v01.0.0' })];
      const collision =
        /a second row carries this Version \(the earlier row's ".+" resolves to it\)/;
      // Written this way round the pair raised a header mismatch; swapped, the
      // same two rows linted completely green. Both orders must name the pair,
      // and the collision is spelled out — the two cells do not read alike.
      expect(
        of('C4', validateProduct({ roadmap: roadmap({ rows: [shipped, building] }), specs }))[0],
      ).toMatch(collision);
      expect(
        of('C4', validateProduct({ roadmap: roadmap({ rows: [building, shipped] }), specs })),
      ).toEqual([
        `C4 roadmap row 01.0.0: a second row carries this Version (the earlier row's "1.0.0" resolves to it), so the specs it links have no single highest-version governing row`,
      ]);
    });

    it('accepts a lone row whose Version carries a leading zero', () => {
      // Nothing collides, so the cell is read as written and its spec's header
      // says the same — odd, and self-consistent. This rule sees collisions; it
      // is not a `Version` validator.
      const rows = [row({ version: '01.0.0' })];
      const specs = [spec({ status: 'shipped v01.0.0' })];
      expect(validateProduct({ roadmap: roadmap({ rows }), specs })).toEqual([]);
    });

    it('keeps a duplicate row, so its marker still counts for C1', () => {
      // Reported and kept, the way C2 keeps a duplicate `D-id`. Dropped
      // instead, this corpus would pass C1 at one marker while carrying two.
      const rows = [row({ version: '1.0.0' }), row({ version: '1.0.0' })];
      const errors = of('C1', validateProduct({ roadmap: roadmap({ rows }), specs: [spec()] }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/found 2/);
    });

    it('rejects a spec no roadmap row links', () => {
      const specs = [spec(), spec({ name: 'orphan' })];
      const errors = of('C4', validateProduct({ roadmap: roadmap(), specs }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/specs\/orphan\.md: no roadmap row links it/);
    });

    it('rejects a row that links no spec', () => {
      // The other half of "both ways": a promoted version with an em-dash Spec
      // cell is a milestone nothing is written down for, and the spec-side loop
      // never reaches it — the older rows keep every existing spec governed.
      const rows = [
        row({ version: '1.0.0', here: false }),
        row({ version: '1.1.0', status: 'building', specs: [] }),
      ];
      const specs = [spec({ status: 'shipped v1.0.0' })];
      const errors = of('C4', validateProduct({ roadmap: roadmap({ rows }), specs }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/roadmap row 1\.1\.0: links no spec/);
    });

    it('rejects a roadmap link to a spec that does not exist', () => {
      const rows = [row({ specs: ['alpha', 'ghost'] })];
      const errors = of('C4', validateProduct({ roadmap: roadmap({ rows }), specs: [spec()] }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/links specs\/ghost\.md, which does not exist/);
    });

    it('does not count a link wrapped in a code span as a link', () => {
      // A backtick span keeps the text and kills the link: the rendered cell
      // shows `[alpha](specs/alpha.md)` as literal code, so the row navigates
      // nowhere. Read span-blind, both halves of C4 resolve off a table that
      // links nothing.
      const rows = [row({ specCell: '`[alpha](specs/alpha.md)`' })];
      expect(of('C4', validateProduct({ roadmap: roadmap({ rows }), specs: [spec()] }))).toEqual([
        'C4 roadmap row 1.0.0: links no spec, so nothing says what it builds',
        'C4 specs/alpha.md: no roadmap row links it, so it has no governing row',
      ]);
    });

    it('still reads a link whose text is code-styled', () => {
      // The false-positive direction: only the span is dropped, so a link
      // labelled in code — a plausible authoring form — is still a link.
      const rows = [row({ specCell: '[`alpha`](specs/alpha.md)' })];
      const errors = validateProduct({ roadmap: roadmap({ rows }), specs: [spec()] });
      expect(of('C4', errors)).toEqual([]);
    });

    it('rejects a spec with no Status header line', () => {
      const errors = of('C4', run({ specs: [spec({ status: null })] }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/missing the "> Status:" header line/);
    });

    it('does not let a fenced copy of the template stand in for a missing header', () => {
      const specs = [
        spec({ status: null, extra: ['```markdown', '> Status: shipped v1.0.0', '```'] }),
      ];
      const errors = of('C4', validateProduct({ roadmap: roadmap(), specs }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/missing the "> Status:" header line/);
    });

    it('does not read a quoted Status line below the first `##` as the header', () => {
      // Not only fences: the header is the preamble's blockquote, so ordinary
      // quoted prose further down is prose.
      const specs = [spec({ status: null, extra: ['> Status: shipped v1.0.0'] })];
      const errors = of('C4', validateProduct({ roadmap: roadmap(), specs }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/missing the "> Status:" header line/);
    });

    it('reads the real header below a fenced illustration of a different one', () => {
      // The false-positive direction: read whole-document, the fenced example
      // wins and C4 rejects a correct header, quoting text it does not contain.
      const specs = [spec({ preamble: ['```markdown', '> Status: draft', '```', ''] })];
      expect(of('C4', validateProduct({ roadmap: roadmap(), specs }))).toEqual([]);
    });

    it('ends the preamble at an indented `##`, which still renders as a heading', () => {
      // Read at column 1 the preamble ran past this heading, so the blockquote
      // below it stood in for a header the spec does not carry.
      const specs = [
        spec({ status: null, intro: ['  ## Overview', '', '> Status: shipped v1.0.0', ''] }),
      ];
      const errors = of('C4', validateProduct({ roadmap: roadmap(), specs }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/missing the "> Status:" header line/);
    });

    it('does not end the preamble at a `##` inside an indented code block', () => {
      // The bound is ` {0,3}`, not `\s*`: at four spaces the line is an indented
      // code block, so an illustrative heading above the header is not a boundary.
      const specs = [spec({ preamble: ['    ## Purpose', ''] })];
      expect(of('C4', validateProduct({ roadmap: roadmap(), specs }))).toEqual([]);
    });
  });

  describe('the shape of a roadmap row', () => {
    // `\|` is the only way a GFM cell can carry a literal pipe. Read
    // escape-blind, it splits the cell it sits in and every later cell is read
    // from the wrong index — so the row's own `Spec` link goes unseen and an
    // older row keeps governing the spec it names.
    const ESCAPED = 'Pipe filters: `input \\| output` chaining.';

    it('reads the Spec cell of a row whose What & why carries an escaped pipe', () => {
      expect(run({ roadmap: { rows: [row({ why: ESCAPED })] } })).toEqual([]);
    });

    it('rejects a stale header on a spec extended by a row with an escaped pipe', () => {
      const rows = [
        row({ version: '1.0.0', here: false }),
        row({ version: '1.1.0', status: 'building', why: ESCAPED }),
      ];
      const specs = [spec({ status: 'shipped v1.0.0' })];
      const errors = of('C4', validateProduct({ roadmap: roadmap({ rows }), specs }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/extended by 1\.1\.0 \(building\)/);
    });

    it('rejects a row whose unescaped pipe adds a seventh cell', () => {
      const errors = of('C4', run({ roadmap: { rows: [row({ why: 'input | output' })] } }));
      expect(errors[0]).toMatch(/expected 6 columns, found 7/);
    });

    it('rejects a cell ending in an escaped backslash rather than mis-reading it', () => {
      // The escape rule's one blind spot, pinned rather than left latent: `\\|`
      // is an escaped backslash then a real delimiter, but the lookbehind reads
      // it as an escaped pipe. The exact arity is what keeps that fail-closed —
      // the row is rejected, not parsed from columns that shifted left.
      const rows = [
        '| 1.0.0 | `v1.0.0` | milestone | **shipped ← we are here** | C:\\\\| [alpha](specs/alpha.md) |',
      ];
      const errors = of('C4', validateProduct({ roadmap: roadmap({ rows }), specs: [spec()] }));
      expect(errors[0]).toMatch(/expected 6 columns, found 5/);
    });

    it('rejects a row missing its Spec cell', () => {
      // Coverage for a branch that predates the escape fix — `expected 6
      // columns` had no test in either direction — not a regression guard.
      const rows = ['| 1.0.0 | `v1.0.0` | milestone | **shipped ← we are here** | what & why |'];
      const errors = of('C4', validateProduct({ roadmap: roadmap({ rows }), specs: [spec()] }));
      expect(errors[0]).toMatch(/expected 6 columns, found 5/);
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

    it('does not read a citation inside a fenced code block', () => {
      // The neighbouring fenced-`##` case could not reach this: its fenced body
      // carries no D-id, so only the citation below the fence was ever scanned.
      const specs = [
        spec({
          cites: ['D-001'],
          extra: ['```markdown', '- **D-007** — an example citation.', '```'],
        }),
      ];
      expect(of('C5', validateProduct({ roadmap: roadmap(), specs }))).toEqual([]);
    });

    it('ends a spec `## Decisions` at an indented `##`', () => {
      // The same boundary in its false-positive direction: read at column 1 the
      // section ran into this appendix, and prose a reader sees outside it raised
      // two C5 errors against a spec whose citations are clean.
      const specs = [
        spec({
          cites: ['D-001'],
          extra: [
            '',
            '  ## Appendix',
            '',
            'How a citation is written: `- **D-999**`, never `D-001a`.',
          ],
        }),
      ];
      expect(of('C5', validateProduct({ roadmap: roadmap(), specs }))).toEqual([]);
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

    it('is not met by a fenced table row', () => {
      // The floor is a floor of real rows: read fence-blind, an illustration
      // would stand in for a roadmap that has no table at all.
      const note = [
        '',
        '```markdown',
        ...TABLE_HEADER,
        row({ version: '9.9.9', status: 'building', specs: ['beta'] }),
        '```',
      ];
      expect(
        of('C6', validateProduct({ roadmap: roadmap({ rows: [], note }), specs: [spec()] })),
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

    // The rows are only the roadmap while they sit under a table. GFM needs a
    // header and a delimiter of matching width; without them the section renders
    // as a paragraph of literal pipes that every row rule still reads as
    // product state.
    describe("the table's frame", () => {
      it('accepts rows under a six-column header and delimiter', () => {
        expect(of('C6', run())).toEqual([]);
      });

      it('rejects a roadmap holding a data row and no header at all', () => {
        const errors = of(
          'C6',
          validateProduct({ roadmap: roadmap({ header: [] }), specs: [spec()] }),
        );
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/not a 6-column header row starting with "Version"/);
      });

      it('rejects a pipe line above the header, though what follows renders', () => {
        // "Opens on" is literal, and the cost is priced: a second table above
        // the roadmap is reported. Searching for the header instead would
        // accept it — and would accept a data row written above the frame,
        // which GFM shows as a paragraph while every rule here reads it as
        // product state. That is the defect the rule exists to close.
        const header = ['| Legend | Meaning |', '|---|---|', ...TABLE_HEADER];
        const errors = of('C6', validateProduct({ roadmap: roadmap({ header }), specs: [spec()] }));
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/opens on "\| Legend \| Meaning \|"/);
      });

      it('rejects a header with no delimiter row beneath it', () => {
        const header = [TABLE_HEADER[0]];
        const errors = of('C6', validateProduct({ roadmap: roadmap({ header }), specs: [spec()] }));
        expect(errors).toEqual([
          'C6 the roadmap table has no delimiter row under its header, so GFM renders no table',
        ]);
      });

      it('rejects a delimiter narrower than its header', () => {
        // The third input of the family, and the one that used to slip past
        // twice over: the all-dash skip ran before the arity check, so an
        // off-arity delimiter was dropped rather than reported.
        const header = [TABLE_HEADER[0], '|---|---|'];
        const errors = validateProduct({ roadmap: roadmap({ header }), specs: [spec()] });
        expect(of('C6', errors)).toEqual([
          "C6 the roadmap table's delimiter row carries 2 column(s) against a 6-column header, so GFM renders no table",
        ]);
        expect(of('C4', errors)).toEqual([
          'C4 roadmap row "|---|---|": expected 6 columns, found 2',
        ]);
      });

      it('accepts a single-dash delimiter, which GFM renders', () => {
        // `|-|-|` is a legal delimiter row. Read as `-{2,}` this frame would be
        // rejected as no delimiter at all — a rule that fires on a table every
        // renderer draws.
        const header = [TABLE_HEADER[0], '|-|-|-|-|-|-|'];
        expect(validateProduct({ roadmap: roadmap({ header }), specs: [spec()] })).toEqual([]);
      });
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
  describe('where a fenced block starts and ends', () => {
    // The fence exemption every rule rests on. A block opens on a run of three
    // or more backticks or tildes; it closes only on a line whose run is the
    // same character, at least as long, and carries nothing after it. Read
    // marker-only, both halves of that leaked — in opposite directions.
    const LIVE_ROW = row({ version: '9.9.9', status: 'building', specs: ['beta'] });

    it('does not let a fence line carrying an info string close a block', () => {
      // Read marker-only this line closed the block, so the row below it became
      // a roadmap row — one every renderer keeps inside the code block, standing
      // in for a table that is not there.
      const note = ['', '```markdown', ...TABLE_HEADER, '```not-a-close', LIVE_ROW, '```'];
      expect(run({ roadmap: { note } })).toEqual([]);
    });

    /**
     * A `D-002` that is wrong twice over — a malformed relation line and no
     * `- Status:` — so a scope that swallows it turns two C3 errors into
     * silence. `bogus(fence)` puts that entry under whatever fence-shaped line
     * is passed, which is what separates a line that opens a block from one
     * that only looks like it does.
     */
    function bogus(...lines) {
      return roadmap({
        decisions: [
          decision({ id: 'D-001' }),
          [
            ...lines,
            ...decision({ id: 'D-002', status: null, extra: ['- Supersedes : D-001'] }).split('\n'),
          ].join('\n'),
        ],
      });
    }

    it('opens no block on a backtick fence whose info string carries a backtick', () => {
      // CommonMark bars a backtick opening fence's info string from carrying a
      // backtick, so this is a paragraph, not a fence. Read as one, it opened a
      // block nothing closed and the rest of the log went unread — the fence
      // exemption suppressing real errors rather than illustrations.
      const errors = of(
        'C3',
        validateProduct({ roadmap: bogus('```js use `foo` here'), specs: [spec()] }),
      );
      expect(errors).toHaveLength(2);
      expect(errors[0]).toMatch(/malformed relation line "- Supersedes : D-001"/);
      expect(errors[1]).toMatch(/no "- Status:" line/);
    });

    it('still opens a block on a tilde fence whose info string carries a backtick', () => {
      // The restriction is the backtick marker's alone: a tilde fence's info
      // string may carry anything, so this really is an illustration.
      expect(validateProduct({ roadmap: bogus('~~~js use `foo` here'), specs: [spec()] })).toEqual(
        [],
      );
    });

    it('does not let an inner three-backtick block close a four-backtick one', () => {
      // The ordinary way to document a fenced example, which is the shape
      // `product/AGENTS.md` itself teaches by. Read marker-only the inner fence
      // closed the outer block and the illustration below became a real entry.
      const extra = [
        '````markdown',
        '```markdown',
        '### D-009 — an illustration, deliberately wrong',
        '- Supersedes : D-001',
        '- Status: banana',
        '```',
        '````',
      ];
      const decisions = [decision({ id: 'D-001', extra })];
      expect(validateProduct({ roadmap: roadmap({ decisions }), specs: [spec()] })).toEqual([]);
    });

    it('lets a longer fence close a shorter block', () => {
      // The other side of the length rule: `>=`, not `===`. Were this not a
      // close, the block would swallow `## Decision Log` and C6 would fire.
      const note = ['', '```markdown', LIVE_ROW, '````'];
      expect(run({ roadmap: { note } })).toEqual([]);
    });

    it('does not let a `~~~` line close a backtick block', () => {
      const note = ['', '```markdown', '~~~', LIVE_ROW, '~~~', '```'];
      expect(run({ roadmap: { note } })).toEqual([]);
    });

    it('does not read a four-space-indented fence as a delimiter', () => {
      // At four spaces the line is block content, not a close — read `\\s*`, it
      // ended the block and freed the row below it.
      const note = ['', '```markdown', '    ```', LIVE_ROW, '```'];
      expect(run({ roadmap: { note } })).toEqual([]);
    });

    it('tracks each scan on its own, so an unclosed fence does not bleed into the next', () => {
      // Fence state belongs to a scan, not to the module: the roadmap and every
      // spec are read by separate calls, and `specStatusHeader` reads a whole
      // document where the others read a section slice. Held in one shared
      // tracker, this unclosed fence would still be open when the spec is read
      // and its header would come back missing.
      const errors = run({ roadmap: { note: ['', '```markdown'] } });
      expect(of('C4', errors)).toEqual([]);
      expect(of('C6', errors)).toEqual(['C6 sanity floor: the Decision Log has no entries']);
    });

    it('still reads a fence indented one to three spaces as a delimiter', () => {
      // The bound is ` {0,3}`, not column 1: this block opens, so the row is an
      // illustration rather than product state.
      const note = ['', '   ```markdown', LIVE_ROW, '   ```'];
      expect(run({ roadmap: { note } })).toEqual([]);
    });
  });
});
