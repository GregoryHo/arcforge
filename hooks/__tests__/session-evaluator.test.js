const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const { formatStopReason } = require('../session-evaluator/main');
const { shouldTrigger, MIN_USER_MESSAGES, MIN_TOOL_CALLS } = require('../lib/thresholds');

describe('shouldTrigger (shared threshold logic)', () => {
  it('should return false when both counts are below minimum', () => {
    assert.strictEqual(shouldTrigger(5, 20), false);
    assert.strictEqual(shouldTrigger(MIN_USER_MESSAGES - 1, MIN_TOOL_CALLS - 1), false);
  });

  it('should return true when user count meets minimum', () => {
    assert.strictEqual(shouldTrigger(MIN_USER_MESSAGES, 0), true);
    assert.strictEqual(shouldTrigger(15, 10), true);
  });

  it('should return true when tool count meets minimum', () => {
    assert.strictEqual(shouldTrigger(5, MIN_TOOL_CALLS), true);
    assert.strictEqual(shouldTrigger(0, 100), true);
  });

  it('should use OR logic - either threshold triggers', () => {
    // Only user messages meet threshold
    assert.strictEqual(shouldTrigger(MIN_USER_MESSAGES, 0), true);
    // Only tool calls meet threshold
    assert.strictEqual(shouldTrigger(0, MIN_TOOL_CALLS), true);
    // Both meet threshold
    assert.strictEqual(shouldTrigger(MIN_USER_MESSAGES, MIN_TOOL_CALLS), true);
    // Neither meets threshold
    assert.strictEqual(shouldTrigger(MIN_USER_MESSAGES - 1, MIN_TOOL_CALLS - 1), false);
  });
});

describe('formatStopReason', () => {
  const config = {
    learnedSkillsGlobalPath: '~/.claude/skills/learned/global/',
    learnedSkillsProjectPath: '~/.claude/skills/learned/{project}/'
  };

  it('should return a string', () => {
    const result = formatStopReason(15, 30, config);
    assert.ok(typeof result === 'string');
  });

  it('should include user count and tool count', () => {
    const result = formatStopReason(15, 30, config);
    assert.ok(result.includes('15 messages'));
    assert.ok(result.includes('30 tool calls'));
  });

  it('should mention /learn and /reflect commands', () => {
    const result = formatStopReason(10, 20, config);
    assert.ok(result.includes('/learn'));
    assert.ok(result.includes('/reflect'));
  });

  it('should include global skills path', () => {
    const result = formatStopReason(10, 20, config);
    assert.ok(result.includes('~/.claude/skills/learned/global/'));
  });

  it('should include diaryed path', () => {
    const result = formatStopReason(10, 20, config);
    assert.ok(result.includes('~/.claude/diaryed/'));
  });

  it('should mention pattern types', () => {
    const result = formatStopReason(10, 20, config);
    assert.ok(result.includes('error_resolution'));
    assert.ok(result.includes('user_corrections'));
  });
});
