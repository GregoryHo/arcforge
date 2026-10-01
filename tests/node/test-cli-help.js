#!/usr/bin/env node
/**
 * Contract test for `arcforge --help` (cli.md B-1, B-4).
 *
 * B-1: the user-facing invocation is the bare `arcforge` command, so the help
 * text must never tell a plugin user to run `node scripts/cli.js`.
 */

const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const CLI_PATH = path.resolve(__dirname, '../../scripts/cli.js');

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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
