#!/usr/bin/env node
/**
 * Contract test for `arcforge --help` (cli.md B-1, B-4).
 *
 * B-1: the user-facing invocation is the bare `arcforge` command, so the help
 * text must never tell a plugin user to run `node scripts/cli.js`.
 *
 * B-4: `--help` prints the full surface, so for every command the flags its
 * help entries name equal the flags the manifest declares for it (subcommand
 * flags included) — a flag added to the manifest but not the help, or the
 * reverse, fails here.
 */

const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const CLI_PATH = path.resolve(__dirname, '../../scripts/cli.js');
const { CLI_MANIFEST } = require('../../scripts/lib/cli-manifest');

console.log('Testing arcforge --help...\n');

const HELP = execFileSync('node', [CLI_PATH, '--help'], { encoding: 'utf8' });

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}\n    ${err.message}`);
    failed++;
  }
}

// Lines of one top-level section, e.g. section('EXAMPLES').
function section(title) {
  const lines = HELP.split('\n');
  const start = lines.indexOf(`${title}:`);
  assert.notStrictEqual(start, -1, `help has no ${title}: section`);
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (/^[A-Z]+:$/.test(line)) break;
    if (line.trim()) body.push(line.trim());
  }
  return body;
}

test('help never prints the contributor-only node scripts/cli.js form (B-1)', () => {
  assert.doesNotMatch(HELP, /node scripts\/cli\.js/);
});

test('USAGE names the bare arcforge command', () => {
  assert.deepStrictEqual(section('USAGE'), ['arcforge <command> [options]']);
});

test('every EXAMPLES line starts with the bare arcforge command', () => {
  const examples = section('EXAMPLES');
  assert.ok(examples.length > 0, 'expected at least one example');
  for (const line of examples) assert.match(line, /^arcforge /, line);
});

// COMMANDS entries grouped by command: an entry line starts `  <command> `,
// and every line up to the next entry belongs to it.
function helpFlagsByCommand() {
  const commands = Object.keys(CLI_MANIFEST);
  const entryRe = new RegExp(`^ {2}(${commands.join('|')})\\b`);
  const byCommand = Object.fromEntries(commands.map((c) => [c, new Set()]));
  let current = null;
  for (const line of section('COMMANDS')) {
    const m = `  ${line}`.match(entryRe);
    if (m) current = m[1];
    if (!current) continue;
    for (const flag of line.match(/--[a-z][a-z0-9-]*/g) || []) byCommand[current].add(flag);
  }
  return byCommand;
}

function manifestFlags(cmd) {
  const entry = CLI_MANIFEST[cmd];
  const flags = new Set(entry.flags || []);
  for (const sub of Object.values(entry.subcommands || {})) {
    for (const flag of sub.flags || []) flags.add(flag);
  }
  return flags;
}

const helpFlags = helpFlagsByCommand();
for (const cmd of Object.keys(CLI_MANIFEST)) {
  test(`${cmd}: help names exactly the manifest's flags (B-4)`, () => {
    const declared = manifestFlags(cmd);
    const shown = helpFlags[cmd];
    const missing = [...declared].filter((f) => !shown.has(f)).sort();
    const extra = [...shown].filter((f) => !declared.has(f)).sort();
    assert.deepStrictEqual(
      { missingFromHelp: missing, notInManifest: extra },
      { missingFromHelp: [], notInManifest: [] },
    );
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
