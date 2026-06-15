#!/usr/bin/env node
/**
 * Quality check orchestrator for PostToolUse (Edit and Write tools)
 *
 * Runs automatically after Edit/Write of TypeScript/JavaScript files:
 * 1. Auto-format with Prettier (if available)
 * 2. Type-check with TypeScript (if available)
 * 3. Warn about console.log/debug/info statements
 *    (console.warn/error are intentionally NOT flagged — they are the
 *    prescribed CLI error-output layer; see coding standards)
 *
 * Output channels (RV-3):
 * - TypeScript errors + console.* findings are actionable for the model →
 *   the model-visible PostToolUse channel (additionalContext) so the next
 *   turn can fix them.
 * - The `Formatted:` notice is a fait accompli (Prettier already rewrote the
 *   file) — user-visible systemMessage only, never the model channel.
 */

const path = require('node:path');
const {
  readStdinSync,
  parseStdinJson,
  output,
  outputPostToolUseFeedback,
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
 * Check for console.log/debug/info statements in a file.
 * console.warn/error are excluded: they are the prescribed CLI error layer.
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

    if (/\bconsole\.(log|debug|info)\s*\(/.test(line)) {
      matches.push({ line: i + 1, content: trimmed.slice(0, 60) });
    }
  }

  return matches;
}

/**
 * Run the quality checks for one file and bucket their output by audience.
 *
 * Pure given its inputs (it does run Prettier/tsc as side effects, but returns
 * no I/O of its own): callers decide how to emit the two channels.
 *   - modelReason: actionable defects the next turn should fix (TypeScript
 *     errors, console.* findings) → the model-visible PostToolUse channel.
 *   - systemMessage: the `Formatted:` notice (Prettier already rewrote the
 *     file) → user-visible only.
 *
 * @returns {{ modelReason: string|null, systemMessage: string|null }}
 */
function collectFindings(absolutePath, filePath, projectDir) {
  const fileName = path.basename(filePath);
  const pm = detectPackageManager(projectDir);
  const modelLines = [];
  let systemMessage = null;

  // 1. Run Prettier (if available) — user-visible only (fait accompli).
  if (pm && hasDevDependency('prettier', projectDir)) {
    const prettierResult = runPrettier(absolutePath, pm);
    if (prettierResult.formatted) {
      systemMessage = `Formatted: ${fileName}`;
    }
  }

  // 2. Run TypeScript check (for .ts/.tsx files) — model-actionable.
  if (/\.(ts|tsx)$/.test(filePath) && pm && hasDevDependency('typescript', projectDir)) {
    const tsResult = runTypeCheck(absolutePath, pm);
    if (tsResult.errors && tsResult.errors.length > 0) {
      modelLines.push(`TypeScript errors in ${fileName}:`);
      for (const err of tsResult.errors) modelLines.push(`  ${err}`);
    }
  }

  // 3. Check for console.log statements — model-actionable.
  const consoleLogs = checkConsoleLogs(absolutePath);
  if (consoleLogs.length > 0) {
    modelLines.push(`console.* found in ${fileName}:`);
    consoleLogs.slice(0, 15).forEach((match) => {
      modelLines.push(`  Line ${match.line}: ${match.content}...`);
    });
    if (consoleLogs.length > 15) {
      modelLines.push(`  ... and ${consoleLogs.length - 15} more`);
    }
  }

  return { modelReason: modelLines.length > 0 ? modelLines.join('\n') : null, systemMessage };
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
  const { modelReason, systemMessage } = collectFindings(absolutePath, filePath, process.cwd());

  // Model-actionable findings go to the model channel (additionalContext),
  // merging the `Formatted:` notice as a user-visible systemMessage into the
  // same JSON object when present. The formatted-only case must NOT call the
  // helper — it throws on an empty reason — so route it through plain output().
  if (modelReason) {
    outputPostToolUseFeedback(modelReason, systemMessage ? { systemMessage } : undefined);
  } else if (systemMessage) {
    output({ systemMessage });
  }

  process.exit(0);
}

module.exports = { checkConsoleLogs, collectFindings };

try {
  if (require.main === module) main();
} catch (err) {
  log(`[quality-check] Error: ${err.message}`);
  process.exit(0);
}
