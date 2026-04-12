# Sync Status Validation Tasks

> **Goal:** Fix the `done` vs `completed` bug where agent-written status values bypass the `TaskStatus` enum, breaking dependency resolution.
> **Architecture:** Two-layer fix — (1) `_mergeEpicsInBase()` auto-updates `.arcforge-epic` marker so the correct value exists at the source, (2) both sync paths validate `local.status` against `TaskStatus` as defense-in-depth.
> **Tech Stack:** Node.js, Jest (tests/scripts/), node:test (tests/node/)

> **For Claude:** Use arc-agent-driven or arc-executing-tasks to implement.

## Context

During the qmd E2E dispatch (2026-04-12), `worker-epic-history` completed its epic but `.arcforge-epic`'s `local.status` ended up as `done` instead of `completed`. When `sync` propagated this to the base DAG, `_getBlockedBy()` at `coordinator.js:674` compared `depEpic.status !== TaskStatus.COMPLETED` and saw `done` ≠ `completed`, blocking `epic-explain-query` from expanding.

Root cause: no code path updates `.arcforge-epic`'s `local.status` after creation (`in_progress`). `mergeEpics()` correctly sets `epic.status = TaskStatus.COMPLETED` in the DAG but doesn't touch the worktree marker. The agent filled the gap by editing `.arcforge-epic` directly, writing an invalid enum value.

## Tasks

### Task 1: Add `normalizeStatus()` to dag-schema — failing test

**Files:**
- Test: `tests/node/test-dag-schema.js`

**Step 1: Write failing test**

Append before the final `console.log('✅ All dag-schema tests passed!')` line in `tests/node/test-dag-schema.js`:

```js
// Test normalizeStatus
console.log('  normalizeStatus...');
const { normalizeStatus } = require('../../scripts/lib/dag-schema');

// Valid values pass through unchanged
assert.strictEqual(normalizeStatus('pending'), 'pending');
assert.strictEqual(normalizeStatus('in_progress'), 'in_progress');
assert.strictEqual(normalizeStatus('completed'), 'completed');
assert.strictEqual(normalizeStatus('blocked'), 'blocked');
console.log('    ✓ Valid statuses pass through');

// Common agent aliases normalize to canonical values
assert.strictEqual(normalizeStatus('done'), 'completed');
assert.strictEqual(normalizeStatus('finished'), 'completed');
assert.strictEqual(normalizeStatus('complete'), 'completed');
console.log('    ✓ Agent aliases normalize correctly');

// Unknown values throw
assert.throws(() => normalizeStatus('banana'), /Invalid status/);
assert.throws(() => normalizeStatus(''), /Invalid status/);
console.log('    ✓ Unknown values throw');
```

**Step 2: Run test**
Run: `node tests/node/test-dag-schema.js`
Expected: FAIL — `normalizeStatus is not a function` (not exported yet)

### Task 2: Implement `normalizeStatus()` in dag-schema

**Files:**
- Modify: `scripts/lib/dag-schema.js`

**Step 1: Implement**

Add after the `TaskStatus` const (after line 20) in `scripts/lib/dag-schema.js`:

```js
/**
 * Aliases that agents commonly write instead of the canonical TaskStatus values.
 * Maps each alias to its canonical TaskStatus value.
 */
const STATUS_ALIASES = {
  done: TaskStatus.COMPLETED,
  finished: TaskStatus.COMPLETED,
  complete: TaskStatus.COMPLETED,
};

/**
 * Normalize a status string to a valid TaskStatus value.
 * Passes through canonical values unchanged, maps known aliases,
 * and throws on unknown values.
 * @param {string} raw - Status string (possibly agent-written)
 * @returns {string} Canonical TaskStatus value
 */
function normalizeStatus(raw) {
  if (Object.values(TaskStatus).includes(raw)) return raw;
  const normalized = STATUS_ALIASES[raw];
  if (normalized) return normalized;
  throw new Error(
    `Invalid status "${raw}". Must be one of: ${Object.values(TaskStatus).join(', ')}`,
  );
}
```

Add `normalizeStatus` to the `module.exports` block.

**Step 2: Verify**
Run: `node tests/node/test-dag-schema.js`
Expected: PASS — all normalizeStatus tests green

**Step 3: Commit**
`git commit -m "feat(cli): add normalizeStatus() to dag-schema for agent-written status validation"`

### Task 3: Apply `normalizeStatus` in sync paths — failing test

**Files:**
- Test: `tests/scripts/coordinator.test.js`

**Step 1: Write failing test**

Add a new `describe('sync status validation')` block in `tests/scripts/coordinator.test.js`, after the existing describe blocks:

```js
describe('sync status validation', () => {
  it('should normalize "done" to "completed" in _syncBase path', () => {
    const coord = createCoordinator(
      twoEpicDag({
        epic1Status: TaskStatus.IN_PROGRESS,
        epic1Worktree: 'epic-1',
      }),
    );

    // Mock _resolveWorktreePath and _readAgenticEpic to simulate
    // a worktree whose .arcforge-epic has local.status: 'done'
    coord._resolveWorktreePath = jest.fn(() => '/tmp/fake-worktree');
    const origExistsSync = require('node:fs').existsSync;
    jest.spyOn(require('node:fs'), 'existsSync').mockImplementation((p) => {
      if (p === '/tmp/fake-worktree/.arcforge-epic') return true;
      return origExistsSync(p);
    });
    coord._readAgenticEpic = jest.fn(() => ({
      epic: 'epic-1',
      local: { status: 'done' },
    }));

    const result = coord._syncBase();
    const epic = coord.dag.getEpic('epic-1');
    expect(epic.status).toBe(TaskStatus.COMPLETED);
    expect(result.updates[0].new_status).toBe(TaskStatus.COMPLETED);

    require('node:fs').existsSync.mockRestore();
  });

  it('should reject invalid status in _syncBase path', () => {
    const coord = createCoordinator(
      twoEpicDag({
        epic1Status: TaskStatus.IN_PROGRESS,
        epic1Worktree: 'epic-1',
      }),
    );

    coord._resolveWorktreePath = jest.fn(() => '/tmp/fake-worktree');
    const origExistsSync = require('node:fs').existsSync;
    jest.spyOn(require('node:fs'), 'existsSync').mockImplementation((p) => {
      if (p === '/tmp/fake-worktree/.arcforge-epic') return true;
      return origExistsSync(p);
    });
    coord._readAgenticEpic = jest.fn(() => ({
      epic: 'epic-1',
      local: { status: 'banana' },
    }));

    expect(() => coord._syncBase()).toThrow(/Invalid status/);

    require('node:fs').existsSync.mockRestore();
  });
});
```

**Step 2: Run test**
Run: `npx jest tests/scripts/coordinator.test.js --verbose`
Expected: FAIL — `_syncBase` passes `done` through without normalization, so `epic.status` is `done` not `completed`

### Task 4: Apply `normalizeStatus` in both sync paths

**Files:**
- Modify: `scripts/lib/coordinator.js`

**Step 1: Implement**

Add `normalizeStatus` to the import from `dag-schema` at the top of `coordinator.js` (line 17):

```js
const { objectToYaml, normalizeStatus } = require('./dag-schema');
```

In `_syncWorktree()`, change the `local.status` usage (around line 607-613) from:

```js
const local = epicFile.local || {};
if (local.status) {
  const pushed = baseCoord._dagTransaction(() => {
    const dagEpic = baseCoord.dag.getEpic(epicFile.epic);
    if (dagEpic && local.status !== dagEpic.status) {
      dagEpic.status = local.status;
```

to:

```js
const local = epicFile.local || {};
if (local.status) {
  const validStatus = normalizeStatus(local.status);
  const pushed = baseCoord._dagTransaction(() => {
    const dagEpic = baseCoord.dag.getEpic(epicFile.epic);
    if (dagEpic && validStatus !== dagEpic.status) {
      dagEpic.status = validStatus;
```

In `_syncBase()`, change the `local.status` usage (around line 641-644) from:

```js
if (local.status) {
  const oldStatus = epic.status;
  if (local.status !== oldStatus) {
    epic.status = local.status;
    result.updates.push({
      epic: epicData.epic,
      old_status: oldStatus,
      new_status: local.status,
    });
```

to:

```js
if (local.status) {
  const validStatus = normalizeStatus(local.status);
  const oldStatus = epic.status;
  if (validStatus !== oldStatus) {
    epic.status = validStatus;
    result.updates.push({
      epic: epicData.epic,
      old_status: oldStatus,
      new_status: validStatus,
    });
```

**Step 2: Verify**
Run: `npx jest tests/scripts/coordinator.test.js --verbose`
Expected: PASS — sync now normalizes `done` → `completed` and rejects `banana`

**Step 3: Commit**
`git commit -m "fix(cli): validate agent-written status in sync paths via normalizeStatus"`

### Task 5: `_mergeEpicsInBase` updates `.arcforge-epic` marker — failing test

**Files:**
- Test: `tests/scripts/coordinator-merge-race.test.js`

**Step 1: Write failing test**

Add a new test inside the existing `describe('Coordinator merge concurrency')` block in `tests/scripts/coordinator-merge-race.test.js`. This test uses the real filesystem setup that already exists:

```js
test('merge updates .arcforge-epic marker to completed', () => {
  // Expand creates .arcforge-epic with local.status: in_progress.
  // After merge, the marker should be updated to completed so that
  // subsequent sync propagates the correct status.
  const worktreePath = path.join(root, 'worktrees', 'epic-a');
  fs.mkdirSync(worktreePath, { recursive: true });

  // Simulate what expand() writes to .arcforge-epic
  const { objectToYaml } = require('../../scripts/lib/dag-schema');
  const markerData = {
    epic: 'epic-a',
    base_worktree: root,
    base_branch: 'main',
    local: {
      status: TaskStatus.IN_PROGRESS,
      started_at: new Date().toISOString(),
    },
    synced: null,
  };
  fs.writeFileSync(path.join(worktreePath, '.arcforge-epic'), objectToYaml(markerData));

  // Point the DAG's worktree field to our mock worktree
  const dagContent = fs.readFileSync(path.join(root, 'dag.yaml'), 'utf8');
  const dagData = parseDagYaml(dagContent);
  dagData.epics.find((e) => e.id === 'epic-a').worktree = worktreePath;
  fs.writeFileSync(path.join(root, 'dag.yaml'), stringifyDagYaml(dagData));

  const coord = new Coordinator(root);
  coord.mergeEpics({ epicIds: ['epic-a'] });

  // Read the marker back — local.status should now be 'completed'
  const updatedMarker = parseDagYaml(
    fs.readFileSync(path.join(worktreePath, '.arcforge-epic'), 'utf8'),
  );
  expect(updatedMarker.local.status).toBe(TaskStatus.COMPLETED);
});
```

**Step 2: Run test**
Run: `npx jest tests/scripts/coordinator-merge-race.test.js --verbose`
Expected: FAIL — `updatedMarker.local.status` is `in_progress` (merge doesn't update marker yet)

### Task 6: Implement marker update in `_mergeEpicsInBase`

**Files:**
- Modify: `scripts/lib/coordinator.js`

**Step 1: Implement**

In `_mergeEpicsInBase()`, after `epic.status = TaskStatus.COMPLETED;` (line 389), add marker update logic:

```js
          epic.status = TaskStatus.COMPLETED;

          // Update the worktree's .arcforge-epic marker so that subsequent
          // sync propagates the correct status. Without this, the marker
          // retains the stale 'in_progress' from expand time, and sync
          // overwrites the DAG's correct 'completed' back to 'in_progress'.
          if (epic.worktree) {
            const wtPath = this._resolveWorktreePath(epic.worktree);
            const markerPath = wtPath && path.join(wtPath, '.arcforge-epic');
            if (markerPath && fs.existsSync(markerPath)) {
              const marker = this._readAgenticEpic(markerPath);
              if (!marker.local) marker.local = {};
              marker.local.status = TaskStatus.COMPLETED;
              fs.writeFileSync(markerPath, objectToYaml(marker));
            }
          }

          merged.push(epic);
```

**Step 2: Verify**
Run: `npx jest tests/scripts/coordinator-merge-race.test.js --verbose`
Expected: PASS — marker is now updated to `completed` after merge

**Step 3: Commit**
`git commit -m "fix(cli): update .arcforge-epic marker on merge to prevent sync status clobber"`

### Task 7: Full test suite verification

**Files:** None (verification only)

**Step 1: Run full suite**
Run: `npm test`
Expected: All 4 runners pass

**Step 2: Run lint**
Run: `npm run lint`
Expected: No warnings or errors

**Step 3: Commit (if lint fixes needed)**
`git commit -m "chore: lint fixes for sync status validation"`
