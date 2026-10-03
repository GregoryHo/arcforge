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

    it('reserves no name — a name only ever fills an operand (cli B-9)', () => {
      const mod = getAliasesModule();
      expect(mod.RESERVED_NAMES).toBeUndefined();
      for (const name of ['list', 'help', 'remove', 'delete', 'create', 'set', 'save', 'resume']) {
        expect(mod.validateAlias(name).valid).toBe(true);
      }
    });

    it('refuses rather than rewrites a name outside letters, digits, - and _', () => {
      const { validateAlias } = getAliasesModule();
      for (const name of ['../x', 'a/b', 'a.b', 'naïve', 'a\nb']) {
        expect(validateAlias(name).valid).toBe(false);
      }
    });
  });

  describe('a corrupt aliases.json', () => {
    it('fails loudly instead of reading as empty, so the next set cannot wipe the index', () => {
      const { getAliasesPath, setAlias, listAliases } = getAliasesModule();
      const file = getAliasesPath('corrupt-project');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '{"version":"1.0","aliases":{"keep":');
      expect(() => listAliases('corrupt-project')).toThrow(/aliases\.json.*not valid JSON/);
      expect(() => setAlias('corrupt-project', 'new', '/x.md')).toThrow(/not valid JSON/);
      expect(fs.readFileSync(file, 'utf8')).toBe('{"version":"1.0","aliases":{"keep":');
    });

    it('fails loudly on JSON of the wrong shape, leaving the file as it was', () => {
      const { getAliasesPath, setAlias, listAliases } = getAliasesModule();
      const file = getAliasesPath('shape-project');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      for (const bad of [
        '[]',
        'null',
        '{"version":"1.0","Aliases":{"keep":{}}}',
        '{"version":"1.0"}',
        '{"version":"1.0","aliases":[]}',
      ]) {
        fs.writeFileSync(file, bad);
        expect(() => listAliases('shape-project')).toThrow(
          /aliases\.json is not an alias index: expected an object with an "aliases" object/,
        );
        expect(() => setAlias('shape-project', 'new', '/x.md')).toThrow(/not an alias index/);
        expect(fs.readFileSync(file, 'utf8')).toBe(bad);
      }
    });

    it('fails loudly when the file cannot be read, naming it and the error', () => {
      const { getAliasesPath, setAlias, listAliases } = getAliasesModule();
      const file = getAliasesPath('unreadable-project');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '{"version":"1.0","aliases":{"keep":{"sessionPath":"/k.md"}}}');
      const realRead = fs.readFileSync;
      const spy = jest.spyOn(fs, 'readFileSync').mockImplementation((p, ...rest) => {
        if (p === file) {
          throw Object.assign(new Error(`EACCES: permission denied, open '${file}'`), {
            code: 'EACCES',
          });
        }
        return realRead(p, ...rest);
      });
      try {
        expect(() => listAliases('unreadable-project')).toThrow(
          /Cannot read .*aliases\.json: EACCES: permission denied/,
        );
        expect(() => setAlias('unreadable-project', 'new', '/x.md')).toThrow(/EACCES/);
      } finally {
        spy.mockRestore();
      }
      expect(JSON.parse(fs.readFileSync(file, 'utf8')).aliases).toEqual({
        keep: { sessionPath: '/k.md' },
      });
    });

    it('fails loudly when aliases.json is a directory, and reads a missing one as empty', () => {
      const { getAliasesPath, listAliases } = getAliasesModule();
      const file = getAliasesPath('dir-project');
      fs.mkdirSync(file, { recursive: true });
      expect(() => listAliases('dir-project')).toThrow(/Cannot read .*aliases\.json: EISDIR/);
      expect(listAliases('no-index-project')).toEqual([]);
    });
  });

  describe('names that are Object.prototype keys', () => {
    const names = ['constructor', 'toString', '__proto__'];

    it('are new on a fresh index, persist, resolve, list and delete like any name', () => {
      const { setAlias, resolveAlias, listAliases, deleteAlias, getAliasesPath } =
        getAliasesModule();
      const proj = 'proto-project';
      for (const name of names) {
        expect(resolveAlias(proj, name)).toBeNull();
        expect(deleteAlias(proj, name).success).toBe(false);
        const result = setAlias(proj, name, `/s/${name}.md`);
        expect(result).toMatchObject({ success: true, isNew: true });
      }
      const onDisk = JSON.parse(fs.readFileSync(getAliasesPath(proj), 'utf8'));
      expect(Object.keys(onDisk.aliases).sort()).toEqual([...names].sort());
      for (const name of names) {
        expect(resolveAlias(proj, name).sessionPath).toBe(`/s/${name}.md`);
        expect(setAlias(proj, name, '/other.md').success).toBe(false);
      }
      expect(
        listAliases(proj)
          .map((a) => a.name)
          .sort(),
      ).toEqual([...names].sort());
      for (const name of names) expect(deleteAlias(proj, name).success).toBe(true);
      expect(listAliases(proj)).toEqual([]);
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

    it('refuses to overwrite an existing alias without force', () => {
      const { setAlias, resolveAlias } = getAliasesModule();
      setAlias(project, 'update-test', '/path/old.md');
      const result = setAlias(project, 'update-test', '/path/new.md');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/already exists.*--force/);
      expect(resolveAlias(project, 'update-test').sessionPath).toBe('/path/old.md');
    });

    it('overwrites an existing alias with force', () => {
      const { setAlias, resolveAlias } = getAliasesModule();
      const result = setAlias(project, 'update-test', '/path/new.md', null, { force: true });
      expect(result.success).toBe(true);
      expect(result.isNew).toBe(false);
      expect(resolveAlias(project, 'update-test').sessionPath).toBe('/path/new.md');
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

  describe('index lock', () => {
    it('releases aliases.lock when a change throws', () => {
      const { setAlias, deleteAlias, getAliasesPath } = getAliasesModule();
      const lockProject = 'lock-release-project';
      const indexPath = getAliasesPath(lockProject);
      const lockPath = path.join(path.dirname(indexPath), 'aliases.lock');
      fs.mkdirSync(path.dirname(indexPath), { recursive: true });
      fs.writeFileSync(indexPath, '{ not json');
      expect(() => setAlias(lockProject, 'x', '/x.md')).toThrow(/is not valid JSON/);
      expect(fs.existsSync(lockPath)).toBe(false);
      expect(() => deleteAlias(lockProject, 'x')).toThrow(/is not valid JSON/);
      expect(fs.existsSync(lockPath)).toBe(false);
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
