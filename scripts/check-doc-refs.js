#!/usr/bin/env node

/**
 * check-doc-refs.js — runner for the doc-reference linter (SRH-4).
 *
 * Walks the shipped markdown surface (the "Ships = Yes" doc layers) and lints
 * every file with scripts/lib/doc-refs.js, validating that doc promises about
 * file paths (R1), CLI commands/flags (R2), `--json` output fields (R3), and
 * skill names (R4) match what the engine actually ships.
 *
 * Exit code reflects GATING findings only: any finding whose severity is
 * 'error' fails the check (exit 1). 'warn'-severity findings (R4 today — see
 * doc-refs.js R4_SEVERITY) are printed but do NOT affect the exit code, so the
 * pre-WT-6 tree (which still carries skills/arc-finishing-epic/ and live
 * references to it) stays green. R4 flips to gating in the SRH-5 CI follow-up
 * once WT-6 has merged.
 *
 * CLI tier: prints a human-readable report and exits 0/1.
 */

const fs = require('node:fs');
const path = require('node:path');

const { lintDoc } = require('./lib/doc-refs');

const repoRoot = path.resolve(__dirname, '..');

// Shipped doc surface to lint. Markdown only — code files are checked by their
// own contract tests, not prose linting.
const SCAN_DIRS = ['skills', 'docs/guide', 'agents', 'templates', 'hooks'];
const SCAN_ROOT_FILES = ['README.md'];

/** Recursively collect *.md files under a directory (skips node_modules). */
function collectMarkdown(dir, acc) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectMarkdown(full, acc);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Existence probe for a path. Resolves against the repo root first, then the
 * linting doc's own directory (skill docs cite skill-local paths like
 * `agents/foo.md` meaning the skill's own agents/ subdir).
 */
function pathExists(relPath, docDir) {
  if (fs.existsSync(path.join(repoRoot, relPath))) return true;
  if (docDir && fs.existsSync(path.join(repoRoot, docDir, relPath))) return true;
  return false;
}

/** Existence probe for a skill directory. */
function skillExists(skillName) {
  return fs.existsSync(path.join(repoRoot, 'skills', skillName));
}

function gatherFiles() {
  const files = [];
  for (const dir of SCAN_DIRS) {
    collectMarkdown(path.join(repoRoot, dir), files);
  }
  for (const f of SCAN_ROOT_FILES) {
    const abs = path.join(repoRoot, f);
    if (fs.existsSync(abs)) files.push(abs);
  }
  return files;
}

function main() {
  const files = gatherFiles();
  const allFindings = [];

  for (const abs of files) {
    const rel = path.relative(repoRoot, abs);
    const content = fs.readFileSync(abs, 'utf8');
    const { findings } = lintDoc(rel, content, { pathExists, skillExists });
    allFindings.push(...findings);
  }

  const errors = allFindings.filter((f) => f.severity === 'error');
  const warnings = allFindings.filter((f) => f.severity === 'warn');

  console.log(`doc-reference linter — scanned ${files.length} shipped docs\n`);

  if (warnings.length > 0) {
    console.log(`Warnings (non-gating, ${warnings.length}):`);
    for (const f of warnings) {
      console.log(`  [${f.rule}] ${f.file}:${f.line}  ${f.message}`);
    }
    console.log('');
  }

  if (errors.length > 0) {
    console.error(`Doc-reference violations (${errors.length}):`);
    for (const f of errors) {
      console.error(`  [${f.rule}] ${f.file}:${f.line}  ${f.message}`);
    }
    process.exit(1);
  }

  console.log('No gating doc-reference violations.');
  process.exit(0);
}

main();
