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
 * `lines` wrapped in a block HTML comment, carrying the blank lines that make the
 * wrapper worth testing. CommonMark keeps `<!-- ... -->` open across a blank line,
 * so what comes back renders as nothing at all while still giving a roadmap table
 * the blank line above its header that C6's framing clause asks for — the shape
 * that let a table nobody can see satisfy four rules.
 *
 * Returns lines, the form `intro`, `note`, `header` and `preamble` take; a fixture
 * putting one in `decisions` or `rows` joins it, the way the fenced fixtures do.
 */
function comment(lines) {
  return ['<!--', '', ...lines, '', '-->'];
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
      // so the row is product state and governs the spec it links. It sits in
      // `rows`, directly under the one above it, because that is the only place
      // the table does render it — moved below the blank line that opens `note`,
      // GFM ends the table before it and C6's adjacency clause reports it
      // instead, which would test the wrong thing.
      const rows = [row(), `   ${row({ version: '2.0.0', status: 'building', here: false })}`];
      const errors = of('C4', run({ roadmap: { rows } }));
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

    it('closes the fold at a same-line `<details></details>`', () => {
      // The element opens and closes in place, so both headings below it render
      // outside it. Read at an anchored closer the opener won and nothing ever
      // cleared `inFold`, so every entry below an empty element went unchecked —
      // the fail-open direction, where the linter stops checking silently.
      const decisions = [
        decision({ id: 'D-001' }),
        '<details></details>\n',
        decision({ id: 'D-003' }),
        decision({ id: 'D-002' }),
      ];
      expect(of('C2', run({ roadmap: { decisions } }))).toContainEqual(
        expect.stringMatching(/out of order: D-002 follows D-003/),
      );
    });

    it('closes the fold at a `</details>` trailing text on a rendering line', () => {
      // The same leak inside a real fold: the element closes where the reader
      // watches it close, wherever on the line the tag lands. Anchored, the tag
      // was invisible and every entry after the fold ended stayed exempt.
      const decisions = [decision({ id: 'D-001' })];
      const fold = [
        decision({ id: 'D-050', status: 'Superseded-by: D-004' }),
        'that is all </details>\n',
        decision({ id: 'D-004' }),
        decision({ id: 'D-003' }),
      ];
      expect(of('C2', run({ roadmap: { decisions, fold } }))).toContainEqual(
        expect.stringMatching(/out of order: D-003 follows D-004/),
      );
    });

    it('does not close the fold at a code-span `</details>` mention', () => {
      // A span keeps the text and kills the markup: GitHub renders this line as
      // `<code>&lt;/details&gt;</code>` and leaves the element open. Reading the
      // closer anywhere on the line has to skip spans, or naming the delimiter in
      // prose ends a real fold and reports the entries below it.
      const decisions = [decision({ id: 'D-001' })];
      const fold = [
        '- Note: the `</details>` delimiter closes this index.\n',
        decision({ id: 'D-003' }),
        decision({ id: 'D-002' }),
      ];
      expect(of('C2', run({ roadmap: { decisions, fold } }))).toEqual([]);
    });

    it('still opens the fold at a one-line `<details><summary>…</summary>`', () => {
      // The opener's side of the position split, pinned because every other fold
      // fixture gives `<details>` a line to itself: it opens the fold from the
      // line's first content, whatever markup shares the line after it.
      const decisions = [
        decision({ id: 'D-001' }),
        '<details><summary>Superseded</summary>\n',
        decision({ id: 'D-003' }),
        decision({ id: 'D-002' }),
      ];
      expect(of('C2', run({ roadmap: { decisions } }))).toEqual([]);
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

    it('does not open the fold at a tag that merely starts with `details`', () => {
      // An HTML tag name ends at whitespace, `/`, `>` or the line's end. Read at
      // `\b` it ended at any non-word character too, so `<details-open>` — a
      // different tag, opening no collapsible block — switched off the ascending
      // clause for every entry below it while the log rendered in written order.
      const decisions = [
        decision({ id: 'D-001' }),
        '<details-open>\n',
        decision({ id: 'D-003' }),
        decision({ id: 'D-002' }),
      ];
      expect(of('C2', run({ roadmap: { decisions } }))).toContainEqual(
        expect.stringMatching(/out of order: D-002 follows D-003/),
      );
    });

    it('still opens the fold at a `<details>` carrying attributes', () => {
      // The other side of that bound, pinned because every other fold fixture
      // opens with a bare `<details>`: narrowing the tag name must not narrow the
      // tag, and `<details open>` is the form a fold left expanded is written in.
      const decisions = [
        decision({ id: 'D-001' }),
        '<details open>\n',
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

    it('rejects a second `- Status:` line indented one to three spaces', () => {
      // A bullet one space in still renders, so the entry a reader sees carries two
      // states. Read at column 1 the appended line was invisible and C3 passed it —
      // the same fail-open the count exists to close, hidden by a stray indent.
      const decisions = [decision({ id: 'D-001', extra: [' - Status: Proposed'] })];
      const errors = of('C3', run({ roadmap: { decisions } }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/a second "- Status:" line/);
    });

    it('does not read a four-space-indented `- Status:` line as a second one', () => {
      // The other side of that bound: four spaces is an indented code block, where
      // the bullet is literal text, so an illustration of the field stays one.
      const decisions = [decision({ id: 'D-001', extra: ['    - Status: Proposed'] })];
      expect(of('C3', run({ roadmap: { decisions } }))).toEqual([]);
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

    it('does not count a Spec cell missing its opening bracket as a link', () => {
      // The same hole one character higher up: a closing bracket with no
      // opening one is not a link construct, so CommonMark renders the cell as
      // literal text. Read bracket-blind, both halves of C4 resolved off a
      // table that links nothing.
      const rows = [row({ specCell: 'alpha](specs/alpha.md)' })];
      expect(of('C4', validateProduct({ roadmap: roadmap({ rows }), specs: [spec()] }))).toEqual([
        'C4 roadmap row 1.0.0: links no spec, so nothing says what it builds',
        'C4 specs/alpha.md: no roadmap row links it, so it has no governing row',
      ]);
    });

    it('does not count a Spec cell whose opening bracket is escaped as a link', () => {
      // The same hole one character further left: the bracket is there, but
      // CommonMark reads the backslash as escaping it, so the cell renders as
      // literal text. Read escape-blind, the match simply started one character
      // later and both halves of C4 resolved off a table that links nothing.
      const rows = [row({ specCell: '\\[alpha](specs/alpha.md)' })];
      expect(of('C4', validateProduct({ roadmap: roadmap({ rows }), specs: [spec()] }))).toEqual([
        'C4 roadmap row 1.0.0: links no spec, so nothing says what it builds',
        'C4 specs/alpha.md: no roadmap row links it, so it has no governing row',
      ]);
    });

    it('still reads a link behind a literal backslash', () => {
      // The false-positive direction of the same fix: backslashes pair off, so
      // `\\[alpha](...)` is a literal backslash followed by a real link, which
      // renders. An escape rule blind to parity would reject it.
      const rows = [row({ specCell: '\\\\[alpha](specs/alpha.md)' })];
      const errors = validateProduct({ roadmap: roadmap({ rows }), specs: [spec()] });
      expect(of('C4', errors)).toEqual([]);
    });

    it('does not count an odd run of backslashes before the bracket as a link', () => {
      // Parity, not the single character before the bracket: three backslashes
      // leave the bracket escaped just as one does, so the cell still renders as
      // literal text.
      const rows = [row({ specCell: '\\\\\\[alpha](specs/alpha.md)' })];
      expect(of('C4', validateProduct({ roadmap: roadmap({ rows }), specs: [spec()] }))).toEqual([
        'C4 roadmap row 1.0.0: links no spec, so nothing says what it builds',
        'C4 specs/alpha.md: no roadmap row links it, so it has no governing row',
      ]);
    });

    it('does not count a Spec cell written as an image as a link', () => {
      // The bracket is unescaped and a reader sees it, but the `!` makes the
      // construct an image: it embeds specs/alpha.md rather than navigating to
      // it. Read image-blind, both halves of C4 resolved off a cell that links
      // nowhere, and the spec got a governing row it could not be reached from.
      const rows = [row({ specCell: '![alpha](specs/alpha.md)' })];
      expect(of('C4', validateProduct({ roadmap: roadmap({ rows }), specs: [spec()] }))).toEqual([
        'C4 roadmap row 1.0.0: links no spec, so nothing says what it builds',
        'C4 specs/alpha.md: no roadmap row links it, so it has no governing row',
      ]);
    });

    it('still reads a link behind an escaped exclamation mark', () => {
      // The false-positive direction of the image rule, and the reason its
      // lookbehind reads the backslash run rather than the single character: an
      // escaped `!` renders as a literal one, so what follows it is a real link.
      const rows = [row({ specCell: '\\![alpha](specs/alpha.md)' })];
      const errors = validateProduct({ roadmap: roadmap({ rows }), specs: [spec()] });
      expect(of('C4', errors)).toEqual([]);
    });

    it('does not count an image behind a literal backslash as a link', () => {
      // Parity again, one construct over: two backslashes are a literal one, so
      // the `!` is unescaped and still opens an image.
      const rows = [row({ specCell: '\\\\![alpha](specs/alpha.md)' })];
      expect(of('C4', validateProduct({ roadmap: roadmap({ rows }), specs: [spec()] }))).toEqual([
        'C4 roadmap row 1.0.0: links no spec, so nothing says what it builds',
        'C4 specs/alpha.md: no roadmap row links it, so it has no governing row',
      ]);
    });

    it('does not count a bare destination as a link', () => {
      const rows = [row({ specCell: '](specs/alpha.md)' })];
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

    it('rejects a stale second Status header left below the real one', () => {
      // Read first-wins the correct header returned and the contradiction below
      // it was never seen, so `check:product` passed a spec rendering two states.
      const specs = [spec({ intro: ['> Status: draft', ''] })];
      const errors = of('C4', validateProduct({ roadmap: roadmap(), specs }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/a second "> Status:" header line \("> Status: draft"\)/);
    });

    it('rejects the same pair with the stale header first', () => {
      // The order that made the defect visible: first-wins reported the *mismatch*
      // here and nothing in the case above, so one corpus got two verdicts decided
      // by typing order. Both orders are the same defect and get the same error.
      const specs = [spec({ preamble: ['> Status: draft', ''] })];
      const errors = of('C4', validateProduct({ roadmap: roadmap(), specs }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/a second "> Status:" header line/);
    });

    it('rejects a second header separated from the first by a blank line', () => {
      // The most visibly two-state render: two blockquotes rather than one.
      const specs = [spec({ intro: ['', '> Status: draft', ''] })];
      const errors = of('C4', validateProduct({ roadmap: roadmap(), specs }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/a second "> Status:" header line/);
    });

    it('rejects a stale second header indented one to three spaces', () => {
      // CommonMark opens a block quote at up to three leading spaces, so both lines
      // render and the spec shows two states. Read at column 1 the indented one was
      // not seen at all and C4 passed the spec on the header above it.
      const specs = [spec({ intro: ['', '  > Status: draft', ''] })];
      const errors = of('C4', validateProduct({ roadmap: roadmap(), specs }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/a second "> Status:" header line/);
    });

    it('rejects the same indented pair with the stale header first', () => {
      // Both orders are the same defect, the way the column-1 pair above is.
      const specs = [spec({ preamble: ['  > Status: draft', ''] })];
      const errors = of('C4', validateProduct({ roadmap: roadmap(), specs }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/a second "> Status:" header line/);
    });

    it('reads a sole header indented one to three spaces instead of calling it missing', () => {
      // The accept side of the bound: the line renders as the header, so it is the
      // header — read and compared against the governing row rather than reported
      // absent while the spec visibly carries one.
      const header = '  > Status: shipped v1.0.0 · [ROADMAP](../ROADMAP.md)';
      const specs = [spec({ status: null, preamble: [header, ''] })];
      expect(of('C4', validateProduct({ roadmap: roadmap(), specs }))).toEqual([]);
    });

    it('does not count a four-space-indented Status line as a second header', () => {
      // The other side of that bound: four spaces is an indented code block, so an
      // unfenced illustration of the header stays an illustration.
      const specs = [spec({ intro: ['', '    > Status: draft', ''] })];
      expect(of('C4', validateProduct({ roadmap: roadmap(), specs }))).toEqual([]);
    });

    it('does not count a fenced illustration of the header as a second header', () => {
      // The false-positive direction the missing-header case cannot reach:
      // collecting every header makes a fenced copy a duplicate candidate for the
      // first time, and the fence exemption is what keeps it an illustration.
      const specs = [spec({ preamble: ['```markdown', '> Status: draft', '```', ''] })];
      expect(of('C4', validateProduct({ roadmap: roadmap(), specs }))).toEqual([]);
    });

    it('does not count a quoted Status line below the first `##` as a second header', () => {
      // Same direction, the other exemption: the count is preamble-scoped, so
      // quoted prose in the body is prose whether or not a header exists above it.
      const specs = [spec({ extra: ['> Status: shipped v1.0.0'] })];
      expect(of('C4', validateProduct({ roadmap: roadmap(), specs }))).toEqual([]);
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

    it('reads a second row whose Version cell says "Version" as a row', () => {
      // The frame's clauses all pass on this row — it opens with a pipe, it is
      // adjacent to the row above it, and it is not `table[0]`, which is the
      // only entry the frame reads as the header. Skipped on cell content it
      // was then dropped before any rule ran, so a second `← we are here`
      // marker, a `Tag` against no version and a link to a spec that does not
      // exist all rendered in the table unread. Skipped by position, the row is
      // read and its `Version` cell fails the semver check.
      const rows = [
        row(),
        '| Version | `v9.9.9` | milestone | **shipped ← we are here** | why | [ghost](specs/ghost.md) |',
      ];
      const errors = of('C4', validateProduct({ roadmap: roadmap({ rows }), specs: [spec()] }));
      expect(errors).toContainEqual(
        expect.stringMatching(/roadmap row "Version": Version must be a semver/),
      );
    });

    it('still skips the header, whose Version cell says the same thing', () => {
      // The other side of the position skip: the one entry that legitimately
      // carries `Version` is `table[0]`, and reading it as a row would report
      // the header of every well-formed roadmap.
      expect(of('C4', run())).toEqual([]);
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

    it.each([
      ['_D-009_', 'underscore emphasis'],
      ['__D-009__', 'underscore bold'],
    ])('reads %s, which %s renders as a citation', (written) => {
      // `_` is a word character, so `\b` never fires between it and the `D`.
      // Read at a word boundary the scan skipped the token whole and the spec
      // cited a decision the log does not carry with no violation.
      const specs = [
        spec({
          cites: ['D-001'],
          extra: [`- ${written} — cites a decision the log does not carry.`],
        }),
      ];
      const errors = of('C5', validateProduct({ roadmap: roadmap(), specs }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/cites D-009/);
    });

    it('does not read the emphasis delimiter as a suffix on the id', () => {
      // The other direction of the same boundary: `_` closes the emphasis, so a
      // recorded decision emphasised this way is the citation it renders as
      // rather than the malformed `D-001_` a trailing `\w*` would report.
      const specs = [spec({ cites: ['D-001'], extra: ['- _D-001_ — pins another choice here.'] })];
      expect(of('C5', validateProduct({ roadmap: roadmap(), specs }))).toEqual([]);
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

      // The head of the frame, the other end of the run. Each input below was
      // rendered through GitHub's own GFM endpoint: a blockquote or a list item
      // directly above the header takes the pipe lines into its own paragraph,
      // so no `<table>` is emitted at all and every row sits inside that block
      // as literal text — while C1, C4, C6 and C7 read those rows as product
      // state. Both linted green before this clause.
      it('rejects a blockquote directly above the header', () => {
        const header = ['> a note', ...TABLE_HEADER];
        const errors = of('C6', validateProduct({ roadmap: roadmap({ header }), specs: [spec()] }));
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/"> a note" sits directly above "\| Version \| Tag \|/);
      });

      it('rejects a list item directly above the header', () => {
        const header = ['- an item', ...TABLE_HEADER];
        const errors = of('C6', validateProduct({ roadmap: roadmap({ header }), specs: [spec()] }));
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/"- an item" sits directly above "\| Version \| Tag \|/);
      });

      it('rejects a paragraph directly above the header, though the table renders', () => {
        // The stricter-than-rendering direction, and the one a later reader is
        // likeliest to challenge: GitHub splits the paragraph and draws the
        // table under it. Reported anyway — the frame no longer opens the
        // section, and telling a paragraph that splits from a blockquote that
        // swallows is a renderer's job, not this rule's.
        //
        // This is the case that pins the message's *whole* text rather than its
        // prefix. The blockquote clause is an example of what the rule protects
        // against, not a diagnosis of this input: read as a diagnosis it sends a
        // reader hunting for a rendering failure that is not there, which is what
        // it said before. The tail carries the rule and the over-strictness.
        const header = ['some prose', ...TABLE_HEADER];
        const errors = of('C6', validateProduct({ roadmap: roadmap({ header }), specs: [spec()] }));
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/"some prose" sits directly above "\| Version \| Tag \|/);
        expect(errors[0]).toMatch(
          /so the header neither opens "## Roadmap" nor carries a blank line above it — a blockquote or a list item there takes the whole table into itself and GFM renders none, and anything else there is reported the same way, whether or not the table under it renders$/,
        );
      });

      it('accepts prose held off the table by a blank line', () => {
        // The green guard the literal reading of "the table is the first thing
        // in the section" would have broken: a blank line closes the paragraph,
        // the table renders, and the corpus's own slice opens on a blank line.
        const header = ['some prose', '', ...TABLE_HEADER];
        expect(validateProduct({ roadmap: roadmap({ header }), specs: [spec()] })).toEqual([]);
      });

      it('accepts a table that opens the section on its first line', () => {
        // The `index === 0` half of the head test, which the builder's blank
        // line under `## Roadmap` puts out of reach. Verified to render.
        const md = [
          '# Roadmap — fixture',
          '',
          '## Roadmap',
          ...TABLE_HEADER,
          row(),
          '',
          '## Decision Log',
          '',
          decision(),
        ].join('\n');
        expect(validateProduct({ roadmap: md, specs: [spec()] })).toEqual([]);
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

      // GFM ends a table at the first blank line or block-level structure, so
      // the frame and its rows are one table only while they occupy consecutive
      // lines. Each input below was rendered through GitHub's own GFM endpoint:
      // a break inside the frame yields one paragraph of literal pipes, and a
      // break under the delimiter yields an empty table with the rows as a
      // paragraph beneath it. All four linted green before this clause.
      it('rejects a blank line between the header and its delimiter', () => {
        const header = [TABLE_HEADER[0], '', TABLE_HEADER[1]];
        const errors = of('C6', validateProduct({ roadmap: roadmap({ header }), specs: [spec()] }));
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/breaks above "\|---\|---\|---\|---\|---\|---\|"/);
      });

      it('rejects a paragraph between the header and its delimiter', () => {
        const header = [TABLE_HEADER[0], 'a note that broke the table', TABLE_HEADER[1]];
        const errors = of('C6', validateProduct({ roadmap: roadmap({ header }), specs: [spec()] }));
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/breaks above "\|---\|---\|---\|---\|---\|---\|"/);
      });

      it('rejects a fenced block between the header and its delimiter', () => {
        // The case the positions have to survive the fence exemption to catch:
        // `unfenced()` drops these three lines, so read off its compressed list
        // the delimiter looks adjacent to the header. A fence is a block-level
        // structure, and GFM ends the table at it.
        const header = [TABLE_HEADER[0], '```markdown', 'an illustration', '```', TABLE_HEADER[1]];
        const errors = of('C6', validateProduct({ roadmap: roadmap({ header }), specs: [spec()] }));
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/breaks above "\|---\|---\|---\|---\|---\|---\|"/);
      });

      it('rejects a row detached from the delimiter by a blank line', () => {
        // The break one line lower: the frame renders, as an empty table, and
        // the row below it is a paragraph — while C1 still counted its `← we
        // are here` and C4 still let it govern a spec.
        const header = [...TABLE_HEADER, ''];
        const errors = of('C6', validateProduct({ roadmap: roadmap({ header }), specs: [spec()] }));
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/breaks above "\| 1\.0\.0 \|/);
      });

      it('accepts a single-dash delimiter, which GFM renders', () => {
        // `|-|-|` is a legal delimiter row. Read as `-{2,}` this frame would be
        // rejected as no delimiter at all — a rule that fires on a table every
        // renderer draws.
        const header = [TABLE_HEADER[0], '|-|-|-|-|-|-|'];
        expect(validateProduct({ roadmap: roadmap({ header }), specs: [spec()] })).toEqual([]);
      });

      // The tail of the run, the last end of the frame left open. GFM asks no
      // outer pipe of a row, so a line the pipe scan skips still renders as one
      // — both inputs below were rendered through GitHub's own GFM endpoint and
      // came back as a second `<tbody>` row. Each linted green before this
      // clause, carrying violations of four rules none of them could see.
      it('rejects a row written without its outer pipes, which GFM still renders', () => {
        const rows = [
          row(),
          '2.0.0 | `v9.9.9` | m | **frobnicated ← we are here** | why | [ghost](specs/ghost.md) |',
        ];
        const errors = validateProduct({ roadmap: roadmap({ rows }), specs: [spec()] });
        expect(of('C6', errors)).toHaveLength(1);
        expect(of('C6', errors)[0]).toMatch(/rows do not end above "2\.0\.0 \| `v9\.9\.9`/);
        // Rejected, not parsed: the row carries a second `← we are here`, a
        // Status outside the vocabulary, a `v9.9.9` Tag on a 2.0.0 row and a
        // link to a spec that does not exist. None of them is reported, because
        // the fix holds the format rather than widening it to read the row —
        // `product/AGENTS.md` defines a roadmap row as six `|`-delimited cells.
        expect(of('C1', errors)).toEqual([]);
        expect(of('C4', errors)).toEqual([]);
        expect(of('C7', errors)).toEqual([]);
      });

      it('rejects a pipe-free line under the last row, which GFM renders as a row', () => {
        const rows = [row(), 'Un-scheduled ideas live in the Backlog'];
        const errors = of('C6', validateProduct({ roadmap: roadmap({ rows }), specs: [spec()] }));
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/rows do not end above "Un-scheduled ideas live in the Backlog"/);
      });

      it('rejects a fence directly under the last row, though the table ends there', () => {
        // The blunt direction, and the one a later reader is likeliest to
        // challenge: GitHub closes the `<table>` at the fence and draws the
        // block below it, so nothing here renders as a row. Reported anyway —
        // the rule is that the run ends at a blank line, and telling the
        // terminators apart from the lines that go on rendering rows is a
        // renderer's job, not this rule's. Pinned whole for that reason: read
        // as a diagnosis of this input the outer-pipe clause is wrong, so the
        // message has to carry the rule and its over-strictness, the way the
        // head clause's does.
        const rows = [row(), '```markdown', 'an illustration', '```'];
        const errors = of('C6', validateProduct({ roadmap: roadmap({ rows }), specs: [spec()] }));
        expect(errors).toEqual([
          'C6 the roadmap table\'s rows do not end above "```markdown": they run from the header ' +
            'to the first blank line, and every line in that run must be written as a ' +
            '"|"-delimited 6-column row — GFM asks no outer pipe of a row, so a line like ' +
            '"1.0.0 | `v1.0.0` | … |" renders inside the table while every rule here reads only ' +
            'lines opening with "|" — and anything else in the run is reported the same way, ' +
            'whether or not it renders as a row. Put a blank line above it',
        ]);
      });

      it('rejects a four-space-indented row under the last row, though the table ends there', () => {
        // The other blunt input, and the one that reads as a contradiction of
        // the ` {0,3}` bound the row scan applies: at four spaces GitHub closes
        // the `<table>` and draws an indented code block. Reported anyway —
        // inside the run the rule is positional, and the indent exemption is
        // about what counts as a row, not about where the run ends. Pinned
        // because four doc surfaces state it and an indent bound added to this
        // clause later would otherwise make all four silently false.
        const rows = [row(), `    ${row({ version: '2.0.0', status: 'building', here: false })}`];
        const errors = of('C6', validateProduct({ roadmap: roadmap({ rows }), specs: [spec()] }));
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/rows do not end above "\| 2\.0\.0 \|/);
      });

      it('accepts the note the corpus holds off the table with a blank line', () => {
        // The green guard: `product/ROADMAP.md` writes a blank line above its
        // `> Un-scheduled ideas…` note, which ends the run. Without this the
        // clause would fire on the live corpus.
        const note = ['', '> a note'];
        expect(validateProduct({ roadmap: roadmap({ note }), specs: [spec()] })).toEqual([]);
      });

      it('accepts a fenced illustration held off the table by a blank line', () => {
        const note = ['', '```markdown', 'an illustration', '```'];
        expect(validateProduct({ roadmap: roadmap({ note }), specs: [spec()] })).toEqual([]);
      });

      it('reports a pipe-less row between two rows through the adjacency clause', () => {
        // The negative control on the clause order: inside the run the pipe
        // lines stop being consecutive, so adjacency reports it first and this
        // clause never runs. Its enumeration names this cause now — a line that
        // renders as a row without being written as one — because it read as a
        // break that ends the table, which is the one thing this input does not
        // do.
        const rows = [row(), 'a pipe-less row', row({ version: '1.1.0', here: false })];
        const errors = of('C6', validateProduct({ roadmap: roadmap({ rows }), specs: [spec()] }));
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/breaks above "\| 1\.1\.0 \|/);
        expect(errors[0]).toMatch(/a line that renders as a row without being written as one/);
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
      // spec are read by separate calls, and `specStatusHeaders` reads a whole
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

  describe('where an HTML comment starts and ends', () => {
    // The other half of the invisibility exemption. A fence renders its contents
    // as literal text; a comment renders nothing at all, and every rule below
    // read one as product state anyway — a table, a log, a spec header and two
    // section boundaries, all of them off lines GitHub's own renderer drops.
    const HIDDEN_ROW = row({ version: '9.9.9', status: 'building', here: false, specs: [] });

    it('reads a commented decision the way it reads an absent one, and a fenced one', () => {
      // The invariant the whole exemption is, stated once. D-002 is missing,
      // then shown in a fence, then hidden in a comment, while a spec cites it
      // throughout: all three are invisible, so all three owe the same verdict.
      // The third returned no errors at all — the commented entry closed C2's
      // gap and resolved C5's citation off a heading nobody can see.
      const forms = {
        absent: [],
        fenced: [['```markdown', decision({ id: 'D-002' }), '```', ''].join('\n')],
        commented: [comment(decision({ id: 'D-002' }).split('\n')).join('\n')],
      };
      const verdicts = Object.fromEntries(
        Object.entries(forms).map(([name, hidden]) => [
          name,
          run({
            roadmap: {
              decisions: [decision({ id: 'D-001' }), ...hidden, decision({ id: 'D-003' })],
            },
            specs: [spec({ cites: ['D-002'] })],
          }),
        ]),
      );
      expect(verdicts.absent).toEqual([
        'C2 Decision Log has a gap: expected D-002, found D-003',
        'C5 specs/alpha.md: cites D-002, which is not in the Decision Log',
      ]);
      expect(verdicts.fenced).toEqual(verdicts.absent);
      expect(verdicts.commented).toEqual(verdicts.absent);
    });

    it('does not read a roadmap table that sits inside a comment', () => {
      // The reported input. The blank line the comment carries above the header
      // satisfies C6's framing clause, so a table on nobody's screen passed the
      // rule that exists to assert the table renders — and C1, C4 and C7 read
      // its row as the corpus's product state.
      // The wrapper is spelled out across the two knobs rather than through
      // `comment()`, because the frame and the rows are separate knobs and the
      // comment has to hold both.
      const errors = run({
        roadmap: { header: ['<!--', '', ...TABLE_HEADER], rows: [row(), '', '-->'] },
      });
      expect(errors).toEqual([
        'C1 expected exactly 1 roadmap row carrying "← we are here", found 0',
        'C4 specs/alpha.md: no roadmap row links it, so it has no governing row',
        'C6 sanity floor: the roadmap table has no rows',
      ]);
    });

    it('does not let a commented Decision Log satisfy the sanity floor', () => {
      const decisions = [comment(decision({ id: 'D-001' }).split('\n')).join('\n')];
      expect(of('C6', run({ roadmap: { decisions } }))).toEqual([
        'C6 sanity floor: the Decision Log has no entries',
      ]);
    });

    it("does not read a spec's `> Status:` header from inside a comment", () => {
      // C4's counterpart to the table case: `specStatusHeaders` scans the whole
      // preamble, so a commented header counted as the one header a spec owes —
      // and a spec that says nothing about its version passed the rule that
      // exists to make it agree with its row.
      const specs = [spec({ preamble: ['<!--', ''], intro: ['-->', ''] })];
      expect(of('C4', run({ specs }))).toEqual([
        'C4 specs/alpha.md: missing the "> Status:" header line',
      ]);
    });

    it('does not let a commented `## Roadmap` stand in for the section below it', () => {
      // `section()` takes the first match, so a commented illustration of the
      // section displaced the real one under it — the same hijack the fence
      // exemption already blocks, through a wrapper that shows even less.
      const intro = [...comment(['## Roadmap', '', ...TABLE_HEADER, HIDDEN_ROW]), ''];
      expect(run({ roadmap: { intro } })).toEqual([]);
    });

    it('does not let a commented `## Appendix` truncate the Decision Log', () => {
      // The closing boundary, where reading a hidden line fails open the way an
      // indented `## Appendix` did: the log ended at a heading nobody sees, and
      // D-002 left the checked history with the citation resolving it.
      const decisions = [
        decision({ id: 'D-001' }),
        comment(['## Appendix']).join('\n'),
        decision({ id: 'D-002' }),
      ];
      expect(run({ roadmap: { decisions }, specs: [spec({ cites: ['D-002'] })] })).toEqual([]);
    });

    it('closes a one-line comment on the line it opens', () => {
      // CommonMark ends the block on the first line *containing* `-->`, the
      // opening line included. Read as an opener alone, this line would leave a
      // comment open that nothing closes, and D-002 would go unread.
      const decisions = [decision({ id: 'D-001' }), '<!-- a note -->', decision({ id: 'D-002' })];
      expect(run({ roadmap: { decisions }, specs: [spec({ cites: ['D-002'] })] })).toEqual([]);
    });

    it('opens no comment on a `<!--` indented four spaces', () => {
      // The bound is ` {0,3}`, the one every structural probe here takes: at
      // four spaces the line is an indented code block, where `<!--` is literal
      // text. Read at `\\s*`, an illustration of the wrapper would swallow the
      // rest of the log.
      const decisions = [decision({ id: 'D-001' }), '    <!--', decision({ id: 'D-002' })];
      expect(run({ roadmap: { decisions }, specs: [spec({ cites: ['D-002'] })] })).toEqual([]);
    });

    it('swallows the rest of its scope when a comment is never closed', () => {
      // Failure stays closed, matching the unclosed-fence posture: GFM really
      // does hide everything below an unterminated `<!--`, so the log is empty
      // and C6's floor is what reports it.
      const decisions = ['<!--', decision({ id: 'D-001' })];
      expect(of('C6', run({ roadmap: { decisions } }))).toEqual([
        'C6 sanity floor: the Decision Log has no entries',
      ]);
    });

    it('does not let a fence delimiter inside a comment open a block', () => {
      // Why the tracker keeps one `open` slot instead of OR-ing two predicates.
      // Two trackers both see every line, so this ` ``` ` would flip fence state
      // and the lines after `-->` would be read against a fence that never
      // opened — taking D-002 with them.
      const decisions = [
        decision({ id: 'D-001' }),
        comment(['```']).join('\n'),
        decision({ id: 'D-002' }),
      ];
      expect(run({ roadmap: { decisions }, specs: [spec({ cites: ['D-002'] })] })).toEqual([]);
    });

    it('still ends the roadmap table where a comment in the row run ends it', () => {
      // The one place invisible and absent part company, and the qualification
      // `product/AGENTS.md` carries because of it. The rows run from the header
      // to the first blank line, and GFM ends a table at an HTML block, so a
      // `<!--` opening inside that run really does move the table's end — C6's
      // framing clause reports the line the way it reports any other non-row
      // line there, where an absent row reports nothing at all. Below the blank
      // line that closes the table it is invisible like any other comment.
      const inRun = of('C6', run({ roadmap: { rows: [row(), '<!-- a note -->'] } }));
      expect(inRun).toHaveLength(1);
      expect(inRun[0]).toMatch(/rows do not end above "<!-- a note -->"/);
      expect(run({ roadmap: { note: ['', '<!-- a note -->'] } })).toEqual([]);
    });

    it('opens no comment on a `<!--` inside a fenced block', () => {
      // The same coupling from the other side: inside a fence the opener is the
      // literal text the block renders, so a fenced illustration of a comment
      // must not open one that runs past the fence's own close.
      const decisions = [
        decision({ id: 'D-001' }),
        ['```markdown', '<!--', '```', ''].join('\n'),
        decision({ id: 'D-002' }),
      ];
      expect(run({ roadmap: { decisions }, specs: [spec({ cites: ['D-002'] })] })).toEqual([]);
    });
  });
});
