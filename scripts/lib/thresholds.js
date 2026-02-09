/**
 * Session threshold constants and utilities
 *
 * Shared module for determining when to trigger diary/evaluation actions.
 * Counters accumulate across resume/exit cycles until threshold is reached.
 *
 * NOTE: This is the canonical location. hooks/lib/thresholds.js should import from here.
 */

const MIN_USER_MESSAGES = 5;
const MIN_TOOL_CALLS = 20;

/**
 * Check if session activity meets threshold for diary trigger.
 * Uses AND logic: both human participation AND substantive work required.
 * @param {number} userCount - Number of user messages
 * @param {number} toolCount - Number of tool calls
 * @returns {boolean} True if threshold is met
 */
function shouldTrigger(userCount, toolCount) {
  return userCount >= MIN_USER_MESSAGES && toolCount >= MIN_TOOL_CALLS;
}

module.exports = {
  MIN_USER_MESSAGES,
  MIN_TOOL_CALLS,
  shouldTrigger
};
