/**
 * product-markdown.js — the markdown primitives the product linter reads with.
 *
 * Fence and code-span awareness is the one thing every rule in
 * `product-lint.js` shares and the one thing none of them is about: a section is
 * sliced fence-aware, every parser drops the fenced lines inside the slice, and
 * C4 reads a link outside its code spans. Extracted so the linter file holds
 * rules rather than markdown mechanics, and so the next C-rule lands without
 * pushing it past the 700-line ceiling in
 * `.claude/rules/coding-standards.md` (`docs/plans/check-product-deferred.md`
 * §4 records the split and why it waited).
 *
 * These primitives know nothing about product state — no roadmap row, no `D-id`, no
 * spec header reaches them — so the fence rule has one implementation and each
 * rule that needs it keeps saying what it is about.
 *
 * Library tier: pure — no I/O, no throws; every function takes strings and
 * returns strings or arrays.
 */

// A fence-delimiter *candidate*: a run of three or more backticks or tildes
// indented at most three spaces, plus whatever follows it on the line. The run
// and the trailing text are both captured because CommonMark constrains that
// text differently at each end of a block — see `fenceTracker`, which is what
// decides whether a candidate is a delimiter at all. The indent bound matches
// the one the linter's heading and relation probes use: at four spaces the line
// is an indented code block rather than a delimiter.
const FENCE_RE = /^ {0,3}((?:`{3,})|(?:~{3,}))(.*)$/;

// The `##` heading that *ends* a section, read at the same ` {0,3}` bound as
// FENCE_RE and as the linter's heading and relation probes: CommonMark renders a
// `##` carrying one to three leading spaces as a heading, so a reader sees the
// section end there and the slice must too. Read at column 1 this boundary fails
// open — an indented `## Appendix` left the Decision Log running into it, and the
// appendix's `### D-NNN` headings became entries C2 numbered and C5 resolved. At
// four spaces the line is an indented code block, which is content, not a
// heading, and closes nothing. Exported because `specStatusHeader` in
// `product-lint.js` ends a spec's preamble at this same boundary, and two copies
// of the bound are two things to widen.
const SECTION_END_RE = /^ {0,3}##\s+/;

/**
 * A per-scan fence-state machine: call the returned predicate with each line in
 * order and it answers whether that line is fenced — either a delimiter itself
 * or content inside a block. Both readers below drop exactly those lines, so
 * this is the single place the fence rule lives.
 *
 * A delimiter of three or more backticks or tildes **opens** a block, info
 * string and all (` ```markdown ` is how every example in `product/AGENTS.md`
 * opens one) — with one exception: CommonMark bars a *backtick* opening fence's
 * info string from carrying a backtick, so ` ```js use `foo` here ` opens
 * nothing and is the paragraph it renders as. Tildes carry no such restriction.
 * A block **closes** only on a line whose run is the same character, at least as
 * long as the opening run, and carrying nothing but whitespace after it.
 *
 * Those are the three constraints this tracker applies. It is not a CommonMark
 * parser: the indent bound is measured from column 1 rather than from a list
 * container, so a fence nested inside a list item is read at its absolute
 * indent. Nothing in `product/` nests one that deep.
 *
 * Each was needed, and they leak in opposite directions. Read marker-only, a
 * ` ```not-a-close ` line ended the block early and the illustrative table row
 * below it became a roadmap row — a row no renderer shows, standing in for a
 * table that is not there. A four-backtick block wrapping a three-backtick one —
 * the ordinary way to document a fenced example, which is what
 * `product/AGENTS.md` teaches — was closed by its own inner fence, so the worked
 * example's body was read live and its deliberately wrong `### D-009` became a
 * Decision Log entry. And read without the info-string rule, a prose line that
 * merely opens with three backticks and quotes a code span opened a block that
 * nothing then closed, so the rest of the log was swallowed and the malformed
 * relation and missing `- Status:` below it went unreported — a fence exemption
 * suppressing real errors rather than illustrations.
 *
 * A fence-shaped line that is neither is block content: `~~~` inside a backtick
 * block does not close it, and a run shorter than the opening one does not
 * either. Failure stays closed — an unclosed fence swallows the rest of its
 * scope, which C6 rejects for `ROADMAP.md`'s two sections.
 *
 * Call it once per scan. The state is the block a scan is inside, so a tracker
 * shared between scans would carry one document's open fence into the next.
 */
function fenceTracker() {
  let open = null;
  return function fenced(line) {
    const m = line.match(FENCE_RE);
    if (!m) return open !== null;
    const [, run, info] = m;
    if (open === null) {
      // Not a fence at all, so it opens nothing and is not itself fenced.
      if (run[0] === '`' && info.includes('`')) return false;
      open = { char: run[0], length: run.length };
    } else if (run[0] === open.char && run.length >= open.length && info.trim() === '') {
      open = null;
    }
    return true;
  };
}

/**
 * The lines between a `##` heading and the next one, or `[]` when it is absent.
 *
 * Both boundaries are found fence-aware: a `##` line inside a fenced block is an
 * illustration, so it neither opens the section early nor closes it — otherwise a
 * worked example in the log (the shape `product/AGENTS.md` itself uses) would cut
 * the slice short and silently drop every entry below it. Only the boundary scan
 * skips fenced lines; the returned slice is a raw index range, so the fence lines
 * stay in it and `unfenced()` drops them for every parser that reads a section.
 * An unclosed fence therefore swallows the heading and yields `[]` — fail-closed
 * for ROADMAP.md's two sections, which C6 rejects as a corpus with no rows or no
 * decisions, but silent for a spec's `## Decisions`, exactly as a spec that
 * renames or drops that section already is: nothing asserts a spec's headings.
 * The first matching heading wins: a second `## Decision Log` later in the file
 * is not read.
 *
 * The two boundaries take *different* indent bounds, and the asymmetry is the
 * point rather than an oversight. The **opening** heading is the caller's regex —
 * `DECISION_LOG_HEADING_RE`, `ROADMAP_HEADING_RE`, `SPEC_DECISIONS_HEADING_RE`,
 * all anchored at column 1 — and reading it there fails *closed*: an indented
 * `## Decision Log` yields an empty slice, which C6 rejects the same way it
 * rejects a renamed one. The **closing** heading is `SECTION_END_RE`, which spans
 * ` {0,3}`, the bound a `### D-NNN` heading and a spec's preamble boundary are
 * read at, because reading it at column 1 fails *open*: an indented `## Appendix`
 * left the log running into the appendix below it, whose decision-shaped headings
 * then became entries C2 numbered and C5 resolved — and, in the other direction,
 * pulled appendix prose into a spec's `## Decisions` and invented citations
 * there. Four spaces is an indented code block at either end: it is content, so
 * it neither opens a section nor closes one.
 */
function section(md, heading) {
  const lines = md.split('\n');
  const fenced = fenceTracker();
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (fenced(lines[i])) continue;
    if (start === -1) {
      if (heading.test(lines[i])) start = i;
      continue;
    }
    if (SECTION_END_RE.test(lines[i])) return lines.slice(start + 1, i);
  }
  return start === -1 ? [] : lines.slice(start + 1);
}

/**
 * The lines of a section that sit outside its fenced code blocks — the fence
 * exemption every parser applies to the raw slice `section()` hands back.
 *
 * A fenced block is an illustration, not product state. Without this a worked
 * example showing a deliberately wrong `- Supersedes : D-001` would hard-fail C3
 * as a malformed relation line, so the log could not document its own rules the
 * way `product/AGENTS.md` does — and, in the other direction, a fenced sample
 * table row would count as a roadmap row and a fenced `- **D-007**` as a spec's
 * citation. Both readers drive `fenceTracker()`, so where a block starts and
 * ends has one answer for the whole linter — each gets its own tracker, because
 * each is a scan of its own.
 */
function unfenced(lines) {
  const fenced = fenceTracker();
  return lines.filter((line) => !fenced(line));
}

/**
 * `text` with its code spans removed — the inline counterpart of the fence
 * exemption `unfenced()` applies to blocks. A backtick span renders its contents
 * as literal text, so `` `[alpha](specs/alpha.md)` `` shows a link rather than
 * being one, and C4 must not record a spec as linked from a row a reader cannot
 * navigate from.
 *
 * Only C4 needs it, and the discriminator is what a span does to the cell it
 * sits in: it keeps the text and kills the link. The `Version` and `Tag` cells
 * are text, so their backticks are decoration the parser strips, and C1's marker
 * still reads as `← we are here` inside a span. The `Spec` cell is the one cell
 * whose content must be a link, so it is the one place a span changes the answer.
 *
 * The closing run must match the opening one, the way a fence's does,
 * so a doubled span is not closed by a single backtick inside it. Unbalanced
 * backticks open no span in CommonMark either, and are left alone.
 */
function stripCodeSpans(text) {
  return text.replace(/(`+)[^\n]*?\1/g, '');
}

module.exports = { SECTION_END_RE, section, unfenced, stripCodeSpans };
