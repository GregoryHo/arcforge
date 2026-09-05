/**
 * product-decisions.js — the reader for `ROADMAP.md`'s Decision Log.
 *
 * One on-disk format, one owner: the `## Decision Log` section — its
 * `### D-NNN` entries, their `Status:` and relation fields, and the folded
 * `<details>` index at its bottom — is parsed here and nowhere else, and the
 * rules that are about the log's own shape rather than about what a spec does
 * with it travel with it: C2's numbering invariants and C3's relation and
 * status coherence. Everything downstream (`product-lint.js`) reads the entry
 * objects this hands back, so C5's citation scan never looks at a heading.
 *
 * Extracted from `product-lint.js` when the header-skip fix and the row-run
 * clause before it pushed that file past the 700-line hard limit in
 * `.claude/rules/coding-standards.md` — the third time that ceiling has forced a
 * cut here (`docs/plans/check-product-deferred.md` §4 records all three).
 *
 * Library tier: pure — no I/O; the corpus arrives as a string and a violation
 * leaves as an error string pushed onto the caller's list.
 */

const { section, unfenced, stripCodeSpans } = require('./product-markdown');

// CommonMark lets an ATX heading carry up to three leading spaces; at four — as
// measured from column 1, and the log nests no headings under list items — it is
// an indented code block, where `### D-NNN` is not a heading at all and must stay
// unread. So the candidate detector spans ` {0,3}`, not `\s*`, while the canonical
// form stays anchored at column 1 — the indent probe is what turns a heading the
// reader can see into a report instead of a silent drop.
const DECISION_HEADING_RE = /^###\s+D-(\d{3})\s+—\s+\S/;
const DECISION_ANY_RE = /^ {0,3}###\s+D-/;
const DECISION_INDENT_RE = /^ {1,3}###/;
// The entry's status field. Read at the same ` {0,3}` bound as the heading probe
// above and as `SPEC_STATUS_HEADER_RE`, the header's counterpart in a spec: a bullet
// one to three spaces in still renders as a bullet a reader trusts, so a flip
// appended beside the line it replaces is counted wherever it renders rather than
// hidden by a stray indent. At four the line is an indented code block again.
//
// The value is captured at `(.*?)`, not `(.+?)`, because the count is over the
// lines a reader sees: `- Status:` with nothing after the colon is a status line
// whether or not it carries a value, so whether the value is empty is decided
// after the line has been counted rather than by whether the line matched at all.
// Read at `(.+?)` a bare second field was not a line, so it never reached the
// duplicate report — while the same field padded with trailing spaces backtracked
// into capturing one of them and passed as a value, leaving three behaviours for
// two adjacent shapes. The surrounding `\s*` collapse every whitespace-only value
// to exactly `''`, so emptiness is a string comparison downstream, not a trim.
const STATUS_FIELD_RE = /^ {0,3}-\s+Status:\s*(.*?)\s*$/;
const RELATION_FIELD_RE =
  /^-\s+(Supersedes|Refines|Extends):\s+D-(\d{3})(\s*\(clause\s+\d+\))?\s*$/;
// Candidate-shaped: any markdown bullet whose field label is one of the three
// relation labels, however it is cased or spaced around the colon. Wider than
// RELATION_FIELD_RE on purpose — the strict form is what reports these, so a
// near-miss (`- Supersedes : D-001`, `* refines: D-001`) is rejected, not
// silently dropped. A misspelled label stays out of reach: matching on the value
// instead would false-fire on the prose fields that legitimately cite a `D-id`.
// The indent is bounded the way the heading probe above is: a relation field sits
// at column 1, so a bullet four or more spaces deep is a nested or illustrative
// line rather than a field, and stays unread instead of raising a bogus C3 —
// whatever markdown makes of it.
const RELATION_ANY_RE = /^ {0,3}[-*+]\s+(?:supersedes|refines|extends)\s*:/i;
// The folded index's delimiters, bounded the way the two probes above are: an
// HTML block opens at three leading spaces at most, and at four the line is an
// indented code block rather than HTML. See `parseDecisions` for both directions
// this leaked in when it was read at `\s*`.
//
// The opener also has to end where an HTML tag name ends — at whitespace, `/`,
// `>` or the line's end. Read at `\b`, it ended at any non-word character, so
// `<details-open>` opened the fold: a hyphen is a word boundary, but the tag it
// names is not `details` and opens no collapsible block, leaving the entries
// below it exempt from C2's ascending clause while the log renders in the order
// it is written.
//
// The two delimiters take different *positions* on the line, and only the indent
// bound is shared. The opener stays anchored: it must be the line's first content,
// because a missed opener fails closed — a genuinely folded entry is reported
// rather than exempted. The closer is found anywhere on a rendering line, the
// opener's own line included, because a missed closer fails open: `inFold` sticks
// and every entry below the element the reader watched close goes unchecked. Read
// anchored, `<details></details>` opened a fold that never existed for the render
// and `that is all </details>` never ended one that did. This mirrors the comment
// rule in `product-markdown.js`, which closes on any line *containing* `-->`,
// including the opening line itself.
//
// `(?![ \t])` is what holds the indent bound on the line's start, and is not
// removable: without it `.*` eats the leading whitespace and a four-space
// `</details>` illustration closes a real fold again.
const FOLD_OPEN_RE = /^ {0,3}<details(?=[\s/>]|$)/i;
const FOLD_CLOSE_RE = /^ {0,3}(?![ \t]).*<\/details>/i;
// The closed vocabulary a decision's `Status:` clauses are drawn from. A live
// clause says the decision still governs; a flip clause says how much of it died.
const DECISION_LIVE_STATUS = new Set(['Accepted', 'Proposed']);
const TOTAL_FLIP_RE = /^Superseded-by: D-(\d{3})$/;
const PARTIAL_FLIP_RE = /^partially superseded by D-(\d{3})$/;
// The Decision Log section of ROADMAP.md — the one section this file reads, the
// roadmap table's being `product-roadmap.js`'s. It is sliced out
// before it is parsed, so a `### D-NNN` heading anywhere else in the file is
// prose, not product state. It is matched at column 1, and the slice's
// boundaries are found fence-aware (see `section`), so a fenced illustration can
// neither stand in for the section nor cut it short. Column 1 is the bound of the
// heading that *opens* the slice, where an indented one fails closed and C6
// catches it; the heading that closes it is read at ` {0,3}` by `SECTION_END_RE`,
// where column 1 would fail open — see `section`.
const DECISION_LOG_HEADING_RE = /^##\s+Decision Log\s*$/;

/**
 * Parse the Decision Log into entries. The log is the `## Decision Log` section,
 * not the whole file — the section is sliced out first, so a `### D-NNN` heading
 * in an intro or a later appendix is prose, never an entry. `inFold` marks the
 * entries parked in the folded `<details>` index at the bottom of the log — they
 * keep their place in the numbering but sit outside the ascending-order
 * requirement.
 *
 * An unclosed `<details>` at column 1 is not reported. GFM genuinely folds
 * everything below it, and `product/AGENTS.md` puts the fold at the bottom of the
 * log, so a fold running to the end of the section is the documented shape — this
 * file reads what markdown renders, and a rule against it would flag a document
 * whose render really is a fold. What the leaks needed was the indent bound on
 * both delimiters and, on the closer alone, the whole line rather than its
 * opening columns.
 */
function parseDecisions(roadmap, errors) {
  const entries = [];
  let inFold = false;
  let current = null;
  for (const line of unfenced(section(roadmap, DECISION_LOG_HEADING_RE))) {
    // The fold's delimiters are read at the bound every other structural line
    // is: at four columns or more — and a leading tab is four — the line is an
    // indented code block, where `<details>` is literal text rather than the
    // HTML block that opens a fold, so it neither opens one nor closes one. Read
    // at `\s*` both leaked, in opposite directions: an indented `<details>` shown
    // as an example exempted every live entry below it from C2's ascending
    // clause, and an indented `</details>` shown as one closed a real fold early,
    // reporting entries that are genuinely folded as out of order.
    //
    // The close test runs second, so a line carrying both delimiters nets out
    // closed — which is what `<details></details>` renders as. It reads the line
    // with its code spans stripped, because a span keeps the text and kills the
    // markup: `` `</details>` `` renders as literal text inside an element that
    // stays open. That strip is escape-blind and joins its neighbours the way
    // `docs/plans/check-product-deferred.md` §5 prices, so `` <`x`/details> ``
    // closes a fold the reader watched stay open — the fail-closed direction,
    // where a folded entry is reported rather than exempted.
    if (FOLD_OPEN_RE.test(line)) inFold = true;
    if (FOLD_CLOSE_RE.test(stripCodeSpans(line))) inFold = false;

    if (DECISION_ANY_RE.test(line)) {
      const m = line.match(DECISION_HEADING_RE);
      if (!m) {
        errors.push(
          DECISION_INDENT_RE.test(line)
            ? `C2 indented Decision Log heading: "${line.trim()}" (a heading must start in column 1)`
            : `C2 malformed Decision Log heading: "${line.trim()}" (expected "### D-NNN — <title>")`,
        );
        current = null;
        continue;
      }
      current = {
        id: `D-${m[1]}`,
        num: Number(m[1]),
        inFold,
        status: null,
        statusLines: 0,
        statusRaw: null,
        relations: [],
      };
      entries.push(current);
      continue;
    }
    if (!current) continue;
    const status = line.match(STATUS_FIELD_RE);
    if (status) {
      // Last-wins on purpose. First-wins would report the duplicate *and* claim
      // the flip is missing on an entry that carries it one line down, which
      // invites a third `Status:` line; last-wins keeps the appended flip a
      // single-error mutant. Last *non-empty* wins, so an empty field appended
      // below a valued one stays a single-error mutant too rather than erasing
      // the value and adding a second error about the line it replaced.
      //
      // The count runs on `statusLines`, not on `status`, because a line whose
      // value is empty is still a line: keyed on `status` the pair `- Status:`
      // then `- Status: Accepted` reported nothing, since nothing had been
      // recorded when the second line arrived.
      if (current.statusLines > 0) {
        errors.push(
          `C3 ${current.id}: a second "- Status:" line ("${line.trim()}") — an entry carries exactly one, so a flip appended beside the line it replaces is reported rather than silently winning`,
        );
      }
      current.statusLines += 1;
      if (status[1] === '') {
        current.statusRaw = line.trim();
      } else {
        current.status = status[1];
      }
    }
    if (RELATION_ANY_RE.test(line)) {
      const rel = line.match(RELATION_FIELD_RE);
      if (!rel) {
        errors.push(
          `C3 ${current.id}: malformed relation line "${line.trim()}" (expected "- Supersedes|Refines|Extends: D-NNN", optionally "(clause N)")`,
        );
        continue;
      }
      current.relations.push({ kind: rel[1], target: Number(rel[2]), clause: !!rel[3] });
    }
  }
  return entries;
}

/** C2 — zero-padded, unique, ascending outside the fold, gap-free from D-001. */
function checkDecisionNumbering(entries, errors) {
  const seen = new Map();
  for (const e of entries) {
    if (seen.has(e.num)) {
      errors.push(`C2 duplicate Decision Log id ${e.id}`);
    } else {
      seen.set(e.num, e);
    }
  }
  let prev = 0;
  for (const e of entries.filter((x) => !x.inFold)) {
    if (e.num <= prev) {
      errors.push(
        `C2 Decision Log is out of order: ${e.id} follows D-${String(prev).padStart(3, '0')}`,
      );
    }
    prev = Math.max(prev, e.num);
  }
  const nums = [...seen.keys()].sort((a, b) => a - b);
  nums.forEach((num, i) => {
    if (num !== i + 1) {
      errors.push(
        `C2 Decision Log has a gap: expected D-${String(i + 1).padStart(3, '0')}, found D-${String(num).padStart(3, '0')}`,
      );
    }
  });
}

/**
 * C3 — the other half of the one-`Status:`-line count. Rejecting a second line
 * while accepting none applies the same structural rule in one direction only:
 * an entry with no `Status:` records nothing about whether it still governs, and
 * a later reversal finds no line to flip. Counting needs no vocabulary, so this
 * runs on every entry — unlike the *value* check below, which stays scoped to
 * entries something supersedes (D-006 records that scope as a deliberate residual).
 *
 * Three states, not two, because a line can be present and still record nothing:
 * no line at all, a line with nothing after the colon, and a line with a value.
 * The middle one gets its own message rather than reusing the first — a line the
 * reader can see must not be reported as absent, or the fix the message asks for
 * (add a `Status:` line) is one the entry already has.
 */
function checkStatusPresence(entries, errors) {
  for (const e of entries) {
    if (e.status !== null) continue;
    errors.push(
      e.statusLines === 0
        ? `C3 ${e.id}: no "- Status:" line — an entry carries exactly one, so a decision that never records whether it still governs is reported rather than read as live`
        : `C3 ${e.id}: a "- Status:" line with nothing after the colon ("${e.statusRaw}") — a line that records nothing about whether the decision still governs is reported rather than read as live`,
    );
  }
}

/** A decision `Status:` split into its `·`-separated clauses. */
function statusClauses(status) {
  return status
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * C3 — a superseded entry's `Status:` as a whole has to stay coherent, not just
 * contain the right phrase somewhere: every clause comes from the closed
 * vocabulary, a decision dies at most once, a totally superseded one has stopped
 * being live, a partially superseded one keeps the live clause that still
 * governs the rest of it, and one decision does not both replace it whole and
 * reverse a clause of it — the two forms mean different things, so they cannot
 * both hold for one superseder/victim pair.
 */
function checkSupersededStatus(victim, errors) {
  const clauses = statusClauses(victim.status);
  const unknown = clauses.find(
    (c) => !DECISION_LIVE_STATUS.has(c) && !TOTAL_FLIP_RE.test(c) && !PARTIAL_FLIP_RE.test(c),
  );
  if (unknown) {
    errors.push(
      `C3 ${victim.id}: Status carries "${unknown}", which is not one of Accepted | Proposed | Superseded-by: D-NNN | partially superseded by D-NNN`,
    );
    return;
  }
  const totals = clauses.filter((c) => TOTAL_FLIP_RE.test(c));
  const live = clauses.filter((c) => DECISION_LIVE_STATUS.has(c));
  // Each relation edge only ever asks whether its own flip clause is present, so
  // a bare and a clause-scoped supersession from one decision both go green
  // independently. The contradiction is a property of the pair, so it is caught
  // here. Keys on the flip's `D-id`, never on a clause number — two clause-scoped
  // flips from *different* decisions stay legal.
  const partialIds = new Set(
    clauses.filter((c) => PARTIAL_FLIP_RE.test(c)).map((c) => c.match(PARTIAL_FLIP_RE)[1]),
  );
  const bothForms = totals.map((c) => c.match(TOTAL_FLIP_RE)[1]).find((n) => partialIds.has(n));
  if (bothForms) {
    errors.push(
      `C3 ${victim.id}: Status is "${victim.status}" — D-${bothForms} cannot both replace it whole and reverse one clause of it; the two supersession forms are exclusive for one superseder/victim pair`,
    );
  }
  if (totals.length > 1) {
    errors.push(
      `C3 ${victim.id}: Status is "${victim.status}" — a decision dies once, so it carries at most one "Superseded-by:"`,
    );
  } else if (totals.length === 1 && live.length > 0) {
    errors.push(
      `C3 ${victim.id}: Status is "${victim.status}" — a totally superseded decision is no longer "${live[0]}"`,
    );
  } else if (totals.length === 0 && live.length !== 1) {
    errors.push(
      `C3 ${victim.id}: Status is "${victim.status}" — a partially superseded decision still governs the rest of itself, so it keeps exactly one "Accepted" (or "Proposed")`,
    );
  }
}

/**
 * C3 — the mirror of the pairing below. Walking only from `Supersedes:` outward
 * validates the half-done edit in one direction; the other half — a flip clause
 * with no superseding entry behind it, or one naming a decision that is not in
 * the log — never reaches a check, so it passes green. A flip is only half of
 * the two-edit reversal, so it has to find its other half.
 *
 * The *form* correspondence (bare vs. clause-scoped) stays owned by the forward
 * pass, so a mismatched pair is reported once, from the `Supersedes:` side.
 */
function checkFlipsAreClaimed(entries, byNum, errors) {
  for (const e of entries) {
    if (e.status === null) continue;
    for (const clause of statusClauses(e.status)) {
      const m = clause.match(TOTAL_FLIP_RE) ?? clause.match(PARTIAL_FLIP_RE);
      if (!m) continue;
      const targetId = `D-${m[1]}`;
      const superseder = byNum.get(Number(m[1]));
      if (!superseder) {
        errors.push(
          `C3 ${e.id}: Status carries "${clause}", but ${targetId} is not in the Decision Log`,
        );
        continue;
      }
      const claimed = superseder.relations.some(
        (r) => r.kind === 'Supersedes' && r.target === e.num,
      );
      if (!claimed) {
        errors.push(
          `C3 ${e.id}: Status carries "${clause}" but ${targetId} carries no "Supersedes: ${e.id}" — a reversal is two edits, and this is only one`,
        );
      }
    }
  }
}

/**
 * C3 — every relation resolves backwards, and a supersession is two edits: the
 * flip on the superseded entry is the second one. `Refines:` and `Extends:`
 * sharpen or widen a decision that stays in force, so they need an earlier
 * target that exists and nothing else — the target's later status is not the
 * edge's business, because a refinement written while its target was live stays
 * a correct record after some third decision supersedes that target. The
 * direction test compares `D-id`s, not positions, so parking a superseded entry
 * in the folded index leaves it satisfied.
 *
 * Coherence is a property of the superseded entry's `Status:`, not of one edge,
 * so it runs once per victim — two decisions superseding one entry report one
 * incoherent status, not two.
 */
function checkRelations(entries, errors) {
  const byNum = new Map(entries.map((e) => [e.num, e]));
  const victims = new Map();
  for (const e of entries) {
    for (const { kind, target, clause } of e.relations) {
      const targetId = `D-${String(target).padStart(3, '0')}`;
      const victim = byNum.get(target);
      if (!victim) {
        errors.push(`C3 ${e.id}: "${kind}: ${targetId}" names a decision that does not exist`);
        continue;
      }
      if (target >= e.num) {
        errors.push(
          `C3 ${e.id}: "${kind}: ${targetId}" must name an earlier decision — the log is append-only, so an entry cannot relate to itself or to one recorded after it`,
        );
        continue;
      }
      if (kind !== 'Supersedes') continue;
      // A victim with no `Status:` is already reported once by
      // `checkStatusPresence`; saying it again per superseding edge would turn
      // one missing line into N errors.
      if (victim.status === null) continue;
      victims.set(target, victim);
      const expected = clause ? `partially superseded by ${e.id}` : `Superseded-by: ${e.id}`;
      if (!statusClauses(victim.status).includes(expected)) {
        errors.push(
          `C3 ${targetId}: Status is "${victim.status}" but ${e.id} supersedes it — expected it to carry "${expected}"`,
        );
      }
    }
  }
  checkFlipsAreClaimed(entries, byNum, errors);
  for (const victim of victims.values()) checkSupersededStatus(victim, errors);
}

module.exports = {
  parseDecisions,
  checkDecisionNumbering,
  checkStatusPresence,
  checkRelations,
};
