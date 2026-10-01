'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { filterEvents } = require('../src/history');

const events = [
  { kind: 'deploy', at: '2026-09-02T10:00:00Z', message: 'api 1.4.0' },
  { kind: 'rollback', at: '2026-09-01T09:00:00Z', message: 'api 1.3.9' },
  { kind: 'deploy', at: '2026-08-30T08:00:00Z', message: 'api 1.3.9' },
];

test('with no options every event comes back, oldest first', () => {
  const at = filterEvents(events).map((e) => e.at);
  assert.deepStrictEqual(at, [
    '2026-08-30T08:00:00Z',
    '2026-09-01T09:00:00Z',
    '2026-09-02T10:00:00Z',
  ]);
});

test('kind keeps only events of that kind', () => {
  const kinds = filterEvents(events, { kind: 'deploy' }).map((e) => e.kind);
  assert.deepStrictEqual(kinds, ['deploy', 'deploy']);
});
