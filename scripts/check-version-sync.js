#!/usr/bin/env node

/**
 * check-version-sync.js — fail fast on canonical version drift.
 *
 * Version drift is the documented #1 arcforge release defect: a prior release
 * (v1.4.0) shipped with `marketplace.json` stuck two versions behind. This
 * script reads the canonical version from `.claude-plugin/plugin.json` (the
 * source of truth per `.claude/rules/plugin.md`) and compares it against every
 * other location that carries the version string.
 *
 * The checked set is anchored to the 9-location table in
 * `.claude/skills/arc-releasing/SKILL.md`, NOT a raw grep — a grep catches the
 * deliberately-stale `package-lock.json` and misses the README badge. The table
 * is the maintained authoritative list.
 *
 * Exits 0 if every location matches the canonical version; exits 1 (CLI tier)
 * with the mismatches listed otherwise. A missing location file is reported,
 * not crashed on silently.
 */

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

const CANONICAL_FILE = '.claude-plugin/plugin.json';

/**
 * Extract a version string from a file's contents.
 *
 * Each location stores the version differently (JSON field, JS property,
 * shields.io badge, hero label). An extractor returns the found version, or
 * null when the file exists but the pattern is absent (real drift signal,
 * distinct from a missing file).
 */
function jsonField(content, getter) {
  return getter(JSON.parse(content));
}

function regexExtract(content, re) {
  const match = content.match(re);
  return match ? match[1] : null;
}

// Non-canonical locations to verify against the canonical version. Mirrors the
// 9-location table in arc-releasing/SKILL.md (canonical baseline + 8 others).
// `package-lock.json` is intentionally excluded — SKILL.md documents it as
// known-stale; never folded into a release commit.
const LOCATIONS = [
  {
    file: 'package.json',
    extract: (c) => jsonField(c, (j) => j.version),
  },
  {
    file: '.claude-plugin/marketplace.json',
    extract: (c) => jsonField(c, (j) => j.plugins?.[0]?.version),
  },
  {
    file: '.opencode/plugins/arcforge.js',
    extract: (c) => regexExtract(c, /version:\s*'([^']+)'/),
  },
  {
    file: 'README.md',
    extract: (c) => regexExtract(c, /badge\/version-([0-9][^-]*)-/),
  },
  {
    file: 'website/page/hero.jsx',
    extract: (c) => regexExtract(c, /v(\d+\.\d+\.\d+)/),
  },
  {
    file: 'website/page/sections.jsx',
    extract: (c) => regexExtract(c, /v(\d+\.\d+\.\d+)/),
  },
  // Compiled babel artifacts — derived from the .jsx siblings via
  // `npm run build:website`, but committed to the repo, so they must match in
  // the same commit. Checked here so a forgotten rebuild is caught.
  {
    file: 'website/page/hero.js',
    extract: (c) => regexExtract(c, /"v(\d+\.\d+\.\d+)"/),
  },
  {
    file: 'website/page/sections.js',
    extract: (c) => regexExtract(c, /v(\d+\.\d+\.\d+)/),
  },
];

function readVersion(file, extract) {
  const abs = path.join(repoRoot, file);
  if (!fs.existsSync(abs)) {
    return { status: 'missing', version: null };
  }
  try {
    const content = fs.readFileSync(abs, 'utf8');
    const version = extract(content);
    if (!version) {
      return { status: 'not-found', version: null };
    }
    return { status: 'ok', version };
  } catch (err) {
    return { status: 'error', version: null, error: err.message };
  }
}

function main() {
  const canonicalAbs = path.join(repoRoot, CANONICAL_FILE);
  if (!fs.existsSync(canonicalAbs)) {
    console.error(`Error: canonical version file missing: ${CANONICAL_FILE}`);
    process.exit(1);
  }
  const canonical = JSON.parse(fs.readFileSync(canonicalAbs, 'utf8')).version;
  if (!canonical) {
    console.error(`Error: no "version" field in ${CANONICAL_FILE}`);
    process.exit(1);
  }

  const rows = [{ file: `${CANONICAL_FILE} (canonical)`, version: canonical, ok: true }];
  const problems = [];

  for (const { file, extract } of LOCATIONS) {
    const { status, version, error } = readVersion(file, extract);
    if (status === 'ok') {
      const ok = version === canonical;
      rows.push({ file, version, ok });
      if (!ok) {
        problems.push(`${file}: found ${version}, expected ${canonical}`);
      }
    } else {
      const note =
        status === 'missing'
          ? 'FILE MISSING'
          : status === 'not-found'
            ? 'version pattern not found'
            : `read error: ${error}`;
      rows.push({ file, version: note, ok: false });
      problems.push(`${file}: ${note}`);
    }
  }

  const width = Math.max(...rows.map((r) => r.file.length));
  console.log('Version sync check (canonical: %s)\n', canonical);
  for (const r of rows) {
    const mark = r.ok ? 'OK ' : 'XX ';
    console.log(`  ${mark} ${r.file.padEnd(width)}  ${r.version}`);
  }
  console.log('');

  if (problems.length > 0) {
    console.error(`Version drift detected (${problems.length}):`);
    for (const p of problems) {
      console.error(`  - ${p}`);
    }
    process.exit(1);
  }

  console.log('All version locations match the canonical version.');
  process.exit(0);
}

main();
