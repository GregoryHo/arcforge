#!/usr/bin/env node
/**
 * Instinct CLI — status, confirm, contradict, evolve
 *
 * Node.js CLI for managing behavioral instincts.
 * Adapted from: continuous-learning-v2/scripts/instinct.py
 */

const fs = require('fs');
const path = require('path');

const {
  parseConfidenceFrontmatter,
  updateConfidenceFrontmatter,
  applyConfirmation,
  applyContradiction,
  shouldArchive,
  ARCHIVE_THRESHOLD
} = require('../../../scripts/lib/confidence');

const {
  getInstinctsDir,
  getInstinctsArchivedDir,
  getGlobalInstinctsDir
} = require('../../../scripts/lib/session-utils');

const { sanitizeFilename } = require('../../../scripts/lib/utils');

const { readCurrentCandidates } = require('../../../scripts/lib/learning-curator/queue-writer');
const {
  appendTransitionEvent,
  appendUpdateEvent
} = require('../../../scripts/lib/learning-curator/dashboard-events');
const {
  isLegalAction,
  LIFECYCLE_STATUS,
  LIFECYCLE_ACTION
} = require('../../../scripts/lib/learning-curator/lifecycle');

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Get default project name from CLAUDE_PROJECT_DIR or cwd.
 */
function getDefaultProject() {
  return path.basename(process.env.CLAUDE_PROJECT_DIR || process.cwd());
}

/**
 * Load all instinct files from a directory.
 * @returns {Array<{id, file, path, frontmatter, body}>}
 */
function loadInstincts(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(file => {
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
        content
      };
    })
    .filter(Boolean);
}

/**
 * Render a confidence bar (10 chars wide).
 */
function confidenceBar(confidence) {
  const filled = Math.round(confidence * 10);
  const empty = 10 - filled;
  return '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
}

/**
 * Format confidence as percentage.
 */
function pct(confidence) {
  return `${Math.round(confidence * 100)}%`;
}

/**
 * Align confirm/contradict feedback on a curator-activated candidate (ICL-6).
 *
 * Curator-activated instincts carry `id == candidate_id` (set by activate.js).
 * When such an instinct is confirmed or contradicted, mirror the running
 * feedback counts back to the Layer 5 candidate store as a `candidate.updated`
 * patch so the dashboard card stays consistent with the instinct frontmatter.
 *
 * When a contradiction archives the instinct AND the matched candidate is
 * currently `activated`, also append a `deactivate` lifecycle transition —
 * gated through `lifecycle.isLegalAction`. This stays inside the curator event
 * log (the file remains in the instinct's own `archived/` dir); it does NOT run
 * activate.js's physical move-to-`.disabled/` or its reviewer_ack consent model.
 *
 * Candidate lookup uses `readCurrentCandidates()` — the HOME-global event log
 * replayed under the store lock — NOT the project-local legacy queue. A
 * non-curator instinct simply has no matching candidate: no event, no crash.
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
          contradictions: feedback.contradictions
        }
      },
      actor
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
        actor
      );
    }
  } catch {
    // Curator store unavailable or locked — instinct file write already
    // succeeded; do not crash the CLI over best-effort lifecycle alignment.
  }
}

// ─────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────

/**
 * Show instincts grouped by domain with confidence bars.
 */
function cmdStatus(project) {
  const instincts = loadInstincts(getInstinctsDir(project));
  const globalInstincts = loadInstincts(getGlobalInstinctsDir());

  if (instincts.length === 0 && globalInstincts.length === 0) {
    console.log(`No instincts found for project "${project}".`);
    console.log('Instincts are auto-detected from tool usage patterns by the observer daemon.');
    return;
  }

  // Group by domain
  const byDomain = {};
  for (const inst of instincts) {
    const domain = inst.frontmatter.domain || 'uncategorized';
    if (!byDomain[domain]) byDomain[domain] = [];
    byDomain[domain].push(inst);
  }

  // Sort within each domain by confidence descending
  for (const domain of Object.keys(byDomain)) {
    byDomain[domain].sort((a, b) => (b.frontmatter.confidence || 0) - (a.frontmatter.confidence || 0));
  }

  // Print project instincts
  if (instincts.length > 0) {
    console.log(`\n## Project: ${project} (${instincts.length} instincts)\n`);

    for (const [domain, items] of Object.entries(byDomain)) {
      console.log(`### ${domain.toUpperCase()} (${items.length})\n`);

      for (const inst of items) {
        const conf = inst.frontmatter.confidence || 0;
        const bar = confidenceBar(conf);
        const trigger = inst.frontmatter.trigger || '';

        console.log(`  ${bar}  ${pct(conf)}  ${inst.id}`);
        if (trigger) {
          console.log(`            trigger: ${trigger}`);
        }

        // Show action from body (first line after ## Action)
        const actionMatch = inst.body.match(/## Action\n+(.+)/);
        if (actionMatch) {
          console.log(`            action: ${actionMatch[1].trim()}`);
        }
        console.log('');
      }
    }
  }

  // Print global instincts
  if (globalInstincts.length > 0) {
    console.log(`\n## Global Instincts (${globalInstincts.length})\n`);

    for (const inst of globalInstincts) {
      const conf = inst.frontmatter.confidence || 0;
      const bar = confidenceBar(conf);
      console.log(`  ${bar}  ${pct(conf)}  ${inst.id}`);
      if (inst.frontmatter.trigger) {
        console.log(`            trigger: ${inst.frontmatter.trigger}`);
      }
      console.log('');
    }
  }

  // Summary
  const atRisk = instincts.filter(i => {
    const c = i.frontmatter.confidence || 0;
    return c < 0.3 && c >= ARCHIVE_THRESHOLD;
  });

  console.log('---');
  console.log(
    'Injection is activation-gated: activate instincts via `arcforge learn dashboard`. ' +
      'Activated instincts are injected at SessionStart (top 5 by confidence; confidence sorts/caps, it is not a threshold).'
  );
  if (atRisk.length > 0) {
    console.log(`At risk (< 0.3): ${atRisk.map(i => i.id).join(', ')}`);
  }
}

/**
 * Confirm an instinct (increase confidence).
 */
function cmdConfirm(instinctId, project) {
  sanitizeFilename(instinctId);
  const dir = getInstinctsDir(project);
  const filePath = path.join(dir, `${instinctId}.md`);

  if (!fs.existsSync(filePath)) {
    console.error(`Instinct not found: ${instinctId} (in ${dir})`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const { frontmatter } = parseConfidenceFrontmatter(content);

  const oldConfidence = frontmatter.confidence || 0.5;
  const newConfidence = applyConfirmation(oldConfidence);
  const confirmations = (frontmatter.confirmations || 0) + 1;

  const updated = updateConfidenceFrontmatter(content, {
    confidence: newConfidence,
    confirmations,
    last_confirmed: new Date().toISOString().split('T')[0]
  });

  fs.writeFileSync(filePath, updated, 'utf-8');

  syncCuratorCandidate(
    instinctId,
    { confirmations, contradictions: frontmatter.contradictions || 0 },
    false
  );

  console.log(`Confirmed: ${instinctId}`);
  console.log(`  ${confidenceBar(oldConfidence)} ${pct(oldConfidence)} → ${confidenceBar(newConfidence)} ${pct(newConfidence)}`);
  console.log(`  Confirmations: ${confirmations}`);
}

/**
 * Contradict an instinct (decrease confidence).
 */
function cmdContradict(instinctId, project) {
  sanitizeFilename(instinctId);
  const dir = getInstinctsDir(project);
  const filePath = path.join(dir, `${instinctId}.md`);

  if (!fs.existsSync(filePath)) {
    console.error(`Instinct not found: ${instinctId} (in ${dir})`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const { frontmatter } = parseConfidenceFrontmatter(content);

  const oldConfidence = frontmatter.confidence || 0.5;
  const newConfidence = applyContradiction(oldConfidence, frontmatter.source);
  const contradictions = (frontmatter.contradictions || 0) + 1;

  const updated = updateConfidenceFrontmatter(content, {
    confidence: newConfidence,
    contradictions,
    last_confirmed: new Date().toISOString().split('T')[0]
  });

  // Check if should archive
  if (shouldArchive(newConfidence)) {
    const archivedDir = getInstinctsArchivedDir(project);
    fs.mkdirSync(archivedDir, { recursive: true });

    const archivedContent = updateConfidenceFrontmatter(updated, {
      archived_at: new Date().toISOString().split('T')[0]
    });

    fs.writeFileSync(path.join(archivedDir, `${instinctId}.md`), archivedContent, 'utf-8');
    fs.unlinkSync(filePath);

    syncCuratorCandidate(
      instinctId,
      { confirmations: frontmatter.confirmations || 0, contradictions },
      true
    );

    console.log(`Contradicted & archived: ${instinctId}`);
    console.log(`  ${confidenceBar(oldConfidence)} ${pct(oldConfidence)} → ${confidenceBar(newConfidence)} ${pct(newConfidence)}`);
    console.log(`  Confidence below ${ARCHIVE_THRESHOLD} — moved to archived/`);
  } else {
    fs.writeFileSync(filePath, updated, 'utf-8');

    syncCuratorCandidate(
      instinctId,
      { confirmations: frontmatter.confirmations || 0, contradictions },
      false
    );

    console.log(`Contradicted: ${instinctId}`);
    console.log(`  ${confidenceBar(oldConfidence)} ${pct(oldConfidence)} → ${confidenceBar(newConfidence)} ${pct(newConfidence)}`);
    console.log(`  Contradictions: ${contradictions}`);
  }
}

/**
 * Evolve: suggest combining related instincts into higher-level skills.
 * (Phase 5 nice-to-have — basic implementation)
 */
function cmdEvolve(project) {
  const instincts = loadInstincts(getInstinctsDir(project));

  if (instincts.length < 3) {
    console.log('Need at least 3 instincts to detect evolution candidates.');
    return;
  }

  // Group by domain and find clusters
  const byDomain = {};
  for (const inst of instincts) {
    const domain = inst.frontmatter.domain || 'uncategorized';
    if (!byDomain[domain]) byDomain[domain] = [];
    byDomain[domain].push(inst);
  }

  let hasCandidates = false;

  for (const [domain, items] of Object.entries(byDomain)) {
    if (items.length >= 3) {
      hasCandidates = true;
      const highConf = items.filter(i => (i.frontmatter.confidence || 0) >= 0.6);
      console.log(`\nDomain "${domain}": ${items.length} instincts (${highConf.length} high-confidence)`);
      console.log('  Candidate for skill clustering:');
      for (const inst of items) {
        console.log(`    - ${inst.id} (${pct(inst.frontmatter.confidence || 0)})`);
      }
      console.log('  Run `arcforge learn dashboard` and use the Evolve action to combine these.');
    }
  }

  if (!hasCandidates) {
    console.log('No evolution candidates found yet.');
    console.log('Need 3+ instincts in the same domain to suggest combinations.');
  }
}

// ─────────────────────────────────────────────
// CLI Argument Parsing
// ─────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0];
  const positional = [];
  const flags = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      flags[key] = value;
    } else {
      positional.push(args[i]);
    }
  }

  return { command, positional, flags };
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

function main() {
  const { command, positional, flags } = parseArgs(process.argv);
  const project = flags.project || getDefaultProject();

  switch (command) {
    case 'status':
      cmdStatus(project);
      break;

    case 'confirm':
      if (!positional[0]) {
        console.error('Usage: instinct.js confirm <id> --project <project>');
        process.exit(1);
      }
      cmdConfirm(positional[0], project);
      break;

    case 'contradict':
      if (!positional[0]) {
        console.error('Usage: instinct.js contradict <id> --project <project>');
        process.exit(1);
      }
      cmdContradict(positional[0], project);
      break;

    case 'evolve':
      cmdEvolve(project);
      break;

    default:
      console.log('Instinct CLI — Behavioral pattern management\n');
      console.log('Usage: instinct.js <command> [options]\n');
      console.log('Commands:');
      console.log('  status                Show instincts with confidence bars');
      console.log('  confirm <id>          Confirm a pattern (+0.05 confidence)');
      console.log('  contradict <id>       Contradict a pattern (-0.10 confidence)');
      console.log('  evolve                Suggest combining related instincts\n');
      console.log('Options:');
      console.log('  --project <name>      Project name (default: current directory)');
      break;
  }
}

// Export for testing
module.exports = {
  loadInstincts,
  confidenceBar,
  pct,
  syncCuratorCandidate,
  cmdStatus,
  cmdConfirm,
  cmdContradict,
  cmdEvolve,
  parseArgs,
  getDefaultProject
};

// Run if executed directly
if (require.main === module) {
  main();
}
