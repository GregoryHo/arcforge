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
const { isInjectActivatedInstinctsEnabled } = require('../../scripts/lib/learning');

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

  lines.push('\nInvoke /arcforge:arc-observing to confirm/contradict these patterns.');

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
 * Returns { count, message } when stale drafts exist, else null.
 * Surfaces silent enrichment failures so they don't accumulate forever.
 */
function loadStaleDraftWarning(project) {
  try {
    const dir = getProjectDiariesDir(project);
    if (!fs.existsSync(dir)) return null;

    let stale = 0;
    for (const dateEntry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!dateEntry.isDirectory()) continue;
      const dateDirPath = path.join(dir, dateEntry.name);
      for (const file of fs.readdirSync(dateDirPath)) {
        if (!file.startsWith('diary-') || !file.endsWith('-draft.md')) continue;
        if (draftIsStale(path.join(dateDirPath, file))) stale++;
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
 * Render the overnight loop-finished review-queue line. The north-star morning
 * surface: what landed, what's blocked, on which branch.
 * @param {Object} payload - { status, completed_count, blocked, base_branch, total_cost }
 * @returns {string}
 */
function renderLoopFinished(payload) {
  const merged = payload.completed_count || 0;
  const blocked = Array.isArray(payload.blocked) ? payload.blocked : [];
  const onBranch = payload.base_branch ? ` on ${payload.base_branch}` : '';
  const lines = [
    `**🌙 Loop finished: ${merged} merged${onBranch}, ${blocked.length} blocked — review before ratifying.**`,
  ];
  if (typeof payload.total_cost === 'number' && payload.total_cost > 0) {
    lines.push(`   Total cost: $${payload.total_cost.toFixed(2)}.`);
  }
  for (const b of blocked) {
    lines.push(`   - blocked: ${b.id}${b.reason ? ` (${b.reason})` : ''}`);
  }
  return lines.join('\n');
}

/**
 * Render the pending-ratification line. Uses the PARSABLE ratify invocation
 * (no bare `arcforge` bin — not on PATH for marketplace/git-clone installs)
 * and points at the ${ARCFORGE_ROOT}-relative pipeline guide.
 * @param {Object} payload - { count, specs: [{ spec_id, decision_ids: [...] }] }
 * @returns {string}
 */
function renderRatifyPending(payload) {
  const count = payload.count || 0;
  const specs = Array.isArray(payload.specs) ? payload.specs : [];
  const first = specs[0];
  const specId = first?.spec_id || '<spec-id>';
  const dId = first?.decision_ids?.[0] || '<D-id>';
  return [
    `**⚖️ ${count} decision${count === 1 ? '' : 's'} pending ratification.** Review, then ratify each in attended mode:`,
    `   ARCFORGE_MODE=attended node "$ARCFORGE_ROOT/scripts/cli.js" ratify ${specId} ${dId}`,
    // biome-ignore lint/suspicious/noTemplateCurlyInString: ${ARCFORGE_ROOT} is a literal placeholder the model expands, not JS interpolation.
    '   See ${ARCFORGE_ROOT}/docs/guide/sdd-pipeline.md for the ratification workflow.',
  ].join('\n');
}

/**
 * Load and consume pending actions for context injection.
 */
function loadPendingActions(project) {
  try {
    // Relay-isolation: a session arcforge spawned itself (e.g. the detached
    // diary enricher, or a loop's headless task session) must NOT consume the
    // user's pending actions — otherwise it eats diary-ready / reflect-ready /
    // ratify-pending / loop-finished before the user's next SessionStart sees
    // them. Mirrors the observe hook's eval-isolation precedent (S7-1).
    if (process.env.ARCFORGE_SPAWNED) return { text: null, summary: null };

    const actions = getPendingActions(project);
    if (actions.length === 0) return { text: null, summary: null };

    const lines = [];
    const summaryParts = [];

    const DEDICATED_TYPES = ['diary-ready', 'reflect-ready', 'loop-finished', 'ratify-pending'];
    const diaryActions = actions.filter((a) => a.type === 'diary-ready');
    const reflectActions = actions.filter((a) => a.type === 'reflect-ready');
    const loopFinishedActions = actions.filter((a) => a.type === 'loop-finished');
    const ratifyActions = actions.filter((a) => a.type === 'ratify-pending');
    const otherActions = actions.filter((a) => !DEDICATED_TYPES.includes(a.type));

    if (diaryActions.length > 0) {
      lines.push('**📝 Diary draft ready — use /arcforge:arc-journaling to review and finalize.**');
      summaryParts.push('diary draft ready');
    }

    if (reflectActions.length > 0) {
      const latest = reflectActions[reflectActions.length - 1];
      const count = latest.payload?.count || reflectActions.length;
      lines.push(
        `**${count} unprocessed diaries ready for reflection.** Run /arcforge:arc-reflecting to analyze patterns.`,
      );
      summaryParts.push(`${count} diaries pending reflection`);
    }

    // Overnight loop outcome — the morning review-queue surface (north star).
    // Render before the ratify prompt so the user sees what landed first.
    if (loopFinishedActions.length > 0) {
      const latest = loopFinishedActions[loopFinishedActions.length - 1];
      lines.push(renderLoopFinished(latest.payload || {}));
      summaryParts.push('loop finished');
    }

    // Pending ratification — point at the PARSABLE ratify invocation, not the
    // bare `arcforge` bin (not on PATH for marketplace/git-clone installs).
    if (ratifyActions.length > 0) {
      const latest = ratifyActions[ratifyActions.length - 1];
      lines.push(renderRatifyPending(latest.payload || {}));
      const count = latest.payload?.count || ratifyActions.length;
      summaryParts.push(`${count} decision${count === 1 ? '' : 's'} pending ratification`);
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

  // Stale-draft healthcheck (re-evaluated every session start, not consumed)
  const staleWarning = loadStaleDraftWarning(project);
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
  renderLoopFinished,
  renderRatifyPending,
  loadAvailableAliases,
  loadNewGlobalPromotions,
};

// Run if executed directly
if (require.main === module) {
  main();
}
