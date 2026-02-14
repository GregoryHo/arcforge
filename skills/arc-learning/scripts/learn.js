#!/usr/bin/env node
/**
 * Learn CLI — Instinct clustering
 *
 * Scan, preview, and list instinct clusters.
 * Replaces the old "learned skills" system with instinct-based clustering.
 */

const fs = require('node:fs');
const path = require('node:path');

const {
  parseConfidenceFrontmatter
} = require('../../../scripts/lib/confidence');

const {
  getInstinctsDir,
  getGlobalInstinctsDir,
  getEvolvedLogPath
} = require('../../../scripts/lib/session-utils');

const {
  buildTriggerFingerprint,
  jaccardSimilarity
} = require('../../../scripts/lib/fingerprint');

const {
  classifyCluster,
  generateName,
  generateSkill,
  generateCommand,
  generateAgent,
  recordEvolution,
  readEvolutionLog,
  isAlreadyEvolved
} = require('../../../scripts/lib/evolve');

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function getDefaultProject() {
  return path.basename(process.env.CLAUDE_PROJECT_DIR || process.cwd());
}

/**
 * Load project + global instincts and merge them.
 */
function loadAllInstincts(project) {
  const projectInstincts = loadInstincts(getInstinctsDir(project));
  const globalInstincts = loadInstincts(getGlobalInstinctsDir());
  return [...projectInstincts, ...globalInstincts];
}

/** Ensure a name has the arc- prefix (for backing skills). */
function ensureArcPrefix(name) {
  return name.startsWith('arc-') ? name : `arc-${name}`;
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
  const allInstincts = loadAllInstincts(project);

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
  const clusters = clusterInstincts(loadAllInstincts(project));

  if (clusters.length === 0) {
    console.log('No clustering candidates found.');
    return;
  }

  for (let idx = 0; idx < clusters.length; idx++) {
    const cluster = clusters[idx];
    const classification = classifyCluster(cluster);
    const suggestedName = generateName(cluster, classification.type);

    console.log(`\n## Cluster ${idx}: ${cluster.domain} (${cluster.items.length} instincts)\n`);
    console.log('Instincts in this cluster:');
    for (const inst of cluster.items) {
      console.log(`  - **${inst.id}** (${Math.round((inst.confidence || 0) * 100)}%)`);
      if (inst.trigger) console.log(`    Trigger: ${inst.trigger}`);
    }
    console.log(`\nRecommended type: ${classification.type}`);
    console.log(`Suggested name: ${suggestedName}`);
    console.log(`Reasons: ${classification.reasons.join('; ')}`);
    console.log(`\nGenerate: /learn generate --cluster ${idx} --project ${project}`);
    console.log('');
  }
}

function cmdList(project) {
  const logPath = getEvolvedLogPath();
  const entries = readEvolutionLog(logPath);

  if (entries.length === 0) {
    console.log('No evolved clusters yet.');
    console.log('Use /learn scan to find candidates, then /learn generate to evolve them.');
    return;
  }

  // Filter by project if specified
  const filtered = project ? entries.filter(e => e.project === project) : entries;

  if (filtered.length === 0) {
    console.log(`No evolved clusters for project "${project}".`);
    console.log(`Total across all projects: ${entries.length}`);
    return;
  }

  console.log(`\n## Evolved Clusters${project ? ` (${project})` : ''}\n`);
  for (const entry of filtered) {
    const date = entry.timestamp ? entry.timestamp.split('T')[0] : 'unknown';
    console.log(`  ${entry.type.padEnd(7)} ${entry.id}`);
    console.log(`          instincts: ${(entry.instincts || []).join(', ')}`);
    console.log(`          files: ${(entry.files || []).join(', ')}`);
    console.log(`          date: ${date}`);
    console.log('');
  }
}

/**
 * Generate a skill/command/agent from a cluster.
 */
function cmdGenerate(project, flags) {
  const clusterIdx = parseInt(flags.cluster, 10);
  const typeOverride = flags.type;
  const nameOverride = flags.name;
  const dryRun = flags['dry-run'] === true;

  const clusters = clusterInstincts(loadAllInstincts(project));

  if (isNaN(clusterIdx) || clusterIdx < 0 || clusterIdx >= clusters.length) {
    console.error(`Invalid cluster index: ${flags.cluster}. Available: 0-${clusters.length - 1}`);
    return;
  }

  const cluster = clusters[clusterIdx];
  const instinctIds = cluster.items.map(i => i.id);

  // Check if already evolved
  const logPath = getEvolvedLogPath();
  if (isAlreadyEvolved(instinctIds, logPath, project)) {
    console.error('These instincts have already been evolved. Use --name to create a different artifact.');
    return;
  }

  // Validate type override
  const VALID_TYPES = new Set(['skill', 'command', 'agent']);
  if (typeOverride && !VALID_TYPES.has(typeOverride)) {
    console.error(`Invalid --type "${typeOverride}". Must be one of: ${[...VALID_TYPES].join(', ')}`);
    return;
  }

  // Classify
  const classification = typeOverride
    ? { type: typeOverride, confidence: 0, reasons: [`Type override: ${typeOverride}`] }
    : classifyCluster(cluster);

  const type = classification.type;

  // Sanitize --name to prevent path traversal
  if (nameOverride && (/[\/\\]/.test(nameOverride) || nameOverride.includes('..'))) {
    console.error(`Invalid --name "${nameOverride}". Name must not contain path separators or "..".`);
    return;
  }

  // Generate name — skills already have arc- prefix from generateName
  const baseName = nameOverride || generateName(cluster, type);
  const skillName = ensureArcPrefix(baseName);
  const cmdName = baseName.replace(/^arc-/, '');

  // Generate files
  const files = [];

  if (type === 'skill') {
    files.push(generateSkill(cluster, skillName));
  } else if (type === 'command') {
    // Commands always produce a backing skill too
    files.push(generateSkill(cluster, skillName));
    files.push(generateCommand(cluster, cmdName, skillName));
  } else if (type === 'agent') {
    files.push(generateAgent(cluster, baseName));
  }

  if (dryRun) {
    console.log(`DRY RUN — would generate ${type}:\n`);
    for (const file of files) {
      console.log(`--- ${file.path} (${file.type}) ---`);
      console.log(file.content);
      console.log('');
    }
    console.log('Run without --dry-run to write files.');
    return;
  }

  // Check for existing files before writing (prevent accidental overwrites)
  const existing = files.filter((f) => fs.existsSync(path.resolve(f.path)));
  if (existing.length > 0) {
    console.error('Refusing to overwrite existing files:');
    for (const f of existing) {
      console.error(`  ${f.path}`);
    }
    console.error('Use a different --name or remove the existing files first.');
    return;
  }

  // Write files
  for (const file of files) {
    const fullPath = path.resolve(file.path);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, file.content, 'utf-8');
    console.log(`Created: ${file.path}`);
  }

  // Record evolution
  recordEvolution({
    id: baseName,
    type,
    instincts: instinctIds,
    project,
    files: files.map(f => f.path),
  }, logPath);

  console.log(`\nEvolved ${instinctIds.length} instincts into ${type}: ${baseName}`);
  console.log('Generated files are scaffolds — refine before deployment.');
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
    case 'generate':
      cmdGenerate(project, flags);
      break;
    case 'list':
      cmdList(project);
      break;
    default:
      console.log('Learn CLI — Instinct clustering & evolution\n');
      console.log('Usage: learn.js <command> [options]\n');
      console.log('Commands:');
      console.log('  scan                  Scan for clustering candidates');
      console.log('  preview               Preview clusters with type recommendations');
      console.log('  generate              Generate skill/command/agent from a cluster');
      console.log('  list                  List previously evolved clusters\n');
      console.log('Options:');
      console.log('  --project <name>      Project name (default: current directory)');
      console.log('  --cluster <N>         Cluster index (for generate)');
      console.log('  --type <type>         Override type: skill|command|agent');
      console.log('  --name <name>         Override generated name');
      console.log('  --dry-run             Preview without writing files');
      break;
  }
}

// Export for testing
module.exports = {
  loadInstincts,
  loadAllInstincts,
  clusterInstincts,
  cmdScan,
  cmdPreview,
  cmdGenerate,
  cmdList,
  parseArgs,
  getDefaultProject
};

if (require.main === module) {
  main();
}
