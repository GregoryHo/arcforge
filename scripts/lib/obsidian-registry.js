/**
 * obsidian-registry.js — registry of Obsidian vaults under ~/.arcforge/.
 *
 * The registry is `~/.arcforge/obsidian-vaults.json` with shape:
 *
 *   { default: <name|null>, vaults: [{ name, path, search, scope, preset }, ...] }
 *
 * The `arc-maintaining-obsidian` skill drives ingest/query/audit and reads
 * this registry through these helpers — never by hand-editing the file.
 *
 * All mutations are wrapped in `withLock` to prevent two concurrent
 * sessions from racing on the same registry write. Reads are unlocked.
 */

const path = require('node:path');
const { getArcforgeHome, readJsonFile, writeJsonFile, ensureDir } = require('./utils');
const { withLock } = require('./locking');

const REGISTRY_FILENAME = 'obsidian-vaults.json';

function getRegistryPath(homeDir) {
  const home = homeDir || getArcforgeHome();
  return path.join(home, REGISTRY_FILENAME);
}

function emptyRegistry() {
  return { default: null, vaults: [] };
}

function defaultSearchConfig() {
  return {
    baseline: 'filesystem',
    preferred: 'filesystem',
    qmd_collection: null,
    fallbacks: ['filesystem', 'obsidian-cli'],
  };
}

function readRegistry({ homeDir } = {}) {
  const data = readJsonFile(getRegistryPath(homeDir), null);
  if (!data || typeof data !== 'object') return emptyRegistry();
  return {
    default: typeof data.default === 'string' ? data.default : null,
    vaults: Array.isArray(data.vaults) ? data.vaults : [],
  };
}

function writeRegistry(data, { homeDir } = {}) {
  const home = homeDir || getArcforgeHome();
  ensureDir(home);
  return writeJsonFile(getRegistryPath(home), data);
}

function findVault(registry, name) {
  return registry.vaults.find((v) => v.name === name) || null;
}

function listVaults({ homeDir } = {}) {
  return readRegistry({ homeDir }).vaults;
}

function addVault(entry, { homeDir, makeDefault } = {}) {
  if (typeof entry !== 'object' || entry === null) {
    throw new Error('addVault: entry must be an object');
  }
  if (typeof entry.name !== 'string' || !entry.name.trim()) {
    throw new Error('addVault: entry.name must be a non-empty string');
  }
  if (typeof entry.path !== 'string' || !entry.path.trim()) {
    throw new Error('addVault: entry.path must be a non-empty string');
  }

  const home = homeDir || getArcforgeHome();
  ensureDir(home);

  return withLock(home, () => {
    const registry = readRegistry({ homeDir: home });

    if (findVault(registry, entry.name)) {
      throw new Error(`addVault: vault '${entry.name}' is already registered`);
    }

    const fullEntry = {
      name: entry.name,
      path: path.resolve(entry.path),
      search: { ...defaultSearchConfig(), ...(entry.search || {}) },
      scope: typeof entry.scope === 'string' ? entry.scope : '',
      preset: typeof entry.preset === 'string' ? entry.preset : '',
    };

    registry.vaults.push(fullEntry);

    const isFirst = registry.vaults.length === 1;
    if (makeDefault || isFirst) {
      registry.default = fullEntry.name;
    }

    writeRegistry(registry, { homeDir: home });
    return { entry: fullEntry, becameDefault: registry.default === fullEntry.name };
  });
}

function removeVault(name, { homeDir } = {}) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('removeVault: name must be a non-empty string');
  }

  const home = homeDir || getArcforgeHome();
  ensureDir(home);

  return withLock(home, () => {
    const registry = readRegistry({ homeDir: home });
    const before = registry.vaults.length;
    registry.vaults = registry.vaults.filter((v) => v.name !== name);

    if (registry.vaults.length === before) {
      throw new Error(`removeVault: vault '${name}' is not registered`);
    }

    const clearedDefault = registry.default === name;
    if (clearedDefault) {
      registry.default = null;
    }

    writeRegistry(registry, { homeDir: home });
    return { removedName: name, clearedDefault };
  });
}

function setDefault(name, { homeDir } = {}) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('setDefault: name must be a non-empty string');
  }

  const home = homeDir || getArcforgeHome();
  ensureDir(home);

  return withLock(home, () => {
    const registry = readRegistry({ homeDir: home });
    if (!findVault(registry, name)) {
      throw new Error(`setDefault: vault '${name}' is not registered`);
    }
    registry.default = name;
    writeRegistry(registry, { homeDir: home });
    return { defaultName: name };
  });
}

module.exports = {
  REGISTRY_FILENAME,
  getRegistryPath,
  emptyRegistry,
  defaultSearchConfig,
  readRegistry,
  writeRegistry,
  listVaults,
  addVault,
  removeVault,
  setDefault,
  findVault,
};
