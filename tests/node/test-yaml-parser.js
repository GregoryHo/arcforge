#!/usr/bin/env node
/**
 * Tests for yaml-parser.js
 */

const assert = require('node:assert');
const { parse, parseValue } = require('../../scripts/lib/yaml-parser');

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

// parseValue flow arrays
console.log('  parseValue (flow arrays)...');
assert.deepStrictEqual(parseValue('[a, b]'), ['a', 'b']);
assert.deepStrictEqual(parseValue('[a]'), ['a']);
assert.deepStrictEqual(parseValue('["a", "b"]'), ['a', 'b']);
assert.deepStrictEqual(parseValue("['a', 'b']"), ['a', 'b']);
assert.deepStrictEqual(parseValue('[]'), []);
console.log('    ✓ Flow arrays parsed correctly');

console.log('\n✅ All yaml-parser tests passed!\n');
