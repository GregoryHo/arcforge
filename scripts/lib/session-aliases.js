// scripts/lib/session-aliases.js
const path = require('node:path');
const { readFileSafe, atomicWriteFile, getProjectSessionsDir, log } = require('./utils');

const ALIASES_FILENAME = 'aliases.json';
const ALIAS_VERSION = '1.0';
const MAX_ALIAS_LENGTH = 128;
const RESERVED_NAMES = [
  'list',
  'help',
  'remove',
  'delete',
  'create',
  'set',
  'save',
  'resume',
  'aliases',
];

/**
 * Get aliases file path for a project.
 * @param {string} project - Project name
 * @returns {string} Path to aliases.json
 */
function getAliasesPath(project) {
  return path.join(getProjectSessionsDir(project), ALIASES_FILENAME);
}

/**
 * Default aliases structure.
 */
function getDefaultAliases() {
  return {
    version: ALIAS_VERSION,
    aliases: {},
  };
}

/**
 * Load aliases from file.
 * @param {string} project - Project name
 * @returns {Object} Aliases data
 */
function loadAliases(project) {
  const content = readFileSafe(getAliasesPath(project));
  if (!content) return getDefaultAliases();

  try {
    const data = JSON.parse(content);
    if (!data.aliases || typeof data.aliases !== 'object') {
      return getDefaultAliases();
    }
    if (!data.version) data.version = ALIAS_VERSION;
    return data;
  } catch {
    return getDefaultAliases();
  }
}

/**
 * Save aliases with atomic write (temp file + rename).
 * @param {string} project - Project name
 * @param {Object} data - Aliases data
 * @returns {boolean} Success
 */
function saveAliases(project, data) {
  try {
    atomicWriteFile(getAliasesPath(project), JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    log(`[Aliases] Save failed: ${err.message}`);
    return false;
  }
}

/**
 * Validate an alias name.
 * @param {string} alias
 * @returns {{ valid: boolean, error?: string }}
 */
function validateAlias(alias) {
  if (!alias || typeof alias !== 'string' || alias.trim() === '') {
    return { valid: false, error: 'Alias name cannot be empty' };
  }
  if (alias.length > MAX_ALIAS_LENGTH) {
    return { valid: false, error: `Alias name cannot exceed ${MAX_ALIAS_LENGTH} characters` };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(alias)) {
    return {
      valid: false,
      error: 'Alias must contain only letters, numbers, dashes, and underscores',
    };
  }
  if (RESERVED_NAMES.includes(alias.toLowerCase())) {
    return { valid: false, error: `'${alias}' is a reserved name` };
  }
  return { valid: true };
}

/**
 * Set or update an alias pointing to a saved session file.
 * @param {string} project - Project name
 * @param {string} alias - Alias name
 * @param {string} sessionPath - Path to saved session file
 * @param {string} [title] - Optional description
 * @returns {{ success: boolean, isNew?: boolean, error?: string }}
 */
function setAlias(project, alias, sessionPath, title = null) {
  const validation = validateAlias(alias);
  if (!validation.valid) return { success: false, error: validation.error };

  if (!sessionPath || typeof sessionPath !== 'string' || sessionPath.trim() === '') {
    return { success: false, error: 'Session path cannot be empty' };
  }

  const data = loadAliases(project);
  const existing = data.aliases[alias];
  const isNew = !existing;

  data.aliases[alias] = {
    sessionPath,
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    title: title || null,
  };

  if (saveAliases(project, data)) {
    return { success: true, isNew, alias, sessionPath };
  }
  return { success: false, error: 'Failed to save alias' };
}

/**
 * Resolve an alias to its saved session path.
 * @param {string} project - Project name
 * @param {string} alias - Alias name
 * @returns {{ alias: string, sessionPath: string, title: string|null } | null}
 */
function resolveAlias(project, alias) {
  if (!alias) return null;
  const validation = validateAlias(alias);
  if (!validation.valid) return null;

  const data = loadAliases(project);
  const entry = data.aliases[alias];
  if (!entry) return null;

  return {
    alias,
    sessionPath: entry.sessionPath,
    title: entry.title || null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

/**
 * List all aliases for a project.
 * @param {string} project - Project name
 * @param {Object} [options]
 * @param {string} [options.search] - Filter by partial name/title match
 * @param {number} [options.limit] - Max results
 * @returns {Array<{ name: string, sessionPath: string, title: string|null, createdAt: string, updatedAt: string }>}
 */
function listAliases(project, options = {}) {
  const { search = null, limit = null } = options;
  const data = loadAliases(project);

  let aliases = Object.entries(data.aliases).map(([name, info]) => ({
    name,
    sessionPath: info.sessionPath,
    createdAt: info.createdAt,
    updatedAt: info.updatedAt,
    title: info.title,
  }));

  // Sort by updated time (newest first)
  aliases.sort(
    (a, b) =>
      new Date(b.updatedAt || b.createdAt || 0).getTime() -
      new Date(a.updatedAt || a.createdAt || 0).getTime(),
  );

  if (search) {
    const s = search.toLowerCase();
    aliases = aliases.filter(
      (a) => a.name.toLowerCase().includes(s) || a.title?.toLowerCase().includes(s),
    );
  }

  if (limit && limit > 0) {
    aliases = aliases.slice(0, limit);
  }

  return aliases;
}

/**
 * Delete an alias.
 * @param {string} project - Project name
 * @param {string} alias - Alias name
 * @returns {{ success: boolean, error?: string }}
 */
function deleteAlias(project, alias) {
  const data = loadAliases(project);
  if (!data.aliases[alias]) {
    return { success: false, error: `Alias '${alias}' not found` };
  }

  delete data.aliases[alias];

  if (saveAliases(project, data)) {
    return { success: true, alias };
  }
  return { success: false, error: 'Failed to delete alias' };
}

module.exports = {
  getAliasesPath,
  loadAliases,
  saveAliases,
  validateAlias,
  setAlias,
  resolveAlias,
  listAliases,
  deleteAlias,
  RESERVED_NAMES,
  MAX_ALIAS_LENGTH,
};
