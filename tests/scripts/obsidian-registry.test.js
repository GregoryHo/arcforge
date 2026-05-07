// tests/scripts/obsidian-registry.test.js

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  REGISTRY_FILENAME,
  getRegistryPath,
  readRegistry,
  listVaults,
  addVault,
  removeVault,
  setDefault,
  defaultSearchConfig,
} = require('../../scripts/lib/obsidian-registry');

function makeTmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-registry-'));
}

describe('obsidian-registry', () => {
  let homeDir;

  beforeEach(() => {
    homeDir = makeTmpHome();
  });

  afterEach(() => {
    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  describe('readRegistry', () => {
    it('returns empty registry when file does not exist', () => {
      const reg = readRegistry({ homeDir });
      expect(reg).toEqual({ default: null, vaults: [] });
    });

    it('returns empty registry when file is malformed', () => {
      fs.writeFileSync(path.join(homeDir, REGISTRY_FILENAME), 'not json');
      const reg = readRegistry({ homeDir });
      expect(reg).toEqual({ default: null, vaults: [] });
    });

    it('reads a registered vault round-trip', () => {
      addVault({ name: 'wiki', path: '/tmp/wiki', preset: 'llm-wiki' }, { homeDir });
      const reg = readRegistry({ homeDir });
      expect(reg.vaults).toHaveLength(1);
      expect(reg.vaults[0].name).toBe('wiki');
      expect(reg.vaults[0].preset).toBe('llm-wiki');
      expect(reg.vaults[0].search).toEqual(defaultSearchConfig());
    });
  });

  describe('addVault', () => {
    it('first vault becomes default automatically', () => {
      const result = addVault({ name: 'wiki', path: '/tmp/wiki' }, { homeDir });
      expect(result.becameDefault).toBe(true);
      expect(readRegistry({ homeDir }).default).toBe('wiki');
    });

    it('second vault does not become default unless makeDefault is set', () => {
      addVault({ name: 'wiki', path: '/tmp/wiki' }, { homeDir });
      addVault({ name: 'news', path: '/tmp/news' }, { homeDir });
      expect(readRegistry({ homeDir }).default).toBe('wiki');
    });

    it('makeDefault overrides existing default', () => {
      addVault({ name: 'wiki', path: '/tmp/wiki' }, { homeDir });
      addVault({ name: 'news', path: '/tmp/news' }, { homeDir, makeDefault: true });
      expect(readRegistry({ homeDir }).default).toBe('news');
    });

    it('rejects duplicate vault names', () => {
      addVault({ name: 'wiki', path: '/tmp/wiki' }, { homeDir });
      expect(() => addVault({ name: 'wiki', path: '/tmp/other' }, { homeDir })).toThrow(
        /already registered/,
      );
    });

    it('rejects entry without name', () => {
      expect(() => addVault({ path: '/tmp/x' }, { homeDir })).toThrow(/entry.name/);
    });

    it('rejects entry without path', () => {
      expect(() => addVault({ name: 'x' }, { homeDir })).toThrow(/entry.path/);
    });

    it('resolves the vault path to absolute', () => {
      addVault({ name: 'rel', path: 'relative/path' }, { homeDir });
      const reg = readRegistry({ homeDir });
      expect(path.isAbsolute(reg.vaults[0].path)).toBe(true);
    });

    it('caller-provided search config is merged with defaults', () => {
      addVault(
        {
          name: 'qmd-vault',
          path: '/tmp/qmd-vault',
          search: { preferred: 'qmd', qmd_collection: 'obsidian-qmd-vault' },
        },
        { homeDir },
      );
      const v = readRegistry({ homeDir }).vaults[0];
      expect(v.search.preferred).toBe('qmd');
      expect(v.search.qmd_collection).toBe('obsidian-qmd-vault');
      expect(v.search.baseline).toBe('filesystem');
    });
  });

  describe('removeVault', () => {
    it('removes the registered vault', () => {
      addVault({ name: 'wiki', path: '/tmp/wiki' }, { homeDir });
      removeVault('wiki', { homeDir });
      expect(listVaults({ homeDir })).toHaveLength(0);
    });

    it('clears default when the default vault is removed', () => {
      addVault({ name: 'wiki', path: '/tmp/wiki' }, { homeDir });
      addVault({ name: 'news', path: '/tmp/news' }, { homeDir });
      const result = removeVault('wiki', { homeDir });
      expect(result.clearedDefault).toBe(true);
      expect(readRegistry({ homeDir }).default).toBeNull();
    });

    it('does not clear default when a non-default vault is removed', () => {
      addVault({ name: 'wiki', path: '/tmp/wiki' }, { homeDir });
      addVault({ name: 'news', path: '/tmp/news' }, { homeDir });
      const result = removeVault('news', { homeDir });
      expect(result.clearedDefault).toBe(false);
      expect(readRegistry({ homeDir }).default).toBe('wiki');
    });

    it('throws when removing an unregistered vault', () => {
      expect(() => removeVault('nope', { homeDir })).toThrow(/not registered/);
    });
  });

  describe('setDefault', () => {
    it('sets the default to the named vault', () => {
      addVault({ name: 'wiki', path: '/tmp/wiki' }, { homeDir });
      addVault({ name: 'news', path: '/tmp/news' }, { homeDir });
      setDefault('news', { homeDir });
      expect(readRegistry({ homeDir }).default).toBe('news');
    });

    it('throws when setting default to an unregistered vault', () => {
      expect(() => setDefault('nope', { homeDir })).toThrow(/not registered/);
    });
  });

  describe('getRegistryPath', () => {
    it('returns the canonical registry file path under home', () => {
      const p = getRegistryPath(homeDir);
      expect(p).toBe(path.join(homeDir, REGISTRY_FILENAME));
    });
  });

  describe('listVaults', () => {
    it('returns an empty array when no vaults registered', () => {
      expect(listVaults({ homeDir })).toEqual([]);
    });

    it('returns vaults in registration order', () => {
      addVault({ name: 'a', path: '/tmp/a' }, { homeDir });
      addVault({ name: 'b', path: '/tmp/b' }, { homeDir });
      addVault({ name: 'c', path: '/tmp/c' }, { homeDir });
      expect(listVaults({ homeDir }).map((v) => v.name)).toEqual(['a', 'b', 'c']);
    });
  });
});
