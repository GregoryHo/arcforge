#!/usr/bin/env node
/**
 * Session Evaluator
 *
 * Runs on Stop to evaluate if session is long enough for pattern extraction.
 * If criteria met, outputs JSON with decision: "block" to prompt Claude.
 *
 * Note: Uses Stop hook (not SessionEnd) so Claude sees and executes the prompt.
 */

const path = require('path');
const {
  readStdinSync,
  readFileSafe,
  getProjectName,
  parseStdinJson,
  outputDecisionHighlight
} = require('../lib/utils');
const { readCount: readUserCount } = require('../user-message-counter/main');
const { readCount: readToolCount } = require('../compact-suggester/main');
const { shouldTrigger } = require('../lib/thresholds');

const DEFAULT_CONFIG = {
  learnedSkillsGlobalPath: '~/.claude/skills/learned/global/',
  learnedSkillsProjectPath: '~/.claude/skills/learned/{project}/',
  patternsToDetect: [
    'error_resolution',
    'user_corrections',
    'workarounds',
    'debugging_techniques',
    'project_specific'
  ],
  enabled: true
};

/**
 * Load configuration from config.json
 */
function loadConfig() {
  const configPath = path.join(__dirname, 'config.json');
  const content = readFileSafe(configPath);
  if (!content) return DEFAULT_CONFIG;
  try {
    return JSON.parse(content);
  } catch {
    return DEFAULT_CONFIG;
  }
}

/**
 * Format stop reason for decision: "block" output
 * Claude will see and execute this prompt
 * @returns {string} The reason/prompt for Claude to execute
 */
function formatStopReason(userCount, toolCount, config) {
  const project = getProjectName();

  return `📚 Session evaluation available (${userCount} messages, ${toolCount} tool calls)

**Pattern Extraction:**
Evaluate if there are extractable patterns from this session:
- Repeated error resolution methods (error_resolution)
- User correction habits (user_corrections)
- Effective workarounds
- Debugging techniques (debugging_techniques)
- Project-specific conventions (project_specific)

If patterns found, use:
  /learn  - Extract reusable patterns → ${config.learnedSkillsGlobalPath}

**Reflection (requires 5+ diary entries):**
  /reflect - Analyze diary entries → ~/.claude/diaryed/${project}/`;
}

/**
 * Main entry point
 */
function main() {
  try {
    // Read stdin
    const stdin = readStdinSync();

    // Parse input to check for stop_hook_active flag
    const input = parseStdinJson(stdin);
    if (input && input.stop_hook_active) {
      // Already processing stop hook - allow stop to prevent infinite loop
      process.exit(0);
      return;
    }

    // Load config
    const config = loadConfig();
    if (!config.enabled) {
      process.exit(0);
      return;
    }

    // Read counters
    const userCount = readUserCount();
    const toolCount = readToolCount();

    // Check if we should suggest evaluation
    if (shouldTrigger(userCount, toolCount)) {
      // Output decision: "block" - Claude will see and execute
      outputDecisionHighlight(formatStopReason(userCount, toolCount, config));
    }
  } catch {
    // Non-blocking - never fail the stop event
  }

  process.exit(0);
}

// Export for testing
module.exports = { loadConfig, formatStopReason };

// Run if executed directly
if (require.main === module) {
  main();
}
