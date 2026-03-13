#!/usr/bin/env node
/**
 * Session Tracker - Context Injection (Sync Hook)
 *
 * Runs SYNCHRONOUSLY on SessionStart to inject minimal context into Claude.
 *
 * Injected (to Claude via stdout):
 * - One-liner session summary (awareness, not history)
 * - Active behavioral instincts (confidence >= 0.70)
 * - Pending action notifications
 *
 * Logged (to user via stderr):
 * - Available session aliases (discoverability)
 * - Global instinct promotions
 *
 * Removed in redesign (was noise):
 * - Diary content injection → use /sessions resume instead
 * - Verbose 5-session history → replaced with one-liner
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  readStdinSync,
  parseStdinJson,
  setSessionIdFromInput,
  readFileSafe,
  getProjectSessionsDir,
  getProjectName,
  outputContext,
  log,
} = require('../../scripts/lib/utils');

const {
  getDateDirs,
  getInstinctsDir,
  getGlobalInstinctsDir,
  getInstinctsGlobalIndex,
} = require('../../scripts/lib/session-utils');

const { parseConfidenceFrontmatter, shouldAutoLoad } = require('../../scripts/lib/confidence');

const { getPendingActions, consumeAction } = require('../../scripts/lib/pending-actions');

const { calculateDurationMinutes } = require('./summary');

/**
 * Pluralize a word based on count
 */
function pluralize(count, word) {
  return `${count} ${word}${count !== 1 ? 's' : ''}`;
}

/**
 * Format relative time string
 */
function formatRelativeTime(timestamp) {
  if (!timestamp) return 'unknown';

  const diffMs = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${pluralize(days, 'day')} ago`;
  if (hours > 0) return `${pluralize(hours, 'hour')} ago`;
  if (mins > 0) return `${pluralize(mins, 'minute')} ago`;
  return 'just now';
}

/**
 * Find the most recent session for a one-liner summary.
 * Returns the latest session object or null.
 */
function findLatestSession() {
  const projectDir = getProjectSessionsDir(getProjectName());
  if (!fs.existsSync(projectDir)) return null;

  const dateDirs = getDateDirs(projectDir);

  for (const dateStr of dateDirs) {
    const dateDir = path.join(projectDir, dateStr);
    const files = fs
      .readdirSync(dateDir)
      .filter((f) => f.endsWith('.json') && f.startsWith('session-'));

    const sessions = [];
    for (const file of files) {
      const content = readFileSafe(path.join(dateDir, file));
      if (!content) continue;
      try {
        sessions.push(JSON.parse(content));
      } catch {
        // skip
      }
    }

    if (sessions.length > 0) {
      // Return the most recently updated session
      sessions.sort((a, b) => new Date(b.lastUpdated || 0) - new Date(a.lastUpdated || 0));
      return sessions[0];
    }
  }

  return null;
}

/**
 * Format a session summary with key metrics.
 */
function formatSessionSummary(session) {
  if (!session) return null;

  const time = formatRelativeTime(session.lastUpdated);
  const duration = calculateDurationMinutes(session.started, session.lastUpdated) || 0;
  const tools = session.toolCalls || 0;
  const msgs = session.userMessages || 0;
  return `- **Time**: ${time}\n- **Duration**: ~${duration} minutes\n- **Tool calls**: ${tools}\n- **User messages**: ${msgs}`;
}

/**
 * Load instincts with confidence >= AUTO_LOAD_THRESHOLD
 */
function loadAutoInstincts(project) {
  const projectInstincts = loadInstinctFiles(getInstinctsDir(project));
  const globalInstincts = loadInstinctFiles(getGlobalInstinctsDir());
  const autoLoaded = [...projectInstincts, ...globalInstincts].filter((i) =>
    shouldAutoLoad(i.confidence),
  );

  if (autoLoaded.length === 0) return null;

  const lines = [
    '## Active Behavioral Instincts\n',
    'These patterns were auto-detected from your tool usage:\n',
  ];

  for (const inst of autoLoaded) {
    const pctStr = Math.round(inst.confidence * 100);
    lines.push(`- **${inst.id}** (${pctStr}%): ${inst.trigger || inst.action || ''}`);
  }

  lines.push(
    '\nUse /instinct-status or invoke arc-observing to confirm/contradict these patterns.',
  );

  return lines.join('\n');
}

/**
 * Load instinct .md files from a directory
 */
function loadInstinctFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((file) => {
      try {
        const content = fs.readFileSync(path.join(dir, file), 'utf-8');
        const { frontmatter, body } = parseConfidenceFrontmatter(content);
        if (frontmatter.confidence === undefined) return null;

        const actionMatch = body.match(/## Action\n+(.+)/);

        return {
          id: frontmatter.id || path.basename(file, '.md'),
          confidence: frontmatter.confidence,
          trigger: frontmatter.trigger || '',
          action: actionMatch ? actionMatch[1].trim() : '',
          domain: frontmatter.domain || 'uncategorized',
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Load and consume pending actions for context injection.
 */
function loadPendingActions(project) {
  try {
    const actions = getPendingActions(project);
    if (actions.length === 0) return null;

    const lines = [];

    const reflectActions = actions.filter((a) => a.type === 'reflect-ready');
    const otherActions = actions.filter((a) => a.type !== 'reflect-ready');

    if (reflectActions.length > 0) {
      const latest = reflectActions[reflectActions.length - 1];
      const count = latest.payload?.count || reflectActions.length;
      lines.push(
        `**${count} unprocessed diaries ready for reflection.** Run /reflect to analyze patterns.`,
      );
    }

    for (const action of otherActions) {
      lines.push(
        `- Pending: ${action.type} (${action.payload ? JSON.stringify(action.payload) : 'no details'})`,
      );
    }

    for (const action of actions) {
      consumeAction(project, action.id);
    }

    return lines.length > 0 ? lines.join('\n') : null;
  } catch {
    return null;
  }
}

/**
 * Load session aliases and log to stderr for discoverability.
 */
function logAvailableAliases(project) {
  try {
    const { listAliases } = require('../../scripts/lib/session-aliases');
    const aliases = listAliases(project);
    if (aliases.length > 0) {
      const names = aliases.map((a) => a.name).join(', ');
      log(`${aliases.length} session aliases available: ${names}`);
    }
  } catch {
    // session-aliases not available yet — skip
  }
}

/**
 * Check global index for newly promoted patterns (stderr only)
 */
function checkNewGlobalPromotions() {
  try {
    const indexPath = getInstinctsGlobalIndex();
    if (!fs.existsSync(indexPath)) return;

    const content = fs.readFileSync(indexPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const recent = lines
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .filter((entry) => new Date(entry.promoted) > weekAgo);

    if (recent.length > 0) {
      const ids = recent.map((e) => e.id).join(', ');
      log(`New global instincts (found in multiple projects): ${ids}`);
    }
  } catch {
    // silent
  }
}

/**
 * Main entry point (sync)
 */
function main() {
  const stdin = readStdinSync();
  const input = parseStdinJson(stdin);
  setSessionIdFromInput(input);

  const project = getProjectName();

  // Build context for Claude (stdout → additionalContext)
  const parts = [];

  // 1. One-liner session summary (minimal awareness)
  const latest = findLatestSession();
  const oneLiner = formatSessionSummary(latest);
  if (oneLiner) {
    parts.push('### Last Session');
    parts.push(oneLiner);
  }

  // 2. Active instincts (behavioral patterns, always relevant)
  const instinctsContext = loadAutoInstincts(project);
  if (instinctsContext) {
    parts.push(instinctsContext);
    log(instinctsContext);
  }

  // 3. Pending action notifications
  const pendingContext = loadPendingActions(project);
  if (pendingContext) {
    parts.push(pendingContext);
    log(pendingContext);
  }

  // Stderr-only (user visibility, not injected into Claude)
  logAvailableAliases(project);
  checkNewGlobalPromotions();

  if (parts.length > 0) {
    const fullContext = parts.join('\n\n');
    outputContext(fullContext, 'SessionStart');
  }

  process.exit(0);
}

// Export for testing
module.exports = {
  findLatestSession,
  formatSessionSummary,
  formatRelativeTime,
  pluralize,
  loadAutoInstincts,
  loadInstinctFiles,
  loadPendingActions,
  logAvailableAliases,
  checkNewGlobalPromotions,
};

// Run if executed directly
if (require.main === module) {
  main();
}
