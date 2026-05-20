#!/usr/bin/env node
/**
 * Observation Hook — PreToolUse/PostToolUse (async)
 *
 * Captures tool calls to observations.jsonl for behavioral pattern detection.
 * Registered with async: true to avoid blocking tool execution.
 *
 * Adapted from: continuous-learning-v2/hooks/observe.sh
 */

const fs = require('node:fs');
const path = require('node:path');

const {
  getProjectName,
  readStdinSync,
  parseStdinJson,
  setSessionIdFromInput,
  getSessionId,
} = require('../../scripts/lib/utils');
const {
  getObservationsPath,
  getObserverSignalFile,
  getObserverPidFile,
} = require('../../scripts/lib/session-utils');
const { getProjectId, isLearningEnabled } = require('../../scripts/lib/learning');

// ─────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────

const MAX_INPUT_LENGTH = 5000;
const MAX_OUTPUT_LENGTH = 5000;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const SIGNAL_COOLDOWN_MS = 30000; // 30 seconds between SIGUSR1 signals
const SIGNAL_TIMESTAMP_FILE = getObserverSignalFile();

/**
 * Get observations archive directory for a project.
 */
function getArchiveDir(project) {
  return `${path.dirname(getObservationsPath(project))}/archive`;
}

const getPidFile = getObserverPidFile;

function shouldObserve({
  projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd(),
  homeDir,
} = {}) {
  try {
    return (
      isLearningEnabled({ scope: 'project', projectRoot, homeDir }) ||
      isLearningEnabled({ scope: 'global', projectRoot, homeDir })
    );
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────
// Core Functions
// ─────────────────────────────────────────────

/**
 * Truncate string to max length with indicator.
 */
function truncate(str, maxLen) {
  if (!str || str.length <= maxLen) return str || '';
  return `${str.substring(0, maxLen)}...[truncated]`;
}

function redactObservationText(value) {
  return String(value || '')
    .replace(/\b(api[_-]?key|secret|password|passwd|token)\b\s*[:=]\s*"[^"]*"/gi, '$1="[REDACTED]"')
    .replace(/\b(api[_-]?key|secret|password|passwd|token)\b\s*[:=]\s*'[^']*'/gi, "$1='[REDACTED]'")
    .replace(/\b(api[_-]?key|secret|password|passwd|token)\b\s*[:=]\s*[^\s,}]+/gi, '$1=[REDACTED]')
    .replace(/\bAuthorization\s*:\s*Bearer\s+[^\s,}]+/gi, 'Authorization: Bearer [REDACTED]');
}

function sanitizeObservationPayload(value, maxLen) {
  return truncate(redactObservationText(value), maxLen);
}

/**
 * Extract the skill name from a Skill tool invocation. Returns null when the
 * tool is not Skill, the input is missing, or the skill field is absent.
 * Only the skill name is returned — never the args payload — so this remains
 * a metadata-only signal.
 */
function extractSkillName(toolName, toolInput) {
  if (toolName !== 'Skill') return null;
  if (!toolInput || typeof toolInput !== 'object') return null;
  const raw = toolInput.skill;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Skill names are bounded; cap defensively to avoid storing arbitrary text.
  return trimmed.slice(0, 128);
}

/**
 * Classify the coarse outcome of a tool call from its response metadata.
 * Returns one of 'success' | 'error' | 'unknown'. Inspects only structural
 * fields (is_error, error) — never the response body content.
 */
function classifyOutcome(toolResponse) {
  if (toolResponse === undefined || toolResponse === null) return 'unknown';
  if (typeof toolResponse !== 'object') return 'success';
  if (toolResponse.is_error === true) return 'error';
  if (toolResponse.error) return 'error';
  return 'success';
}

/**
 * Compute the byte size of a tool response payload without storing it.
 * Returns 0 when the response is missing.
 */
function responseByteSize(toolResponse) {
  if (toolResponse === undefined || toolResponse === null) return 0;
  try {
    const str = typeof toolResponse === 'string' ? toolResponse : JSON.stringify(toolResponse);
    return Buffer.byteLength(str || '', 'utf8');
  } catch {
    return 0;
  }
}

function buildObservedToolInput(toolName, toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return toolInput;
  if (toolName !== 'Skill') return toolInput;
  const skillName = extractSkillName(toolName, toolInput);
  return skillName ? { skill: skillName } : {};
}

// ---------------------------------------------------------------------------
// Semantic summaries
//
// Privacy-safe, bounded shape derived from the tool input. We never persist
// raw command lines, file contents, search queries, or skill args. We classify
// the call into a small vocabulary so the analyzer can reason about workflows
// without the redacted text. The contract: the persisted `semantic` object
// only contains short enums and `payload_saved=false`.
// ---------------------------------------------------------------------------

const PATH_CLASSES = [
  { key: 'test', regex: /(^|\/)tests?(\/|$)|\.test\.|_test\.|test_/ },
  { key: 'docs', regex: /(^|\/)docs?(\/|$)|\.md$/i },
  { key: 'config', regex: /\.(json|ya?ml|toml|ini)$/i },
  { key: 'script', regex: /^scripts\/|\.sh$/ },
  { key: 'source', regex: /^(src|lib|scripts)\//i },
];

function classifyPath(rawPath) {
  if (typeof rawPath !== 'string' || rawPath.length === 0) return 'unknown';
  for (const { key, regex } of PATH_CLASSES) if (regex.test(rawPath)) return key;
  if (/\.(js|ts|py|go|rs|java|rb|c|cpp|h|hpp)$/i.test(rawPath)) return 'source';
  return 'other';
}

const ALLOWED_FILE_KINDS = new Set([
  'js',
  'ts',
  'jsx',
  'tsx',
  'py',
  'md',
  'json',
  'yaml',
  'yml',
  'toml',
  'sh',
  'txt',
]);

function fileKindFromPath(rawPath) {
  if (typeof rawPath !== 'string') return 'unknown';
  const match = rawPath.match(/\.([a-z0-9]+)$/i);
  if (!match) return 'none';
  const ext = match[1].toLowerCase();
  return ALLOWED_FILE_KINDS.has(ext) ? ext : 'other';
}

function classifyBashCommand(rawCommand) {
  if (typeof rawCommand !== 'string' || rawCommand.trim() === '') return 'unknown';
  const head = rawCommand.trim().split(/\s+/)[0] || '';
  const lower = head.toLowerCase();
  if (/^(npm|yarn|pnpm|bun)$/.test(lower)) {
    if (/\btest\b/.test(rawCommand)) return 'test';
    if (/\b(lint|format|biome|eslint)\b/.test(rawCommand)) return 'lint';
    if (/\b(build|compile|tsc)\b/.test(rawCommand)) return 'build';
    return 'package';
  }
  if (/^(jest|pytest|mocha|vitest|cargo|go)$/.test(lower) && /test/.test(rawCommand)) return 'test';
  if (/^(jest|pytest|mocha|vitest)$/.test(lower)) return 'test';
  if (/^(biome|eslint|prettier|black|flake8|ruff)$/.test(lower)) return 'lint';
  if (/^(git)$/.test(lower)) return 'git';
  if (/^(grep|rg|find|ls|cat|head|tail|wc)$/.test(lower)) return 'inspect';
  if (/^(node|python3?|deno|bun)$/.test(lower)) return 'run';
  if (/^(make|cargo|go|gcc|clang)$/.test(lower)) return 'build';
  if (/^(curl|wget|http)$/.test(lower)) return 'network';
  return 'other';
}

function summarizeToolInput(toolName, toolInput) {
  if (!toolInput || typeof toolInput !== 'object') {
    return { tool: toolName, payload_saved: false };
  }
  const base = { tool: toolName, payload_saved: false };
  switch (toolName) {
    case 'Bash':
      return {
        ...base,
        operation: 'shell',
        command_kind: classifyBashCommand(toolInput.command),
      };
    case 'Read':
      return {
        ...base,
        operation: 'read',
        path_class: classifyPath(toolInput.file_path),
        file_kind: fileKindFromPath(toolInput.file_path),
      };
    case 'Edit':
    case 'Write':
      return {
        ...base,
        operation: toolName.toLowerCase(),
        path_class: classifyPath(toolInput.file_path),
        file_kind: fileKindFromPath(toolInput.file_path),
      };
    case 'Grep':
      return {
        ...base,
        operation: 'search',
        path_class: classifyPath(toolInput.path || toolInput.glob || ''),
      };
    case 'Glob':
      return { ...base, operation: 'glob' };
    case 'Skill': {
      const skillName = extractSkillName(toolName, toolInput);
      return { ...base, operation: 'skill', ...(skillName ? { skill_name: skillName } : {}) };
    }
    default:
      return { ...base, operation: 'other' };
  }
}

/**
 * Archive observations file if it exceeds MAX_FILE_SIZE.
 */
function archiveIfNeeded(obsPath, project) {
  try {
    if (!fs.existsSync(obsPath)) return;
    const stats = fs.statSync(obsPath);
    if (stats.size < MAX_FILE_SIZE) return;

    const archiveDir = getArchiveDir(project);
    fs.mkdirSync(archiveDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archivePath = path.join(archiveDir, `observations-${timestamp}.jsonl`);

    fs.renameSync(obsPath, archivePath);
  } catch {
    // Non-blocking — never fail the hook
  }
}

/**
 * Signal the observer daemon via SIGUSR1 with file-based cooldown.
 * Each hook invocation is a separate process — timestamp file coordinates cooldown.
 */
function signalDaemon() {
  try {
    // Check cooldown via timestamp file
    if (fs.existsSync(SIGNAL_TIMESTAMP_FILE)) {
      const lastSignal = fs.statSync(SIGNAL_TIMESTAMP_FILE).mtimeMs;
      if (Date.now() - lastSignal < SIGNAL_COOLDOWN_MS) return;
    }

    const pidFile = getPidFile();
    if (!fs.existsSync(pidFile)) return;
    const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
    if (pid > 0) {
      process.kill(pid, 'SIGUSR1');
      // Touch timestamp file (write updates mtime)
      fs.writeFileSync(SIGNAL_TIMESTAMP_FILE, String(Date.now()), 'utf-8');
    }
  } catch {
    // Daemon not running or signal failed — silently ignore
  }
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

function main() {
  try {
    const phase = process.argv[2]; // 'pre' or 'post'
    const stdin = readStdinSync();

    // Parse hook input
    const input = parseStdinJson(stdin);
    if (!input) {
      process.exit(0);
      return;
    }

    const project = getProjectName();
    if (!shouldObserve()) {
      process.exit(0);
      return;
    }
    setSessionIdFromInput(input);
    const sessionId = getSessionId();

    // Extract tool information
    const toolName = input.tool_name || input.tool || 'unknown';
    const event = phase === 'pre' ? 'tool_start' : 'tool_end';

    // Build observation entry
    const observation = {
      ts: new Date().toISOString(),
      event,
      tool: toolName,
      session: sessionId,
      project,
      project_id: getProjectId(process.env.CLAUDE_PROJECT_DIR || process.cwd()),
    };

    // Coarse skill-usage signal: when the call is a Skill invocation, record
    // only the skill name. This lets us answer "are non-learning skills used?"
    // without storing the args payload.
    const skillName = extractSkillName(toolName, input.tool_input);
    if (skillName) observation.skill = skillName;

    // Add semantic input summary based on phase. PreToolUse deliberately does
    // not persist raw tool input (commands, file paths, file contents, queries,
    // or skill args). The bounded semantic object is the durable payload.
    if (phase === 'pre' && input.tool_input) {
      try {
        observation.semantic = summarizeToolInput(toolName, input.tool_input);
      } catch {
        // Summary is best-effort; never block the observation.
      }
    }

    // PostToolUse uses `tool_response` per the Claude hook schema; older
    // payloads may still carry `tool_output`. Accept either.
    const toolResponse =
      input.tool_response !== undefined ? input.tool_response : input.tool_output;
    if (phase === 'post') {
      observation.outcome = classifyOutcome(toolResponse);
      observation.output_bytes = responseByteSize(toolResponse);
      // Do not persist response bodies for outcome telemetry. The byte count and
      // structural outcome are enough for usage analysis and keep PostToolUse
      // observations lightweight.
    }

    // Ensure directory exists
    const obsPath = getObservationsPath(project);
    fs.mkdirSync(path.dirname(obsPath), { recursive: true });

    // Archive if file is too large
    archiveIfNeeded(obsPath, project);

    // Append observation
    fs.appendFileSync(obsPath, `${JSON.stringify(observation)}\n`, 'utf-8');

    // Wake the LLM-curation daemon; statistical auto-trigger retired (Slice A).
    signalDaemon();
  } catch {
    // Non-blocking — never fail the hook
  }

  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {
  truncate,
  redactObservationText,
  sanitizeObservationPayload,
  extractSkillName,
  classifyOutcome,
  responseByteSize,
  buildObservedToolInput,
  summarizeToolInput,
  classifyPath,
  classifyBashCommand,
  fileKindFromPath,
  getArchiveDir,
  getPidFile,
  shouldObserve,
  MAX_INPUT_LENGTH,
  MAX_OUTPUT_LENGTH,
};
