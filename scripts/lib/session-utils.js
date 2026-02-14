// scripts/lib/session-utils.js
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const CLAUDE_DIR = path.join(os.homedir(), '.claude');

/**
 * Get diary file path: ~/.claude/sessions/{project}/{date}/diary-{sessionId}.md
 */
function getDiaryPath(project, date, sessionId) {
  return path.join(CLAUDE_DIR, 'sessions', project, date, `diary-${sessionId}.md`);
}

/**
 * Save diary file, creating parent directories if needed.
 */
function saveDiary(filePath, content) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
  return true;
}

/**
 * Get processed.log path for project or global.
 */
function getProcessedLogPath(project) {
  const base = path.join(CLAUDE_DIR, 'diaryed');
  return project
    ? path.join(base, project, 'processed.log')
    : path.join(base, 'global', 'processed.log');
}

/**
 * Parse processed.log and return set of processed diary filenames.
 */
function parseProcessedLog(logPath) {
  const processed = new Set();
  if (fs.existsSync(logPath)) {
    const content = fs.readFileSync(logPath, 'utf-8');
    for (const line of content.split('\n')) {
      if (line.trim() && !line.startsWith('#')) {
        const [filename] = line.split('|').map((s) => s.trim());
        if (filename) processed.add(filename);
      }
    }
  }
  return processed;
}

/**
 * Scan for diary files based on strategy.
 */
function scanDiaries(project, strategy, processedLogPath) {
  const sessionsDir = path.join(CLAUDE_DIR, 'sessions', project);
  if (!fs.existsSync(sessionsDir)) return [];

  const processed = parseProcessedLog(processedLogPath);
  const allDiaries = [];

  // Find all diary files sorted by date
  const dateDirs = fs
    .readdirSync(sessionsDir)
    .filter((d) => fs.statSync(path.join(sessionsDir, d)).isDirectory())
    .sort();

  for (const dateDir of dateDirs) {
    const dirPath = path.join(sessionsDir, dateDir);
    const diaries = fs
      .readdirSync(dirPath)
      .filter((f) => f.startsWith('diary-') && f.endsWith('.md'))
      .map((f) => path.join(dirPath, f))
      .sort();
    allDiaries.push(...diaries);
  }

  // Filter based on strategy
  if (strategy === 'unprocessed') {
    return allDiaries.filter((d) => !processed.has(path.basename(d)));
  } else if (strategy === 'project_focused') {
    return allDiaries.slice(0, 10);
  } else {
    return allDiaries.slice(-10);
  }
}

/**
 * Determine which reflection strategy to use.
 */
function determineReflectStrategy(project, processedLogPath) {
  const sessionsDir = path.join(CLAUDE_DIR, 'sessions', project);
  if (!fs.existsSync(sessionsDir)) return 'recent_window';

  // Count all diaries
  const allDiaries = [];
  const dateDirs = fs
    .readdirSync(sessionsDir)
    .filter((d) => fs.statSync(path.join(sessionsDir, d)).isDirectory());
  for (const dateDir of dateDirs) {
    const dirPath = path.join(sessionsDir, dateDir);
    const diaries = fs
      .readdirSync(dirPath)
      .filter((f) => f.startsWith('diary-') && f.endsWith('.md'));
    allDiaries.push(...diaries);
  }

  // Count unprocessed
  const processed = parseProcessedLog(processedLogPath);
  const unprocessed = allDiaries.filter((d) => !processed.has(d));

  if (unprocessed.length >= 5) return 'unprocessed';
  if (allDiaries.length >= 5) return 'project_focused';
  return 'recent_window';
}

/**
 * Append processed diary entries to log.
 */
function updateProcessedLog(logPath, diaryFiles, reflectionId) {
  const dir = path.dirname(logPath);
  fs.mkdirSync(dir, { recursive: true });

  const date = new Date().toISOString().split('T')[0];
  const lines = diaryFiles.map((d) => `${path.basename(d)} | ${date} | ${reflectionId}\n`).join('');

  fs.appendFileSync(logPath, lines, 'utf-8');
}

// ─────────────────────────────────────────────
// Observation & Instinct Path Helpers
// ─────────────────────────────────────────────

/**
 * Get observations JSONL path for a project.
 * @param {string} project - Project name
 * @returns {string} ~/.claude/observations/{project}/observations.jsonl
 */
function getObservationsPath(project) {
  return path.join(CLAUDE_DIR, 'observations', project, 'observations.jsonl');
}

/**
 * Get instincts directory for a project.
 * @param {string} project - Project name
 * @returns {string} ~/.claude/instincts/{project}/
 */
function getInstinctsDir(project) {
  return path.join(CLAUDE_DIR, 'instincts', project);
}

/**
 * Get archived instincts directory for a project.
 * @param {string} project - Project name
 * @returns {string} ~/.claude/instincts/{project}/archived/
 */
function getInstinctsArchivedDir(project) {
  return path.join(CLAUDE_DIR, 'instincts', project, 'archived');
}

/**
 * Get global instincts directory.
 * @returns {string} ~/.claude/instincts/global/
 */
function getGlobalInstinctsDir() {
  return path.join(CLAUDE_DIR, 'instincts', 'global');
}

/**
 * Get global index for instinct bubble-up tracking.
 * @returns {string} ~/.claude/instincts/global-index.jsonl
 */
function getInstinctsGlobalIndex() {
  return path.join(CLAUDE_DIR, 'instincts', 'global-index.jsonl');
}

/**
 * Get evolved log path for tracking instinct-to-artifact evolution.
 * @returns {string} ~/.claude/evolved/evolved.jsonl
 */
function getEvolvedLogPath() {
  return path.join(CLAUDE_DIR, 'evolved', 'evolved.jsonl');
}

module.exports = {
  getDiaryPath,
  saveDiary,
  getProcessedLogPath,
  parseProcessedLog,
  scanDiaries,
  determineReflectStrategy,
  updateProcessedLog,
  CLAUDE_DIR,
  // Observation & Instinct paths
  getObservationsPath,
  getInstinctsDir,
  getInstinctsArchivedDir,
  getGlobalInstinctsDir,
  getInstinctsGlobalIndex,
  getEvolvedLogPath,
};
