/**
 * product-lint.js — static validation of the product state under `product/`.
 *
 * `product/` is maintained by hand: a roadmap table, an append-only Decision
 * Log, and one living spec per area. Every rule it runs on is prose in
 * `product/AGENTS.md`, and prose drifts silently — a renumbered D-id, a
 * supersede with no flip on the entry it replaces, two `← we are here` markers
 * after a release, a spec header still claiming to be building a version that
 * shipped. None of that breaks a build; it just turns the product state into a
 * plausible-looking lie that the next reader trusts.
 *
 * This linter asserts the mechanical rules pinned in `product/AGENTS.md` (row →
 * header mapping, the governing-row rule, the two supersession forms, the
 * Status ↔ `Tag` pairing) plus the log's numbering invariants.
 *
 * Validates:
 *   - C1  exactly one roadmap row carries the `← we are here` marker — rows are
 *         read outside fenced blocks, so an illustrative table row inside
 *         `## Roadmap` is not a roadmap row: it carries no second marker and it
 *         does not stand in for a table that is not there;
 *   - C2  Decision Log ids are `D-NNN` (zero-padded), ascending outside the
 *         folded `<details>` index, unique, and gap-free from D-001 — read
 *         inside the `## Decision Log` section, so a `### D-NNN` heading
 *         elsewhere in `ROADMAP.md` is prose rather than an entry, and a missing
 *         log section is C6's job rather than a silent zero. That section's own
 *         boundaries are found fence-aware, so a fenced `##` line in a worked
 *         example neither stands in for the log nor truncates it, and the heading
 *         that ends it is read at the indent a reader still sees as a heading, so
 *         an indented `## Appendix` does not leave its decision-shaped headings
 *         inside the log. The entry heading is read
 *         at column 1, and one indented far enough to still render as a heading
 *         (one to three spaces) is reported rather than dropped, so a stray
 *         indent cannot hide an entry in the log's flat structure. The fold's own
 *         `<details>` delimiters are read at that same bound, so an indented
 *         illustration of the fold move neither opens a fold — which would exempt
 *         every live entry below it from the ascending clause — nor closes a real
 *         one early;
 *   - C3  every `Supersedes:` / `Refines:` / `Extends:` is well-formed and names
 *         an earlier decision that exists — a relation-shaped bullet that misses
 *         the canonical form is reported as malformed rather than dropped, and
 *         the detector keys on the three labels, so a label spelled differently
 *         enough is not seen at all — and every `Supersedes:` carries its
 *         flip on the entry it supersedes — bare form ⇒ `Superseded-by: D-NNN`,
 *         clause-scoped form ⇒ `partially superseded by D-NNN`. The pairing is
 *         checked from both ends, so a flip clause with no superseding entry
 *         behind it, or one naming a decision the log does not carry, is
 *         rejected too. A superseded entry's whole `Status:` is then read clause
 *         by clause against the closed vocabulary, so a totally superseded entry
 *         is no longer `Accepted`, no entry dies twice, and no decision both
 *         replaces an entry whole and reverses one of its clauses. An entry
 *         carries exactly one `Status:` line, counted structurally rather than
 *         only on a victim: a second one is reported rather than silently
 *         overwriting the first — otherwise the same self-contradiction is
 *         rejected `·`-separated and accepted newline-separated — and a missing
 *         one is reported too, because an entry with no `Status:` records
 *         nothing about whether it still governs and no later flip has a line to
 *         replace. The fence exemption already covers the counting and needs no
 *         new code: an illustration inside a fence or an indented code block
 *         never becomes an entry at all, so it is never counted. Indentation
 *         short of that is no exemption either — `product-decisions.js`'s
 *         `STATUS_FIELD_RE` reads the ` {0,3}` band a bullet still renders in, so
 *         a flip one space in is counted rather than hidden. `Refines:` and
 *         `Extends:` require no flip;
 *   - C4  every spec's `Status:` header matches its governing roadmap row, and
 *         the row ↔ spec links resolve in both directions — every row links at
 *         least one spec, every spec is linked from some row, and every link
 *         names a spec that exists, so a version cannot be promoted without the
 *         spec it is built from. Those links are read outside code spans, the
 *         way sections are read outside fences, so a link wrapped in backticks
 *         is text a reader cannot follow rather than a link the row carries.
 *         The header is read in the preamble above the
 *         spec's first `##`, fence-aware, so a worked example or a quoted header
 *         line further down is neither mistaken for the header nor allowed to
 *         displace it, and that preamble carries exactly one such header — read
 *         first-wins, a stale header left beside its replacement decided the
 *         verdict by typing order, and read at column 1 a stale header one space
 *         in was not seen at all. Each version occupies exactly one row, which is what
 *         makes "the highest-version one" name a row at all: two rows for one
 *         version leave the governing row decided by table order, and the same
 *         pair then accepts two contradictory headers;
 *   - C5  every D-id a spec cites in `## Decisions` is a zero-padded `D-NNN`
 *         and exists in the log — that section is sliced the same fence-aware
 *         way, so an example `##` heading cannot carry citations out of reach,
 *         and the citation scan skips its fenced lines, so a `D-NNN` inside a
 *         worked example is an illustration rather than a citation. The token
 *         itself is bounded by the identifier alphabet rather than by a word
 *         boundary, because Markdown's emphasis delimiter is a word character:
 *         read at `\b`, `_D-999_` matched nothing at all, so a spec could cite
 *         a decision the log does not carry, in a line every reader sees as a
 *         citation, with no violation;
 *   - C6  sanity floor — at least one roadmap row, one decision, one spec, and
 *         the roadmap's rows sitting under a table that renders: a six-column
 *         header opening on `Version`, and a delimiter row of the same width
 *         directly beneath it. Rows and decisions are read outside fenced
 *         blocks, so an illustration never meets the floor on their behalf, and
 *         an unframed row cannot stand in for the table either — GFM shows it as
 *         a paragraph of literal pipes while every row rule reads it as product
 *         state;
 *   - C7  a roadmap row's `Tag` cell matches its Status — a `shipped` row
 *         carries `vX.Y.Z` for its own version, any other row carries `—`.
 *
 * Three siblings hold what this file is not about, cut one per format. The
 * markdown primitives every rule reads with — the fence-aware `section()`,
 * `unfenced()` and `stripCodeSpans()` — live in `product-markdown.js`, which
 * knows nothing about product state (`stripCodeSpans()` is read from there by
 * `product-roadmap.js`, the one rule whose answer a code span changes). The
 * roadmap table's reader lives in `product-roadmap.js`, and the two rules about
 * the table's own shape rather than about what its rows say travel with it: C4's
 * arity check and C6's framing clause. The Decision Log's reader lives in
 * `product-decisions.js`, and the rules about the log's own shape travel with it
 * too: C2's numbering invariants and C3's relation and status coherence. This
 * file holds the rules that read the parsed state — C1, C4's row↔spec pairing,
 * C5, C6's sanity floor and C7 — plus `validateProduct`, which runs them all.
 *
 * Library tier: pure — no I/O of its own; every rule reads the corpus strings
 * its caller hands it, and a violation is an error string rather than a throw.
 */

const { SECTION_END_RE, section, unfenced } = require('./product-markdown');
const { parseRoadmapRows, HERE_MARKER, ROW_STATUSES } = require('./product-roadmap');
const {
  parseDecisions,
  checkDecisionNumbering,
  checkStatusPresence,
  checkRelations,
} = require('./product-decisions');

// The `Tag` cell an unshipped row carries.
const NO_TAG = '—';
// The one `##` section of a spec this linter reads, sliced the way the two
// sections of `ROADMAP.md` are by their own owners — but no
// rule asserts a spec's headings, so an indented or renamed one empties the slice
// silently, where C6 catches the same read on `ROADMAP.md`.
const SPEC_DECISIONS_HEADING_RE = /^##\s+Decisions\s*$/;
// The spec header line, matched per line rather than against the whole file, so
// the scope in `specStatusHeaders` is what decides which line is the header. Read at
// the ` {0,3}` bound the rest of the linter reads structure at: CommonMark opens a
// block quote at up to three leading spaces, so a `> Status:` line in that band still
// renders as the header a reader trusts and the count below has to see it. At four
// the line is an indented code block, and an illustration again.
const SPEC_STATUS_HEADER_RE = /^ {0,3}>\s*Status:\s*(.+?)\s*$/;
// Matches a citation-shaped token and its trailing identifier characters, so a
// suffixed id (`D-001a`) is reported as malformed rather than skipped. The
// leading `\d` keeps ordinary prose (`D-Bus`) out of the scan. The alphabet is
// letters and digits on both sides rather than `\w`, so `_` is the emphasis
// delimiter it renders as and never a character of the id: `\b` counts `_` as a
// word character, so it never fired between the `_` and the `D` of `_D-999_`
// and the scan skipped the citation whole. The residual runs the other way and
// is the smaller one: an underscore-suffixed id (`D-001_beta`) now reads as a
// clean `D-001` where it used to be reported malformed — a shape nothing
// writes, where emphasising a citation is an ordinary way to write one.
const CITATION_RE = /(?<![0-9A-Za-z])D-(\d+)([0-9A-Za-z]*)/g;

/**
 * The three numbers a roadmap `Version` cell orders by — callers hand it a cell
 * `parseRoadmapRows` already validated as `X.Y.Z`, so there is no fourth
 * component and no `NaN` to reason about. The ordering below and
 * C4's uniqueness key both read this one parse, so no pair of cells can be
 * distinct to one and equal to the other — which is exactly what a leading zero
 * did while uniqueness keyed on the raw string: `01.0.0` and `1.0.0` are two Set
 * keys that compare equal, so the duplicate went unreported and the tie left the
 * governing row decided by table order, the ambiguity the rule exists to reject.
 */
function versionParts(version) {
  return version.split('.').map(Number);
}

/** Semver-ish ordering for roadmap Version cells (`X.Y.Z`). */
function compareVersions(a, b) {
  const av = versionParts(a);
  const bv = versionParts(b);
  for (let i = 0; i < 3; i++) {
    if (av[i] !== bv[i]) return av[i] - bv[i];
  }
  return 0;
}

/** The identity two `Version` cells share when `compareVersions` calls them equal. */
function versionKey(version) {
  return versionParts(version).join('.');
}

/** C7 — the `Tag` cell is the row's Status said a second way; a release fills it. */
function checkRoadmapTags(rows, errors) {
  for (const row of rows) {
    if (!ROW_STATUSES.has(row.status)) continue;
    const expected = row.status === 'shipped' ? `v${row.version}` : NO_TAG;
    if (row.tag !== expected) {
      errors.push(
        `C7 roadmap row ${row.version}: Tag is "${row.tag}" but a ${row.status} row must carry "${expected}"`,
      );
    }
  }
}

/**
 * The `Status:` text of a spec header, with the trailing ROADMAP link dropped.
 *
 * The header is the blockquote of the *preamble* — the lines above the spec's
 * first `##`, where the template puts it — so a `> Status:` further down is
 * prose that neither stands in for a missing header nor displaces the real one
 * above it. Read whole-document, C4 both passed a spec with no header that
 * quoted one later, and failed a spec whose header was right while an example
 * above it was not, quoting text the header does not contain. Fenced lines are
 * dropped here as everywhere else, so a fenced copy of the template is an
 * illustration and a fenced `##` does not end the preamble. An unclosed fence
 * above the header swallows it and C4 reports it missing — fail-closed, the way
 * `section()` is.
 *
 * The boundary spans ` {0,3}`, not column 1, because CommonMark still renders a
 * `##` carrying one to three leading spaces as a heading: read at column 1 the
 * preamble ran past such a heading, and a body blockquote below it stood in for
 * a header the spec does not have. The preamble therefore ends at the shared
 * `SECTION_END_RE`, the same boundary that ends a section, at the bound
 * `DECISION_ANY_RE` in `product-decisions.js` also takes and for the same reason
 * — every boundary a heading *ends* fails open when it is read at column 1. The
 * one column-1 *boundary* read left is the heading that *opens* a section, which
 * fails closed — and C6 rejects the empty slice that read yields for `ROADMAP.md`'s
 * two sections, though not for a spec's `## Decisions`, which has no such backstop
 * and is then checked for nothing (`product/AGENTS.md` states that exception).
 *
 * A *form* stays anchored at column 1 where a wider probe covers the band above it
 * and reports what it catches there instead of dropping it: `DECISION_HEADING_RE`
 * with `DECISION_ANY_RE`, and `product-decisions.js`'s `RELATION_FIELD_RE` with
 * `RELATION_ANY_RE`, which widens past the band to the bullet character, the casing
 * and the spacing around the colon as well. The two `Status:` forms carry no such
 * probe and take the bound themselves instead (`SPEC_STATUS_HEADER_RE` here,
 * `product-decisions.js`'s `STATUS_FIELD_RE` for an entry), so an indented one is
 * counted where it renders rather than reported: read at column 1, a stale header
 * left beside its replacement one space in was invisible, and the count that exists
 * to reject a visibly two-state spec passed it. Four spaces is an indented code
 * block, so an illustrative `##` in the preamble still does not cut it short.
 *
 * Every header in that scope is collected, not the first one: read first-wins, a
 * stale `> Status:` left beside the line meant to replace it decided the verdict
 * by typing order, and the order that reported nothing shipped a spec rendering
 * two states. C3 picks a winner among an entry's duplicate `- Status:` lines
 * because `current.status` feeds the relation and vocabulary checks downstream;
 * C4's header feeds one comparison in `checkSpecHeaders`, so skipping that
 * comparison is available and keeps the appended header a single-error mutant in
 * either order.
 */
function specStatusHeaders(content) {
  const headers = [];
  for (const line of unfenced(content.split('\n'))) {
    if (SECTION_END_RE.test(line)) break;
    const m = line.match(SPEC_STATUS_HEADER_RE);
    if (!m) continue;
    const status = m[1]
      .split('·')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('['))
      .join(' · ');
    headers.push({ status, raw: line.trim() });
  }
  return headers;
}

/**
 * The header a spec must carry, given every roadmap row that links it, sorted
 * ascending by version. The governing row is the last one; a shipped governing
 * row collapses the header, an unshipped one extends the last shipped row.
 */
function expectedSpecStatus(linking) {
  const governing = linking[linking.length - 1];
  if (governing.status === 'shipped') return `shipped v${governing.version}`;
  const shipped = linking.filter((r) => r.status === 'shipped');
  if (shipped.length > 0) {
    const base = shipped[shipped.length - 1];
    return `shipped v${base.version} · extended by ${governing.version} (${governing.status})`;
  }
  return governing.status === 'next' ? 'draft' : `building v${governing.version}`;
}

/**
 * C4 — one row per version: the precondition the governing-row rule rests on.
 *
 * `product/AGENTS.md` calls a spec's governing row "the highest-version one",
 * which names a row only while versions are unique. With two rows for one
 * version the sort in `checkSpecHeaders` is a tie, and `expectedSpecStatus`
 * takes whichever the table happens to list last — so a `shipped 1.0.0` and a
 * `building 1.0.0` linking one spec accept `shipped v1.0.0 · extended by 1.0.0
 * (building)` written one way round and `shipped v1.0.0` the other. Two
 * contradictory green verdicts over one corpus, decided by typing order.
 *
 * The duplicate is reported and the row kept, the way `checkDecisionNumbering`
 * keeps a duplicate `D-id`. Dropping it would take its `← we are here` with it
 * and let a corpus whose two same-version rows are both marked pass C1 at one
 * marker — failing open on the marker rule while closing this one.
 *
 * "The same Version" is `versionKey`, not the cell's text: the `Version`
 * validator admits a leading zero, so `01.0.0` and `1.0.0` are two strings that
 * `compareVersions` calls equal, and a Set of strings let exactly the pair this
 * rule exists to reject through. A row whose cell reads `01.0.0` and no second
 * row for it stays legal and makes its spec's header `shipped v01.0.0` — the
 * header is built from the cell as written, so the two agree; odd to read, but
 * self-consistent, and narrowing what a `Version` cell may say is a separate
 * change from making this rule see the collision.
 */
function checkRoadmapVersions(rows, errors) {
  const seen = new Map();
  for (const row of rows) {
    const key = versionKey(row.version);
    const first = seen.get(key);
    if (first === undefined) {
      seen.set(key, row.version);
      continue;
    }
    const collision = first === row.version ? '' : ` (the earlier row's "${first}" resolves to it)`;
    errors.push(
      `C4 roadmap row ${row.version}: a second row carries this Version${collision}, so the specs it links have no single highest-version governing row`,
    );
  }
}

/** C4 — row ↔ spec links resolve both ways and the header matches the governing row. */
function checkSpecHeaders(rows, specs, errors) {
  const known = new Set(specs.map((s) => s.name));
  for (const row of rows) {
    if (row.specs.length === 0) {
      errors.push(`C4 roadmap row ${row.version}: links no spec, so nothing says what it builds`);
    }
    for (const slug of row.specs) {
      if (!known.has(slug)) {
        errors.push(`C4 roadmap row ${row.version}: links specs/${slug}.md, which does not exist`);
      }
    }
  }
  for (const spec of specs) {
    const linking = rows
      .filter((r) => r.specs.includes(spec.name))
      .sort((a, b) => compareVersions(a.version, b.version));
    if (linking.length === 0) {
      errors.push(`C4 specs/${spec.name}.md: no roadmap row links it, so it has no governing row`);
      continue;
    }
    const headers = specStatusHeaders(spec.content);
    if (headers.length === 0) {
      errors.push(`C4 specs/${spec.name}.md: missing the "> Status:" header line`);
      continue;
    }
    if (headers.length > 1) {
      errors.push(
        `C4 specs/${spec.name}.md: a second "> Status:" header line ("${headers[1].raw}") — a spec carries exactly one, so a second header is reported rather than one silently winning by position`,
      );
      continue;
    }
    const actual = headers[0].status;
    const expected = expectedSpecStatus(linking);
    if (actual !== expected) {
      errors.push(
        `C4 specs/${spec.name}.md: Status header is "${actual}" but its governing roadmap row makes it "${expected}"`,
      );
    }
  }
}

/**
 * The body of a spec's `## Decisions` section, empty when it has none. It takes
 * the same fence-aware slice the roadmap's sections do, so a fenced `## …` in a
 * worked example neither stands in for the section nor cuts it short and drops
 * the citations below it — and its fenced lines are dropped from the body too,
 * so a `D-NNN` shown inside one is an example citation rather than one C5
 * resolves. A spec with no such section cites nothing, which is what an empty
 * body already says.
 */
function decisionsSection(content) {
  return unfenced(section(content, SPEC_DECISIONS_HEADING_RE)).join('\n');
}

/** C5 — a spec may only cite well-formed `D-NNN` ids the log actually carries. */
function checkSpecCitations(entries, specs, errors) {
  const known = new Set(entries.map((e) => e.id));
  for (const spec of specs) {
    for (const m of decisionsSection(spec.content).matchAll(CITATION_RE)) {
      if (m[1].length !== 3 || m[2] !== '') {
        errors.push(
          `C5 specs/${spec.name}.md: cites "${m[0]}", which is not a zero-padded D-NNN id`,
        );
        continue;
      }
      if (!known.has(m[0])) {
        errors.push(`C5 specs/${spec.name}.md: cites ${m[0]}, which is not in the Decision Log`);
      }
    }
  }
}

/**
 * Validate the product state. Pure — takes the file contents, returns a list of
 * error strings (empty = valid). Never throws on malformed input.
 *
 * @param {{roadmap: string, specs: {name: string, content: string}[]}} product
 * @returns {string[]} error messages
 */
function validateProduct({ roadmap = '', specs = [] } = {}) {
  const errors = [];

  const rows = parseRoadmapRows(roadmap, errors);
  const entries = parseDecisions(roadmap, errors);

  const markers = rows.filter((r) => r.here).length;
  if (markers !== 1) {
    errors.push(`C1 expected exactly 1 roadmap row carrying "${HERE_MARKER}", found ${markers}`);
  }

  checkDecisionNumbering(entries, errors);
  checkStatusPresence(entries, errors);
  checkRelations(entries, errors);
  checkRoadmapVersions(rows, errors);
  checkSpecHeaders(rows, specs, errors);
  checkSpecCitations(entries, specs, errors);
  checkRoadmapTags(rows, errors);

  if (rows.length === 0) errors.push('C6 sanity floor: the roadmap table has no rows');
  if (entries.length === 0) errors.push('C6 sanity floor: the Decision Log has no entries');
  if (specs.length === 0) errors.push('C6 sanity floor: specs/ holds no spec');

  return errors;
}

module.exports = {
  validateProduct,
  expectedSpecStatus,
  specStatusHeaders,
};
