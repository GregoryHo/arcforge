#!/usr/bin/env node
/**
 * Tests for .opencode/plugins/arcforge.js (the OpenCode plugin bootstrap).
 *
 * The plugin is an ES module; this CommonJS test loads it via dynamic
 * import() of an absolute file URL so it works regardless of cwd. The
 * assertions guard the minimal-bootstrap contract shared with the Claude
 * Code side (hooks/inject-skills/bootstrap.txt): a small, ARCFORGE_ROOT-
 * resolved posture wrapped in injection markers — NOT the full arc-using
 * SKILL.md (the IT-10 regression).
 */

const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const pluginPath = path.resolve(__dirname, '../../.opencode/plugins/arcforge.js');
const expectedRoot = path.resolve(__dirname, '../..');

async function main() {
  console.log('Testing .opencode/plugins/arcforge.js...\n');

  const mod = await import(pathToFileURL(pluginPath).href);
  const plugin = mod.default;
  const transform = plugin['experimental.chat.system.transform'];
  assert.strictEqual(typeof transform, 'function', 'transform handler should be a function');

  // 1. transform pushes exactly one bootstrap string into a fresh output.system
  console.log('  transform pushes one bootstrap...');
  const output = {};
  await transform(undefined, output);
  assert.ok(Array.isArray(output.system), 'output.system should be an array');
  assert.strictEqual(output.system.length, 1, 'exactly one entry should be pushed');
  const bootstrap = output.system[0];
  assert.strictEqual(typeof bootstrap, 'string', 'pushed entry should be a string');
  console.log('    ✓ exactly one bootstrap string pushed');

  // 2. minimal-bootstrap posture, wrapped in markers, ARCFORGE_ROOT resolved
  console.log('  minimal-bootstrap content + resolved root...');
  assert.ok(
    bootstrap.includes('ArcForge skills are available for this project.'),
    'bootstrap should contain the minimal-bootstrap posture line',
  );
  assert.ok(
    bootstrap.includes('invoke the arcforge:arc-using skill'),
    'bootstrap should point at the arc-using router',
  );
  assert.ok(
    bootstrap.startsWith('<EXTREMELY_IMPORTANT>'),
    'bootstrap should open with the injection marker',
  );
  assert.ok(
    bootstrap.trimEnd().endsWith('</EXTREMELY_IMPORTANT>'),
    'bootstrap should close with the injection marker',
  );
  const literalPlaceholder = `\${ARCFORGE_ROOT}`;
  assert.ok(
    !bootstrap.includes(literalPlaceholder),
    'literal ARCFORGE_ROOT placeholder must be substituted away',
  );
  assert.ok(
    bootstrap.includes(`ARCFORGE_ROOT=${expectedRoot}`),
    'resolved ARCFORGE_ROOT path should be present',
  );
  console.log('    ✓ posture, markers, and resolved root present');

  // 3. IT-10 regression guard: minimal bootstrap, NOT the full arc-using SKILL.md
  console.log('  IT-10 guard: minimal, not full skill...');
  assert.ok(
    bootstrap.length > 300 && bootstrap.length < 1500,
    `bootstrap should be the ~minimal size, got ${bootstrap.length} chars`,
  );
  assert.ok(
    !bootstrap.includes('Core Philosophy'),
    'full arc-using SKILL.md content (e.g. "Core Philosophy") must be absent',
  );
  console.log(`    ✓ minimal bootstrap (${bootstrap.length} chars), no full-skill content`);

  // 4. stable output across calls (module-level cache yields identical string)
  console.log('  stable output across calls...');
  const output2 = {};
  await transform(undefined, output2);
  assert.strictEqual(
    output2.system[0],
    bootstrap,
    'a second transform call should yield an identical bootstrap string',
  );
  console.log('    ✓ second call yields identical bootstrap');

  console.log('\n✅ All opencode-plugin tests passed!\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
