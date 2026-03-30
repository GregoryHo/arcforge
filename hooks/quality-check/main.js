#!/usr/bin/env node
/**
 * Quality check orchestrator for PostToolUse (Edit tool)
 *
 * Runs automatically after editing TypeScript/JavaScript files:
 * 1. Auto-format with Prettier (if available)
 * 2. Type-check with TypeScript (if available)
 * 3. Warn about console.log statements
 *
 * Warnings output via systemMessage (user-visible)
 * Prettier auto-formats files in-place
 */

const path = require('node:path');
const {
  readStdinSync,
  parseStdinJson,
  output,
  log,
  readFileSafe,
} = require('../../scripts/lib/utils');
const {
  detectPackageManager,
  hasDevDependency, // checks both deps + devDeps
} = require('../../scripts/lib/package-manager');
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
  const stdin = readStdinSync();
  const input = parseStdinJson(stdin);
  if (!input) {
    process.exit(0);
    return;
  }

  const filePath = input.tool_input?.file_path;
  if (!filePath || !/\.(ts|tsx|js|jsx)$/.test(filePath)) {
    process.exit(0);
    return;
  }

  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  const projectDir = process.cwd();
  const pm = detectPackageManager(projectDir);
  const fileName = path.basename(filePath);
  const warnings = [];

  // 1. Run Prettier (if available)
  if (pm && hasDevDependency('prettier', projectDir)) {
    const prettierResult = runPrettier(absolutePath, pm);
    if (prettierResult.formatted) {
      warnings.push(`Formatted: ${fileName}`);
    }
  }

  // 2. Run TypeScript check (for .ts/.tsx files)
  if (/\.(ts|tsx)$/.test(filePath) && pm && hasDevDependency('typescript', projectDir)) {
    const tsResult = runTypeCheck(absolutePath, pm);
    if (tsResult.errors && tsResult.errors.length > 0) {
      warnings.push(`TypeScript errors in ${fileName}:`);
      for (const err of tsResult.errors) warnings.push(`  ${err}`);
    }
  }

  // 3. Check for console.log statements
  const consoleLogs = checkConsoleLogs(absolutePath);
  if (consoleLogs.length > 0) {
    warnings.push(`console.* found in ${fileName}:`);
    consoleLogs.slice(0, 15).forEach((match) => {
      warnings.push(`  Line ${match.line}: ${match.content}...`);
    });
    if (consoleLogs.length > 15) {
      warnings.push(`  ... and ${consoleLogs.length - 15} more`);
    }
  }

  if (warnings.length > 0) {
    output({ systemMessage: warnings.join('\n') });
  }

  process.exit(0);
}

module.exports = { checkConsoleLogs };

try {
  if (require.main === module) main();
} catch (err) {
  log(`[quality-check] Error: ${err.message}`);
  process.exit(0);
}
