#!/usr/bin/env node

/**
 * check-product.js — static validation of the product state under `product/`.
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
 * Status ↔ `Tag` pairing) plus the log's numbering invariants. Fits the
 * scripts/check-*.js family.
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
 *         example neither stands in for the log nor truncates it. The heading is read
 *         at column 1, and one indented far enough to still render as a heading
 *         (one to three spaces) is reported rather than dropped, so a stray
 *         indent cannot hide an entry in the log's flat structure;
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
 *         replace. Both existing exemptions already cover the counting and need
 *         no new code: an illustration inside a fence or an indented code block
 *         never becomes an entry at all, so it is never counted, and
 *         `STATUS_FIELD_RE` is anchored at column 1, so a line only counts where
 *         the entry form puts it. `Refines:` and `Extends:` require no flip;
 *   - C4  every spec's `Status:` header matches its governing roadmap row, and
 *         the row ↔ spec links resolve in both directions — the header is read
 *         in the preamble above the spec's first `##`, fence-aware, so a worked
 *         example or a quoted header line further down is neither mistaken for
 *         the header nor allowed to displace it;
 *   - C5  every D-id a spec cites in `## Decisions` is a zero-padded `D-NNN`
 *         and exists in the log — that section is sliced the same fence-aware
 *         way, so an example `##` heading cannot carry citations out of reach,
 *         and the citation scan skips its fenced lines, so a `D-NNN` inside a
 *         worked example is an illustration rather than a citation;
 *   - C6  sanity floor — at least one roadmap row, one decision, one spec, each
 *         counted outside fenced blocks, so an illustration never meets it;
 *   - C7  a roadmap row's `Tag` cell matches its Status — a `shipped` row
 *         carries `vX.Y.Z` for its own version, any other row carries `—`.
 *
 * CLI tier: prints a report and exits 0 (valid) / 1 (invalid).
 */

const fs = require('node:fs');
const path = require('node:path');

const PRODUCT_DIR = path.resolve(__dirname, '..', 'product');
const ROADMAP_MD = path.join(PRODUCT_DIR, 'ROADMAP.md');
const SPECS_DIR = path.join(PRODUCT_DIR, 'specs');

const HERE_MARKER = '← we are here';
const ROW_STATUSES = new Set(['next', 'building', 'shipped']);
const NO_TAG = '—';

// Opening or closing marker of a fenced code block, capturing which marker it is
// so a `~~~` inside a ``` block cannot close it.
const FENCE_RE = /^\s*(```|~~~)/;
// CommonMark lets an ATX heading carry up to three leading spaces; at four — as
// measured from column 1, and the log nests no headings under list items — it is
// an indented code block, where `### D-NNN` is not a heading at all and must stay
// unread. So the candidate detector spans ` {0,3}`, not `\s*`, while the canonical
// form stays anchored at column 1 — the indent probe is what turns a heading the
// reader can see into a report instead of a silent drop.
const DECISION_HEADING_RE = /^###\s+D-(\d{3})\s+—\s+\S/;
const DECISION_ANY_RE = /^ {0,3}###\s+D-/;
const DECISION_INDENT_RE = /^ {1,3}###/;
const STATUS_FIELD_RE = /^-\s+Status:\s*(.+?)\s*$/;
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
// The closed vocabulary a decision's `Status:` clauses are drawn from. A live
// clause says the decision still governs; a flip clause says how much of it died.
const DECISION_LIVE_STATUS = new Set(['Accepted', 'Proposed']);
const TOTAL_FLIP_RE = /^Superseded-by: D-(\d{3})$/;
const PARTIAL_FLIP_RE = /^partially superseded by D-(\d{3})$/;
// The two `##` sections of ROADMAP.md this linter reads. Each is sliced out
// before it is parsed, so a table row or a `### D-NNN` heading anywhere else in
// the file is prose, not product state. Both are matched at column 1, and the
// slice's boundaries are found fence-aware (see `section`), so a fenced
// illustration can neither stand in for the section nor cut it short.
const ROADMAP_HEADING_RE = /^##\s+Roadmap\s*$/;
const DECISION_LOG_HEADING_RE = /^##\s+Decision Log\s*$/;
// The one `##` section of a spec this linter reads, sliced the same way.
const SPEC_DECISIONS_HEADING_RE = /^##\s+Decisions\s*$/;
const SPEC_LINK_RE = /\]\(specs\/([A-Za-z0-9._-]+)\.md\)/g;
// The spec header line, matched per line rather than against the whole file, so
// the scope in `specStatusHeader` is what decides which line is the header.
const SPEC_STATUS_HEADER_RE = /^>\s*Status:\s*(.+?)\s*$/;
// Matches a citation-shaped token and its trailing word characters, so a
// suffixed id (`D-001a`) is reported as malformed rather than skipped. The
// leading `\d` keeps ordinary prose (`D-Bus`) out of the scan.
const CITATION_RE = /\bD-(\d+)(\w*)/g;

/** Semver-ish ordering for roadmap Version cells (`X.Y.Z`). */
function compareVersions(a, b) {
  const av = a.split('.').map(Number);
  const bv = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (av[i] !== bv[i]) return av[i] - bv[i];
  }
  return 0;
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
 * An unclosed fence
 * therefore swallows the heading and yields `[]` — fail-closed for ROADMAP.md's two
 * sections, which C6 rejects as a corpus with no rows or no decisions, but silent
 * for a spec's `## Decisions`, exactly as a spec that renames or drops that section
 * already is: nothing asserts a spec's headings. The first matching heading wins: a
 * second `## Decision Log` later in the file is not read.
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

/** The lines between `## Roadmap` and the next `##` heading. */
function roadmapSection(roadmap) {
  return section(roadmap, ROADMAP_HEADING_RE);
}

/**
 * Parse the roadmap table. Pushes structural errors onto `errors` and returns
 * the rows it could read. Read outside fenced blocks, so an illustrative table
 * row inside `## Roadmap` is not a roadmap row.
 *
 * @returns {{version: string, tag: string, status: string, here: boolean, specs: string[]}[]}
 */
function parseRoadmapRows(roadmap, errors) {
  const rows = [];
  for (const raw of unfenced(roadmapSection(roadmap))) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    const cells = line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    if (cells[0] === 'Version') continue;

    if (cells.length < 6) {
      errors.push(`C4 roadmap row "${line}": expected 6 columns, found ${cells.length}`);
      continue;
    }
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
    const specs = [...cells[5].matchAll(SPEC_LINK_RE)].map((m) => m[1]);
    rows.push({ version, tag, status, here, specs });
  }
  return rows;
}

/**
 * Parse the Decision Log into entries. The log is the `## Decision Log` section,
 * not the whole file — the section is sliced out first, so a `### D-NNN` heading
 * in an intro or a later appendix is prose, never an entry. `inFold` marks the
 * entries parked in the folded `<details>` index at the bottom of the log — they
 * keep their place in the numbering but sit outside the ascending-order
 * requirement.
 */
function parseDecisions(roadmap, errors) {
  const entries = [];
  let inFold = false;
  let current = null;
  for (const line of unfenced(section(roadmap, DECISION_LOG_HEADING_RE))) {
    if (/^\s*<details\b/i.test(line)) inFold = true;
    if (/^\s*<\/details>/i.test(line)) inFold = false;

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
      current = { id: `D-${m[1]}`, num: Number(m[1]), inFold, status: null, relations: [] };
      entries.push(current);
      continue;
    }
    if (!current) continue;
    const status = line.match(STATUS_FIELD_RE);
    if (status) {
      // Last-wins on purpose. First-wins would report the duplicate *and* claim
      // the flip is missing on an entry that carries it one line down, which
      // invites a third `Status:` line; last-wins keeps the appended flip a
      // single-error mutant.
      if (current.status !== null) {
        errors.push(
          `C3 ${current.id}: a second "- Status:" line ("${line.trim()}") — an entry carries exactly one, so a flip appended beside the line it replaces is reported rather than silently winning`,
        );
      }
      current.status = status[1];
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
 */
function checkStatusPresence(entries, errors) {
  for (const e of entries) {
    if (e.status !== null) continue;
    errors.push(
      `C3 ${e.id}: no "- Status:" line — an entry carries exactly one, so a decision that never records whether it still governs is reported rather than read as live`,
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
 */
function specStatusHeader(content) {
  for (const line of unfenced(content.split('\n'))) {
    if (/^##\s+/.test(line)) break;
    const m = line.match(SPEC_STATUS_HEADER_RE);
    if (!m) continue;
    return m[1]
      .split('·')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('['))
      .join(' · ');
  }
  return null;
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

/** C4 — row ↔ spec links resolve both ways and the header matches the governing row. */
function checkSpecHeaders(rows, specs, errors) {
  const known = new Set(specs.map((s) => s.name));
  for (const row of rows) {
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
    const actual = specStatusHeader(spec.content);
    if (actual === null) {
      errors.push(`C4 specs/${spec.name}.md: missing the "> Status:" header line`);
      continue;
    }
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
  checkSpecHeaders(rows, specs, errors);
  checkSpecCitations(entries, specs, errors);
  checkRoadmapTags(rows, errors);

  if (rows.length === 0) errors.push('C6 sanity floor: the roadmap table has no rows');
  if (entries.length === 0) errors.push('C6 sanity floor: the Decision Log has no entries');
  if (specs.length === 0) errors.push('C6 sanity floor: specs/ holds no spec');

  return errors;
}

function readProduct() {
  const roadmap = fs.readFileSync(ROADMAP_MD, 'utf8');
  const specs = fs.existsSync(SPECS_DIR)
    ? fs
        .readdirSync(SPECS_DIR)
        .filter((f) => f.endsWith('.md'))
        .sort()
        .map((f) => ({
          name: f.slice(0, -3),
          content: fs.readFileSync(path.join(SPECS_DIR, f), 'utf8'),
        }))
    : [];
  return { roadmap, specs };
}

function main() {
  let product;
  try {
    product = readProduct();
  } catch (err) {
    console.error(`product linter — cannot read product/: ${err.message}`);
    process.exit(1);
  }

  const errors = validateProduct(product);
  const rows = parseRoadmapRows(product.roadmap, []).length;
  const decisions = parseDecisions(product.roadmap, []).length;

  console.log(
    `product linter — ${rows} roadmap row(s) / ${decisions} decision(s) / ${product.specs.length} spec(s)\n`,
  );

  if (errors.length === 0) {
    console.log('product state is consistent.');
    process.exit(0);
  }

  console.error(`product/ has ${errors.length} consistency violation(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

module.exports = { validateProduct, expectedSpecStatus, specStatusHeader, ROW_STATUSES };

if (require.main === module) {
  main();
}
