#!/usr/bin/env node
/**
 * User Message Counter
 *
 * Tracks user prompt submissions via UserPromptSubmit hook.
 * Count is stored in temp file and used by session-evaluator
 * to determine if session is long enough for pattern extraction.
 */

const {
  readStdinSync,
  parseStdinJson,
  setSessionIdFromInput,
  createSessionCounter
} = require('../lib/utils');

// Counter is created lazily on first access
let userCounter = null;

function getCounter() {
  if (!userCounter) {
    userCounter = createSessionCounter('user-count');
  }
  return userCounter;
}

/**
 * Main entry point - UserPromptSubmit hook
 */
function main() {
  // Read and pass through stdin (for hook chaining)
  const stdin = readStdinSync();
  process.stdout.write(stdin);

  // Parse stdin and set session ID from input
  const input = parseStdinJson(stdin);
  setSessionIdFromInput(input);

  // Increment counter
  const counter = getCounter();
  const currentCount = counter.read();
  counter.write(currentCount + 1);
  process.exit(0);
}

// Export for use by session-tracker and session-evaluator
module.exports = {
  readCount: () => getCounter().read(),
  writeCount: (count) => getCounter().write(count),
  resetCounter: () => getCounter().reset(),
  getCounterFilePath: () => getCounter().getFilePath()
};

// Run if executed directly
if (require.main === module) {
  main();
}
