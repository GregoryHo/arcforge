/**
 * Cross-platform utilities for Claude Code scripts and hooks
 * Provides file operations, JSON handling, and command detection
 *
 * NOTE: This is the canonical location. Hooks import directly from here.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

// Module-level cached session ID (set from hook input)
let _cachedSessionId = null;

/**
 * Set session ID from hook input JSON
 * Call this early in hook execution to ensure consistent session ID
 * @param {Object} input - Parsed hook input JSON containing session_id
 * @returns {string|null} The cached session ID
 */
function setSessionIdFromInput(input) {
  if (input?.session_id) {
    _cachedSessionId = input.session_id;
  }
  return _cachedSessionId;
}

/**
 * Clear cached session ID (for testing)
 */
function clearCachedSessionId() {
  _cachedSessionId = null;
}

/**
 * Escape a string for safe JSON embedding
 * Handles newlines, tabs, quotes, backslashes, and control characters
 */
function escapeForJson(str) {
  if (typeof str !== 'string') return '';
  return (
    str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control char sanitization
      .replace(/[\x00-\x1f\x7f]/g, (char) => {
        return `\\u${(`0000${char.charCodeAt(0).toString(16)}`).slice(-4)}`;
      })
  );
}

/**
 * Check if a file exists
 */
function fileExists(filePath) {
  return fs.existsSync(filePath);
}

/**
 * Read file safely, returning null on error
 */
function readFileSafe(filePath, encoding = 'utf8') {
  try {
    return fs.readFileSync(filePath, encoding);
  } catch {
    return null;
  }
}

/**
 * Write file safely, returning success boolean
 */
function writeFileSafe(filePath, content, options = {}) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, options);
    return true;
  } catch {
    return false;
  }
}

/**
 * Atomic file write — write to a sibling tmp path, then rename.
 * Sibling tmp guarantees same-filesystem rename (real atomicity, not a copy).
 * Cleans up the tmp file on rename failure to avoid leaving orphans in the
 * destination directory. Throws on any I/O failure — callers that prefer a
 * boolean-result wrapper should catch and convert.
 *
 * @param {string} destPath - Final destination path (absolute recommended).
 * @param {string} content - Content to write.
 * @param {object} [options] - Write options (encoding etc.); default utf8.
 * @returns {string} The destination path.
 */
function atomicWriteFile(destPath, content, options = { encoding: 'utf8' }) {
  const tmpPath = `${destPath}.tmp`;
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(tmpPath, content, options);
  try {
    fs.renameSync(tmpPath, destPath);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // best-effort cleanup; ignore.
    }
    throw err;
  }
  return destPath;
}

/**
 * Get cross-platform temp directory
 */
function getTempDir() {
  return os.tmpdir();
}

/**
 * Walk up directory tree to find a file
 * @param {string} filename - Name of file to find (e.g., 'tsconfig.json')
 * @param {string} startDir - Directory to start search from
 * @returns {string|null} Path to found file, or null if not found
 */
function findUpwards(filename, startDir = process.cwd()) {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const filePath = path.join(currentDir, filename);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
    currentDir = path.dirname(currentDir);
  }

  // Check root directory
  const rootPath = path.join(root, filename);
  if (fs.existsSync(rootPath)) {
    return rootPath;
  }

  return null;
}

/**
 * Get the path to an executable command
 * Returns null if not found
 * Uses execFileSync to avoid shell injection
 */
function getCommandPath(command) {
  try {
    const isWindows = process.platform === 'win32';
    const whichCmd = isWindows ? 'where' : 'which';
    // execFileSync is safe - no shell interpretation
    const result = execFileSync(whichCmd, [command], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // 'where' on Windows returns multiple lines, take first
    return result.trim().split('\n')[0].trim();
  } catch {
    return null;
  }
}

/**
 * Check if a command exists
 */
function commandExists(command) {
  return Boolean(getCommandPath(command));
}

/**
 * Execute a command safely using execFileSync (no shell injection)
 * Returns { stdout, stderr, exitCode } or { error }
 */
function execCommand(command, args = [], options = {}) {
  try {
    const stdout = execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: options.timeout || 30000,
      cwd: options.cwd || process.cwd(),
      ...options,
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || err.message,
      exitCode: err.status || 1,
      error: err,
    };
  }
}

/**
 * Parse stdin JSON (for hook input)
 * Returns parsed object or null on error
 */
function parseStdinJson(stdinContent) {
  try {
    return JSON.parse(stdinContent);
  } catch {
    return null;
  }
}

/**
 * Read stdin synchronously (blocking)
 * For hooks that need sync operation
 */
function readStdinSync() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

// =============================================================================
// ANSI COLOR CODES - for terminal output
// =============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  // Foreground
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  // Bright foreground
  brightYellow: '\x1b[93m',
  brightCyan: '\x1b[96m',
  // Background
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

/**
 * Check if stderr supports colors (is a TTY)
 */
function supportsColor() {
  return process.stderr.isTTY && !process.env.NO_COLOR;
}

/**
 * Wrap text with color codes (only if TTY supports it)
 * @param {string} text - Text to colorize
 * @param {...string} codes - Color codes to apply
 */
function colorize(text, ...codes) {
  if (!supportsColor()) return text;
  return codes.join('') + text + colors.reset;
}

/**
 * Log to stderr - visible to USER in terminal, NOT sent to Claude
 * Use for: debug info, progress messages, warnings that don't need Claude's attention
 *
 * @param {string} message - Message to log
 */
function log(message) {
  console.error(message);
}

/**
 * Log highlighted message to stderr - for important notices
 * Uses bright yellow + bold for visibility
 *
 * @param {string} message - Message to log with highlighting
 */
function logHighlight(message) {
  console.error(colorize(message, colors.bold, colors.brightYellow));
}

/**
 * Output to stdout - raw output for hook chaining
 * For SessionStart/UserPromptSubmit hooks, stdout becomes additionalContext
 * For other hooks, stdout is only visible in verbose mode (Ctrl+O)
 *
 * @param {string|Object} data - Data to output (objects are JSON.stringified)
 */
function output(data) {
  if (typeof data === 'object') {
    console.log(JSON.stringify(data));
  } else {
    console.log(data);
  }
}

/**
 * Output structured hook response with additionalContext for Claude
 * Use for: SessionStart, UserPromptSubmit hooks that need to add context
 *
 * This outputs the proper JSON format that Claude Code expects:
 * { hookSpecificOutput: { hookEventName, additionalContext } }
 *
 * @param {string} context - The context string Claude should receive
 * @param {string} eventName - The hook event name (default: 'Hook')
 */
function outputContext(context, eventName = 'Hook') {
  output({
    hookSpecificOutput: {
      hookEventName: eventName,
      additionalContext: context,
    },
  });
}

/**
 * Output combined hook response with both systemMessage (user-visible) and additionalContext (Claude-visible).
 * Use for: SessionStart/UserPromptSubmit hooks that need to show the user a summary AND inject context to Claude.
 *
 * @param {string|null} userMessage - Message shown to user (systemMessage), null to skip
 * @param {string|null} claudeContext - Context injected into Claude (additionalContext), null to skip
 * @param {string} eventName - The hook event name (default: 'Hook')
 */
function outputCombined(userMessage, claudeContext, eventName = 'Hook') {
  if (!userMessage && !claudeContext) return;

  const result = {};
  if (userMessage) {
    result.systemMessage = userMessage;
  }
  if (claudeContext) {
    result.hookSpecificOutput = {
      hookEventName: eventName,
      additionalContext: claudeContext,
    };
  }
  output(result);
}

/**
 * Output decision response for Stop hooks
 * Use for: Stop hooks that need Claude to execute a prompt before stopping
 *
 * This outputs: { decision: 'block', reason }
 * Claude will see the reason and execute it as a prompt.
 *
 * @param {string} reason - The prompt/reason for Claude to execute
 */
function outputDecision(reason) {
  output({ decision: 'block', reason });
}

/**
 * Output highlighted decision response for Stop hooks
 * Same as outputDecision but colorizes first line for visibility
 *
 * @param {string} reason - The prompt/reason for Claude to execute
 */
function outputDecisionHighlight(reason) {
  const lines = reason.split('\n');
  const coloredFirstLine = colors.bold + colors.brightYellow + lines[0] + colors.reset;
  const coloredReason = [coloredFirstLine, ...lines.slice(1)].join('\n');
  output({ decision: 'block', reason: coloredReason });
}

/**
 * Get session ID from cache, environment, or generate one
 * Priority: _cachedSessionId > CLAUDE_SESSION_ID > process.ppid > 'default'
 */
function getSessionId() {
  return `session-${_cachedSessionId || process.env.CLAUDE_SESSION_ID || process.ppid || 'default'}`;
}

/**
 * Get project name from CLAUDE_PROJECT_DIR or current directory
 */
function getProjectName() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  return path.basename(projectDir);
}

/**
 * Get current date in YYYY-MM-DD format
 */
function getDateString() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * Get ISO timestamp
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * Generate a compact, filesystem-safe run identifier.
 * Format: YYYYMMDD-HHmmss (sortable, unique per second).
 * Used to group eval trials from the same CLI invocation.
 * @returns {string} Run ID (e.g., '20260320-143022')
 */
function generateRunId() {
  const iso = getTimestamp();
  return `${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 19).replace(/:/g, '')}`;
}

/**
 * Root for all arcforge user state (worktrees, sessions, diaries).
 * Lives outside ~/.claude/ because Claude Code v2.1.78+ protects ~/.claude/
 * from nested-subprocess Write calls, which breaks the background enricher.
 */
function getArcforgeHome() {
  return path.join(os.homedir(), '.arcforge');
}

function getSessionsDir() {
  return path.join(getArcforgeHome(), 'sessions');
}

function getProjectSessionsDir(project) {
  return path.join(getSessionsDir(), project);
}

function getSessionDir(project, date) {
  return path.join(getSessionsDir(), project, date);
}

function getDiariesDir() {
  return path.join(getArcforgeHome(), 'diaries');
}

function getProjectDiariesDir(project) {
  return path.join(getDiariesDir(), project);
}

function getDateDiariesDir(project, date) {
  return path.join(getDiariesDir(), project, date);
}

function getDiaryDraftPath(project, date, sessionId) {
  return path.join(getDateDiariesDir(project, date), `diary-${sessionId}-draft.md`);
}

function getDiaryFilePath() {
  return path.join(
    getDateDiariesDir(getProjectName(), getDateString()),
    `diary-${getSessionId()}.md`,
  );
}

function getDiaryedDir(project = null) {
  const base = path.join(getArcforgeHome(), 'diaryed');
  return project ? path.join(base, project) : path.join(base, 'global');
}

/**
 * Get compaction log file path for a project
 * Located at ~/.arcforge/sessions/{project}/compaction-log.txt
 */
function getCompactionLogPath(project) {
  return path.join(getProjectSessionsDir(project), 'compaction-log.txt');
}

/**
 * Sanitize a filename to prevent path traversal attacks.
 * Rejects names containing path separators, parent-dir sequences,
 * null bytes, or control characters. Throws on invalid input.
 *
 * @param {string} name - Filename to validate (e.g., skill name, instinct ID)
 * @returns {string} The validated filename (unchanged if valid)
 * @throws {Error} If the name is invalid
 */
function sanitizeFilename(name) {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error('Filename must be a non-empty string');
  }

  if (name.includes('/') || name.includes('\\')) {
    throw new Error(`Invalid filename: path separators not allowed: "${name}"`);
  }

  if (name.includes('..')) {
    throw new Error(`Invalid filename: parent directory traversal not allowed: "${name}"`);
  }

  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control char validation
  if (/[\x00-\x1f\x7f]/.test(name)) {
    throw new Error(`Invalid filename: control characters not allowed: "${name}"`);
  }

  return name;
}

/**
 * Normalize a value into an array.
 * Handles the various forms that depends_on can take from YAML parsing:
 * - falsy (null, undefined, '') → []
 * - already an array → pass-through
 * - string "[a, b]" (YAML flow syntax) → ['a', 'b']
 * - string "item" (plain string) → ['item']
 *
 * @param {*} value - Value to normalize
 * @returns {Array} Normalized array
 */
function normalizeArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const { parseValue } = require('./yaml-parser');
      const result = parseValue(trimmed);
      return Array.isArray(result) ? result : [result];
    }
    return [trimmed];
  }
  return [];
}

/**
 * Ensure a directory exists
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

/**
 * Create a session-scoped counter
 * Returns object with read(), write(), reset(), and getFilePath() methods
 *
 * @param {string} name - Counter name (e.g., 'tool-count', 'user-count')
 * @returns {Object} Counter interface
 */
function createSessionCounter(name) {
  function getFilePath() {
    const sessionId = getSessionId();
    return path.join(getTempDir(), `arcforge-${name}-${sessionId}`);
  }

  function read() {
    const content = readFileSafe(getFilePath());
    const count = parseInt(content, 10);
    return Number.isNaN(count) ? 0 : count;
  }

  function write(count) {
    writeFileSafe(getFilePath(), String(count));
  }

  function reset() {
    write(0);
  }

  return { read, write, reset, getFilePath };
}

/**
 * Get session file path for current session
 * Returns ~/.arcforge/sessions/{project}/{date}/{sessionId}.json
 */
function getSessionFilePath() {
  const project = getProjectName();
  const date = getDateString();
  const sessionId = getSessionId();
  return path.join(getSessionDir(project, date), `${sessionId}.json`);
}

/**
 * Load current session from file
 * Returns parsed session object or null on error
 */
function loadSession() {
  const content = readFileSafe(getSessionFilePath());
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Save session to file
 * Returns success boolean
 */
function saveSession(session) {
  return writeFileSafe(getSessionFilePath(), JSON.stringify(session, null, 2));
}

module.exports = {
  escapeForJson,
  fileExists,
  readFileSafe,
  writeFileSafe,
  atomicWriteFile,
  getTempDir,
  findUpwards,
  commandExists,
  execCommand,
  parseStdinJson,
  readStdinSync,
  // Session ID caching
  setSessionIdFromInput,
  clearCachedSessionId,
  // Hook I/O helpers (preferred)
  log,
  logHighlight,
  output,
  outputContext,
  outputCombined,
  outputDecision,
  outputDecisionHighlight,
  // Color utilities (internal: colors, colorize, supportsColor)
  // Session management
  getSessionId,
  getProjectName,
  getDateString,
  getTimestamp,
  generateRunId,
  getArcforgeHome,
  getSessionsDir,
  getProjectSessionsDir,
  getSessionDir,
  getDiariesDir,
  getProjectDiariesDir,
  getDateDiariesDir,
  getDiaryFilePath,
  getDiaryDraftPath,
  getDiaryedDir,
  getCompactionLogPath,
  ensureDir,
  normalizeArray,
  sanitizeFilename,
  createSessionCounter,
  getSessionFilePath,
  loadSession,
  saveSession,
  CLAUDE_MAX_BUFFER: 50 * 1024 * 1024, // 50MB — Claude verbose output can be large
};
