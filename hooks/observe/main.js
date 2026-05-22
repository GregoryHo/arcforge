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
const { spawn } = require('node:child_process');

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
const {
  sanitizeObservationPayload,
  EVIDENCE_STATUS,
} = require('../../scripts/lib/sanitize-observation');
// summarizeToolInput is available for read-time consumers via:
// require('../../scripts/lib/learning-observation-view').summarizeToolInput

// ─────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────

const MAX_INPUT_LENGTH = 5000;
const MAX_OUTPUT_LENGTH = 5000;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const SIGNAL_COOLDOWN_MS = 30000; // 30 seconds between SIGUSR1 signals
const SIGNAL_TIMESTAMP_FILE = getObserverSignalFile();
const LAZY_START_THRESHOLD = Number(process.env.ARCFORGE_LAZY_START_THRESHOLD) || 50;
const SKIP_SPAWN = process.env.ARCFORGE_OBSERVE_NO_SPAWN === '1';

/**
 * Get observations archive directory for a project.
 */
function getArchiveDir(project) {
  return `${path.dirname(getObservationsPath(project))}/archive`;
}

const getPidFile = getObserverPidFile;

// Eval harness isolation — observations from eval trial dirs are not real user activity.
const EVAL_TRIAL_SEGMENT_RE = /\/\.eval-trials\//;
const EVAL_TRIAL_SUFFIX_RE = /-t\d+-[A-Za-z0-9]{6}$/;

// User-configured skip list — parsed once at module load (hook is a fresh process per event).
const USER_SKIP_ENTRIES = (process.env.ARCFORGE_OBSERVE_SKIP_PATHS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isSkippedPath(projectRoot) {
  if (EVAL_TRIAL_SEGMENT_RE.test(projectRoot)) return true;
  if (EVAL_TRIAL_SUFFIX_RE.test(projectRoot)) return true;
  for (const entry of USER_SKIP_ENTRIES) {
    if (projectRoot.includes(entry)) return true;
  }
  return false;
}

function shouldObserve({
  projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd(),
  homeDir,
} = {}) {
  try {
    if (process.env.ARCFORGE_OBSERVE_EXPLICIT_SKIP === '1') return false;
    if (process.env.ARCFORGE_OBSERVE_SELF_ANALYSIS === '1') return false;
    if (isSkippedPath(projectRoot)) return false;
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

// ---------------------------------------------------------------------------
// Per-tool collection contract (Layer 2 — SafeEvidencePatch)
//
// Returns a SafeEvidencePatch object. The patch is spread directly into the
// observation record — no nested `evidence` key.
//
// evidence_status values:
//   "present"                 — safe evidence fields were added
//   "omitted_no_input"        — no tool_input present
//   "omitted_unsupported_tool"— tool class not in the allowlist
//   "omitted_safety"          — payload existed but post-sanitize result is empty
//
// Fail-closed: raw fallback is forbidden. When a field cannot be proven safe,
// it is omitted. An empty post-sanitize result becomes omitted_safety.
// ---------------------------------------------------------------------------

/** Tool classes in the Layer 2 allowlist. */
const SUPPORTED_TOOLS = new Set([
  'Bash',
  'Read',
  'Edit',
  'Write',
  'Grep',
  'Glob',
  'NotebookEdit',
  'Skill',
  'WebFetch',
  'WebSearch',
]);

/**
 * Build a SafeEvidencePatch from a tool name and (optional) raw tool_input.
 * The returned object is spread into the observation record alongside the
 * Layer 1 event skeleton fields.
 *
 * @param {string} toolName
 * @param {object|null|undefined} toolInput
 * @returns {object} SafeEvidencePatch
 */
// Helper: classify the omit reason — empty raw input is omitted_no_input,
// non-empty raw that the sanitizer strips entirely is omitted_safety. Per
// Layer 2 spec these are semantically distinct and must not be conflated.
function classifyOmission(raw, sanitized) {
  if (!raw || !raw.trim()) return EVIDENCE_STATUS.OMITTED_NO_INPUT;
  if (!sanitized.trim()) return EVIDENCE_STATUS.OMITTED_SAFETY;
  return null;
}

function buildObservedEvidence(toolName, toolInput) {
  if (!toolInput || typeof toolInput !== 'object') {
    return { evidence_status: EVIDENCE_STATUS.OMITTED_NO_INPUT };
  }

  if (!SUPPORTED_TOOLS.has(toolName)) {
    return { evidence_status: EVIDENCE_STATUS.OMITTED_UNSUPPORTED_TOOL };
  }

  switch (toolName) {
    case 'Bash': {
      const raw = typeof toolInput.command === 'string' ? toolInput.command : '';
      const sanitized = sanitizeObservationPayload(raw, MAX_INPUT_LENGTH);
      const omit = classifyOmission(raw, sanitized);
      if (omit) return { evidence_status: omit };
      return {
        evidence_status: EVIDENCE_STATUS.PRESENT,
        input: sanitized,
        operation_kind: 'shell',
      };
    }
    case 'Read': {
      const raw = typeof toolInput.file_path === 'string' ? toolInput.file_path : '';
      const sanitized = sanitizeObservationPayload(raw, 1024);
      const omit = classifyOmission(raw, sanitized);
      if (omit) return { evidence_status: omit };
      return { evidence_status: EVIDENCE_STATUS.PRESENT, path: sanitized, operation_kind: 'read' };
    }
    case 'Edit': {
      const raw = typeof toolInput.file_path === 'string' ? toolInput.file_path : '';
      const sanitized = sanitizeObservationPayload(raw, 1024);
      const omit = classifyOmission(raw, sanitized);
      if (omit) return { evidence_status: omit };
      return { evidence_status: EVIDENCE_STATUS.PRESENT, path: sanitized, operation_kind: 'edit' };
    }
    case 'Write': {
      const raw = typeof toolInput.file_path === 'string' ? toolInput.file_path : '';
      const sanitized = sanitizeObservationPayload(raw, 1024);
      const omit = classifyOmission(raw, sanitized);
      if (omit) return { evidence_status: omit };
      return { evidence_status: EVIDENCE_STATUS.PRESENT, path: sanitized, operation_kind: 'write' };
    }
    case 'Grep': {
      const patternRaw = typeof toolInput.pattern === 'string' ? toolInput.pattern : '';
      const pathRaw = typeof toolInput.path === 'string' ? toolInput.path : '';
      const pattern = sanitizeObservationPayload(patternRaw, 512);
      const pathVal = sanitizeObservationPayload(pathRaw, 1024);
      const noRaw = !patternRaw.trim() && !pathRaw.trim();
      const noSanitized = !pattern.trim() && !pathVal.trim();
      if (noRaw) return { evidence_status: EVIDENCE_STATUS.OMITTED_NO_INPUT };
      if (noSanitized) return { evidence_status: EVIDENCE_STATUS.OMITTED_SAFETY };
      const patch = { evidence_status: EVIDENCE_STATUS.PRESENT, operation_kind: 'search' };
      if (pattern.trim()) patch.pattern = pattern;
      if (pathVal.trim()) patch.path = pathVal;
      return patch;
    }
    case 'Glob': {
      const raw = typeof toolInput.pattern === 'string' ? toolInput.pattern : '';
      const sanitized = sanitizeObservationPayload(raw, 512);
      const omit = classifyOmission(raw, sanitized);
      if (omit) return { evidence_status: omit };
      return { evidence_status: EVIDENCE_STATUS.PRESENT, glob: sanitized, operation_kind: 'glob' };
    }
    case 'NotebookEdit': {
      const raw = typeof toolInput.notebook_path === 'string' ? toolInput.notebook_path : '';
      const sanitized = sanitizeObservationPayload(raw, 1024);
      const omit = classifyOmission(raw, sanitized);
      if (omit) return { evidence_status: omit };
      return { evidence_status: EVIDENCE_STATUS.PRESENT, path: sanitized, operation_kind: 'edit' };
    }
    case 'Skill': {
      const skillName = extractSkillName(toolName, toolInput);
      if (!skillName) return { evidence_status: EVIDENCE_STATUS.OMITTED_NO_INPUT };
      // Skill args are never persisted.
      return {
        evidence_status: EVIDENCE_STATUS.PRESENT,
        skill: skillName,
        operation_kind: 'skill',
      };
    }
    case 'WebFetch':
    case 'WebSearch': {
      const urlRaw =
        typeof toolInput.url === 'string'
          ? toolInput.url
          : typeof toolInput.query === 'string'
            ? toolInput.query
            : '';
      const sanitized = sanitizeObservationPayload(urlRaw, 1024);
      const omit = classifyOmission(urlRaw, sanitized);
      if (omit) return { evidence_status: omit };
      let domain = '';
      try {
        domain = new URL(sanitized).hostname;
      } catch {
        domain = sanitized.split('/')[0] || '';
      }
      return {
        evidence_status: EVIDENCE_STATUS.PRESENT,
        url: sanitized,
        ...(domain ? { domain } : {}),
        operation_kind: 'network',
      };
    }
    default:
      return { evidence_status: EVIDENCE_STATUS.OMITTED_UNSUPPORTED_TOOL };
  }
}

// summarizeToolInput is now a read-time helper imported from
// scripts/lib/learning-observation-view (Decision 4 — not persisted).

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

/**
 * Spawn the observer daemon if observations >= LAZY_START_THRESHOLD and daemon not running.
 * Non-blocking, silent catch — never throws. Returns a status string for testability:
 *   'pid-exists' | 'no-file' | 'below-threshold' | 'no-spawn-env' | 'spawned' | 'error'
 */
function spawnDaemonIfNeeded(obsPath) {
  try {
    const pidFile = getPidFile();
    if (fs.existsSync(pidFile)) return 'pid-exists';
    if (!fs.existsSync(obsPath)) return 'no-file';

    const content = fs.readFileSync(obsPath, 'utf-8');
    const lineCount = content.split('\n').filter((l) => l.trim()).length;
    if (lineCount < LAZY_START_THRESHOLD) return 'below-threshold';

    if (SKIP_SPAWN) return 'no-spawn-env';

    const daemonScript = path.resolve(
      __dirname,
      '../../skills/arc-observing/scripts/observer-daemon.sh',
    );
    const child = spawn('bash', [daemonScript, 'start'], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return 'spawned';
  } catch {
    return 'error';
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

    // Coarse skill-usage shortcut: record skill name at top level for both
    // pre and post phases when the tool is Skill. This preserves the backward-
    // compatible signal "which skills were used this session?" without storing args.
    const skillName = extractSkillName(toolName, input.tool_input);
    if (skillName) observation.skill = skillName;

    // Layer 2: build SafeEvidencePatch and spread into observation record.
    // Decision 4: no semantic field is persisted; summarizeToolInput is read-time only.
    // Decision 5: all evidence fields pass through the shared sanitizer.
    if (phase === 'pre') {
      try {
        const patch = buildObservedEvidence(toolName, input.tool_input);
        Object.assign(observation, patch);
      } catch {
        // Best-effort: if buildObservedEvidence throws (e.g. unexpected input
        // shape from a future tool), label as no-input rather than safety so
        // we don't pollute downstream signal with a fake safety event.
        observation.evidence_status = EVIDENCE_STATUS.OMITTED_NO_INPUT;
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

    // Lazy-start daemon when enough observations have accumulated.
    spawnDaemonIfNeeded(obsPath);

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
  extractSkillName,
  classifyOutcome,
  responseByteSize,
  buildObservedEvidence,
  getArchiveDir,
  getPidFile,
  shouldObserve,
  spawnDaemonIfNeeded,
  MAX_INPUT_LENGTH,
  MAX_OUTPUT_LENGTH,
  LAZY_START_THRESHOLD,
};
