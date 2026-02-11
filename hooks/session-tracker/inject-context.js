#!/usr/bin/env node
/**
 * Session Tracker - Context Injection (Sync Hook)
 *
 * Runs SYNCHRONOUSLY on SessionStart to inject context into Claude.
 * Outputs JSON with additionalContext for immediate delivery.
 *
 * This is the sync companion to start.js (which runs async for background tasks).
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
} = require('../lib/utils');

const {
  getInstinctsDir,
  getGlobalInstinctsDir,
  getInstinctsGlobalIndex,
} = require('../../scripts/lib/session-utils');

const { parseConfidenceFrontmatter, shouldAutoLoad } = require('../../scripts/lib/confidence');

const { getPendingActions, consumeAction } = require('../../scripts/lib/pending-actions');

const MAX_SESSIONS = 5;
const MAX_MD_FILES = 3;

/**
 * Get all date directories sorted by date descending
 */
function getDateDirs(projectDir) {
  return fs
    .readdirSync(projectDir)
    .filter((entry) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry)) return false;
      return fs.statSync(path.join(projectDir, entry)).isDirectory();
    })
    .sort((a, b) => new Date(b) - new Date(a));
}

/**
 * Find recent session files for current project
 */
function findRecentSessions() {
  const projectDir = getProjectSessionsDir(getProjectName());
  if (!fs.existsSync(projectDir)) return [];

  const sessions = [];
  const dateDirs = getDateDirs(projectDir);

  for (const dateStr of dateDirs) {
    const dateDir = path.join(projectDir, dateStr);
    const files = fs.readdirSync(dateDir).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      const content = readFileSafe(path.join(dateDir, file));
      if (!content) continue;

      try {
        sessions.push({ ...JSON.parse(content), dateStr });
      } catch {
        // Skip invalid JSON
      }
    }
  }

  return sessions
    .filter((s) => (s.userMessages || 0) >= 1 || (s.toolCalls || 0) >= 1)
    .sort((a, b) => new Date(b.lastUpdated || b.dateStr) - new Date(a.lastUpdated || a.dateStr))
    .slice(0, MAX_SESSIONS);
}

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
 * Calculate session duration in minutes
 */
function calcDuration(session) {
  if (!session.started || !session.lastUpdated) return 0;
  return Math.round((new Date(session.lastUpdated) - new Date(session.started)) / 60000);
}

/**
 * Format session context for output
 */
function formatSessionContext(sessions) {
  if (sessions.length === 0) return null;

  const [latest, ...older] = sessions;
  const lines = ['## Previous Session Context\n'];

  // Latest session details
  lines.push('### Last Session');
  lines.push(`- **Time**: ${formatRelativeTime(latest.lastUpdated)}`);

  const duration = calcDuration(latest);
  if (duration > 0) {
    lines.push(`- **Duration**: ~${duration} minutes`);
  }

  lines.push(`- **Tool calls**: ${latest.toolCalls || 0}`);
  lines.push(`- **User messages**: ${latest.userMessages || 0}`);

  const files = latest.filesModified || [];
  if (files.length > 0) {
    const displayed = files.slice(0, 5);
    const remaining = files.length - displayed.length;
    lines.push(
      `- **Files modified**: ${displayed.join(', ')}${remaining > 0 ? ` ... and ${remaining} more` : ''}`,
    );
  }

  // Older sessions summary
  if (older.length > 0) {
    const totalToolCalls = older.reduce((sum, s) => sum + (s.toolCalls || 0), 0);
    const totalUserMsgs = older.reduce((sum, s) => sum + (s.userMessages || 0), 0);
    lines.push(
      `\n**Recent activity**: ${pluralize(older.length, 'other session')}, ${totalToolCalls} tool calls, ${totalUserMsgs} user messages`,
    );
  }

  return lines.join('\n');
}

/**
 * Find recent diary or session markdown files from latest session.
 * Diary-first: if diary files exist, load those. Otherwise fallback to session markdown.
 * Returns { header, contents } where header indicates diary vs session notes.
 */
function findRecentMarkdownFiles(sessions) {
  if (!sessions?.length) return { header: null, contents: [] };

  const latestDateStr = sessions[0].dateStr;
  if (!latestDateStr) return { header: null, contents: [] };

  const dateDir = path.join(getProjectSessionsDir(getProjectName()), latestDateStr);
  if (!fs.existsSync(dateDir)) return { header: null, contents: [] };

  const allFiles = fs.readdirSync(dateDir).filter((f) => f.endsWith('.md'));

  // Diary-first: prioritize diary files, fall back to session markdown
  const diaryFiles = allFiles.filter((f) => f.startsWith('diary-'));
  const isDiary = diaryFiles.length > 0;
  const files = isDiary ? diaryFiles : allFiles.filter((f) => !f.startsWith('diary-'));

  const contents = files
    .sort()
    .reverse()
    .slice(0, MAX_MD_FILES)
    .map((file) => {
      const content = readFileSafe(path.join(dateDir, file));
      return content?.trim() ? `### ${latestDateStr}/${file}\n${content.trim()}` : null;
    })
    .filter(Boolean);

  const header = isDiary ? '--- Recent Diary Entries ---' : '--- Previous Session Notes ---';
  return { header, contents };
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

        // Extract action from body
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
 * Check global index for newly promoted patterns
 */
function checkNewGlobalPromotions() {
  try {
    const indexPath = getInstinctsGlobalIndex();
    if (!fs.existsSync(indexPath)) return null;

    const content = fs.readFileSync(indexPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    // Check for promotions in the last 7 days
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

    if (recent.length === 0) return null;

    const ids = recent.map((e) => e.id).join(', ');
    return `New global instincts (found in multiple projects): ${ids}`;
  } catch {
    return null;
  }
}

/**
 * Load and consume pending actions for context injection.
 * Returns formatted context string or null.
 */
function loadPendingActions(project) {
  try {
    const actions = getPendingActions(project);
    if (actions.length === 0) return null;

    const lines = [];

    // Group by type
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

    // Consume all displayed actions
    for (const action of actions) {
      consumeAction(project, action.id);
    }

    return lines.length > 0 ? lines.join('\n') : null;
  } catch {
    return null;
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
  const sessions = findRecentSessions();
  const { header: mdHeader, contents: mdContents } = findRecentMarkdownFiles(sessions);
  const instinctsContext = loadAutoInstincts(project);
  const pendingContext = loadPendingActions(project);
  const globalPromotions = checkNewGlobalPromotions();

  const parts = [];

  const sessionContext = formatSessionContext(sessions);
  if (sessionContext) {
    parts.push(sessionContext);
    log(sessionContext);
  }

  if (mdContents.length > 0 && mdHeader) {
    parts.push(mdHeader);
    parts.push(mdContents.join('\n---\n'));
    log(`\n${mdHeader}`);
    log(mdContents.join('\n---\n'));
  }

  if (instinctsContext) {
    parts.push(instinctsContext);
    log(instinctsContext);
  }

  if (pendingContext) {
    parts.push(pendingContext);
    log(pendingContext);
  }

  if (globalPromotions) {
    parts.push(globalPromotions);
    log(globalPromotions);
  }

  if (parts.length > 0) {
    const fullContext = parts.join('\n\n');
    outputContext(fullContext, 'SessionStart');
  }

  process.exit(0);
}

// Export for testing
module.exports = {
  getDateDirs,
  findRecentSessions,
  formatSessionContext,
  findRecentMarkdownFiles,
  formatRelativeTime,
  calcDuration,
  pluralize,
  loadAutoInstincts,
  loadInstinctFiles,
  checkNewGlobalPromotions,
  loadPendingActions,
};

// Run if executed directly
if (require.main === module) {
  main();
}
