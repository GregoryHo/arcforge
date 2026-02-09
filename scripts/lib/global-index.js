#!/usr/bin/env node
/**
 * Global Index — Bubble-up tracking for instincts
 *
 * Manages JSONL index files for tracking cross-project patterns.
 * Tracks instinct promotions across projects via global-index.jsonl.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { buildTriggerFingerprint, jaccardSimilarity } = require('./fingerprint');
const { parseConfidenceFrontmatter } = require('./confidence');

/**
 * Append an entry to a JSONL index file.
 * @param {string} indexPath - Path to the JSONL index file
 * @param {string} patternName - Pattern/instinct ID
 * @param {string} project - Source project
 * @param {number} confidence - Current confidence score
 * @param {string} type - 'instinct' or 'learned'
 */
function appendToIndex(indexPath, patternName, project, confidence, type) {
  const entry = {
    id: patternName,
    project,
    confidence,
    type,
    timestamp: new Date().toISOString()
  };

  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.appendFileSync(indexPath, JSON.stringify(entry) + '\n', 'utf-8');
}

/**
 * Read and parse a JSONL index file.
 * @param {string} indexPath - Path to the JSONL index file
 * @returns {Array<Object>} Parsed entries
 */
function readIndex(indexPath) {
  if (!fs.existsSync(indexPath)) return [];

  const content = fs.readFileSync(indexPath, 'utf-8');
  return content.trim().split('\n')
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); }
      catch { return null; }
    })
    .filter(Boolean);
}

/**
 * Find patterns that appear in multiple projects.
 * @param {string} indexPath - Path to the JSONL index file
 * @param {number} [minProjects=2] - Minimum number of projects for promotion
 * @returns {Array<{id: string, projects: string[], count: number}>}
 */
function findCrossProjectPatterns(indexPath, minProjects = 2) {
  const entries = readIndex(indexPath);

  // Group by pattern ID, tracking unique projects
  const byPattern = {};
  for (const entry of entries) {
    if (!byPattern[entry.id]) {
      byPattern[entry.id] = new Set();
    }
    byPattern[entry.id].add(entry.project);
  }

  // Return patterns in 2+ projects
  return Object.entries(byPattern)
    .filter(([, projects]) => projects.size >= minProjects)
    .map(([id, projects]) => ({
      id,
      projects: Array.from(projects),
      count: projects.size
    }));
}

/**
 * Check if a pattern is already promoted to global.
 * @param {string} indexPath - Path to the JSONL index file
 * @param {string} patternName - Pattern/instinct ID
 * @returns {boolean}
 */
function isAlreadyGlobal(indexPath, patternName) {
  const entries = readIndex(indexPath);
  return entries.some(e => e.id === patternName && e.promoted);
}

/**
 * Promote a pattern to global by copying the file and marking in index.
 * @param {string} sourcePath - Source file path
 * @param {string} globalDir - Target global directory
 * @param {string} indexPath - Path to the JSONL index file
 * @returns {string|null} Path to the promoted file, or null if already exists
 */
function promoteToGlobal(sourcePath, globalDir, indexPath) {
  const filename = path.basename(sourcePath);
  const targetPath = path.join(globalDir, filename);

  // Don't overwrite existing global pattern
  if (fs.existsSync(targetPath)) return null;

  fs.mkdirSync(globalDir, { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);

  // Mark as promoted in index
  const entry = {
    id: path.basename(filename, '.md'),
    promoted: new Date().toISOString(),
    source: sourcePath
  };

  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.appendFileSync(indexPath, JSON.stringify(entry) + '\n', 'utf-8');

  return targetPath;
}

/**
 * CLI entry point for bubble-up checks
 * Usage: node global-index.js --check-promote --project <project-name>
 */
function main() {
  const args = process.argv.slice(2);

  if (args.includes('--check-promote')) {
    const projectIdx = args.indexOf('--project');
    if (projectIdx === -1 || !args[projectIdx + 1]) {
      console.error('Usage: node global-index.js --check-promote --project <project-name>');
      process.exit(1);
    }

    const project = args[projectIdx + 1];
    checkBubbleUpForProject(project);
  } else {
    console.error('Usage: node global-index.js --check-promote --project <project-name>');
    process.exit(1);
  }
}

/**
 * Check and promote instincts for a specific project
 * @param {string} project - Project name
 */
function checkBubbleUpForProject(project) {
  const instinctsBase = path.join(os.homedir(), '.claude', 'instincts');
  const projectInstincts = path.join(instinctsBase, project);
  const globalDir = path.join(instinctsBase, 'global');
  const indexPath = path.join(instinctsBase, 'global-index.jsonl');

  if (!fs.existsSync(projectInstincts)) {
    return;
  }

  // For each instinct in this project, check if it appears in 2+ projects
  const instinctFiles = fs.readdirSync(projectInstincts).filter(f => f.endsWith('.md'));

  for (const file of instinctFiles) {
    const instinctId = path.basename(file, '.md');

    // Count how many projects have this instinct
    let projectCount = 0;
    const projectDirs = fs.readdirSync(instinctsBase).filter(name => {
      const fullPath = path.join(instinctsBase, name);
      return fs.statSync(fullPath).isDirectory() && name !== 'global' && name !== 'archived';
    });

    for (const projName of projectDirs) {
      const projInstinctFile = path.join(instinctsBase, projName, file);
      if (fs.existsSync(projInstinctFile)) {
        projectCount++;
      }
    }

    // Fast path: bubble up if found in 2+ projects by filename
    if (projectCount >= 2) {
      const sourcePath = path.join(projectInstincts, file);
      const promoted = promoteToGlobal(sourcePath, globalDir, indexPath);

      if (promoted) {
        console.log(`Promoted ${instinctId} to global (found in ${projectCount} projects)`);
      }
      continue;
    }

    // Slow path: semantic matching via trigger fingerprints
    const sourcePath = path.join(projectInstincts, file);
    const sourceContent = fs.readFileSync(sourcePath, 'utf-8');
    const { frontmatter: sourceFm } = parseConfidenceFrontmatter(sourceContent);

    if (!sourceFm.trigger || !sourceFm.domain) continue;

    const sourceFp = buildTriggerFingerprint(sourceFm.trigger);
    if (sourceFp.size < 3) continue;

    let semanticMatch = false;

    for (const otherProj of projectDirs) {
      if (otherProj === project) continue;

      const otherProjDir = path.join(instinctsBase, otherProj);
      const otherFiles = fs.readdirSync(otherProjDir).filter(f => f.endsWith('.md'));

      for (const otherFile of otherFiles) {
        const otherPath = path.join(otherProjDir, otherFile);
        const otherContent = fs.readFileSync(otherPath, 'utf-8');
        const { frontmatter: otherFm } = parseConfidenceFrontmatter(otherContent);

        if (!otherFm.trigger || !otherFm.domain) continue;
        if (otherFm.domain !== sourceFm.domain) continue;

        const otherFp = buildTriggerFingerprint(otherFm.trigger);
        if (otherFp.size < 3) continue;

        const similarity = jaccardSimilarity(sourceFp, otherFp);
        if (similarity >= 0.6) {
          semanticMatch = true;
          break;
        }
      }

      if (semanticMatch) break;
    }

    if (semanticMatch) {
      const promoted = promoteToGlobal(sourcePath, globalDir, indexPath);
      if (promoted) {
        console.log(`Promoted ${instinctId} to global (semantic match across projects)`);
      }
    }
  }
}

module.exports = {
  appendToIndex,
  readIndex,
  findCrossProjectPatterns,
  isAlreadyGlobal,
  promoteToGlobal,
  checkBubbleUpForProject
};

// Run CLI if executed directly
if (require.main === module) {
  main();
}
