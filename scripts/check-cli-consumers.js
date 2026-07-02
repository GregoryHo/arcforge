#!/usr/bin/env node

/**
 * check-cli-consumers.js — flag shipped CLI commands that no shipped doc,
 * skill, template, or agent references (the "stranded CLI" defect class).
 *
 * v4.0.0 shipped the `sdd-gate` command with ZERO consumers: the engine
 * landed (#87) but the skills that were meant to call it kept running their
 * old inline recipes. A CLI surface nobody invokes is dead weight at best and,
 * as with sdd-gate, a sign that a planned migration never completed. This guard
 * enumerates every command in the frozen CLI manifest and confirms each is
 * named somewhere in the shipped prose surface.
 *
 * Source of truth: scripts/lib/cli-manifest.js `CLI_MANIFEST`. That file is
 * bidirectionally contract-tested against the live `cli.js` switch, so it can
 * never silently drift from the real command set — unlike scraping help.js.
 *
 * GATING (since v4.0.1). The linter exits 1 on any zero-consumer command. It
 * shipped warn-only at v4.0.0 (when `sdd-gate` itself had no consumers — gating
 * then would have reddened unrelated PRs) and flipped to gating once the SDD-6
 * migration wired sdd-gate's consumers. This mirrors the repo's doc-reference
 * linter, which shipped warn-first then flipped to gating.
 *
 * LIMITATION — common-English-word command names. The match is a lenient
 * word-boundary presence test (zero vs nonzero), so a command whose name is an
 * ordinary word (`status`, `next`, `block`, `merge`, `sync`, `parallel`,
 * `complete`, `reboot`) will almost always match incidental prose and read as
 * "consumed" even if its CLI form is never referenced. This guard therefore
 * reliably catches only DISTINCTIVE names (sdd-gate, worktree, obsidian,
 * ratify, schema, expand, cleanup). False negatives on common-word commands
 * are accepted; the alternative (context-aware parsing) is out of scope for a
 * presence linter. The allowlist below absorbs any documented intentional gap.
 *
 * CLI tier: prints a human-readable report and exits 0 (warn) / 1 (gating).
 */

const fs = require('node:fs');
const path = require('node:path');

const { CLI_MANIFEST } = require('./lib/cli-manifest');

const repoRoot = path.resolve(__dirname, '..');

// Shipped prose surfaces a CLI command should be referenced from. Markdown
// only — code files invoke commands via the engine, not by name in prose.
const SCAN_DIRS = ['skills', 'docs/guide', 'templates', 'agents'];

// Commands intentionally exempt from the zero-consumer check. Mirrors the
// `doc-ref-lint: ignore` precedent. Shipped EMPTY — add an entry only with a
// documented reason (a command that legitimately has no prose consumer).
const ALLOWLIST = new Set([]);

// Flipped to true at v4.0.1: the SDD-6 migration wired sdd-gate's consumers
// (arc-refining + arc-planning), so a zero-consumer command now fails the check.
const GATING = true;

/** Recursively collect *.md files under a directory (skips node_modules + dotdirs). */
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
 * Enumerate every invocable command label: each top-level command, plus each
 * `parent sub` join for commands that declare subcommands (e.g. `worktree add`).
 */
function enumerateCommands() {
  const labels = [];
  for (const [name, def] of Object.entries(CLI_MANIFEST)) {
    labels.push(name);
    if (def?.subcommands) {
      for (const sub of Object.keys(def.subcommands)) {
        labels.push(`${name} ${sub}`);
      }
    }
  }
  return labels;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function main() {
  const files = [];
  for (const dir of SCAN_DIRS) {
    collectMarkdown(path.join(repoRoot, dir), files);
  }
  const corpus = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

  const commands = enumerateCommands();
  const stranded = [];
  for (const cmd of commands) {
    if (ALLOWLIST.has(cmd)) continue;
    const re = new RegExp(`\\b${escapeRegExp(cmd)}\\b`);
    if (!re.test(corpus)) stranded.push(cmd);
  }

  console.log(
    `cli-consumer linter — ${commands.length} CLI commands vs ${files.length} shipped docs\n`,
  );

  if (stranded.length === 0) {
    console.log('Every CLI command has at least one documented consumer.');
    process.exit(0);
  }

  const log = GATING ? console.error : console.warn;
  const prefix = GATING ? '' : '[warn] ';
  log(`${prefix}Shipped CLI commands with ZERO consumers (${stranded.length}):`);
  for (const cmd of stranded) {
    log(`  - ${cmd}  (no word-boundary match in ${SCAN_DIRS.join(', ')})`);
  }
  if (!GATING) {
    log('\nWarn-only (GATING=false): reporting without failing the check.');
  }
  process.exit(GATING ? 1 : 0);
}

main();
