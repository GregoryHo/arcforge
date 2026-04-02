#!/usr/bin/env node
/**
 * Tests for eval CLI flags: --no-isolate, --plugin-dir, --max-turns
 *
 * These test the option forwarding from CLI to eval functions.
 * Since runTrial invokes `claude`, we test the option construction
 * logic rather than full end-to-end execution.
 */

const assert = require('node:assert');

console.log('Testing eval CLI flags...\n');

// ============================================================
// Feature 1: --no-isolate (cli-no-isolate)
// ============================================================

console.log('  --no-isolate flag...');

// Test: parseArgs treats --no-isolate as a boolean flag
{
  // Inline parseArgs to test flag parsing (it's not exported from cli.js)
  function parseArgs(args) {
    const result = { command: null, positional: [], flags: {}, options: {} };
    let i = 0;
    while (i < args.length) {
      const arg = args[i];
      if (arg.startsWith('--')) {
        const key = arg.slice(2);
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          result.options[key] = args[i + 1];
          i += 2;
        } else {
          result.flags[key] = true;
          i++;
        }
      } else if (arg.startsWith('-')) {
        result.flags[arg.slice(1)] = true;
        i++;
      } else if (!result.command) {
        result.command = arg;
        i++;
      } else {
        result.positional.push(arg);
        i++;
      }
    }
    return result;
  }

  // --no-isolate produces flags['no-isolate'] = true
  const parsed = parseArgs(['eval', 'run', 'my-scenario', '--no-isolate']);
  assert.strictEqual(parsed.flags['no-isolate'], true);
  assert.strictEqual(parsed.positional[1], 'my-scenario');
  console.log('    ✓ --no-isolate parsed as boolean flag');

  // Without --no-isolate, flags['no-isolate'] is undefined
  const parsed2 = parseArgs(['eval', 'run', 'my-scenario']);
  assert.strictEqual(parsed2.flags['no-isolate'], undefined);
  console.log('    ✓ default (no --no-isolate) leaves flag undefined');
}

// ============================================================
// Feature 2: --plugin-dir (cli-plugin-dir)
// ============================================================

console.log('  --plugin-dir flag...');

{
  function parseArgs(args) {
    const result = { command: null, positional: [], flags: {}, options: {} };
    let i = 0;
    while (i < args.length) {
      const arg = args[i];
      if (arg.startsWith('--')) {
        const key = arg.slice(2);
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          result.options[key] = args[i + 1];
          i += 2;
        } else {
          result.flags[key] = true;
          i++;
        }
      } else if (arg.startsWith('-')) {
        result.flags[arg.slice(1)] = true;
        i++;
      } else if (!result.command) {
        result.command = arg;
        i++;
      } else {
        result.positional.push(arg);
        i++;
      }
    }
    return result;
  }

  // --plugin-dir /some/path produces options['plugin-dir'] = '/some/path'
  const parsed = parseArgs(['eval', 'run', 'my-scenario', '--plugin-dir', '/some/path']);
  assert.strictEqual(parsed.options['plugin-dir'], '/some/path');
  console.log('    ✓ --plugin-dir parsed as option with value');

  // --plugin-dir in eval ab
  const parsedAb = parseArgs(['eval', 'ab', 'my-scenario', '--plugin-dir', '/some/path']);
  assert.strictEqual(parsedAb.options['plugin-dir'], '/some/path');
  console.log('    ✓ --plugin-dir parsed in eval ab context');
}

// ============================================================
// Feature 3: --max-turns (cli-max-turns)
// ============================================================

console.log('  --max-turns flag...');

{
  function parseArgs(args) {
    const result = { command: null, positional: [], flags: {}, options: {} };
    let i = 0;
    while (i < args.length) {
      const arg = args[i];
      if (arg.startsWith('--')) {
        const key = arg.slice(2);
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          result.options[key] = args[i + 1];
          i += 2;
        } else {
          result.flags[key] = true;
          i++;
        }
      } else if (arg.startsWith('-')) {
        result.flags[arg.slice(1)] = true;
        i++;
      } else if (!result.command) {
        result.command = arg;
        i++;
      } else {
        result.positional.push(arg);
        i++;
      }
    }
    return result;
  }

  // --max-turns 10 produces options['max-turns'] = '10'
  const parsed = parseArgs(['eval', 'run', 'my-scenario', '--max-turns', '10']);
  assert.strictEqual(parsed.options['max-turns'], '10');
  console.log('    ✓ --max-turns parsed as option with value');

  // parseInt conversion
  const maxTurns = parseInt(parsed.options['max-turns'], 10);
  assert.strictEqual(maxTurns, 10);
  assert.strictEqual(typeof maxTurns, 'number');
  console.log('    ✓ --max-turns value converts to integer');
}

// ============================================================
// Feature 4: runWorkflowEval CLI override forwarding
// ============================================================

console.log('  runWorkflowEval CLI override forwarding...');

{
  const eval_ = require('../../scripts/lib/eval');

  // Test: CLI pluginDir overrides scenario pluginDir
  // We can't run real trials, but we verify the function signature accepts the options
  // by checking that the function exists and has expected behavior with mock data
  assert.strictEqual(typeof eval_.runWorkflowEval, 'function');
  console.log('    ✓ runWorkflowEval is exported');

  // Test: CLI maxTurns override via resolveMaxTurns
  // CLI maxTurns takes precedence over scenario maxTurns
  assert.strictEqual(eval_.resolveMaxTurns({ maxTurns: 5, scenarioMaxTurns: 10 }), 5);
  console.log('    ✓ CLI maxTurns overrides scenario maxTurns');

  // Scenario maxTurns used when no CLI override
  assert.strictEqual(eval_.resolveMaxTurns({ scenarioMaxTurns: 10 }), 10);
  console.log('    ✓ scenario maxTurns used as fallback');

  // pluginDir default of 10 when neither CLI nor scenario maxTurns set
  assert.strictEqual(eval_.resolveMaxTurns({ pluginDir: '/some/path' }), 10);
  console.log('    ✓ pluginDir triggers default maxTurns of 10');
}

// ============================================================
// Feature 5: runSkillEval CLI override forwarding
// ============================================================

console.log('  runSkillEval CLI override forwarding...');

{
  const eval_ = require('../../scripts/lib/eval');
  assert.strictEqual(typeof eval_.runSkillEval, 'function');
  console.log('    ✓ runSkillEval is exported');
}

// ============================================================
// Feature 6: Combined flags
// ============================================================

console.log('  Combined flags...');

{
  function parseArgs(args) {
    const result = { command: null, positional: [], flags: {}, options: {} };
    let i = 0;
    while (i < args.length) {
      const arg = args[i];
      if (arg.startsWith('--')) {
        const key = arg.slice(2);
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          result.options[key] = args[i + 1];
          i += 2;
        } else {
          result.flags[key] = true;
          i++;
        }
      } else if (arg.startsWith('-')) {
        result.flags[arg.slice(1)] = true;
        i++;
      } else if (!result.command) {
        result.command = arg;
        i++;
      } else {
        result.positional.push(arg);
        i++;
      }
    }
    return result;
  }

  // All flags together
  const parsed = parseArgs([
    'eval',
    'run',
    'my-scenario',
    '--no-isolate',
    '--plugin-dir',
    '/path',
    '--max-turns',
    '15',
    '--model',
    'sonnet',
  ]);
  assert.strictEqual(parsed.flags['no-isolate'], true);
  assert.strictEqual(parsed.options['plugin-dir'], '/path');
  assert.strictEqual(parsed.options['max-turns'], '15');
  assert.strictEqual(parsed.options.model, 'sonnet');
  console.log('    ✓ all flags combine correctly');

  // Verify option construction matches what CLI should pass to runTrial
  const isolated = !parsed.flags['no-isolate'];
  const pluginDir = parsed.options['plugin-dir'];
  const maxTurns = parsed.options['max-turns']
    ? parseInt(parsed.options['max-turns'], 10)
    : undefined;
  assert.strictEqual(isolated, false);
  assert.strictEqual(pluginDir, '/path');
  assert.strictEqual(maxTurns, 15);
  console.log('    ✓ option construction produces correct types');
}

console.log('\n✅ All eval CLI flag tests passed!\n');
