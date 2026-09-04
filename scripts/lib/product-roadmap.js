/**
 * product-roadmap.js — the reader for `ROADMAP.md`'s roadmap table.
 *
 * One on-disk format, one owner: the six-column table under `## Roadmap` is
 * parsed here and nowhere else, and the two rules that are about the table's own
 * shape rather than about what its rows say travel with it — C4's arity check
 * and C6's framing clause. Everything downstream (`product-lint.js`) reads the
 * row objects this hands back, so a rule about spec headers or `Tag` cells never
 * touches a pipe.
 *
 * Extracted from `product-lint.js` when the framing clause pushed that file past
 * the 700-line hard limit in `.claude/rules/coding-standards.md`
 * (`docs/plans/check-product-deferred.md` §4 records the ceiling and the earlier
 * split it forced).
 *
 * Library tier: pure — no I/O; the corpus arrives as a string and a violation
 * leaves as an error string pushed onto the caller's list.
 */

const { section, unfencedEntries, stripCodeSpans } = require('./product-markdown');

// The `← we are here` marker C1 counts, read off the `Status` cell here because
// this is the only place a cell is cut.
const HERE_MARKER = '← we are here';
// The closed vocabulary a row's `Status` cell is drawn from.
const ROW_STATUSES = new Set(['next', 'building', 'shipped']);
// A cell of a GFM delimiter row — the second line of a table, which decides
// whether the lines around it render as one at all. A single dash is legal
// (`|-|-|` renders), so the run is `-+`: read as `-{2,}` the framing rule below
// would reject a table every renderer draws.
//
// Unlike the header cell below, this one is matched at any position and stays
// that way: a dash row carries no version, no `← we are here` marker and no
// spec link, so a second one further down the table hides nothing from C1, C4,
// C6 or C7 — it renders as an empty row and is dropped as one.
const DELIMITER_CELL_RE = /^:?-+:?$/;
// The `Version` header cell — what the *first* pipe line of the table has to
// read to be the header. It is a check on `table[0]`, not a way of recognizing a
// header wherever one appears: the table has exactly one, and a later row that
// happens to carry the same cell is a row (see `parseRoadmapRows`).
const HEADER_FIRST_CELL = 'Version';
// The width every line of the table carries: the six columns `product/AGENTS.md`
// defines a roadmap row as.
const ROW_COLUMNS = 6;
// The `##` section of ROADMAP.md this file reads. It is sliced out before it is
// parsed, so a table row anywhere else in the file is prose, not product state.
// It is matched at column 1, and the slice's boundaries are found fence-aware
// (see `section`), so a fenced illustration can neither stand in for the section
// nor cut it short. Column 1 is the bound of the heading that *opens* the slice,
// where an indented one fails closed and C6 catches it; the heading that closes
// it is read at ` {0,3}`, where column 1 would fail open — an indented
// `## Decision Log` never ended `## Roadmap`, so a pipe-shaped line inside the
// log parsed as a roadmap row. See `section`.
const ROADMAP_HEADING_RE = /^##\s+Roadmap\s*$/;
// A link into `specs/`, which is what a `Spec` cell must carry — the *whole*
// link construct, because a closing bracket alone is not one. Read from `](`
// onward, `alpha](specs/alpha.md)` counted as a link although CommonMark renders
// it as literal text, and C4 must not record a spec as linked from a row a reader
// cannot navigate from — the same reason `stripCodeSpans` runs before this match.
// Both halves of C4 rode on it: the row escaped "links no spec", the spec got a
// phantom governing row, and its `Status:` header was judged against that row.
// The opening bracket also has to be one a reader sees: `\[alpha](specs/alpha.md)`
// carries one, but CommonMark reads the backslash as escaping it, so the cell renders
// as literal text while a bare `\[` match simply started one character later and C4
// recorded the spec as linked all the same. The prefix is `(?<!\\)(?:\\\\)*` rather than
// a plain `(?<!\\)` because backslashes pair off: `\\[alpha](...)` is a literal backslash
// followed by a real link, which renders and must keep matching, so the parity of the
// whole run before the bracket decides rather than the single character before it. It
// is the lookbehind `rowCells` reads unescaped pipes with, extended to that run: a
// cell's delimiters are never doubled, so there the plain form is enough.
// The link text is `*` rather than `+` because the code-span strip runs first, so
// a link labelled in code arrives here as `[](specs/alpha.md)`. The trade is
// fail-closed, in the two forms CommonMark allows inside link text that a
// bracket-blind class cannot cross: balanced brackets, `[see [alpha]](...)`, and
// an escaped one, `[a\]b](...)`. Both are links this pattern reports. Every plausible
// authoring form — plain text, code-styled text, several links joined by `·` —
// matches. (The image form `![...](specs/x.md)` still counts, though it embeds
// rather than links — not a Spec cell anyone writes, so it buys no rule.)
// One sibling stays open, and in the opposite direction to that trade: an escaped
// *closing* bracket, `[a\](specs/alpha.md)`, renders as literal text and still matches
// here — a non-link read as a link, where the two forms above are real links missed.
// Every way of shutting it prices a real link as fail-closed in exchange, so it is
// recorded in `docs/plans/check-product-deferred.md` §8 rather than half-fixed.
const SPEC_LINK_RE = /(?<!\\)(?:\\\\)*\[[^\]]*\]\(specs\/([A-Za-z0-9._-]+)\.md\)/g;

/** The lines between `## Roadmap` and the next `##` heading. */
function roadmapSection(roadmap) {
  return section(roadmap, ROADMAP_HEADING_RE);
}

/**
 * The cells of a pipe line, in order.
 *
 * A cell that carries a literal pipe writes it `\|` — the only form GFM has —
 * so the split reads unescaped delimiters and unescapes the cells it hands
 * back. Read escape-blind, such a cell splits in two and every cell after it is
 * read from the wrong index: a `What & why` mentioning `input \| output` moved
 * `Spec` out of reach, the row parsed as linking nothing, and C4 went on
 * governing that spec from an older row. One reader for the framing check and
 * the row loop below, so the header a table is judged by and the row a rule
 * reads are cut the same way.
 */
function rowCells(line) {
  return line
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.replace(/\\\|/g, '|').trim());
}

/**
 * C6 — the roadmap's rows sit under a table that renders.
 *
 * Every rule that reads the table reads a *row*, and until this ran nothing
 * above the rows was required: a `## Roadmap` holding one data row and no header
 * at all, a header with no delimiter under it, or a header over a two-column
 * delimiter each linted green. GFM renders none of the three — a delimiter row
 * is required, and one whose arity differs from the header's un-recognizes the
 * table — so each reaches a reader as a paragraph of literal pipes while C1, C4,
 * C6 and C7 go on reading it as product state. The corruption is visible rather
 * than plausible, which is why this stayed a deferral for several rounds; it is
 * a floor rather than a widening, because "the roadmap table has no rows"
 * already promised a table.
 *
 * The frame is the section's first two pipe lines, the way GFM reads one: a
 * header of six cells opening on `Version`, then a delimiter of the same width.
 * Positional on purpose, and `product/AGENTS.md` says so: the table is the first
 * thing in `## Roadmap`. The tradeoff is a pipe line *above* the header — a
 * second table, say — being reported although what follows it renders.
 * Searching for the header instead would accept that, and would also accept a
 * data row written above the frame: GFM shows such a row as a paragraph while
 * every rule here would go on reading it as product state, which is the defect
 * this rule exists to close. Prose belongs above the heading, and the section's
 * note below the table, where the corpus puts it.
 *
 * "First" is read against the *section*, not against the pipe lines: the header
 * either opens `## Roadmap` or carries a blank line directly above it, and
 * anything else sitting there is reported. Read pipe-only this end of the frame
 * was open, and the input it costs the most on is a blockquote or a list item
 * directly above the header — the pipe lines continue that block's paragraph
 * lazily, so GitHub renders no table at all and every row reaches a reader as
 * literal text inside it while C1, C4, C6 and C7 go on reading them as product
 * state. Confirmed against GitHub's own renderer, along with the two directions
 * this rule is deliberately blunt in: a plain *paragraph* directly above the
 * header splits, so the table below it renders and is reported all the same,
 * and a closing fence directly above the header is reported the same way. Blank
 * is measured after `trim()` — a whitespace-only line is blank to CommonMark and
 * the table under it renders, so strict equality would report a corpus GitHub
 * draws. `index === 0` is the other half of the test rather than the whole of
 * it: the corpus's own slice opens on the blank line under `## Roadmap`.
 *
 * "First two pipe lines" is not the whole frame, and reading it as the whole
 * frame was a hole: GFM ends a table at the first blank line or block-level
 * structure, so the header, the delimiter and every row are one table only while
 * they sit on *consecutive* lines. The pipe lines arrive here already sifted out
 * of the section, so a blank line, a paragraph or a fenced block between any two
 * of them is invisible unless their positions come with them — which is why they
 * do (`unfencedEntries`). Both halves were confirmed against GitHub's own
 * renderer: a break inside the frame renders the whole section as one paragraph
 * of literal pipes, and a break below the delimiter renders an empty table with
 * the rows as a paragraph under it. Each linted green while C1, C4, C6 and C7
 * read those rows as product state — the same defect as a missing delimiter,
 * reached one line later.
 *
 * The frame is not the whole story at the tail either, and reading it as one was
 * the same hole reached from the other end. A table runs from its header to the
 * first blank line, and until then *every* line in that run is a row — GFM asks
 * no outer pipe of one. `2.0.0 | \`v9.9.9\` | m | **frobnicated ← we are here** |
 * why | [ghost](specs/ghost.md)` appended under the last row renders as a full
 * six-cell row, and a pipe-free prose line renders as a one-cell row; neither
 * opens with `|`, so the scan above never collected either and a second
 * `← we are here` marker, a `Status` outside the vocabulary, a `Tag` against the
 * wrong version and a link to a spec that does not exist all sat in the rendered
 * table unread by C1, C4, C6 and C7. So the run is measured positionally rather
 * than off the pipe lines: every line from the header down to the first blank
 * line has to be written as one, and one the scan did not collect is reported.
 * Reported rather than parsed — `product/AGENTS.md` defines a roadmap row as six
 * `|`-delimited cells, and reading a row the corpus does not write that way
 * would widen the format instead of holding it.
 *
 * Blunt in the same direction the head clause is, and priced the same way: a
 * fenced block or a four-space-indented row directly under the last row *does*
 * end the table for a reader — both confirmed against GitHub's own renderer,
 * along with the blockquote, ATX heading and list item that end it too — and is
 * reported all the same. What the rule asks for is the blank line the corpus
 * already writes above the section's note, and telling the terminators apart
 * from the lines that keep rendering rows is a renderer's job, not this rule's.
 *
 * Reported and the rows kept, the way a duplicate `Version` and a duplicate
 * `D-id` are — dropping them would take the `← we are here` marker with them
 * and trade this rule's error for C1's.
 */
function checkRoadmapFraming(table, lines, errors) {
  // An empty `## Roadmap` is the row floor's to report, not this rule's.
  if (table.length === 0) return;
  // The head of the frame: the table opens the section, or a blank line sits
  // between it and whatever comes before.
  const head = table[0].index;
  if (head > 0 && lines[head - 1].trim() !== '') {
    errors.push(
      `C6 the roadmap table does not open the section: "${lines[head - 1].trim()}" sits directly above "${table[0].line}", so the header neither opens "## Roadmap" nor carries a blank line above it — a blockquote or a list item there takes the whole table into itself and GFM renders none, and anything else there is reported the same way, whether or not the table under it renders`,
    );
    return;
  }
  // Adjacency next: a break anywhere in the run means the lines below it are
  // not in the table at all, so judging the frame's shape past one would be
  // reporting on a table the reader never sees.
  const broken = table.find((entry, i) => i > 0 && entry.index !== table[i - 1].index + 1);
  if (broken) {
    errors.push(
      `C6 the roadmap table breaks above "${broken.line}": a line no rule here reads as a row — a blank line, a paragraph, a fenced block, or a line that renders as a row without being written as one — sits between it and the pipe line before it, so either GFM ends the table there and what follows renders as a paragraph of pipes, or the table goes on carrying a row every rule here reads past`,
    );
    return;
  }
  const [header, delimiter] = table;
  if (header.cells[0] !== HEADER_FIRST_CELL || header.cells.length !== ROW_COLUMNS) {
    errors.push(
      `C6 the roadmap table opens on "${header.line}", not a ${ROW_COLUMNS}-column header row starting with "${HEADER_FIRST_CELL}", so its rows render as a paragraph of pipes rather than a table`,
    );
    return;
  }
  if (!delimiter || !delimiter.cells.every((c) => DELIMITER_CELL_RE.test(c))) {
    errors.push(
      'C6 the roadmap table has no delimiter row under its header, so GFM renders no table',
    );
    return;
  }
  if (delimiter.cells.length !== header.cells.length) {
    errors.push(
      `C6 the roadmap table's delimiter row carries ${delimiter.cells.length} column(s) against a ${header.cells.length}-column header, so GFM renders no table`,
    );
  }
  // The tail of the run, last because the clauses above name the shape of a
  // frame this one only measures the extent of. One push and out: a fenced
  // block under the last row would otherwise report every line of it.
  const collected = new Set(table.map((entry) => entry.index));
  for (let i = head; i < lines.length && lines[i].trim() !== ''; i++) {
    if (collected.has(i)) continue;
    errors.push(
      `C6 the roadmap table's rows do not end above "${lines[i].trim()}": they run from the header to the first blank line, and every line in that run must be written as a "|"-delimited ${ROW_COLUMNS}-column row — GFM asks no outer pipe of a row, so a line like "1.0.0 | \`v1.0.0\` | … |" renders inside the table while every rule here reads only lines opening with "|" — and anything else in the run is reported the same way, whether or not it renders as a row. Put a blank line above it`,
    );
    return;
  }
}

/**
 * Parse the roadmap table. Pushes structural errors onto `errors` and returns
 * the rows it could read. Read outside fenced blocks, so an illustrative table
 * row inside `## Roadmap` is not a roadmap row.
 *
 * The arity check is exact rather than a floor — a row that does not resolve to
 * six cells is rejected instead of read from indexes that may have shifted,
 * which is also what catches the one input the escape rule in `rowCells` cannot
 * see through: a cell ending in a literal backslash makes the delimiter after it
 * look escaped. It runs *before* the header and delimiter lines are skipped, so
 * an off-arity delimiter is reported rather than dropped by an all-dash test
 * that never looked at how many cells it had.
 *
 * The two skips under it are not symmetric, and deliberately: the delimiter is
 * recognized by shape anywhere, the header only at `table[0]`. See their
 * constants above and the comment at the header skip.
 *
 * The scan is indent-bounded the way the log's heading and relation probes are:
 * a row indented four spaces or more is an indented code block, so it is an
 * illustration rather than product state. Read indent-blind, such a row still
 * became a spec's governing row and forced its `Status:` header to a version
 * that exists only in the example — the honest header rejected, the phantom one
 * accepted. One to three spaces is not an exemption: the row still renders in
 * the table.
 *
 * @returns {{version: string, tag: string, status: string, here: boolean, specs: string[]}[]}
 */
function parseRoadmapRows(roadmap, errors) {
  const table = [];
  // `index` is the line's position in the section slice, which is what C6's
  // head and adjacency clauses read against; a fenced line is dropped rather
  // than renumbered, so
  // a fenced block between two pipe lines shows up as the break it is.
  const lines = roadmapSection(roadmap);
  for (const { line: raw, index } of unfencedEntries(lines)) {
    if (!/^ {0,3}\|/.test(raw)) continue;
    const line = raw.trim();
    table.push({ line, cells: rowCells(line), index });
  }
  checkRoadmapFraming(table, lines, errors);

  const rows = [];
  for (const [position, { line, cells }] of table.entries()) {
    if (cells.length !== ROW_COLUMNS) {
      errors.push(`C4 roadmap row "${line}": expected 6 columns, found ${cells.length}`);
      continue;
    }
    if (cells.every((c) => DELIMITER_CELL_RE.test(c))) continue;
    // The header is skipped by *position*, not by cell content. Skipped on
    // content alone, a second row whose `Version` cell reads `Version` was
    // dropped here silently while every clause of the framing rule above passed
    // it: it opens with a pipe, sits adjacent to the row before it, and is not
    // `table[0]`, which is the only entry the frame reads as a header. The row
    // rendered — a second `← we are here` marker, a `Tag` against no version, a
    // link to a spec that does not exist — and C1, C4, C6 and C7 never saw it.
    // Position is what `checkRoadmapFraming` already means by "the header", so
    // reading it the same way here is what closes the gap; the content test
    // stays alongside it so that when the frame is broken and `table[0]` is not
    // the header, the real header below is read as the malformed row it then is
    // rather than silently skipped on top of an already-reported frame.
    if (position === 0 && cells[0] === HEADER_FIRST_CELL) continue;
    const version = cells[0].replace(/`/g, '').trim();
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      errors.push(`C4 roadmap row "${cells[0]}": Version must be a semver X.Y.Z`);
      continue;
    }
    const here = cells[3].includes(HERE_MARKER);
    const status = cells[3].replace(HERE_MARKER, '').replace(/\*/g, '').trim();
    if (!ROW_STATUSES.has(status)) {
      errors.push(
        `C4 roadmap row ${version}: unknown Status "${status}" (expected next | building | shipped)`,
      );
    }
    const tag = cells[1].replace(/`/g, '').trim();
    const specs = [...stripCodeSpans(cells[5]).matchAll(SPEC_LINK_RE)].map((m) => m[1]);
    rows.push({ version, tag, status, here, specs });
  }
  return rows;
}

module.exports = { parseRoadmapRows, HERE_MARKER, ROW_STATUSES };
