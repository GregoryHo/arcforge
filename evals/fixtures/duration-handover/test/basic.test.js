const test = require('node:test');
const assert = require('node:assert');
const { parseDuration } = require('../src/duration');

test('parses seconds', () => {
  assert.strictEqual(parseDuration('90s'), 90000);
});

test('parses minutes', () => {
  assert.strictEqual(parseDuration('5m'), 300000);
});

test('rejects text that is not a duration', () => {
  assert.throws(() => parseDuration('soon'), /bad duration/);
});
