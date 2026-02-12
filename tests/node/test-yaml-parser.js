#!/usr/bin/env node
/**
 * Tests for yaml-parser.js
 */

const assert = require('node:assert');
const {
  parse,
  parseValue,
  parseDagYaml,
  stringifyDagYaml,
} = require('../../scripts/lib/yaml-parser');

console.log('Testing yaml-parser.js...\n');

// Test parseValue
console.log('  parseValue...');
assert.strictEqual(parseValue('null'), null);
assert.strictEqual(parseValue('~'), null);
assert.strictEqual(parseValue(''), null);
assert.strictEqual(parseValue('true'), true);
assert.strictEqual(parseValue('false'), false);
assert.strictEqual(parseValue('42'), 42);
assert.strictEqual(parseValue('3.14'), 3.14);
assert.strictEqual(parseValue('hello'), 'hello');
assert.strictEqual(parseValue('"quoted"'), 'quoted');
assert.strictEqual(parseValue("'single'"), 'single');
assert.deepStrictEqual(parseValue('[]'), []);
console.log('    ✓ Scalar values parsed correctly');

// Test basic parsing
console.log('  parse (basic)...');
const basicYaml = `
key1: value1
key2: 42
key3: true
`;
const basicResult = parse(basicYaml);
assert.strictEqual(basicResult.key1, 'value1');
assert.strictEqual(basicResult.key2, 42);
assert.strictEqual(basicResult.key3, true);
console.log('    ✓ Basic key-value parsing');

// Test nested objects
console.log('  parse (nested)...');
const nestedYaml = `
parent:
  child1: value1
  child2: value2
`;
const nestedResult = parse(nestedYaml);
assert.strictEqual(nestedResult.parent.child1, 'value1');
assert.strictEqual(nestedResult.parent.child2, 'value2');
console.log('    ✓ Nested object parsing');

// Test arrays
console.log('  parse (arrays)...');
const arrayYaml = `
items:
  - item1
  - item2
  - item3
`;
const arrayResult = parse(arrayYaml);
assert.ok(Array.isArray(arrayResult.items));
assert.strictEqual(arrayResult.items.length, 3);
assert.strictEqual(arrayResult.items[0], 'item1');
console.log('    ✓ Array parsing');

// Test array of objects
console.log('  parse (array of objects)...');
const objArrayYaml = `
epics:
  - id: epic-001
    name: Epic One
  - id: epic-002
    name: Epic Two
`;
const objArrayResult = parse(objArrayYaml);
assert.ok(Array.isArray(objArrayResult.epics));
assert.strictEqual(objArrayResult.epics.length, 2);
assert.strictEqual(objArrayResult.epics[0].id, 'epic-001');
assert.strictEqual(objArrayResult.epics[1].name, 'Epic Two');
console.log('    ✓ Array of objects parsing');

// Test comments
console.log('  parse (comments)...');
const commentYaml = `
# This is a comment
key: value
# Another comment
`;
const commentResult = parse(commentYaml);
assert.strictEqual(commentResult.key, 'value');
console.log('    ✓ Comments ignored');

// Test parseDagYaml
console.log('  parseDagYaml...');
const dagYaml = `
epics:
  - id: epic-001
    name: Test Epic
    spec_path: docs/spec.md
    status: in_progress
    depends_on: []
    features:
      - id: feat-001
        name: Feature 1
        status: completed
        depends_on: []
blocked:
  - task_id: feat-001
    reason: Test reason
    blocked_at: "2024-01-15T10:00:00Z"
    attempts: []
`;
const dagResult = parseDagYaml(dagYaml);
assert.ok(Array.isArray(dagResult.epics));
assert.strictEqual(dagResult.epics[0].id, 'epic-001');
assert.strictEqual(dagResult.epics[0].status, 'in_progress');
assert.strictEqual(dagResult.epics[0].features[0].id, 'feat-001');
assert.ok(Array.isArray(dagResult.blocked));
assert.strictEqual(dagResult.blocked[0].task_id, 'feat-001');
console.log('    ✓ DAG YAML parsing');

// Test stringifyDagYaml
console.log('  stringifyDagYaml...');
const dagObj = {
  epics: [
    {
      id: 'test-epic',
      name: 'Test',
      status: 'pending',
      spec_path: 'test.md',
      worktree: null,
      depends_on: [],
      features: [
        {
          id: 'test-feat',
          name: 'Test Feature',
          status: 'pending',
          depends_on: [],
        },
      ],
    },
  ],
  blocked: [],
};
const yamlString = stringifyDagYaml(dagObj);
assert.ok(yamlString.includes('test-epic'));
assert.ok(yamlString.includes('test-feat'));
console.log('    ✓ DAG YAML stringification');

// Test roundtrip
console.log('  Roundtrip (parse -> stringify -> parse)...');
const roundtripResult = parseDagYaml(stringifyDagYaml(dagResult));
assert.strictEqual(roundtripResult.epics[0].id, dagResult.epics[0].id);
assert.strictEqual(roundtripResult.epics[0].features[0].id, dagResult.epics[0].features[0].id);
console.log('    ✓ Roundtrip preserves data');

console.log('\n✅ All yaml-parser tests passed!\n');
