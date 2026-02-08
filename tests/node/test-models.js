#!/usr/bin/env node
/**
 * Tests for models.js
 */

const assert = require('assert');
const { TaskStatus, Feature, Epic, BlockedItem, SyncResult, DAG } = require('../../scripts/lib/models');

console.log('Testing models.js...\n');

// Test Feature
console.log('  Feature class...');
const feature1 = new Feature({
  id: 'feat-001',
  name: 'Test Feature',
  status: TaskStatus.PENDING,
  depends_on: ['feat-000']
});
assert.strictEqual(feature1.id, 'feat-001');
assert.strictEqual(feature1.name, 'Test Feature');
assert.strictEqual(feature1.status, TaskStatus.PENDING);
assert.deepStrictEqual(feature1.depends_on, ['feat-000']);
console.log('    ✓ Feature creation');

// Test Feature.isReady
const completedFeatures = new Set(['feat-000']);
assert.strictEqual(feature1.isReady(completedFeatures), true);
assert.strictEqual(feature1.isReady(new Set()), false);
console.log('    ✓ Feature.isReady');

// Test Feature.toObject
const featureObj = feature1.toObject();
assert.strictEqual(featureObj.id, 'feat-001');
assert.ok(!featureObj.source_requirement, 'should not include null source_requirement');
console.log('    ✓ Feature.toObject');

// Test Epic
console.log('  Epic class...');
const epic1 = new Epic({
  id: 'epic-001',
  name: 'Test Epic',
  spec_path: 'docs/spec.md',
  status: TaskStatus.IN_PROGRESS,
  worktree: '.worktrees/epic-001',
  depends_on: [],
  features: [
    { id: 'feat-001', name: 'Feature 1', status: TaskStatus.COMPLETED },
    { id: 'feat-002', name: 'Feature 2', status: TaskStatus.PENDING }
  ]
});
assert.strictEqual(epic1.id, 'epic-001');
assert.strictEqual(epic1.features.length, 2);
assert.ok(epic1.features[0] instanceof Feature);
console.log('    ✓ Epic creation');

// Test Epic.isReady
assert.strictEqual(epic1.isReady(new Set()), true);
const epicWithDeps = new Epic({
  id: 'epic-002',
  name: 'Dependent Epic',
  spec_path: 'spec.md',
  depends_on: ['epic-001']
});
assert.strictEqual(epicWithDeps.isReady(new Set()), false);
assert.strictEqual(epicWithDeps.isReady(new Set(['epic-001'])), true);
console.log('    ✓ Epic.isReady');

// Test Epic.completionRatio
assert.strictEqual(epic1.completionRatio(), 0.5);
console.log('    ✓ Epic.completionRatio');

// Test Epic.getCompletedFeatures
const completed = epic1.getCompletedFeatures();
assert.ok(completed.has('feat-001'));
assert.ok(!completed.has('feat-002'));
console.log('    ✓ Epic.getCompletedFeatures');

// Test BlockedItem
console.log('  BlockedItem class...');
const blocked = new BlockedItem({
  task_id: 'feat-001',
  reason: 'Test reason',
  blocked_at: '2024-01-15T10:00:00Z'
});
assert.strictEqual(blocked.task_id, 'feat-001');
assert.ok(blocked.blocked_at instanceof Date);
console.log('    ✓ BlockedItem creation');

const blockedObj = blocked.toObject();
assert.ok(blockedObj.blocked_at.includes('2024-01-15'));
console.log('    ✓ BlockedItem.toObject');

// Test SyncResult
console.log('  SyncResult class...');
const syncResult = new SyncResult({
  epic_id: 'epic-001',
  pulled: true,
  pushed: false
});
assert.strictEqual(syncResult.epic_id, 'epic-001');
assert.strictEqual(syncResult.pulled, true);
assert.strictEqual(syncResult.pushed, false);
console.log('    ✓ SyncResult creation');

// Test DAG
console.log('  DAG class...');
const dag = new DAG({
  epics: [
    {
      id: 'epic-001',
      name: 'Epic 1',
      spec_path: 'spec.md',
      status: TaskStatus.IN_PROGRESS,
      features: [
        { id: 'feat-001', name: 'Feature 1', status: TaskStatus.COMPLETED },
        { id: 'feat-002', name: 'Feature 2', status: TaskStatus.PENDING }
      ]
    },
    {
      id: 'epic-002',
      name: 'Epic 2',
      spec_path: 'spec2.md',
      status: TaskStatus.PENDING,
      depends_on: ['epic-001']
    }
  ]
});
assert.strictEqual(dag.epics.length, 2);
assert.ok(dag.epics[0] instanceof Epic);
console.log('    ✓ DAG creation');

// Test DAG.getTask
const task1 = dag.getTask('epic-001');
assert.ok(task1 instanceof Epic);
const task2 = dag.getTask('feat-001');
assert.ok(task2 instanceof Feature);
const task3 = dag.getTask('nonexistent');
assert.strictEqual(task3, null);
console.log('    ✓ DAG.getTask');

// Test DAG.getEpic
const epic = dag.getEpic('epic-002');
assert.strictEqual(epic.id, 'epic-002');
console.log('    ✓ DAG.getEpic');

// Test DAG.getCompletedEpics
const completedEpics = dag.getCompletedEpics();
assert.strictEqual(completedEpics.size, 0);
console.log('    ✓ DAG.getCompletedEpics');

// Test DAG.getCompletedFeatures
const completedFeaturesInEpic = dag.getCompletedFeatures('epic-001');
assert.ok(completedFeaturesInEpic.has('feat-001'));
console.log('    ✓ DAG.getCompletedFeatures');

// Test DAG.findEpicByFeature
const containingEpic = dag.findEpicByFeature('feat-002');
assert.strictEqual(containingEpic.id, 'epic-001');
console.log('    ✓ DAG.findEpicByFeature');

// Test DAG.toObject
const dagObj = dag.toObject();
assert.ok(Array.isArray(dagObj.epics));
assert.strictEqual(dagObj.epics.length, 2);
console.log('    ✓ DAG.toObject');

// Test DAG.fromObject
const dag2 = DAG.fromObject(dagObj);
assert.strictEqual(dag2.epics.length, 2);
console.log('    ✓ DAG.fromObject');

console.log('\n✅ All models tests passed!\n');
