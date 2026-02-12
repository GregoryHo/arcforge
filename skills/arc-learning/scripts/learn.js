#!/usr/bin/env node
/**
 * Learn CLI — Instinct clustering
 *
 * Scan, preview, and list instinct clusters.
 * Replaces the old "learned skills" system with instinct-based clustering.
 */

const fs = require('fs');
const path = require('path');

const {
  parseConfidenceFrontmatter
} = require('../../../scripts/lib/confidence');

const {
  getInstinctsDir,
  getGlobalInstinctsDir
} = require('../../../scripts/lib/session-utils');

const {
  buildTriggerFingerprint,
  jaccardSimilarity
} = require('../../../scripts/lib/fingerprint');

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function getDefaultProject() {
  return path.basename(process.env.CLAUDE_PROJECT_DIR || process.cwd());
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0];
  const flags = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      flags[key] = value;
    }
  }

  return { command, flags };
}

/**
 * Load all instinct files from a directory.
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
        confidence: frontmatter.confidence,
        domain: frontmatter.domain || 'uncategorized',
        trigger: frontmatter.trigger || ''
      };
    })
    .filter(Boolean);
}

/**
 * Cluster instincts by domain, then by trigger similarity.
 */
function clusterInstincts(instincts, threshold = 0.6) {
  // Group by domain
  const byDomain = {};
  for (const inst of instincts) {
    if (!byDomain[inst.domain]) byDomain[inst.domain] = [];
    byDomain[inst.domain].push(inst);
  }

  const clusters = [];

  for (const [domain, items] of Object.entries(byDomain)) {
    if (items.length < 3) continue;

    // Check quality threshold: at least 1 with confidence >= 0.6
    const hasQuality = items.some(i => i.confidence >= 0.6);
    if (!hasQuality) continue;

    // Build fingerprints
    const fingerprinted = items.map(i => ({
      ...i,
      fingerprint: buildTriggerFingerprint(i.trigger)
    }));

    // Simple clustering: group items with pairwise Jaccard >= threshold
    const used = new Set();
    for (let i = 0; i < fingerprinted.length; i++) {
      if (used.has(i)) continue;
      const cluster = [fingerprinted[i]];
      used.add(i);

      for (let j = i + 1; j < fingerprinted.length; j++) {
        if (used.has(j)) continue;
        // Check similarity with any member of the cluster
        const similar = cluster.some(member =>
          jaccardSimilarity(member.fingerprint, fingerprinted[j].fingerprint) >= threshold
        );
        if (similar) {
          cluster.push(fingerprinted[j]);
          used.add(j);
        }
      }

      if (cluster.length >= 3) {
        clusters.push({ domain, items: cluster });
      }
    }

    // If no sub-clusters found but the whole domain has 3+, treat domain as cluster
    if (clusters.filter(c => c.domain === domain).length === 0 && items.length >= 3 && hasQuality) {
      clusters.push({ domain, items });
    }
  }

  return clusters;
}

// ─────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────

function cmdScan(project) {
  const projectInstincts = loadInstincts(getInstinctsDir(project));
  const globalInstincts = loadInstincts(getGlobalInstinctsDir());
  const allInstincts = [...projectInstincts, ...globalInstincts];

  if (allInstincts.length < 3) {
    console.log(`Only ${allInstincts.length} instincts found. Need at least 3 for clustering.`);
    return;
  }

  const clusters = clusterInstincts(allInstincts);

  if (clusters.length === 0) {
    console.log('No clustering candidates found.');
    console.log('Need 3+ instincts in the same domain with at least 1 having confidence >= 0.6.');
    return;
  }

  console.log(`Found ${clusters.length} clustering candidate(s):\n`);
  for (const cluster of clusters) {
    const highConf = cluster.items.filter(i => (i.confidence || 0) >= 0.6);
    console.log(`  Domain "${cluster.domain}": ${cluster.items.length} instincts (${highConf.length} high-confidence)`);
    for (const inst of cluster.items) {
      console.log(`    - ${inst.id} (${Math.round((inst.confidence || 0) * 100)}%)`);
    }
    console.log('');
  }

  console.log('Run /learn preview to see detailed cluster analysis.');
}

function cmdPreview(project) {
  const projectInstincts = loadInstincts(getInstinctsDir(project));
  const globalInstincts = loadInstincts(getGlobalInstinctsDir());
  const allInstincts = [...projectInstincts, ...globalInstincts];
  const clusters = clusterInstincts(allInstincts);

  if (clusters.length === 0) {
    console.log('No clustering candidates found.');
    return;
  }

  for (const cluster of clusters) {
    console.log(`\n## Cluster: ${cluster.domain} (${cluster.items.length} instincts)\n`);
    console.log('Instincts in this cluster:');
    for (const inst of cluster.items) {
      console.log(`  - **${inst.id}** (${Math.round((inst.confidence || 0) * 100)}%)`);
      if (inst.trigger) console.log(`    Trigger: ${inst.trigger}`);
    }
    console.log('\nPossible outputs:');
    console.log('  1. Skill: A reusable SKILL.md with combined workflow');
    console.log('  2. Command: A CLI command that automates the pattern');
    console.log('  3. Agent: A specialized subagent for the domain');
    console.log('');
  }
}

function cmdList(project) {
  // List previously evolved clusters (placeholder — would need storage)
  console.log('No evolved clusters yet.');
  console.log('Use /learn scan to find candidates, then /learn preview to analyze them.');
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

function main() {
  const { command, flags } = parseArgs(process.argv);
  const project = flags.project || getDefaultProject();

  switch (command) {
    case 'scan':
      cmdScan(project);
      break;
    case 'preview':
      cmdPreview(project);
      break;
    case 'list':
      cmdList(project);
      break;
    default:
      console.log('Learn CLI — Instinct clustering\n');
      console.log('Usage: learn.js <command> [options]\n');
      console.log('Commands:');
      console.log('  scan                  Scan for clustering candidates');
      console.log('  preview               Preview detailed cluster analysis');
      console.log('  list                  List previously evolved clusters\n');
      console.log('Options:');
      console.log('  --project <name>      Project name (default: current directory)');
      break;
  }
}

// Export for testing
module.exports = {
  loadInstincts,
  clusterInstincts,
  cmdScan,
  cmdPreview,
  cmdList,
  parseArgs,
  getDefaultProject
};

if (require.main === module) {
  main();
}
