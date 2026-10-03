const test = require('node:test');
const assert = require('node:assert');
const { parseDuration } = require('../src/duration');

test('parses days', () => {
  assert.strictEqual(parseDuration('3d'), 259200000);
});
