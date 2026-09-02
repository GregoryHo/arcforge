'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { formatFor, availableFormats } = require('../src/exporter');

const run = {
  id: 'run-41',
  columns: ['region', 'orders'],
  rows: [
    { orders: 12, region: 'north' },
    { orders: 7, region: 'south' },
  ],
};

test('json export honours the run column order', () => {
  const parsed = JSON.parse(formatFor('json', run));
  assert.deepStrictEqual(Object.keys(parsed.rows[0]), ['region', 'orders']);
});

test('an unknown format is refused with the format named', () => {
  assert.throws(() => formatFor('pdf', run), /unsupported export kind: pdf/);
});

test('available formats lists what the exporter implements', () => {
  assert.deepStrictEqual(availableFormats(), ['json']);
});
