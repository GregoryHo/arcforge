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
 * These four know nothing about product state — no roadmap row, no `D-id`, no
 * spec header reaches them — so the fence rule has one implementation and each
 * rule that needs it keeps saying what it is about.
 *
 * Library tier: pure — no I/O, no throws; every function takes strings and
 * returns strings or arrays.
 */

// Opening or closing marker of a fenced code block, capturing which marker it is
// so a `~~~` inside a ``` block cannot close it.
const FENCE_RE = /^\s*(```|~~~)/;

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
 */
function section(md, heading) {
  const lines = md.split('\n');
  let fenceMarker = null;
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const fence = lines[i].match(FENCE_RE);
    if (fence) {
      if (!fenceMarker) fenceMarker = fence[1];
      else if (fence[1] === fenceMarker) fenceMarker = null;
      continue;
    }
    if (fenceMarker) continue;
    if (start === -1) {
      if (heading.test(lines[i])) start = i;
      continue;
    }
    if (/^##\s+/.test(lines[i])) return lines.slice(start + 1, i);
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
 * citation. One implementation keeps `FENCE_RE`'s marker matching (a `~~~`
 * cannot close a ``` block) as the single fence rule.
 */
function unfenced(lines) {
  const out = [];
  let fenceMarker = null;
  for (const line of lines) {
    const fence = line.match(FENCE_RE);
    if (fence) {
      if (!fenceMarker) fenceMarker = fence[1];
      else if (fence[1] === fenceMarker) fenceMarker = null;
      continue;
    }
    if (!fenceMarker) out.push(line);
  }
  return out;
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
 * The closing run must match the opening one, the way `FENCE_RE`'s marker does,
 * so a doubled span is not closed by a single backtick inside it. Unbalanced
 * backticks open no span in CommonMark either, and are left alone.
 */
function stripCodeSpans(text) {
  return text.replace(/(`+)[^\n]*?\1/g, '');
}

module.exports = { section, unfenced, stripCodeSpans };
