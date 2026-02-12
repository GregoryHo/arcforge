// tests/scripts/pending-actions.test.js

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

describe('pending-actions', () => {
  let testDir;
  let pendingActions;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pending-actions-test-'));
    jest.spyOn(os, 'homedir').mockReturnValue(testDir);
    // Reset module cache so CLAUDE_DIR picks up the mocked homedir
    jest.resetModules();
    pendingActions = require('../../scripts/lib/pending-actions');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('getActionsPath', () => {
    it('returns path under ~/.claude/sessions/{project}', () => {
      const result = pendingActions.getActionsPath('my-project');
      expect(result).toBe(
        path.join(testDir, '.claude', 'sessions', 'my-project', 'pending-actions.json'),
      );
    });
  });

  describe('write/read round-trip', () => {
    it('adds an action and reads it back with all fields', () => {
      const action = pendingActions.addPendingAction('proj', 'reflect-ready', { file: 'r.md' });

      expect(action.id).toBeDefined();
      expect(typeof action.id).toBe('string');
      expect(action.type).toBe('reflect-ready');
      expect(action.payload).toEqual({ file: 'r.md' });
      expect(action.created).toBeDefined();
      expect(action.consumed).toBe(false);
      expect(action.consumed_at).toBeNull();

      const pending = pendingActions.getPendingActions('proj');
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(action.id);
      expect(pending[0].type).toBe('reflect-ready');
      expect(pending[0].payload).toEqual({ file: 'r.md' });
    });
  });

  describe('action structure', () => {
    it('has correct fields: id, type, payload, created, consumed, consumed_at', () => {
      const action = pendingActions.addPendingAction('proj', 'diary-saved', {});

      expect(action).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          type: 'diary-saved',
          payload: {},
          created: expect.any(String),
          consumed: false,
          consumed_at: null,
        }),
      );

      // Verify created is a valid ISO date
      expect(() => new Date(action.created)).not.toThrow();
      expect(new Date(action.created).toISOString()).toBe(action.created);
    });
  });

  describe('per-action consume', () => {
    it('consumes one action, leaving the other unconsumed', () => {
      const a1 = pendingActions.addPendingAction('proj', 'reflect-ready', { n: 1 });
      const a2 = pendingActions.addPendingAction('proj', 'diary-saved', { n: 2 });

      const consumed = pendingActions.consumeAction('proj', a1.id);
      expect(consumed).toBe(true);

      const pending = pendingActions.getPendingActions('proj');
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(a2.id);
    });
  });

  describe('type filter', () => {
    it('filters actions by type', () => {
      pendingActions.addPendingAction('proj', 'reflect-ready', {});
      pendingActions.addPendingAction('proj', 'diary-saved', {});
      pendingActions.addPendingAction('proj', 'reflect-ready', {});

      const reflectOnly = pendingActions.getPendingActions('proj', 'reflect-ready');
      expect(reflectOnly).toHaveLength(2);
      for (const a of reflectOnly) expect(a.type).toBe('reflect-ready');

      const diaryOnly = pendingActions.getPendingActions('proj', 'diary-saved');
      expect(diaryOnly).toHaveLength(1);
      expect(diaryOnly[0].type).toBe('diary-saved');
    });

    it('returns all actions when no type filter is given', () => {
      pendingActions.addPendingAction('proj', 'reflect-ready', {});
      pendingActions.addPendingAction('proj', 'diary-saved', {});

      const all = pendingActions.getPendingActions('proj');
      expect(all).toHaveLength(2);
    });
  });

  describe('7-day expiry', () => {
    it('excludes actions older than 7 days from getPendingActions', () => {
      // Add a fresh action
      const fresh = pendingActions.addPendingAction('proj', 'fresh', {});

      // Manually inject an old action into the file
      const filePath = pendingActions.getActionsPath('proj');
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      data.actions.push({
        id: 'old-action-id',
        type: 'old-type',
        payload: {},
        created: eightDaysAgo,
        consumed: false,
        consumed_at: null,
      });
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');

      const pending = pendingActions.getPendingActions('proj');
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(fresh.id);
    });
  });

  describe('pruneExpired', () => {
    it('removes old actions and keeps new ones', () => {
      // Add a fresh action
      pendingActions.addPendingAction('proj', 'keep-me', {});

      // Manually inject an old action
      const filePath = pendingActions.getActionsPath('proj');
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      data.actions.push({
        id: 'expired-action',
        type: 'old-type',
        payload: {},
        created: eightDaysAgo,
        consumed: false,
        consumed_at: null,
      });
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');

      const pruned = pendingActions.pruneExpired('proj');
      expect(pruned).toBe(1);

      // Verify file only contains the fresh action
      const remaining = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(remaining.actions).toHaveLength(1);
      expect(remaining.actions[0].type).toBe('keep-me');
    });

    it('returns 0 when nothing to prune', () => {
      pendingActions.addPendingAction('proj', 'recent', {});
      const pruned = pendingActions.pruneExpired('proj');
      expect(pruned).toBe(0);
    });
  });

  describe('empty / non-existent file', () => {
    it('returns { actions: [] } for non-existent file', () => {
      const pending = pendingActions.getPendingActions('no-such-project');
      expect(pending).toEqual([]);
    });

    it('returns { actions: [] } for empty file', () => {
      const filePath = pendingActions.getActionsPath('empty-proj');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, '', 'utf-8');

      const pending = pendingActions.getPendingActions('empty-proj');
      expect(pending).toEqual([]);
    });
  });

  describe('malformed JSON file', () => {
    it('returns { actions: [] } for invalid JSON', () => {
      const filePath = pendingActions.getActionsPath('bad-json');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, '{not valid json!!!', 'utf-8');

      const pending = pendingActions.getPendingActions('bad-json');
      expect(pending).toEqual([]);
    });

    it('returns { actions: [] } when actions field is not an array', () => {
      const filePath = pendingActions.getActionsPath('bad-shape');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify({ actions: 'not-an-array' }), 'utf-8');

      const pending = pendingActions.getPendingActions('bad-shape');
      expect(pending).toEqual([]);
    });
  });

  describe('consumeAction', () => {
    it('returns false for non-existent action ID', () => {
      pendingActions.addPendingAction('proj', 'something', {});

      const result = pendingActions.consumeAction('proj', 'non-existent-id');
      expect(result).toBe(false);
    });

    it('returns false for non-existent project', () => {
      const result = pendingActions.consumeAction('no-project', 'no-id');
      expect(result).toBe(false);
    });

    it('sets consumed and consumed_at on the consumed action', () => {
      const action = pendingActions.addPendingAction('proj', 'check', {});

      pendingActions.consumeAction('proj', action.id);

      const filePath = pendingActions.getActionsPath('proj');
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const found = data.actions.find((a) => a.id === action.id);

      expect(found.consumed).toBe(true);
      expect(found.consumed_at).toBeDefined();
      expect(() => new Date(found.consumed_at)).not.toThrow();
    });
  });
});
