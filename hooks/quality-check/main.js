#!/usr/bin/env node
/**
 * Quality check for edited TypeScript/JavaScript files.
 *
 * v5 Stop-time batching: on PostToolUse this hook is a path ACCUMULATOR only —
 * it records the edited .ts/.tsx/.js/.jsx path into a session temp file and
 * emits nothing. The heavy work (Prettier + tsc + console.* scan) runs ONCE at
 * Stop over the unique accumulated paths (runStopBatch, invoked by the Stop hook
 * session-tracker/end.js) instead of after every edit.
 *
 * Behavior delta (documented): files are no longer auto-formatted mid-task, and
 * findings arrive at Stop over the user-visible systemMessage channel only — the
 * PostToolUse model channel (additionalContext) is unavailable at Stop, and lint
 * findings must NOT block the Stop with a decision.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  readStdinSync,
  parseStdinJson,
  log,
  readFileSafe,
  getTempDir,
  getSessionId,
} = require('../../scripts/lib/utils');
const {
  detectPackageManager,
  hasDevDependency, // checks both deps + devDeps
} = require('../../scripts/lib/package-manager');
const { runPrettier } = require('./prettier');
const { runTypeCheck } = require('./typescript');

const QUALITY_EXT_RE = /\.(ts|tsx|js|jsx)$/;

/**
 * Session-scoped file accumulating the edited paths pending a Stop-time batch.
 * Mirrors the tmp-dir counter layout so it is wiped between sessions.
 */
function accumPath() {
  return path.join(getTempDir(), `arcforge-quality-paths-${getSessionId()}`);
}

/**
 * Read the accumulated edited paths (deduped, absolute). [] when none.
 */
function readAccumulated() {
  const raw = readFileSafe(accumPath());
  if (!raw) return [];
  return [...new Set(raw.split('\n').filter(Boolean))];
}

/**
 * PostToolUse rule: record an edited quality-eligible path for the Stop batch.
 * Emits nothing (returns null). Non-Edit/Write tools and non-code paths no-op.
 *
 * @param {Object|null} input - Parsed hook stdin.
 * @returns {null}
 */
function accumulate(input) {
  if (!input) return null;
  const tool = input.tool_name;
  if (tool !== 'Edit' && tool !== 'Write') return null;
  const filePath = input.tool_input?.file_path;
  if (typeof filePath !== 'string' || !QUALITY_EXT_RE.test(filePath)) return null;

  const cwd = input.cwd || process.cwd();
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
  try {
    const existing = new Set(readAccumulated());
    if (!existing.has(absolutePath)) {
      fs.appendFileSync(accumPath(), `${absolutePath}\n`);
    }
  } catch {
    // Non-blocking — a dropped accumulation just skips one file's Stop-time check.
  }
  return null;
}

/**
 * Run the Stop-time quality batch over the accumulated paths and clear the
 * accumulator. Runs Prettier + tsc + console.* scan once per unique path and
 * folds every finding (model-actionable + fait-accompli) into a single
 * user-visible systemMessage string. Returns null when there is nothing to say.
 *
 * @param {string} projectDir - Directory used for package-manager detection.
 * @returns {string|null}
 */
function runStopBatch(projectDir) {
  const paths = readAccumulated();
  if (paths.length === 0) return null;
  try {
    fs.rmSync(accumPath(), { force: true });
  } catch {
    // Best-effort — a stale accumulator only re-reports on the next Stop.
  }

  const messages = [];
  for (const absolutePath of paths) {
    if (!fs.existsSync(absolutePath)) continue;
    const { modelReason, systemMessage } = collectFindings(absolutePath, absolutePath, projectDir);
    if (systemMessage) messages.push(systemMessage);
    if (modelReason) messages.push(modelReason);
  }
  return messages.length > 0 ? messages.join('\n') : null;
}

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
      const heading = tsResult.standalone
        ? `TypeScript errors in ${fileName} (no tsconfig.json found — checked with default compiler options, may not reflect this project's real settings):`
        : `TypeScript errors in ${fileName}:`;
      modelLines.push(heading);
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
 * Main entry point — PostToolUse accumulator (emits nothing).
 */
function main() {
  const stdin = readStdinSync();
  const input = parseStdinJson(stdin);
  accumulate(input);
  process.exit(0);
}

module.exports = {
  checkConsoleLogs,
  collectFindings,
  accumulate,
  runStopBatch,
  accumPath,
  readAccumulated,
};

try {
  if (require.main === module) main();
} catch (err) {
  log(`[quality-check] Error: ${err.message}`);
  process.exit(0);
}
