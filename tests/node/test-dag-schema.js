#!/usr/bin/env node
/**
 * Tests for dag-schema.js
 */

const assert = require('assert');
const path = require('path');
const { TaskStatus, schema, example, schemaToYaml, exampleToYaml, validate, objectToYaml } = require('../../scripts/lib/dag-schema');

console.log('Testing dag-schema.js...\n');

// Test TaskStatus
console.log('  TaskStatus enum...');
assert.strictEqual(TaskStatus.PENDING, 'pending');
assert.strictEqual(TaskStatus.IN_PROGRESS, 'in_progress');
assert.strictEqual(TaskStatus.COMPLETED, 'completed');
assert.strictEqual(TaskStatus.BLOCKED, 'blocked');
console.log('    ✓ TaskStatus values correct');

// Test schema structure
console.log('  Schema structure...');
assert.ok(schema.epics, 'schema should have epics');
assert.ok(schema.blocked, 'schema should have blocked');
assert.strictEqual(schema.epics.type, 'array');
assert.ok(schema.epics.items.id, 'epic should have id field');
assert.ok(schema.epics.items.features, 'epic should have features field');
console.log('    ✓ Schema has required fields');

// Test example structure
console.log('  Example structure...');
assert.ok(Array.isArray(example.epics), 'example.epics should be array');
assert.ok(example.epics.length > 0, 'example should have at least one epic');
assert.ok(example.epics[0].id, 'example epic should have id');
assert.ok(example.epics[0].features, 'example epic should have features');
console.log('    ✓ Example has required structure');

// Test schemaToYaml
console.log('  schemaToYaml...');
const schemaYaml = schemaToYaml();
assert.ok(schemaYaml.includes('epics:'), 'schema YAML should include epics');
assert.ok(schemaYaml.includes('blocked:'), 'schema YAML should include blocked');
assert.ok(schemaYaml.includes('id: string'), 'schema YAML should show id type');
console.log('    ✓ Schema YAML output correct');

// Test exampleToYaml
console.log('  exampleToYaml...');
const exampleYaml = exampleToYaml();
assert.ok(exampleYaml.includes('epic-001'), 'example YAML should include epic id');
assert.ok(exampleYaml.includes('User Authentication'), 'example YAML should include epic name');
console.log('    ✓ Example YAML output correct');

// Test validate - valid dag
console.log('  validate (valid dag)...');
const validResult = validate(example);
assert.strictEqual(validResult.valid, true, 'example should be valid');
assert.strictEqual(validResult.errors.length, 0, 'example should have no errors');
console.log('    ✓ Valid dag passes validation');

// Test validate - invalid dag (missing id)
console.log('  validate (missing id)...');
const invalidDag1 = { epics: [{ name: 'Test' }] };
const result1 = validate(invalidDag1);
assert.strictEqual(result1.valid, false);
assert.ok(result1.errors.some(e => e.includes('id')));
console.log('    ✓ Missing id detected');

// Test validate - invalid status
console.log('  validate (invalid status)...');
const invalidDag2 = {
  epics: [{
    id: 'test',
    name: 'Test',
    spec_path: 'test.md',
    status: 'invalid_status'
  }]
};
const result2 = validate(invalidDag2);
assert.strictEqual(result2.valid, false);
assert.ok(result2.errors.some(e => e.includes('status')));
console.log('    ✓ Invalid status detected');

// Test validate - duplicate epic id
console.log('  validate (duplicate epic id)...');
const invalidDag3 = {
  epics: [
    { id: 'same-id', name: 'Epic 1', spec_path: 'a.md' },
    { id: 'same-id', name: 'Epic 2', spec_path: 'b.md' }
  ]
};
const result3 = validate(invalidDag3);
assert.strictEqual(result3.valid, false);
assert.ok(result3.errors.some(e => e.includes('duplicate')));
console.log('    ✓ Duplicate epic id detected');

// Test objectToYaml
console.log('  objectToYaml...');
const testObj = {
  key: 'value',
  nested: { a: 1, b: 2 },
  list: ['x', 'y', 'z']
};
const objYaml = objectToYaml(testObj);
assert.ok(objYaml.includes('key: value'));
assert.ok(objYaml.includes('nested:'));
assert.ok(objYaml.includes('list:'));
console.log('    ✓ Object serialization correct');

console.log('\n✅ All dag-schema tests passed!\n');
