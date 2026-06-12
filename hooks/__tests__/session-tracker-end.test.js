const { describe, it } = require('node:test');
const assert = require('node:assert');

const { calculateDurationMinutes } = require('../session-tracker/end');

describe('calculateDurationMinutes', () => {
  it('should calculate duration correctly', () => {
    const start = '2025-01-01T10:00:00Z';
    const end = '2025-01-01T10:30:00Z';
    assert.strictEqual(calculateDurationMinutes(start, end), 30);
  });

  it('should round to nearest minute', () => {
    const start = '2025-01-01T10:00:00Z';
    const end = '2025-01-01T10:00:45Z';
    assert.strictEqual(calculateDurationMinutes(start, end), 1);
  });

  it('should return null for missing timestamps', () => {
    assert.strictEqual(calculateDurationMinutes(null, '2025-01-01T10:00:00Z'), null);
    assert.strictEqual(calculateDurationMinutes('2025-01-01T10:00:00Z', null), null);
    assert.strictEqual(calculateDurationMinutes(null, null), null);
  });
});
