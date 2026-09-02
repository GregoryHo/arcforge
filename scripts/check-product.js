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
 * This linter asserts the three mechanical rules pinned in `product/AGENTS.md`
 * (row → header mapping, the governing-row rule, the two supersession forms)
 * plus the log's numbering invariants. Fits the scripts/check-*.js family.
 *
 * Validates:
 *   - C1  exactly one roadmap row carries the `← we are here` marker;
 *   - C2  Decision Log ids are `D-NNN` (zero-padded), ascending outside the
 *         folded `<details>` index, unique, and gap-free from D-001;
 *   - C3  every `Supersedes:` carries its flip on the entry it supersedes —
 *         bare form ⇒ `Superseded-by: D-NNN`, clause-scoped form ⇒
 *         `partially superseded by D-NNN`;
 *   - C4  every spec's `Status:` header matches its governing roadmap row, and
 *         the row ↔ spec links resolve in both directions;
 *   - C5  every D-id a spec cites in `## Decisions` exists in the log;
 *   - C6  sanity floor — at least one roadmap row, one decision, one spec.
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

const DECISION_HEADING_RE = /^###\s+D-(\d{3})\s+—\s+\S/;
const DECISION_ANY_RE = /^###\s+D-/;
const STATUS_FIELD_RE = /^-\s+Status:\s*(.+?)\s*$/;
const SUPERSEDES_FIELD_RE = /^-\s+Supersedes:\s+D-(\d{3})(\s*\(clause\s+[^)]+\))?\s*$/;
const SPEC_LINK_RE = /\]\(specs\/([A-Za-z0-9._-]+)\.md\)/g;

/** Semver-ish ordering for roadmap Version cells (`X.Y.Z`). */
function compareVersions(a, b) {
  const av = a.split('.').map(Number);
  const bv = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (av[i] !== bv[i]) return av[i] - bv[i];
  }
  return 0;
}

/** The lines between `## Roadmap` and the next `##` heading. */
function roadmapSection(roadmap) {
  const lines = roadmap.split('\n');
  const start = lines.findIndex((l) => /^##\s+Roadmap\s*$/.test(l));
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^##\s+/.test(l));
  return end === -1 ? rest : rest.slice(0, end);
}

/**
 * Parse the roadmap table. Pushes structural errors onto `errors` and returns
 * the rows it could read.
 *
 * @returns {{version: string, status: string, here: boolean, specs: string[]}[]}
 */
function parseRoadmapRows(roadmap, errors) {
  const rows = [];
  for (const raw of roadmapSection(roadmap)) {
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
    const specs = [...cells[5].matchAll(SPEC_LINK_RE)].map((m) => m[1]);
    rows.push({ version, status, here, specs });
  }
  return rows;
}

/**
 * Parse the Decision Log into entries. `inFold` marks the entries parked in the
 * folded `<details>` index at the bottom of the log — they keep their place in
 * the numbering but sit outside the ascending-order requirement.
 */
function parseDecisions(roadmap, errors) {
  const entries = [];
  let inFold = false;
  let current = null;
  for (const line of roadmap.split('\n')) {
    if (/^\s*<details\b/i.test(line)) inFold = true;
    if (/^\s*<\/details>/i.test(line)) inFold = false;

    if (DECISION_ANY_RE.test(line)) {
      const m = line.match(DECISION_HEADING_RE);
      if (!m) {
        errors.push(
          `C2 malformed Decision Log heading: "${line.trim()}" (expected "### D-NNN — <title>")`,
        );
        current = null;
        continue;
      }
      current = { id: `D-${m[1]}`, num: Number(m[1]), inFold, status: null, supersedes: [] };
      entries.push(current);
      continue;
    }
    if (!current) continue;
    if (/^##\s/.test(line)) {
      current = null;
      continue;
    }
    const status = line.match(STATUS_FIELD_RE);
    if (status) current.status = status[1];
    const supersedes = line.match(SUPERSEDES_FIELD_RE);
    if (supersedes)
      current.supersedes.push({ target: Number(supersedes[1]), clause: !!supersedes[2] });
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

/** C3 — a supersession is two edits; the flip on the superseded entry is one of them. */
function checkSupersessions(entries, errors) {
  const byNum = new Map(entries.map((e) => [e.num, e]));
  for (const e of entries) {
    for (const { target, clause } of e.supersedes) {
      const targetId = `D-${String(target).padStart(3, '0')}`;
      const victim = byNum.get(target);
      if (!victim) {
        errors.push(`C3 ${e.id}: "Supersedes: ${targetId}" names a decision that does not exist`);
        continue;
      }
      if (victim.status === null) {
        errors.push(`C3 ${targetId}: no "Status:" line to carry the flip that ${e.id} requires`);
        continue;
      }
      const expected = clause ? `partially superseded by ${e.id}` : `Superseded-by: ${e.id}`;
      if (!victim.status.includes(expected)) {
        errors.push(
          `C3 ${targetId}: Status is "${victim.status}" but ${e.id} supersedes it — expected it to carry "${expected}"`,
        );
      }
    }
  }
}

/** The `Status:` text of a spec header, with the trailing ROADMAP link dropped. */
function specStatusHeader(content) {
  const m = content.match(/^>\s*Status:\s*(.+?)\s*$/m);
  if (!m) return null;
  return m[1]
    .split('·')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('['))
    .join(' · ');
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

/** The body of a spec's `## Decisions` section, or null when it has none. */
function decisionsSection(content) {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => /^##\s+Decisions\s*$/.test(l));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^##\s/.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

/** C5 — a spec may only cite D-ids the log actually carries. */
function checkSpecCitations(entries, specs, errors) {
  const known = new Set(entries.map((e) => e.id));
  for (const spec of specs) {
    const section = decisionsSection(spec.content);
    if (section === null) continue;
    for (const m of section.matchAll(/\bD-(\d{3})\b/g)) {
      if (!known.has(`D-${m[1]}`)) {
        errors.push(`C5 specs/${spec.name}.md: cites D-${m[1]}, which is not in the Decision Log`);
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
  checkSupersessions(entries, errors);
  checkSpecHeaders(rows, specs, errors);
  checkSpecCitations(entries, specs, errors);

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
