const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  generateMarkdownSummary,
  calculateDurationMinutes,
  formatTime,
  formatDate,
} = require('../session-tracker/summary');

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

describe('formatTime', () => {
  it('should extract HH:MM from ISO timestamp', () => {
    assert.strictEqual(formatTime('2025-01-01T14:30:00Z'), '14:30');
    assert.strictEqual(formatTime('2025-12-31T09:05:00Z'), '09:05');
  });

  it('should return unknown for invalid input', () => {
    assert.strictEqual(formatTime(null), 'unknown');
    assert.strictEqual(formatTime(undefined), 'unknown');
  });
});

describe('formatDate', () => {
  it('should extract YYYY-MM-DD from ISO timestamp', () => {
    assert.strictEqual(formatDate('2025-01-01T14:30:00Z'), '2025-01-01');
    assert.strictEqual(formatDate('2025-12-31T09:05:00Z'), '2025-12-31');
  });

  it('should return unknown for invalid input', () => {
    assert.strictEqual(formatDate(null), 'unknown');
    assert.strictEqual(formatDate(undefined), 'unknown');
  });
});

describe('generateMarkdownSummary', () => {
  it('should generate complete session summary with new template format', () => {
    const session = {
      sessionId: 'abc12345-6789',
      project: 'my-project',
      date: '2025-01-15',
      started: '2025-01-15T10:00:00Z',
      lastUpdated: '2025-01-15T11:30:00Z',
      toolCalls: 75,
      filesModified: ['src/app.js', 'lib/utils.js'],
      compactions: ['2025-01-15T10:30:00Z', '2025-01-15T11:00:00Z'],
    };

    const md = generateMarkdownSummary(session);

    // Header
    assert.ok(md.includes('# Session: 2025-01-15'));
    assert.ok(md.includes('**Project:** my-project'));
    assert.ok(md.includes('**Session ID:** abc12345-6789'));
    assert.ok(md.includes('**Started:** 10:00'));
    assert.ok(md.includes('**Last Updated:** 11:30'));

    // Current State section with metrics
    assert.ok(md.includes('## Current State'));
    assert.ok(md.includes('Duration: ~90 minutes'));
    assert.ok(md.includes('Tool calls: 75'));
    assert.ok(md.includes('Compactions: 2'));

    // Editable sections (placeholders)
    assert.ok(md.includes('### Completed'));
    assert.ok(md.includes('### In Progress'));
    assert.ok(md.includes('### Notes for Next Session'));

    // Context to Load
    assert.ok(md.includes('### Context to Load'));
    assert.ok(md.includes('src/app.js'));
    assert.ok(md.includes('lib/utils.js'));

    // Timeline
    assert.ok(md.includes('### Compaction Timeline'));
    assert.ok(md.includes('10:30'));
    assert.ok(md.includes('11:00'));
  });

  it('should omit compaction info when empty', () => {
    const session = {
      project: 'test',
      filesModified: [],
      compactions: [],
      toolCalls: 10,
    };

    const md = generateMarkdownSummary(session);
    assert.ok(!md.includes('Compactions:'));
    assert.ok(!md.includes('### Compaction Timeline'));
  });

  it('should handle empty filesModified', () => {
    const session = {
      project: 'test',
      filesModified: [],
      toolCalls: 10,
    };

    const md = generateMarkdownSummary(session);
    assert.ok(md.includes('### Context to Load'));
    assert.ok(md.includes('```\n```')); // Empty code block
  });

  it('should handle minimal session data', () => {
    const session = {
      project: 'minimal',
    };

    const md = generateMarkdownSummary(session);
    assert.ok(md.includes('**Project:** minimal'));
    assert.ok(md.includes('Tool calls: 0'));
    assert.ok(md.includes('### Completed'));
    assert.ok(md.includes('### In Progress'));
    assert.ok(md.includes('### Notes for Next Session'));
    assert.ok(!md.includes('### Compaction Timeline'));
  });

  it('should not show duration when 0', () => {
    const session = {
      project: 'test',
      started: '2025-01-15T10:00:00Z',
      lastUpdated: '2025-01-15T10:00:00Z',
    };

    const md = generateMarkdownSummary(session);
    assert.ok(!md.includes('Duration:'));
  });

  it('should use date from session.date field', () => {
    const session = {
      project: 'test',
      date: '2025-01-20',
      started: '2025-01-15T10:00:00Z',
    };

    const md = generateMarkdownSummary(session);
    assert.ok(md.includes('# Session: 2025-01-20'));
  });

  it('should fallback to started date when session.date is missing', () => {
    const session = {
      project: 'test',
      started: '2025-01-15T10:00:00Z',
    };

    const md = generateMarkdownSummary(session);
    assert.ok(md.includes('# Session: 2025-01-15'));
  });
});
