const test = require('node:test');
const assert = require('node:assert');
const { parseDuration } = require('../src/duration');

test('parses hours', () => {
  assert.strictEqual(parseDuration('2h'), 7200000);
});
