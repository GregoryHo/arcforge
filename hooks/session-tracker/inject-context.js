#!/usr/bin/env node
/**
 * Session Tracker - Context Injection (Sync Hook)
 *
 * Runs SYNCHRONOUSLY on SessionStart with dual output:
 *
 * systemMessage (user-visible):
 * - Brief summary: instinct count, pending actions
 *
 * additionalContext (Claude-visible):
 * - Full instinct details with confidence scores
 * - Pending action notifications
 *
 * stderr (internal diagnostics):
 * - Available session aliases
 * - Global instinct promotions
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  readStdinSync,
  parseStdinJson,
  setSessionIdFromInput,
  getProjectName,
  outputCombined,
  log,
} = require('../../scripts/lib/utils');

const {
  getInstinctsDir,
  getGlobalInstinctsDir,
  getInstinctsGlobalIndex,
} = require('../../scripts/lib/session-utils');

const { parseConfidenceFrontmatter, shouldAutoLoad } = require('../../scripts/lib/confidence');

const { getPendingActions, consumeAction } = require('../../scripts/lib/pending-actions');

/**
 * Load instincts with confidence >= AUTO_LOAD_THRESHOLD
 */
function loadAutoInstincts(project) {
  const projectInstincts = loadInstinctFiles(getInstinctsDir(project));
  const globalInstincts = loadInstinctFiles(getGlobalInstinctsDir());
  const autoLoaded = [...projectInstincts, ...globalInstincts].filter((i) =>
    shouldAutoLoad(i.confidence),
  );

  if (autoLoaded.length === 0) return { text: null, count: 0 };

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

  return { text: lines.join('\n'), count: autoLoaded.length };
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
    if (actions.length === 0) return { text: null, summary: null };

    const lines = [];
    const summaryParts = [];

    const diaryActions = actions.filter((a) => a.type === 'diary-ready');
    const reflectActions = actions.filter((a) => a.type === 'reflect-ready');
    const otherActions = actions.filter(
      (a) => a.type !== 'reflect-ready' && a.type !== 'diary-ready',
    );

    if (diaryActions.length > 0) {
      lines.push('**📝 Diary draft ready — use /diary to review and finalize.**');
      summaryParts.push('diary draft ready');
    }

    if (reflectActions.length > 0) {
      const latest = reflectActions[reflectActions.length - 1];
      const count = latest.payload?.count || reflectActions.length;
      lines.push(
        `**${count} unprocessed diaries ready for reflection.** Run /reflect to analyze patterns.`,
      );
      summaryParts.push(`${count} diaries pending reflection`);
    }

    for (const action of otherActions) {
      lines.push(
        `- Pending: ${action.type} (${action.payload ? JSON.stringify(action.payload) : 'no details'})`,
      );
      summaryParts.push(`pending: ${action.type}`);
    }

    for (const action of actions) {
      consumeAction(project, action.id);
    }

    const text = lines.length > 0 ? lines.join('\n') : null;
    const summary = summaryParts.length > 0 ? summaryParts.join(', ') : null;
    return { text, summary };
  } catch {
    return { text: null, summary: null };
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

  // Build Claude context (full details) and user summary (brief)
  const contextParts = [];
  const userParts = [];

  // Active instincts
  const { text: instinctsContext, count: instinctCount } = loadAutoInstincts(project);
  if (instinctsContext) {
    contextParts.push(instinctsContext);
    userParts.push(`${instinctCount} instinct${instinctCount !== 1 ? 's' : ''} active`);
  }

  // Pending action notifications
  const { text: pendingContext, summary: pendingSummary } = loadPendingActions(project);
  if (pendingContext) {
    contextParts.push(pendingContext);
  }
  if (pendingSummary) {
    userParts.push(pendingSummary);
  }

  // Stderr-only (internal diagnostics)
  logAvailableAliases(project);
  checkNewGlobalPromotions();

  const claudeContext = contextParts.length > 0 ? contextParts.join('\n\n') : null;
  const userMessage = userParts.length > 0 ? userParts.join(' | ') : null;

  if (claudeContext || userMessage) {
    outputCombined(userMessage, claudeContext, 'SessionStart');
  }

  process.exit(0);
}

// Export for testing
module.exports = {
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
