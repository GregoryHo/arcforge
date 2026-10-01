#!/usr/bin/env node
/**
 * Contract test for cli.md B-2: every environment variable the engine reads is
 * named in the spec's B-2 and in the CLI guide's Environment table, and neither
 * names one the engine does not read.
 *
 * The engine is everything `arcforge` can execute: scripts/cli.js,
 * scripts/cli/, scripts/loop.js and scripts/lib/. A read is `process.env.X` or
 * `env.X` on any env object; an assignment (`env.X = ...`, building a child
 * process's environment) is a write and is not counted.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');

console.log('Testing CLI environment inputs (cli.md B-2)...\n');

function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return jsFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

const ENGINE_FILES = [
  path.join(ROOT, 'scripts/cli.js'),
  path.join(ROOT, 'scripts/loop.js'),
  ...jsFiles(path.join(ROOT, 'scripts/cli')),
  ...jsFiles(path.join(ROOT, 'scripts/lib')),
];

function envReads(source) {
  const names = new Set();
  const re = /\benv\.([A-Z][A-Z0-9_]*)\b(?!\s*=(?!=))/g;
  for (const m of source.matchAll(re)) names.add(m[1]);
  return names;
}

const engineReads = new Set();
for (const file of ENGINE_FILES) {
  for (const name of envReads(fs.readFileSync(file, 'utf8'))) engineReads.add(name);
}

// Names in backticks inside a text block that look like env vars.
function namedVars(text) {
  return new Set([...text.matchAll(/`\$?([A-Z][A-Z0-9]*_[A-Z0-9_]+)`/g)].map((m) => m[1]));
}

function between(text, startRe, endRe, label) {
  const start = text.search(startRe);
  assert.notStrictEqual(start, -1, `${label}: start not found (${startRe})`);
  const rest = text.slice(start);
  const end = rest.slice(1).search(endRe);
  return end === -1 ? rest : rest.slice(0, end + 1);
}

const spec = fs.readFileSync(path.join(ROOT, 'product/specs/cli.md'), 'utf8');
const guide = fs.readFileSync(path.join(ROOT, 'docs/guide/cli-invocation.md'), 'utf8');

const sources = {
  'cli.md B-2': namedVars(between(spec, /- \*\*B-2 /, /\n- \*\*B-3 |\n### /, 'cli.md B-2')),
  'cli-invocation.md ## Environment': namedVars(
    between(guide, /^## Environment$/m, /\n## /, 'guide Environment'),
  ),
};

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

test('the engine reads at least CLAUDE_PROJECT_DIR (scan sanity)', () => {
  assert.ok(engineReads.has('CLAUDE_PROJECT_DIR'), [...engineReads].join(', '));
});

for (const [label, named] of Object.entries(sources)) {
  test(`${label} names every variable the engine reads`, () => {
    const missing = [...engineReads].filter((n) => !named.has(n)).sort();
    assert.deepStrictEqual(missing, [], `read by the engine, not in ${label}: ${missing}`);
  });
  test(`${label} names no variable the engine does not read`, () => {
    const extra = [...named].filter((n) => !engineReads.has(n)).sort();
    assert.deepStrictEqual(extra, [], `in ${label}, never read by the engine: ${extra}`);
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
