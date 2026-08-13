/**
 * instinct-feedback.js — instinct status view and confirm/contradict feedback.
 *
 * Canonical owner of the instinct-feedback half of the learning workflow, which
 * the `learn instinct` CLI subgroup exposes. Before v6/P5 this lived in a
 * skill-local script that reached back into `scripts/lib/` — engine code sitting
 * inside a skill directory (D1/D8).
 *
 * Data collection and rendering are separate so `--json` and the human view
 * come from one source: `collectInstinctStatus()` produces the facts,
 * `renderInstinctStatus()` formats them.
 *
 * Errors throw with context (lib tier); the CLI turns them into exit codes.
 */

const fs = require('node:fs');
const path = require('node:path');

const {
  parseConfidenceFrontmatter,
  updateConfidenceFrontmatter,
  applyConfirmation,
  applyContradiction,
  shouldArchive,
  ARCHIVE_THRESHOLD,
} = require('./confidence');
const {
  getInstinctsDir,
  getInstinctsArchivedDir,
  getGlobalInstinctsDir,
} = require('./session-utils');
const { sanitizeFilename } = require('./utils');
const { readCurrentCandidates } = require('./learning-curator/queue-writer');
const { appendTransitionEvent, appendUpdateEvent } = require('./learning-curator/dashboard-events');
const {
  isLegalAction,
  LIFECYCLE_STATUS,
  LIFECYCLE_ACTION,
} = require('./learning-curator/lifecycle');

/** Confidence below this is reported as "at risk" but not yet archived. */
const AT_RISK_CEILING = 0.3;

function requireProject(project) {
  if (typeof project !== 'string' || !project.trim()) {
    throw new Error(`project must be a non-empty string (got ${JSON.stringify(project)})`);
  }
  return project;
}

/**
 * Load every instinct file in a directory that carries a confidence value.
 * A file without `confidence` is not an instinct record and is skipped.
 * @returns {Array<{id: string, file: string, path: string, frontmatter: object, body: string, content: string}>}
 */
function loadInstincts(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((file) => {
      const filePath = path.join(dir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const { frontmatter, body } = parseConfidenceFrontmatter(content);
      if (frontmatter.confidence === undefined) return null;
      return {
        id: frontmatter.id || path.basename(file, '.md'),
        file,
        path: filePath,
        frontmatter,
        body,
        content,
      };
    })
    .filter(Boolean);
}

/** Render a 10-character confidence bar. */
function confidenceBar(confidence) {
  const filled = Math.round(confidence * 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

/** Format a confidence as a whole percentage. */
function pct(confidence) {
  return `${Math.round(confidence * 100)}%`;
}

/** Extract the first line under `## Action` from an instinct body. */
function extractAction(body) {
  const match = body.match(/## Action\n+(.+)/);
  return match ? match[1].trim() : '';
}

function summarize(inst) {
  const confidence = inst.frontmatter.confidence || 0;
  return {
    id: inst.id,
    confidence,
    domain: inst.frontmatter.domain || 'uncategorized',
    trigger: inst.frontmatter.trigger || '',
    action: extractAction(inst.body),
  };
}

/**
 * Collect the instinct status view for a project, plus global instincts.
 * @returns {{project: string, instincts: object[], globalInstincts: object[], byDomain: object, atRisk: string[]}}
 */
function collectInstinctStatus(project) {
  requireProject(project);

  const instincts = loadInstincts(getInstinctsDir(project)).map(summarize);
  const globalInstincts = loadInstincts(getGlobalInstinctsDir()).map(summarize);

  const byDomain = {};
  for (const inst of instincts) {
    if (!byDomain[inst.domain]) byDomain[inst.domain] = [];
    byDomain[inst.domain].push(inst);
  }
  for (const domain of Object.keys(byDomain)) {
    byDomain[domain].sort((a, b) => b.confidence - a.confidence);
  }

  const atRisk = instincts
    .filter((i) => i.confidence < AT_RISK_CEILING && i.confidence >= ARCHIVE_THRESHOLD)
    .map((i) => i.id);

  return { project, instincts, globalInstincts, byDomain, atRisk };
}

/** Format a collected status view for a terminal reader. */
function renderInstinctStatus(status) {
  const { project, instincts, globalInstincts, byDomain, atRisk } = status;

  if (instincts.length === 0 && globalInstincts.length === 0) {
    return [
      `No instincts found for project "${project}".`,
      'Instincts are auto-detected from tool usage patterns by the observer daemon.',
    ].join('\n');
  }

  const lines = [];

  if (instincts.length > 0) {
    lines.push('', `## Project: ${project} (${instincts.length} instincts)`, '');
    for (const [domain, items] of Object.entries(byDomain)) {
      lines.push(`### ${domain.toUpperCase()} (${items.length})`, '');
      for (const inst of items) {
        lines.push(`  ${confidenceBar(inst.confidence)}  ${pct(inst.confidence)}  ${inst.id}`);
        if (inst.trigger) lines.push(`            trigger: ${inst.trigger}`);
        if (inst.action) lines.push(`            action: ${inst.action}`);
        lines.push('');
      }
    }
  }

  if (globalInstincts.length > 0) {
    lines.push('', `## Global Instincts (${globalInstincts.length})`, '');
    for (const inst of globalInstincts) {
      lines.push(`  ${confidenceBar(inst.confidence)}  ${pct(inst.confidence)}  ${inst.id}`);
      if (inst.trigger) lines.push(`            trigger: ${inst.trigger}`);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push(
    'Injection is activation-gated: activate instincts via `arcforge learn dashboard`. ' +
      'Activated instincts are injected at SessionStart (top 5 by confidence; ' +
      'confidence sorts/caps, it is not a threshold).',
  );
  if (atRisk.length > 0) {
    lines.push(`At risk (< ${AT_RISK_CEILING}): ${atRisk.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Align confirm/contradict feedback on a curator-activated candidate (ICL-6).
 *
 * Curator-activated instincts carry `id == candidate_id`. When such an instinct
 * is confirmed or contradicted, mirror the running feedback counts back to the
 * candidate store as a `candidate.updated` patch so the dashboard card stays
 * consistent with the instinct frontmatter.
 *
 * When a contradiction archives the instinct AND the matched candidate is
 * currently `activated`, also append a `deactivate` transition — gated through
 * `isLegalAction`. This stays inside the curator event log; it does NOT run the
 * physical move-to-`.disabled/` or the reviewer_ack consent model.
 *
 * A non-curator instinct simply has no matching candidate: no event, no crash.
 *
 * @param {string} instinctId
 * @param {{confirmations: number, contradictions: number}} feedback
 * @param {boolean} archived — true when the contradiction archived the instinct
 */
function syncCuratorCandidate(instinctId, feedback, archived) {
  try {
    const candidates = readCurrentCandidates();
    const candidate = candidates[instinctId];
    if (!candidate) return;

    const actor = { layer: 6, actor_type: 'instinct_cli' };

    appendUpdateEvent(
      instinctId,
      {
        feedback: {
          confirmations: feedback.confirmations,
          contradictions: feedback.contradictions,
        },
      },
      actor,
    );

    if (!archived) return;

    const status = candidate.lifecycle ? candidate.lifecycle.status : undefined;
    if (
      status === LIFECYCLE_STATUS.ACTIVATED &&
      isLegalAction(status, LIFECYCLE_ACTION.DEACTIVATE)
    ) {
      appendTransitionEvent(
        instinctId,
        LIFECYCLE_ACTION.DEACTIVATE,
        LIFECYCLE_STATUS.DEACTIVATED,
        actor,
      );
    }
  } catch {
    // Curator store unavailable or locked — the instinct file write already
    // succeeded; do not fail the operation over best-effort lifecycle alignment.
  }
}

/** Resolve an instinct file path, rejecting ids that are not safe filenames. */
function instinctFilePath(instinctId, project) {
  requireProject(project);
  sanitizeFilename(instinctId);
  const dir = getInstinctsDir(project);
  const filePath = path.join(dir, `${instinctId}.md`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Instinct not found: ${instinctId} (looked in ${dir})`);
  }
  return filePath;
}

function today() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Confirm an instinct: raise its confidence and increment its confirmations.
 * @returns {{id: string, path: string, oldConfidence: number, confidence: number, confirmations: number, archived: false}}
 */
function confirmInstinct(instinctId, project) {
  const filePath = instinctFilePath(instinctId, project);
  const content = fs.readFileSync(filePath, 'utf-8');
  const { frontmatter } = parseConfidenceFrontmatter(content);

  const oldConfidence = frontmatter.confidence || 0.5;
  const confidence = applyConfirmation(oldConfidence);
  const confirmations = (frontmatter.confirmations || 0) + 1;

  fs.writeFileSync(
    filePath,
    updateConfidenceFrontmatter(content, {
      confidence,
      confirmations,
      last_confirmed: today(),
    }),
    'utf-8',
  );

  syncCuratorCandidate(
    instinctId,
    { confirmations, contradictions: frontmatter.contradictions || 0 },
    false,
  );

  return {
    id: instinctId,
    path: filePath,
    oldConfidence,
    confidence,
    confirmations,
    archived: false,
  };
}

/**
 * Contradict an instinct: lower its confidence, archiving it when the
 * confidence falls below the archive threshold.
 * @returns {{id: string, path: string, oldConfidence: number, confidence: number, contradictions: number, archived: boolean}}
 */
function contradictInstinct(instinctId, project) {
  const filePath = instinctFilePath(instinctId, project);
  const content = fs.readFileSync(filePath, 'utf-8');
  const { frontmatter } = parseConfidenceFrontmatter(content);

  const oldConfidence = frontmatter.confidence || 0.5;
  const confidence = applyContradiction(oldConfidence, frontmatter.source);
  const contradictions = (frontmatter.contradictions || 0) + 1;

  const updated = updateConfidenceFrontmatter(content, {
    confidence,
    contradictions,
    last_confirmed: today(),
  });

  const archived = shouldArchive(confidence);
  let resultPath = filePath;

  if (archived) {
    const archivedDir = getInstinctsArchivedDir(project);
    fs.mkdirSync(archivedDir, { recursive: true });
    resultPath = path.join(archivedDir, `${instinctId}.md`);
    fs.writeFileSync(
      resultPath,
      updateConfidenceFrontmatter(updated, { archived_at: today() }),
      'utf-8',
    );
    fs.unlinkSync(filePath);
  } else {
    fs.writeFileSync(filePath, updated, 'utf-8');
  }

  syncCuratorCandidate(
    instinctId,
    { confirmations: frontmatter.confirmations || 0, contradictions },
    archived,
  );

  return { id: instinctId, path: resultPath, oldConfidence, confidence, contradictions, archived };
}

/** Format the one-line confidence transition both feedback commands report. */
function formatConfidenceChange(oldConfidence, confidence) {
  return `  ${confidenceBar(oldConfidence)} ${pct(oldConfidence)} → ${confidenceBar(confidence)} ${pct(confidence)}`;
}

module.exports = {
  ARCHIVE_THRESHOLD,
  AT_RISK_CEILING,
  loadInstincts,
  confidenceBar,
  pct,
  collectInstinctStatus,
  renderInstinctStatus,
  syncCuratorCandidate,
  confirmInstinct,
  contradictInstinct,
  formatConfidenceChange,
};
