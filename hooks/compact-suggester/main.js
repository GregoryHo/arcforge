#!/usr/bin/env node
/**
 * Strategic Compact Suggester
 *
 * Tracks tool calls and suggests /compact at strategic points:
 * - First suggestion at 50 tool calls
 * - Subsequent reminders every 25 calls
 * - Phase-aware messaging: references phase transitions instead of generic reminders
 * - Read/write ratio: suppresses during heavy write phases, boosts during read-heavy phases
 *
 * Triggered on PostToolUse for ALL tools.
 *
 * Performance: read/write tracking uses session-scoped file counters (same as tool-count)
 * since hooks run as fresh processes per event — in-memory state doesn't persist.
 */

const {
  readStdinSync,
  parseStdinJson,
  setSessionIdFromInput,
  logHighlight,
  createSessionCounter,
} = require('../../scripts/lib/utils');

const THRESHOLD = 50; // First suggestion
const INTERVAL = 25; // Subsequent reminders
const MIN_PHASE_SAMPLES = 10;

const WRITE_TOOLS = ['Write', 'Edit', 'NotebookEdit'];
const READ_TOOLS = ['Read', 'Glob', 'Grep'];

// All counters persist to disk — hooks run as fresh processes per event
let toolCounter = null;
let readCounter = null;
let writeCounter = null;

function getCounter() {
  if (!toolCounter) {
    toolCounter = createSessionCounter('tool-count');
  }
  return toolCounter;
}

function getReadCounter() {
  if (!readCounter) {
    readCounter = createSessionCounter('read-count');
  }
  return readCounter;
}

function getWriteCounter() {
  if (!writeCounter) {
    writeCounter = createSessionCounter('write-count');
  }
  return writeCounter;
}

/**
 * Check if we should show a suggestion
 */
function shouldSuggest(count) {
  return count >= THRESHOLD && (count - THRESHOLD) % INTERVAL === 0;
}

/**
 * Get read/write ratio from persisted counters
 * @returns {{ reads: number, writes: number, total: number }}
 */
function getReadWriteRatio() {
  const reads = getReadCounter().read();
  const writes = getWriteCounter().read();
  return { reads, writes, total: reads + writes };
}

/**
 * Check if a write-heavy phase should suppress non-critical reminders.
 * Suppresses at non-threshold counts below 100 during active implementation.
 */
function shouldSuppressReminder(count) {
  const { writes, total } = getReadWriteRatio();
  const writeHeavy = total >= MIN_PHASE_SAMPLES && writes / total > 0.6;
  return writeHeavy && count !== THRESHOLD && count < 100;
}

/**
 * Build phase-aware suggestion message
 */
function buildMessage(count) {
  const { reads, writes, total } = getReadWriteRatio();
  const hasEnoughData = total >= MIN_PHASE_SAMPLES;
  const readHeavy = hasEnoughData && reads / total > 0.7;
  const writeHeavy = hasEnoughData && writes / total > 0.6;

  if (count === THRESHOLD) {
    if (readHeavy) {
      return `\n📊 ${count} tool calls (mostly reads) — looks like a research/exploration phase. If you're transitioning to implementation, /compact now to free context for code.\n`;
    }
    if (writeHeavy) {
      return `\n📊 ${count} tool calls (active implementation). If you're between tasks or about to switch features, /compact at the boundary. Mid-implementation compaction loses valuable context.\n`;
    }
    return `\n📊 ${count} tool calls this session. If you're between workflow phases, consider /compact to preserve context quality. Use arc-compacting for timing guidance.\n`;
  }

  if (count >= 75 && readHeavy) {
    return `\n📊 ${count} tool calls — heavy read phase. Context is filling with research. If findings are saved to files, /compact now for a fresh start.\n`;
  }

  return `\n📊 ${count} tool calls. Between phases? /compact helps maintain context quality for longer sessions.\n`;
}

/**
 * Track read/write tool usage via persisted counters
 */
function trackToolType(input) {
  const toolName = input?.tool_name || '';
  if (READ_TOOLS.some((t) => toolName.includes(t))) {
    const c = getReadCounter();
    c.write(c.read() + 1);
  } else if (WRITE_TOOLS.some((t) => toolName.includes(t))) {
    const c = getWriteCounter();
    c.write(c.read() + 1);
  }
}

/**
 * Main entry point
 */
function main() {
  // Read and pass through stdin
  const stdin = readStdinSync();
  process.stdout.write(stdin);

  // Parse stdin and set session ID from input
  const input = parseStdinJson(stdin);
  setSessionIdFromInput(input);

  // Track read/write ratio in memory (zero file I/O cost)
  trackToolType(input);

  // Increment counter (2 file I/O ops: read + write)
  const counter = getCounter();
  const currentCount = counter.read();
  const newCount = currentCount + 1;
  counter.write(newCount);

  // Check if suggestion is needed (suppress during write-heavy phases at non-threshold counts)
  if (shouldSuggest(newCount)) {
    if (shouldSuppressReminder(newCount)) {
      return;
    }
    logHighlight(buildMessage(newCount));
  }
}

// Export for use by session-tracker and testing
module.exports = {
  resetCounter: () => getCounter().reset(),
  readCount: () => getCounter().read(),
  getCounterFilePath: () => getCounter().getFilePath(),
  shouldSuggest,
  shouldSuppressReminder,
  buildMessage,
  trackToolType,
  getReadWriteRatio,
};

// Run if executed directly
if (require.main === module) {
  main();
}
