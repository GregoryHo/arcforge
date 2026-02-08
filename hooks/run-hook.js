#!/usr/bin/env node
/**
 * Node.js hook dispatcher for Claude Code hooks
 * Cross-platform replacement for run-hook.cmd
 *
 * Usage: node run-hook.js <hook-script>
 * Example: node run-hook.js quality-check/main.js
 */

const path = require('path');

const hookScript = process.argv[2];

if (!hookScript) {
  console.error('Usage: run-hook.js <hook-script>');
  process.exit(1);
}

// Resolve script path relative to hooks directory
const hooksDir = __dirname;
const scriptPath = path.resolve(hooksDir, hookScript);

// Execute the hook script
try {
  require(scriptPath);
} catch (err) {
  console.error(`Hook error (${hookScript}): ${err.message}`);
  process.exit(1);
}
