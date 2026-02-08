#!/usr/bin/env node
/**
 * Learn CLI — save, list, confirm, contradict, check-duplicate
 *
 * Manages learned skills with confidence scoring.
 */

const fs = require('fs');
const path = require('path');

const {
  parseConfidenceFrontmatter,
  updateConfidenceFrontmatter,
  applyConfirmation,
  applyContradiction,
  shouldAutoLoad,
  shouldArchive,
  AUTO_LOAD_THRESHOLD,
  ARCHIVE_THRESHOLD
} = require('../../../scripts/lib/confidence');

const {
  getLearnedSkillsDir,
  getLearnedSkillsArchivedDir,
  getLearnedGlobalIndex
} = require('../../../scripts/lib/session-utils');

const {
  appendToIndex,
  findCrossProjectPatterns,
  promoteToGlobal
} = require('../../../scripts/lib/global-index');

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function getDefaultProject() {
  return path.basename(process.env.CLAUDE_PROJECT_DIR || process.cwd());
}

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

/**
 * Load all learned skill files from a directory.
 */
function loadSkills(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) return null;

      const content = fs.readFileSync(filePath, 'utf-8');
      const { frontmatter, body } = parseConfidenceFrontmatter(content);

      return {
        name: frontmatter.name || path.basename(file, '.md'),
        file,
        path: filePath,
        frontmatter,
        body,
        content,
        confidence: frontmatter.confidence
      };
    })
    .filter(Boolean);
}

function confidenceBar(confidence) {
  if (confidence === undefined) return '          ';
  const filled = Math.round(confidence * 10);
  const empty = 10 - filled;
  return '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
}

function pct(confidence) {
  if (confidence === undefined) return '   ';
  return `${Math.round(confidence * 100)}%`;
}

// ─────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────

/**
 * Save a new learned skill.
 */
function cmdSave(flags) {
  const project = flags.project || getDefaultProject();
  const scope = flags.scope || 'project';
  const confidence = parseFloat(flags.confidence) || 0.5;
  const name = flags.name;
  const content = flags.content;

  if (!name || !content) {
    console.error('Usage: learn.js save --name X --content "..." [--project P] [--scope global|project] [--confidence 0.5]');
    process.exit(1);
  }

  const dir = scope === 'global' ? getLearnedSkillsDir(null) : getLearnedSkillsDir(project);
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `${name}.md`);

  // Check for duplicates
  if (fs.existsSync(filePath)) {
    console.error(`Skill already exists: ${filePath}`);
    console.error('Use confirm/contradict to update, or choose a different name.');
    process.exit(1);
  }

  // Build frontmatter with confidence
  const today = new Date().toISOString().split('T')[0];
  const fullContent = `---
name: ${name}
extracted: ${today}
confidence: ${confidence.toFixed(2)}
scope: ${scope}
project: ${project}
last_confirmed: ${today}
confirmations: 0
contradictions: 0
---

${content}`;

  fs.writeFileSync(filePath, fullContent, 'utf-8');
  console.log(`Saved: ${filePath}`);
  console.log(`  Confidence: ${pct(confidence)}`);

  // Append to global index for bubble-up tracking
  const indexPath = getLearnedGlobalIndex();
  appendToIndex(indexPath, name, project, confidence, 'learned');
}

/**
 * List learned skills.
 */
function cmdList(flags) {
  const project = flags.project || getDefaultProject();
  const minConfidence = parseFloat(flags['min-confidence']) || 0;

  const projectSkills = loadSkills(getLearnedSkillsDir(project));
  const globalSkills = loadSkills(getLearnedSkillsDir(null));

  const allSkills = [
    ...projectSkills.map(s => ({ ...s, scope: 'project' })),
    ...globalSkills.map(s => ({ ...s, scope: 'global' }))
  ].filter(s => (s.confidence || 0) >= minConfidence);

  if (allSkills.length === 0) {
    console.log(`No learned skills found for "${project}" (min confidence: ${minConfidence}).`);
    return;
  }

  // Group by scope
  const byScope = { global: [], project: [] };
  for (const skill of allSkills) {
    byScope[skill.scope].push(skill);
  }

  for (const [scope, skills] of Object.entries(byScope)) {
    if (skills.length === 0) continue;

    // Sort by confidence descending
    skills.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

    console.log(`\n## ${scope.toUpperCase()} (${skills.length})\n`);
    for (const skill of skills) {
      const conf = skill.confidence;
      const bar = conf !== undefined ? confidenceBar(conf) : '';
      const autoLoad = conf !== undefined && shouldAutoLoad(conf) ? ' [auto-loaded]' : '';
      const context = skill.frontmatter.context || '';

      console.log(`  ${bar}  ${pct(conf)}  ${skill.name}${autoLoad}`);
      if (context) {
        console.log(`            context: ${context}`);
      }
      console.log('');
    }
  }

  // Summary
  const autoLoaded = allSkills.filter(s => s.confidence !== undefined && shouldAutoLoad(s.confidence));
  console.log('---');
  console.log(`Auto-loaded (>= ${AUTO_LOAD_THRESHOLD}): ${autoLoaded.length}`);
}

/**
 * Confirm a learned skill.
 */
function cmdConfirm(name, flags) {
  const project = flags.project || getDefaultProject();

  // Look in project first, then global
  let filePath = path.join(getLearnedSkillsDir(project), `${name}.md`);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(getLearnedSkillsDir(null), `${name}.md`);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`Learned skill not found: ${name}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const { frontmatter } = parseConfidenceFrontmatter(content);

  const oldConf = frontmatter.confidence || 0.5;
  const newConf = applyConfirmation(oldConf);
  const confirmations = (frontmatter.confirmations || 0) + 1;

  const updated = updateConfidenceFrontmatter(content, {
    confidence: newConf,
    confirmations,
    last_confirmed: new Date().toISOString().split('T')[0]
  });

  fs.writeFileSync(filePath, updated, 'utf-8');

  console.log(`Confirmed: ${name}`);
  console.log(`  ${confidenceBar(oldConf)} ${pct(oldConf)} → ${confidenceBar(newConf)} ${pct(newConf)}`);

  // Check bubble-up
  checkBubbleUp(name, project);
}

/**
 * Contradict a learned skill.
 */
function cmdContradict(name, flags) {
  const project = flags.project || getDefaultProject();

  let filePath = path.join(getLearnedSkillsDir(project), `${name}.md`);
  let scope = 'project';
  if (!fs.existsSync(filePath)) {
    filePath = path.join(getLearnedSkillsDir(null), `${name}.md`);
    scope = 'global';
  }

  if (!fs.existsSync(filePath)) {
    console.error(`Learned skill not found: ${name}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const { frontmatter } = parseConfidenceFrontmatter(content);

  const oldConf = frontmatter.confidence || 0.5;
  const newConf = applyContradiction(oldConf);
  const contradictions = (frontmatter.contradictions || 0) + 1;

  const updated = updateConfidenceFrontmatter(content, {
    confidence: newConf,
    contradictions,
    last_confirmed: new Date().toISOString().split('T')[0]
  });

  if (shouldArchive(newConf)) {
    const archiveDir = scope === 'global'
      ? getLearnedSkillsArchivedDir(null)
      : getLearnedSkillsArchivedDir(project);
    fs.mkdirSync(archiveDir, { recursive: true });

    const archivedContent = updateConfidenceFrontmatter(updated, {
      archived_at: new Date().toISOString().split('T')[0]
    });

    fs.writeFileSync(path.join(archiveDir, `${name}.md`), archivedContent, 'utf-8');
    fs.unlinkSync(filePath);

    console.log(`Contradicted & archived: ${name}`);
    console.log(`  ${confidenceBar(oldConf)} ${pct(oldConf)} → ${confidenceBar(newConf)} ${pct(newConf)}`);
    console.log(`  Confidence below ${ARCHIVE_THRESHOLD} — moved to archived/`);
  } else {
    fs.writeFileSync(filePath, updated, 'utf-8');
    console.log(`Contradicted: ${name}`);
    console.log(`  ${confidenceBar(oldConf)} ${pct(oldConf)} → ${confidenceBar(newConf)} ${pct(newConf)}`);
  }
}

/**
 * Check for duplicate skill name.
 */
function cmdCheckDuplicate(name, flags) {
  const project = flags.project || getDefaultProject();

  const projectPath = path.join(getLearnedSkillsDir(project), `${name}.md`);
  const globalPath = path.join(getLearnedSkillsDir(null), `${name}.md`);

  if (fs.existsSync(projectPath)) {
    console.log(`duplicate|project|${projectPath}`);
  } else if (fs.existsSync(globalPath)) {
    console.log(`duplicate|global|${globalPath}`);
  } else {
    console.log('unique');
  }
}

/**
 * Check if a pattern should bubble up to global.
 */
function checkBubbleUp(name, project) {
  const indexPath = getLearnedGlobalIndex();
  const crossProject = findCrossProjectPatterns(indexPath, 2);

  const match = crossProject.find(p => p.id === name);
  if (match) {
    const sourcePath = path.join(getLearnedSkillsDir(project), `${name}.md`);
    const globalDir = getLearnedSkillsDir(null);

    if (fs.existsSync(sourcePath)) {
      const result = promoteToGlobal(sourcePath, globalDir, indexPath);
      if (result) {
        console.log(`  Promoted to global (found in ${match.count} projects): ${result}`);
      }
    }
  }
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

function main() {
  const { command, positional, flags } = parseArgs(process.argv);

  switch (command) {
    case 'save':
      cmdSave(flags);
      break;

    case 'list':
      cmdList(flags);
      break;

    case 'confirm':
      if (!positional[0]) {
        console.error('Usage: learn.js confirm <name> [--project P]');
        process.exit(1);
      }
      cmdConfirm(positional[0], flags);
      break;

    case 'contradict':
      if (!positional[0]) {
        console.error('Usage: learn.js contradict <name> [--project P]');
        process.exit(1);
      }
      cmdContradict(positional[0], flags);
      break;

    case 'check-duplicate':
      if (!positional[0]) {
        console.error('Usage: learn.js check-duplicate <name> [--project P]');
        process.exit(1);
      }
      cmdCheckDuplicate(positional[0], flags);
      break;

    default:
      console.log('Learn CLI — Learned skill management\n');
      console.log('Usage: learn.js <command> [options]\n');
      console.log('Commands:');
      console.log('  save                  Save a new learned skill');
      console.log('  list                  List learned skills with confidence');
      console.log('  confirm <name>        Confirm a pattern (+0.05)');
      console.log('  contradict <name>     Contradict a pattern (-0.10)');
      console.log('  check-duplicate <name> Check if skill name exists\n');
      console.log('Options:');
      console.log('  --project <name>      Project name (default: current dir)');
      console.log('  --scope <global|project>  Scope for save (default: project)');
      console.log('  --confidence <0.5>    Initial confidence for save');
      console.log('  --min-confidence <0>  Minimum confidence for list');
      break;
  }
}

// Export for testing
module.exports = {
  loadSkills,
  confidenceBar,
  pct,
  parseArgs,
  getDefaultProject,
  cmdSave,
  cmdList,
  cmdConfirm,
  cmdContradict,
  cmdCheckDuplicate
};

if (require.main === module) {
  main();
}
