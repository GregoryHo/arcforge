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
 * 'error' fails the check (exit 1). All four rules now gate — R4 flipped to
 * 'error' in the SRH-5 R4-flip follow-up (WT-6 has merged, so the finishing
 * twin no longer dangles). 'warn'-severity findings, if any are ever added,
 * are printed but do NOT affect the exit code.
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

/**
 * Existence probe for a backticked arc-<name> reference. Resolves against all
 * three component trees a doc may legitimately name: a skill dir, a hook dir,
 * or an agent file. (arc-guard / arc-remind are hooks; arc-auditing-spec-*
 * are dispatched agents — neither lives under skills/.)
 */
function skillExists(name) {
  return (
    fs.existsSync(path.join(repoRoot, 'skills', name)) ||
    fs.existsSync(path.join(repoRoot, 'hooks', name)) ||
    fs.existsSync(path.join(repoRoot, 'agents', `${name}.md`))
  );
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
