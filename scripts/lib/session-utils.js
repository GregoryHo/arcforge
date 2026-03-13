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
// Session Listing, Checkpoints & Briefings
// ─────────────────────────────────────────────

/**
 * Get all date directories sorted by date descending.
 * @param {string} parentDir - Directory containing YYYY-MM-DD subdirectories
 * @returns {string[]} Date directory names sorted newest-first
 */
function getDateDirs(parentDir) {
  return fs
    .readdirSync(parentDir)
    .filter((entry) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry)) return false;
      return fs.statSync(path.join(parentDir, entry)).isDirectory();
    })
    .sort()
    .reverse();
}

/**
 * List sessions for a project with metadata.
 * @param {string} project - Project name
 * @param {Object} [options]
 * @param {string} [options.date] - Filter by date (YYYY-MM-DD)
 * @param {number} [options.limit=20] - Max results
 * @param {number} [options.offset=0] - Skip first N results
 * @returns {{ sessions: Object[], total: number }}
 */
function listSessions(project, options = {}) {
  const { date = null, limit = 20, offset = 0 } = options;
  const sessionsDir = path.join(CLAUDE_DIR, 'sessions', project);
  if (!fs.existsSync(sessionsDir)) return { sessions: [], total: 0 };

  const allSessions = [];
  let dateDirs = getDateDirs(sessionsDir);

  if (date) {
    dateDirs = dateDirs.filter((d) => d === date);
  }

  for (const dateStr of dateDirs) {
    const dateDir = path.join(sessionsDir, dateStr);
    const jsonFiles = fs
      .readdirSync(dateDir)
      .filter((f) => f.endsWith('.json') && f.startsWith('session-'));

    for (const file of jsonFiles) {
      try {
        const content = fs.readFileSync(path.join(dateDir, file), 'utf-8');
        const session = JSON.parse(content);
        allSessions.push({ ...session, dateStr, filename: file });
      } catch {
        // skip invalid
      }
    }
  }

  // Sort by lastUpdated descending
  allSessions.sort(
    (a, b) =>
      new Date(b.lastUpdated || b.dateStr).getTime() -
      new Date(a.lastUpdated || a.dateStr).getTime(),
  );

  return {
    sessions: allSessions.slice(offset, offset + limit),
    total: allSessions.length,
  };
}

/**
 * Find a session by ID prefix or full ID.
 * @param {string} project - Project name
 * @param {string} idPrefix - Session ID or prefix (e.g., "session-abc" or "abc")
 * @returns {Object|null} Session data or null
 */
function getSessionById(project, idPrefix) {
  const { sessions } = listSessions(project, { limit: 1000 });
  const normalized = idPrefix.startsWith('session-') ? idPrefix : `session-${idPrefix}`;

  return (
    sessions.find((s) => s.sessionId === normalized || s.sessionId?.startsWith(normalized)) || null
  );
}

/**
 * Generate a checkpoint markdown from session data and optional transcript data.
 * @param {Object} session - Session JSON data
 * @param {Object|null} transcriptData - Parsed transcript data
 * @param {Object} [enrichment] - Claude-provided enrichment
 * @param {string} [enrichment.summary] - What was accomplished
 * @param {string} [enrichment.whatWorked] - Approaches that worked
 * @param {string} [enrichment.whatFailed] - Approaches that failed
 * @param {string} [enrichment.blockers] - Current blockers
 * @param {string} [enrichment.nextStep] - Exact next step
 * @returns {string} Checkpoint markdown content
 */
function generateCheckpoint(session, transcriptData = null, enrichment = {}) {
  const lines = [];
  const date = session.date || session.dateStr || new Date().toISOString().split('T')[0];

  lines.push(`# Session Checkpoint: ${date}`);
  lines.push(`**Project:** ${session.project || 'unknown'}`);
  lines.push(`**Session:** ${session.sessionId || 'unknown'}`);
  lines.push(`**Created:** ${new Date().toISOString()}`);
  lines.push('');

  // Metrics
  lines.push('## Session Metrics');
  const durationMins =
    session.started && session.lastUpdated
      ? Math.round((new Date(session.lastUpdated) - new Date(session.started)) / 60000)
      : null;
  lines.push(`- **Duration**: ${durationMins != null ? `~${durationMins} minutes` : 'unknown'}`);
  lines.push(`- **Tool calls**: ${session.toolCalls || 0}`);
  lines.push(`- **User messages**: ${session.userMessages || 0}`);
  lines.push('');

  // Tools used
  const tools = transcriptData?.toolsUsed || session.toolsUsed || [];
  if (tools.length > 0) {
    lines.push('## Tools Used');
    lines.push(tools.join(', '));
    lines.push('');
  }

  // Files modified
  const files = transcriptData?.filesModified || session.filesModified || [];
  if (files.length > 0) {
    lines.push('## Files Modified');
    for (const f of files) {
      lines.push(`- ${f}`);
    }
    lines.push('');
  }

  // User messages (conversation trail)
  const msgs = transcriptData?.userMessages || session.userMessageContent || [];
  if (msgs.length > 0) {
    lines.push('## Conversation Trail');
    for (const msg of msgs) {
      lines.push(`> ${msg}`);
    }
    lines.push('');
  }

  // Enrichment sections (Claude fills these)
  lines.push('## Summary');
  lines.push(enrichment.summary || '<!-- TO BE ENRICHED: What was accomplished this session -->');
  lines.push('');

  lines.push('## What Worked');
  lines.push(
    enrichment.whatWorked || '<!-- TO BE ENRICHED: Approaches and techniques that succeeded -->',
  );
  lines.push('');

  lines.push('## What Failed');
  lines.push(
    enrichment.whatFailed || '<!-- TO BE ENRICHED: Approaches that were tried and abandoned -->',
  );
  lines.push('');

  lines.push('## Blockers');
  lines.push(enrichment.blockers || '<!-- TO BE ENRICHED: Current blockers or open questions -->');
  lines.push('');

  lines.push('## Next Step');
  lines.push(enrichment.nextStep || '<!-- TO BE ENRICHED: Exact next step to take -->');
  lines.push('');

  return lines.join('\n');
}

/**
 * Format a structured briefing from checkpoint content for resume.
 * @param {string} checkpointContent - Raw checkpoint markdown
 * @param {string} checkpointPath - Path to the checkpoint file
 * @returns {string} Formatted briefing
 */
function formatSessionBriefing(checkpointContent, checkpointPath) {
  const lines = [];
  lines.push(`SESSION LOADED: ${checkpointPath}`);
  lines.push('════════════════════════════════════════════════');
  lines.push('');

  // Extract sections from checkpoint markdown
  const sections = parseCheckpointSections(checkpointContent);

  if (sections.project) {
    lines.push(`PROJECT: ${sections.project}`);
    lines.push('');
  }

  if (sections.summary && !sections.summary.includes('TO BE ENRICHED')) {
    lines.push('WHAT WE WERE DOING:');
    lines.push(sections.summary);
    lines.push('');
  }

  if (sections.metrics) {
    lines.push('SESSION STATS:');
    lines.push(sections.metrics);
    lines.push('');
  }

  if (sections.filesModified) {
    lines.push('FILES MODIFIED:');
    lines.push(sections.filesModified);
    lines.push('');
  }

  if (sections.whatFailed && !sections.whatFailed.includes('TO BE ENRICHED')) {
    lines.push('WHAT NOT TO RETRY:');
    lines.push(sections.whatFailed);
    lines.push('');
  }

  if (sections.blockers && !sections.blockers.includes('TO BE ENRICHED')) {
    lines.push('OPEN QUESTIONS / BLOCKERS:');
    lines.push(sections.blockers);
    lines.push('');
  }

  if (sections.nextStep && !sections.nextStep.includes('TO BE ENRICHED')) {
    lines.push('NEXT STEP:');
    lines.push(sections.nextStep);
    lines.push('');
  }

  if (sections.conversationTrail) {
    lines.push('CONVERSATION TRAIL:');
    lines.push(sections.conversationTrail);
    lines.push('');
  }

  lines.push('════════════════════════════════════════════════');
  lines.push('Ready to continue. What would you like to do?');

  return lines.join('\n');
}

/**
 * Parse checkpoint markdown into named sections.
 * @param {string} content - Checkpoint markdown
 * @returns {Object} Parsed sections
 */
function parseCheckpointSections(content) {
  const sections = {};
  const lines = content.split('\n');

  // Extract project from frontmatter-style line
  const projectLine = lines.find((l) => l.startsWith('**Project:**'));
  if (projectLine) {
    sections.project = projectLine.replace('**Project:**', '').trim();
  }

  // Parse ## sections
  let currentSection = null;
  let currentContent = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentSection) {
        sections[currentSection] = currentContent.join('\n').trim();
      }
      const sectionName = line.replace('## ', '').trim();
      currentSection = sectionNameToKey(sectionName);
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentSection) {
    sections[currentSection] = currentContent.join('\n').trim();
  }

  return sections;
}

/**
 * Map section heading to object key.
 */
function sectionNameToKey(name) {
  const map = {
    'Session Metrics': 'metrics',
    'Tools Used': 'toolsUsed',
    'Files Modified': 'filesModified',
    'Conversation Trail': 'conversationTrail',
    Summary: 'summary',
    'What Worked': 'whatWorked',
    'What Failed': 'whatFailed',
    Blockers: 'blockers',
    'Next Step': 'nextStep',
  };
  return map[name] || name.toLowerCase().replace(/\s+/g, '_');
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
  // Session listing, checkpoints & briefings
  getDateDirs,
  listSessions,
  getSessionById,
  generateCheckpoint,
  formatSessionBriefing,
  parseCheckpointSections,
  // Observation & Instinct paths
  getObservationsPath,
  getInstinctsDir,
  getInstinctsArchivedDir,
  getGlobalInstinctsDir,
  getInstinctsGlobalIndex,
  getEvolvedLogPath,
};
