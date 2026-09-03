#!/usr/bin/env node
/**
 * Session Tracker - Context Injection (Sync Hook)
 *
 * Runs SYNCHRONOUSLY on SessionStart with dual output:
 *
 * systemMessage (user-visible):
 * - Brief summary: instinct count, pending actions, session aliases,
 *   recent global promotions
 *
 * additionalContext (Claude-visible):
 * - Full instinct details with confidence scores
 * - Pending action notifications
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  readStdinSync,
  parseStdinJson,
  setSessionIdFromInput,
  getProjectName,
  getProjectDiariesDir,
  getProjectSessionsDir,
  outputCombined,
} = require('../../scripts/lib/utils');

const {
  getInstinctsDir,
  getGlobalInstinctsDir,
  getInstinctsGlobalIndex,
  getInstinctsRoot,
  migrateInstinctsToNameKey,
} = require('../../scripts/lib/session-utils');

const { parseConfidenceFrontmatter } = require('../../scripts/lib/confidence');
const { getArcforgeHome } = require('../../scripts/lib/utils');
const { listActivatedCandidateIds } = require('../../scripts/lib/learning-curator/activate');
const {
  isInjectActivatedInstinctsEnabled,
  learningEnabledSince,
} = require('../../scripts/lib/learning');

const { getPendingActions, consumeAction } = require('../../scripts/lib/pending-actions');

const { draftIsStale } = require('../../scripts/lib/diary-capture');

// Max activated instincts injected into SessionStart context (ICL-4).
const MAX_INJECTED_INSTINCTS = 5;

/**
 * Load activated instincts for SessionStart context injection (ICL-4).
 *
 * The GATE is the activation lifecycle, not confidence: an instinct is injected
 * only when a reviewer explicitly activated it on the dashboard and has not
 * since deactivated it (`listActivatedCandidateIds` folds ActivationRecords by
 * candidate_id, latest wins). Confidence is used ONLY to sort and cap the top
 * five — never as a threshold. The `inject_activated_instincts` kill-switch is
 * DEFAULT ON; only an explicit `false` in the global learning config silences it.
 */
function loadAutoInstincts(project) {
  if (!isInjectActivatedInstinctsEnabled()) return { text: null, count: 0 };

  let projectInstincts = loadInstinctFiles(getInstinctsDir(project));
  // First-session window (ICL-3, S5-6): start.js runs async and is skipped on
  // source=compact, so the name-keyed dir may still be empty while stale
  // hash-keyed instinct files exist. On a basename miss, run the idempotent,
  // collision-safe migration once and re-resolve. No-op when already migrated.
  if (projectInstincts.length === 0) {
    try {
      migrateInstinctsToNameKey(project);
      projectInstincts = loadInstinctFiles(getInstinctsDir(project));
    } catch {
      // silent — never block SessionStart
    }
  }
  const globalInstincts = loadInstinctFiles(getGlobalInstinctsDir());

  let activated;
  try {
    // Active instinct files live under <home>/instincts; ActivationRecords live
    // under <home>/learning/activations — both rooted at the same arcforge home.
    const arcforgeRoot = path.dirname(getInstinctsRoot()) || getArcforgeHome();
    activated = listActivatedCandidateIds(arcforgeRoot);
  } catch {
    activated = new Set();
  }
  if (activated.size === 0) return { text: null, count: 0 };

  // Gate: a file is injected only when its basename (candidate_id) is in the
  // activated set. Confidence is NOT a gate here.
  const gated = [...projectInstincts, ...globalInstincts].filter((i) => activated.has(i.id));
  if (gated.length === 0) return { text: null, count: 0 };

  // Confidence sorts + caps the top five; it does not exclude anything.
  gated.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  const top = gated.slice(0, MAX_INJECTED_INSTINCTS);

  const lines = [
    '## Active Behavioral Instincts\n',
    'These patterns were activated for this project. Apply them where relevant:\n',
  ];

  for (const inst of top) {
    const pctStr = Math.round((inst.confidence || 0) * 100);
    lines.push(`- **${inst.id}** (${pctStr}%): ${inst.trigger || inst.action || ''}`);
  }

  // `learning` is user-invoked, so this tells the user what is available rather
  // than instructing the model to reach for the skill itself.
  lines.push(
    '\nTo confirm or contradict a pattern, tell the user they can run /arcforge:learning.',
  );

  return { text: lines.join('\n'), count: top.length };
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

// draftIsStale (TO BE ENRICHED probe) now lives in diary-capture.js — the
// single owner shared by this healthcheck and the curator batch-assembler.

/**
 * Whether a draft was written before enrichment was ever authorized.
 *
 * The floor is the EARLIER of creation and last-write time, so hand-editing or
 * touching a pre-opt-in stub does not lift it above the floor — mtime alone
 * would, and every later session would then report a by-design stub as an
 * enricher failure. A copy that preserves NEITHER stamp still does, because the
 * learning config's `updated_at` is embedded and survives the same copy while
 * file stamps do not; ordinary restore tooling keeps mtime and so stays below
 * the floor.
 *
 * Fails open — an unreadable timestamp lets the stub probe decide.
 */
function draftPredatesOptIn(filePath, enabledSince) {
  try {
    const { mtimeMs, birthtimeMs } = fs.statSync(filePath);
    // birthtime is 0 on filesystems that don't record it; fall back to mtime
    // there rather than collapsing the floor to 0 and going quiet forever.
    const writtenAt = birthtimeMs > 0 ? Math.min(mtimeMs, birthtimeMs) : mtimeMs;
    return writtenAt < enabledSince;
  } catch {
    return false;
  }
}

/**
 * Returns { count, message } when stale drafts exist, else null.
 * Surfaces silent enrichment failures so they don't accumulate forever.
 *
 * Only drafts written since the learning opt-in count. Drafts from a
 * learning-off period keep their stubs by design (D-009), so counting them
 * would turn the first session after opting in into a report of the entire
 * backlog — and the message's diagnosis ("the enricher may be failing") would
 * be wrong about every one of them.
 *
 * @param {string} project
 * @param {number} [enabledSince] - Epoch ms the opt-in took effect; 0 (the
 *   default) applies no floor and counts every stale draft.
 */
function loadStaleDraftWarning(project, enabledSince = 0) {
  try {
    const dir = getProjectDiariesDir(project);
    if (!fs.existsSync(dir)) return null;

    let stale = 0;
    for (const dateEntry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!dateEntry.isDirectory()) continue;
      const dateDirPath = path.join(dir, dateEntry.name);
      for (const file of fs.readdirSync(dateDirPath)) {
        if (!file.startsWith('diary-') || !file.endsWith('-draft.md')) continue;
        const draftPath = path.join(dateDirPath, file);
        if (draftPredatesOptIn(draftPath, enabledSince)) continue;
        if (draftIsStale(draftPath)) stale++;
      }
    }

    if (stale === 0) return null;
    const enricherLog = path.join(getProjectSessionsDir(project), 'enricher.log');
    return {
      count: stale,
      message: `⚠️ ${stale} diary draft${stale === 1 ? '' : 's'} unenriched — background enricher may be failing. Check ${enricherLog}`,
    };
  } catch {
    return null;
  }
}

/**
 * Load and consume pending actions for context injection.
 */
function loadPendingActions(project) {
  try {
    // Relay-isolation: a session arcforge spawned itself (e.g. the detached
    // diary enricher, or a loop's headless task session) must NOT consume the
    // user's pending actions — otherwise it eats diary-ready / reflect-ready
    // before the user's next SessionStart sees them. Mirrors the observe hook's
    // eval-isolation precedent (S7-1).
    if (process.env.ARCFORGE_SPAWNED) return { text: null, summary: null };

    const actions = getPendingActions(project);
    if (actions.length === 0) return { text: null, summary: null };

    const lines = [];
    const summaryParts = [];

    const DEDICATED_TYPES = ['diary-ready', 'reflect-ready'];
    const diaryActions = actions.filter((a) => a.type === 'diary-ready');
    const reflectActions = actions.filter((a) => a.type === 'reflect-ready');
    const otherActions = actions.filter((a) => !DEDICATED_TYPES.includes(a.type));

    if (diaryActions.length > 0) {
      lines.push(
        '**📝 Diary draft ready.** Tell the user they can run /arcforge:learning to review and finalize it.',
      );
      summaryParts.push('diary draft ready');
    }

    if (reflectActions.length > 0) {
      const latest = reflectActions[reflectActions.length - 1];
      const count = latest.payload?.count || reflectActions.length;
      lines.push(
        `**${count} unprocessed diaries ready for reflection.** Tell the user they can run /arcforge:learning to analyze patterns.`,
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
 * Build a user-summary line for available session aliases (discoverability).
 * @returns {string|null} summary line, or null when there are no aliases
 */
function loadAvailableAliases(project) {
  try {
    const { listAliases } = require('../../scripts/lib/session-aliases');
    const aliases = listAliases(project);
    if (aliases.length > 0) {
      return `${aliases.length} session alias${aliases.length === 1 ? '' : 'es'}`;
    }
  } catch {
    // session-aliases not available yet — skip
  }
  return null;
}

/**
 * Build a user-summary line for patterns promoted to global in the last week.
 * @returns {string|null} summary line, or null when there are none
 */
function loadNewGlobalPromotions() {
  try {
    const indexPath = getInstinctsGlobalIndex();
    if (!fs.existsSync(indexPath)) return null;

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
      return `${recent.length} new global promotion${recent.length === 1 ? '' : 's'}`;
    }
  } catch {
    // silent
  }
  return null;
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

  // Activated behavioral instincts (ICL-4). Influence reaches the model only
  // through explicit dashboard activation (activation-gated, top-5 by
  // confidence, kill-switch default ON) — never via the retired confidence
  // auto-load.
  const { text: instinctContext, count: instinctCount } = loadAutoInstincts(project);
  if (instinctContext) {
    contextParts.push(instinctContext);
    userParts.push(`${instinctCount} active instinct${instinctCount === 1 ? '' : 's'}`);
  }

  // Pending action notifications
  const { text: pendingContext, summary: pendingSummary } = loadPendingActions(project);
  if (pendingContext) {
    contextParts.push(pendingContext);
  }
  if (pendingSummary) {
    userParts.push(pendingSummary);
  }

  // Stale-draft healthcheck (re-evaluated every session start, not consumed).
  // Only meaningful once enrichment can run: with learning off, drafts keep
  // their TO BE ENRICHED stubs by design (D-009), so the warning would be a
  // permanent complaint about intended behavior. The opt-in TIMESTAMP, not just
  // the flag, is what bounds it — otherwise the whole learning-off backlog
  // surfaces at once on the first session after opting in.
  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const enabledSince = learningEnabledSince({ projectRoot });
  const staleWarning = enabledSince === null ? null : loadStaleDraftWarning(project, enabledSince);
  if (staleWarning) {
    contextParts.push(staleWarning.message);
    userParts.push(`${staleWarning.count} unenriched draft${staleWarning.count === 1 ? '' : 's'}`);
  }

  // Session aliases + recent global promotions — surfaced to the USER summary
  // (the stderr versions were invisible: Claude Code condenses stderr to
  // "N hooks ran"). These are discoverability hints for the user, not Claude
  // context, so they go to userParts only.
  const aliasSummary = loadAvailableAliases(project);
  if (aliasSummary) userParts.push(aliasSummary);

  const promotionSummary = loadNewGlobalPromotions();
  if (promotionSummary) userParts.push(promotionSummary);

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
  loadStaleDraftWarning,
  loadAvailableAliases,
  loadNewGlobalPromotions,
};

// Run if executed directly
if (require.main === module) {
  main();
}
