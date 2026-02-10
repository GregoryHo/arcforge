#!/usr/bin/env node
/**
 * Quality check orchestrator for PostToolUse (Edit tool)
 *
 * Runs automatically after editing TypeScript/JavaScript files:
 * 1. Auto-format with Prettier (if available)
 * 2. Type-check with TypeScript (if available)
 * 3. Warn about console.log statements
 *
 * Passthrough: stdin JSON is passed to stdout unchanged
 * Warnings go to stderr only
 */

const path = require('path');
const { readStdinSync, parseStdinJson, log, readFileSafe } = require('../lib/utils');
const { detectPackageManager, hasDevDependency } = require('../lib/package-manager');
const { runPrettier } = require('./prettier');
const { runTypeCheck } = require('./typescript');

/**
 * Check for console.log statements in a file
 */
function checkConsoleLogs(filePath) {
  const content = readFileSafe(filePath);
  if (!content) return [];

  const matches = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    // Skip commented lines
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

    if (/\bconsole\.(log|warn|error|debug|info)\s*\(/.test(line)) {
      matches.push({ line: i + 1, content: trimmed.slice(0, 60) });
    }
  }

  return matches;
}

/**
 * Main entry point
 */
function main() {
  // Read and pass through stdin
  const stdin = readStdinSync();
  process.stdout.write(stdin);

  // Parse the hook input
  const input = parseStdinJson(stdin);
  if (!input) {
    log('[quality-check] Could not parse hook input');
    process.exit(0);
    return;
  }

  // Get the file path from tool_input
  const filePath = input.tool_input?.file_path;
  if (!filePath) {
    process.exit(0);
    return; // No file path, nothing to do
  }

  // Verify it's a JS/TS file (should already be filtered by matcher, but double-check)
  if (!/\.(ts|tsx|js|jsx)$/.test(filePath)) {
    process.exit(0);
    return;
  }

  // Get absolute path
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);

  const projectDir = process.cwd();
  const pm = detectPackageManager(projectDir);

  // 1. Run Prettier (if available)
  const hasPrettier = pm && hasDevDependency('prettier', projectDir);
  if (hasPrettier) {
    const prettierResult = runPrettier(absolutePath, pm);
    if (prettierResult.formatted) {
      log(`[quality-check] Formatted: ${path.basename(filePath)}`);
    } else if (prettierResult.error) {
      log(`[quality-check] Prettier error: ${prettierResult.error}`);
    }
  }

  // 2. Run TypeScript check (for .ts/.tsx files)
  if (/\.(ts|tsx)$/.test(filePath)) {
    const hasTypeScript = pm && hasDevDependency('typescript', projectDir);
    if (hasTypeScript) {
      const tsResult = runTypeCheck(absolutePath, pm);
      if (tsResult.errors && tsResult.errors.length > 0) {
        log(`[quality-check] TypeScript errors in ${path.basename(filePath)}:`);
        tsResult.errors.forEach(err => {
          log(`  ${err}`);
        });
      }
    }
  }

  // 3. Check for console.log statements
  const consoleLogs = checkConsoleLogs(absolutePath);
  if (consoleLogs.length > 0) {
    log(`[quality-check] console.* found in ${path.basename(filePath)}:`);
    // Show max 15 occurrences
    consoleLogs.slice(0, 15).forEach(match => {
      log(`  Line ${match.line}: ${match.content}...`);
    });
    if (consoleLogs.length > 15) {
      log(`  ... and ${consoleLogs.length - 15} more`);
    }
  }

  process.exit(0);
}

try {
  main();
} catch (err) {
  console.error('[quality-check] Error:', err.message);
  process.exit(0);
}
