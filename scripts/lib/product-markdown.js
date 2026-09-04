/**
 * product-markdown.js — the markdown primitives the product linter reads with.
 *
 * Invisibility and code-span awareness is the one thing every rule in
 * `product-lint.js` shares and the one thing none of them is about: a section is
 * sliced hidden-aware, every parser drops the hidden lines inside the slice, and
 * C4 reads a link outside its code spans. Extracted so the linter file holds
 * rules rather than markdown mechanics, and so the next C-rule lands without
 * pushing it past the 700-line ceiling in
 * `.claude/rules/coding-standards.md` (`docs/plans/check-product-deferred.md`
 * §4 records the split and why it waited).
 *
 * These primitives know nothing about product state — no roadmap row, no `D-id`, no
 * spec header reaches them — so the invisibility rule has one implementation and each
 * rule that needs it keeps saying what it is about.
 *
 * Library tier: pure — no I/O, no throws; every function takes strings and
 * returns strings or arrays.
 */

// A fence-delimiter *candidate*: a run of three or more backticks or tildes
// indented at most three spaces, plus whatever follows it on the line. The run
// and the trailing text are both captured because CommonMark constrains that
// text differently at each end of a block — see `hiddenTracker`, which is what
// decides whether a candidate is a delimiter at all. The indent bound matches
// the one the linter's heading and relation probes use: at four spaces the line
// is an indented code block rather than a delimiter.
const FENCE_RE = /^ {0,3}((?:`{3,})|(?:~{3,}))(.*)$/;

// An HTML comment's opener, read at the same ` {0,3}` bound as FENCE_RE and as the
// linter's heading and relation probes: CommonMark's HTML block type 2 *starts* on a
// line beginning `<!--`, and at four spaces the line is an indented code block, where
// the delimiter is literal text that opens nothing. There is no closing counterpart
// to pair with this one, and its absence is the spec rather than an omission: the
// block *ends* on any line that merely **contains** `-->`, at whatever indent and
// whatever column — which is why `hiddenTracker` closes on `includes` rather than on
// a regex anchored anywhere.
const COMMENT_OPEN_RE = /^ {0,3}<!--/;

// The `##` heading that *ends* a section, read at the same ` {0,3}` bound as
// FENCE_RE and as the linter's heading and relation probes: CommonMark renders a
// `##` carrying one to three leading spaces as a heading, so a reader sees the
// section end there and the slice must too. Read at column 1 this boundary fails
// open — an indented `## Appendix` left the Decision Log running into it, and the
// appendix's `### D-NNN` headings became entries C2 numbered and C5 resolved. At
// four spaces the line is an indented code block, which is content, not a
// heading, and closes nothing. Exported because `specStatusHeaders` in
// `product-lint.js` ends a spec's preamble at this same boundary, and two copies
// of the bound are two things to widen.
const SECTION_END_RE = /^ {0,3}##\s+/;

/**
 * A per-scan invisibility state machine: call the returned predicate with each line
 * in order and it answers whether that line is hidden — a delimiter of a fenced code
 * block or an HTML comment, or content inside one. Every reader below drops exactly
 * those lines, so this is the single place the rule lives.
 *
 * The two forms are one rule, not two: **what a reader cannot see is not product
 * state.** A fence is the form that renders its contents as literal text; a comment
 * is the form that renders nothing at all. The linter owes them the same answer, and
 * for a while it gave them opposite ones. A `D-002` that is absent, and the same
 * entry inside a fence, both report a C2 numbering gap and a C5 unresolved citation;
 * the same entry inside a comment reported nothing — so it counted toward gap-free
 * numbering and resolved a spec's citation off a heading GitHub's own renderer never
 * emits. Whole sections went the same way: a commented roadmap table satisfied C6's
 * framing and its hidden row carried C1, C4 and C7; a commented `## Roadmap` won
 * `section()`'s first-match and displaced the real one below it; a commented
 * `## Appendix` truncated the Decision Log. That is the fail-open direction this
 * file exists to close, and closing it in one tracker is what makes the four rules
 * and both `section()` boundaries agree without any of them saying so.
 *
 * A **fence** delimiter of three or more backticks or tildes opens a block, info
 * string and all (` ```markdown ` is how every example in `product/AGENTS.md`
 * opens one) — with one exception: CommonMark bars a *backtick* opening fence's
 * info string from carrying a backtick, so ` ```js use `foo` here ` opens
 * nothing and is the paragraph it renders as. Tildes carry no such restriction.
 * A block **closes** only on a line whose run is the same character, at least as
 * long as the opening run, and carrying nothing but whitespace after it.
 *
 * Those are the three constraints this tracker applies to a fence. It is not a
 * CommonMark parser: the indent bound is measured from column 1 rather than from a
 * list container, so a fence nested inside a list item is read at its absolute
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
 * A **comment** is the blunter form, and its two conditions are CommonMark's for an
 * HTML block of type 2 rather than anything sharpened here. It opens on a line that
 * *begins* with `<!--` and closes on the first line that *contains* `-->`, both ends
 * included, so a one-line `<!-- note -->` opens and closes in place. Blank lines are
 * what make the hole worth a state machine: they end most HTML blocks and they do
 * **not** end this one, so a comment stays open across the blank line that a roadmap
 * table needs above its header — which is exactly how a commented table came to pass
 * C6's framing clause.
 *
 * One `open` slot holds either kind, and that is load-bearing rather than tidy. Two
 * trackers OR-ed together would both see every line, so a ` ``` ` inside a comment
 * would flip fence state and every line after the comment closed would be read
 * against a fence that never opened. The order below is what keeps the slot honest:
 * a comment is closed before anything else is considered, a comment opens only when
 * nothing is open, and the fence logic runs last, by which point `open` is either
 * null or a fence.
 *
 * A hidden-shaped line that is neither is block content: `~~~` inside a backtick
 * block does not close it, a run shorter than the opening one does not either, and a
 * `<!--` inside a fence opens no comment. Failure stays closed — an unclosed fence or
 * an unterminated comment swallows the rest of its scope, which C6 rejects for
 * `ROADMAP.md`'s two sections.
 *
 * The comment half is scoped to comments, and deliberately not generalized to raw
 * HTML. The discriminator is *does the block render its contents*, not *is it HTML*:
 * CommonMark's HTML blocks 1 and 3-7 pass their contents through to the reader, and
 * `<details>` is the one this corpus depends on — `product-decisions.js` reads the
 * folded index's entries as live product state (`FOLD_OPEN_RE`), so a rule that hid
 * every raw-HTML block would delete the fold. It is scoped to the block form too: an
 * inline `<!-- note -->` sitting mid-line leaves the rest of that line rendering, so
 * the line is kept whole and the comment's own contents are read with it. No line in
 * `product/` writes one, and closing that direction means reading a line's inline
 * spans rather than its opening columns.
 *
 * Call it once per scan. The state is the block a scan is inside, so a tracker
 * shared between scans would carry one document's open fence into the next.
 */
function hiddenTracker() {
  let open = null;
  return function hidden(line) {
    // Closing a comment comes first: inside one, a fence-shaped line is text.
    if (open !== null && open.kind === 'comment') {
      if (line.includes('-->')) open = null;
      return true;
    }
    // Opening one comes next, and only from a closed slot — inside a fence a
    // `<!--` is the literal text the block renders it as.
    if (open === null && COMMENT_OPEN_RE.test(line)) {
      if (!line.includes('-->')) open = { kind: 'comment' };
      return true;
    }
    const m = line.match(FENCE_RE);
    if (!m) return open !== null;
    const [, run, info] = m;
    if (open === null) {
      // Not a fence at all, so it opens nothing and is not itself hidden.
      if (run[0] === '`' && info.includes('`')) return false;
      open = { kind: 'fence', char: run[0], length: run.length };
    } else if (run[0] === open.char && run.length >= open.length && info.trim() === '') {
      open = null;
    }
    return true;
  };
}

/**
 * The lines between a `##` heading and the next one, or `[]` when it is absent.
 *
 * Both boundaries are found hidden-aware: a `##` line inside a fenced block or an
 * HTML comment is an illustration or is on nobody's screen, so it neither opens the
 * section early nor closes it — otherwise a worked example in the log (the shape
 * `product/AGENTS.md` itself uses) would cut the slice short and silently drop every
 * entry below it, and a commented-out `## Roadmap` would win the first match and
 * stand in for the real section under it. Only the boundary scan skips hidden lines;
 * the returned slice is a raw index range, so those lines stay in it and
 * `unfenced()` drops them for every parser that reads a section. An unclosed fence
 * or an unterminated comment therefore swallows the heading and yields `[]` —
 * fail-closed for ROADMAP.md's two sections, which C6 rejects as a corpus with no
 * rows or no decisions, but silent for a spec's `## Decisions`, exactly as a spec
 * that renames or drops that section already is: nothing asserts a spec's headings.
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
  const hidden = hiddenTracker();
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (hidden(lines[i])) continue;
    if (start === -1) {
      if (heading.test(lines[i])) start = i;
      continue;
    }
    if (SECTION_END_RE.test(lines[i])) return lines.slice(start + 1, i);
  }
  return start === -1 ? [] : lines.slice(start + 1);
}

/**
 * The lines of a section a reader can see — the invisibility exemption every parser
 * applies to the raw slice `section()` hands back. The name is the fence half, which
 * came first; the comment half arrived later and is dropped by the same call.
 *
 * A fenced block is an illustration, not product state. Without this a worked
 * example showing a deliberately wrong `- Supersedes : D-001` would hard-fail C3
 * as a malformed relation line, so the log could not document its own rules the
 * way `product/AGENTS.md` does — and, in the other direction, a fenced sample
 * table row would count as a roadmap row and a fenced `- **D-007**` as a spec's
 * citation. A commented block is not even an illustration: it is on nobody's
 * screen, so a commented `### D-002` must no more fill a numbering gap or resolve a
 * citation than a missing one does. Both readers drive `hiddenTracker()`, so where
 * a hidden block starts and ends has one answer for the whole linter — each gets
 * its own tracker, because each is a scan of its own.
 */
function unfenced(lines) {
  return unfencedEntries(lines).map((entry) => entry.line);
}

/**
 * The same lines, each paired with its **index in the slice it came from** — the
 * form a rule needs when it is about where lines sit rather than only what they
 * say.
 *
 * C6's framing clause is the one such rule, and it is why this exists. GFM ends
 * a table at the first blank line or block-level structure, so a header, its
 * delimiter and the rows beneath render as one table only while they occupy
 * consecutive lines. Read off the compressed list `unfenced()` returns, those
 * positions are gone: a blank line, a paragraph or a fenced block between the
 * header and the delimiter closes up, the frame reads as adjacent, and a
 * `## Roadmap` that GitHub itself renders as a paragraph of literal pipes lints
 * green while C1, C4, C6 and C7 go on reading its rows as product state.
 *
 * Positions alone are not enough for the comment half, and that is why it belongs
 * in the tracker rather than here. A comment stays open across a blank line, so a
 * table sitting whole inside one keeps every index consecutive and satisfies this
 * clause exactly as a rendered table does — the frame is intact, the rows are
 * adjacent, and none of it is on the page. Only dropping the lines answers that.
 *
 * `unfenced()` is this with the indices dropped rather than a second scan, so
 * the invisibility rule keeps the single implementation this file exists to give it.
 */
function unfencedEntries(lines) {
  const hidden = hiddenTracker();
  const entries = [];
  lines.forEach((line, index) => {
    if (!hidden(line)) entries.push({ line, index });
  });
  return entries;
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
 *
 * The join is what the neighbours pay for. Dropping a span whole leaves whatever
 * preceded it against whatever followed, so a character the renderer kept apart from a
 * link's opening bracket can arrive against it, and `SPEC_LINK_RE` disqualifies the
 * bracket on a neighbour that was never adjacent. `` !`x`[alpha](specs/alpha.md) `` is
 * the plain form — a literal `!`, a span, a real link — and reaches it as the image
 * form. The other needs an escape as well, which is the one thing this function does
 * not read: `` \` `` opens no span in CommonMark but one here, so a cell writing one is
 * joined around a span that never existed and can strand a backslash the same way.
 * Both fail closed, and no `Spec` cell anyone writes puts a span in either position;
 * the cost and the two ways of paying it are in
 * `docs/plans/check-product-deferred.md` §5, and belong to whoever needs the strip to
 * mean something different.
 */
function stripCodeSpans(text) {
  return text.replace(/(`+)[^\n]*?\1/g, '');
}

module.exports = { SECTION_END_RE, section, unfenced, unfencedEntries, stripCodeSpans };
