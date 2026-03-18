// tests/scripts/session-aliases.test.js

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const testDir = path.join(
  os.tmpdir(),
  `aliases-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
);
fs.mkdirSync(testDir, { recursive: true });

let homedirSpy;

function getAliasesModule() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes('session-aliases') || key.includes('/utils')) {
      delete require.cache[key];
    }
  }
  return require('../../scripts/lib/session-aliases');
}

beforeAll(() => {
  // Mock os.homedir() — Node caches the native value
  homedirSpy = jest.spyOn(os, 'homedir').mockReturnValue(testDir);
});

afterAll(() => {
  homedirSpy.mockRestore();
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('session-aliases', () => {
  const project = 'alias-project';

  describe('validateAlias', () => {
    it('accepts valid alias names', () => {
      const { validateAlias } = getAliasesModule();
      expect(validateAlias('my-feature').valid).toBe(true);
      expect(validateAlias('auth_refactor').valid).toBe(true);
      expect(validateAlias('v2').valid).toBe(true);
      expect(validateAlias('A-Z_09').valid).toBe(true);
    });

    it('rejects empty names', () => {
      const { validateAlias } = getAliasesModule();
      expect(validateAlias('').valid).toBe(false);
      expect(validateAlias(null).valid).toBe(false);
      expect(validateAlias(undefined).valid).toBe(false);
    });

    it('rejects names with invalid characters', () => {
      const { validateAlias } = getAliasesModule();
      expect(validateAlias('has space').valid).toBe(false);
      expect(validateAlias('has.dot').valid).toBe(false);
      expect(validateAlias('path/traversal').valid).toBe(false);
    });

    it('rejects names exceeding max length', () => {
      const { validateAlias, MAX_ALIAS_LENGTH } = getAliasesModule();
      const long = 'a'.repeat(MAX_ALIAS_LENGTH + 1);
      expect(validateAlias(long).valid).toBe(false);
    });

    it('rejects reserved names', () => {
      const { validateAlias, RESERVED_NAMES } = getAliasesModule();
      for (const name of RESERVED_NAMES) {
        expect(validateAlias(name).valid).toBe(false);
        expect(validateAlias(name.toUpperCase()).valid).toBe(false);
      }
    });
  });

  describe('setAlias', () => {
    it('creates a new alias', () => {
      const { setAlias } = getAliasesModule();
      const result = setAlias(project, 'new-alias-1', '/path/to/session.md');
      expect(result.success).toBe(true);
      expect(result.isNew).toBe(true);
      expect(result.alias).toBe('new-alias-1');
    });

    it('updates an existing alias', () => {
      const { setAlias } = getAliasesModule();
      setAlias(project, 'update-test', '/path/old.md');
      const result = setAlias(project, 'update-test', '/path/new.md');
      expect(result.success).toBe(true);
      expect(result.isNew).toBe(false);
    });

    it('rejects invalid alias names', () => {
      const { setAlias } = getAliasesModule();
      const result = setAlias(project, 'has space', '/path.md');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('rejects empty session path', () => {
      const { setAlias } = getAliasesModule();
      const result = setAlias(project, 'valid-name', '');
      expect(result.success).toBe(false);
    });
  });

  describe('resolveAlias', () => {
    it('resolves an existing alias', () => {
      const { setAlias, resolveAlias } = getAliasesModule();
      setAlias(project, 'resolve-test', '/path/session.md');
      const result = resolveAlias(project, 'resolve-test');
      expect(result).not.toBeNull();
      expect(result.sessionPath).toBe('/path/session.md');
      expect(result.alias).toBe('resolve-test');
    });

    it('returns null for non-existent alias', () => {
      const { resolveAlias } = getAliasesModule();
      expect(resolveAlias(project, 'nonexistent-xyz')).toBeNull();
    });

    it('returns null for invalid alias names', () => {
      const { resolveAlias } = getAliasesModule();
      expect(resolveAlias(project, 'has space')).toBeNull();
    });
  });

  describe('listAliases', () => {
    it('lists aliases sorted by updated time', () => {
      const { setAlias, listAliases } = getAliasesModule();
      setAlias(project, 'list-a', '/a.md');
      setAlias(project, 'list-b', '/b.md');
      const aliases = listAliases(project);
      expect(aliases.length).toBeGreaterThanOrEqual(2);
      const names = aliases.map((a) => a.name);
      expect(names).toContain('list-a');
      expect(names).toContain('list-b');
    });

    it('filters by search term', () => {
      const { setAlias, listAliases } = getAliasesModule();
      setAlias(project, 'findme-target', '/target.md');
      const results = listAliases(project, { search: 'findme' });
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].name).toBe('findme-target');
    });

    it('respects limit', () => {
      const { listAliases } = getAliasesModule();
      const results = listAliases(project, { limit: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('deleteAlias', () => {
    it('deletes an existing alias', () => {
      const { setAlias, deleteAlias, resolveAlias } = getAliasesModule();
      setAlias(project, 'to-delete', '/path.md');
      const result = deleteAlias(project, 'to-delete');
      expect(result.success).toBe(true);
      expect(resolveAlias(project, 'to-delete')).toBeNull();
    });

    it('returns error for non-existent alias', () => {
      const { deleteAlias } = getAliasesModule();
      const result = deleteAlias(project, 'never-existed-xyz');
      expect(result.success).toBe(false);
    });
  });

  describe('persistence', () => {
    it('aliases persist across loadAliases calls', () => {
      const { setAlias } = getAliasesModule();
      setAlias(project, 'persist-test', '/persistent.md');

      // Re-require to force fresh module
      const fresh = getAliasesModule();
      const data = fresh.loadAliases(project);
      expect(data.aliases['persist-test']).toBeDefined();
      expect(data.aliases['persist-test'].sessionPath).toBe('/persistent.md');
    });
  });
});
