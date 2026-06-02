/**
 * Learning observation view — read-time semantic derivation (Layer 2, Output B).
 *
 * Provides the DerivedSemanticView computed from safe persisted evidence fields
 * at READ time. This is NOT persisted in observations.jsonl — it is derived
 * on demand by dashboard rendering, curator batch assembly, and other consumers.
 *
 * Decision 4: semantic enum is a derived view, not a persisted field.
 */

// ---------------------------------------------------------------------------
// Path classification
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

// ---------------------------------------------------------------------------
// File kind classification
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Bash command kind classification
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Skill name extraction (read-only helper — no side effects)
// ---------------------------------------------------------------------------

function extractSkillNameFromInput(toolName, toolInput) {
  if (toolName !== 'Skill') return null;
  if (!toolInput || typeof toolInput !== 'object') return null;
  const raw = toolInput.skill;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 128);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derive a DerivedSemanticView from a tool name and tool input at read time.
 *
 * The signature is intentionally compatible with the function previously
 * inlined in hooks/observe/main.js so callers can import from this module.
 *
 * @param {string} toolName
 * @param {object|null|undefined} toolInput
 * @returns {object} DerivedSemanticView
 */
function summarizeToolInput(toolName, toolInput) {
  if (!toolInput || typeof toolInput !== 'object') {
    return { tool: toolName, payload_saved: false };
  }
  const base = { tool: toolName, payload_saved: false };
  switch (toolName) {
    case 'Bash':
      return {
        ...base,
        operation_kind: 'shell',
        command_kind: classifyBashCommand(toolInput.command),
      };
    case 'Read':
      return {
        ...base,
        operation_kind: 'read',
        path_class: classifyPath(toolInput.file_path),
        file_kind: fileKindFromPath(toolInput.file_path),
      };
    case 'Edit':
    case 'Write':
      return {
        ...base,
        operation_kind: toolName.toLowerCase(),
        path_class: classifyPath(toolInput.file_path),
        file_kind: fileKindFromPath(toolInput.file_path),
      };
    case 'Grep':
      return {
        ...base,
        operation_kind: 'search',
        path_class: classifyPath(toolInput.path || toolInput.glob || ''),
      };
    case 'Glob':
      return { ...base, operation_kind: 'glob' };
    case 'Skill': {
      const skillName = extractSkillNameFromInput(toolName, toolInput);
      return {
        ...base,
        operation_kind: 'skill',
        ...(skillName ? { skill_name: skillName } : {}),
      };
    }
    default:
      return { ...base, operation_kind: 'other' };
  }
}

module.exports = {
  summarizeToolInput,
  classifyPath,
  classifyBashCommand,
  fileKindFromPath,
};
