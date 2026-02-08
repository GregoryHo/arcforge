#!/usr/bin/env node
/**
 * Strategic Compact Suggester
 *
 * Tracks tool calls and suggests /compact at strategic points:
 * - First suggestion at 50 tool calls
 * - Subsequent reminders every 25 calls
 *
 * Triggered on PostToolUse for ALL tools.
 */

const {
  readStdinSync,
  parseStdinJson,
  setSessionIdFromInput,
  logHighlight,
  createSessionCounter
} = require('../lib/utils');

const THRESHOLD = 50;     // First suggestion
const INTERVAL = 25;      // Subsequent reminders

// Counter is created lazily on first access
let toolCounter = null;

function getCounter() {
  if (!toolCounter) {
    toolCounter = createSessionCounter('tool-count');
  }
  return toolCounter;
}

/**
 * Check if we should show a suggestion
 */
function shouldSuggest(count) {
  return count >= THRESHOLD && (count - THRESHOLD) % INTERVAL === 0;
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

  // Increment counter
  const counter = getCounter();
  const currentCount = counter.read();
  const newCount = currentCount + 1;
  counter.write(newCount);

  // Check if suggestion is needed
  if (shouldSuggest(newCount)) {
    const message = newCount === THRESHOLD
      ? `\n📊 You've made ${newCount} tool calls this session. Consider using /compact at your next phase boundary to preserve context quality.\n`
      : `\n📊 Now at ${newCount} tool calls. Reminder: /compact helps maintain context quality for longer sessions.\n`;
    logHighlight(message);
  }
}

// Export for use by session-tracker
module.exports = {
  resetCounter: () => getCounter().reset(),
  readCount: () => getCounter().read(),
  getCounterFilePath: () => getCounter().getFilePath()
};

// Run if executed directly
if (require.main === module) {
  main();
}
