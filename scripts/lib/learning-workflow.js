/**
 * learning-workflow.js — diary, reflection and recall operations.
 *
 * Canonical owner of the three learning operations a human drives through the
 * `learn diary|reflect|recall` CLI subgroups. Before v6/P5 this logic lived in
 * skill-local scripts that reached back into `scripts/lib/` (a D8/D1
 * violation); it is engine code, so it lives here and the skill reaches it by
 * subprocess CLI only.
 *
 * Split of responsibility:
 *   - diary-capture.js  — generates drafts from the hook side (automatic)
 *   - this file         — what a human does to a diary/reflection afterwards
 *   - instinct-feedback.js — the instinct half (status/confirm/contradict)
 *
 * Errors throw with context (lib tier); the CLI turns them into exit codes.
 */

const fs = require('node:fs');
const path = require('node:path');

const {
  getDiaryPath,
  saveDiary,
  getProcessedLogPath,
  scanDiaries,
  determineReflectStrategy,
  updateProcessedLog,
} = require('./session-utils');
const { getDiaryDraftPath, sanitizeFilename } = require('./utils');
const { saveReflectionRecord, saveRecallRecord } = require('./operation-record-writer');

/**
 * Minimum unprocessed diaries before reflection is worth offering. Owned here
 * because both the CLI (`learn reflect scan`) and the SessionEnd hook's
 * reflect-ready nudge must agree on one number.
 */
const REFLECT_READY_MIN_DIARIES = 3;

function requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} must be a non-empty string (got ${JSON.stringify(value)})`);
  }
  return value;
}

/**
 * Validate the {project, date, session} triple that keys every diary file.
 *
 * Each part becomes exactly one path segment, so each must survive
 * `sanitizeFilename` — a `project` of `../../etc` would otherwise write outside
 * the diaries root. The underlying path helpers sanitize the session id only.
 */
function requireDiaryKey({ project, date, session }) {
  for (const [name, value] of [
    ['project', project],
    ['date', date],
    ['session', session],
  ]) {
    requireString(value, name);
    try {
      sanitizeFilename(value);
    } catch (err) {
      throw new Error(`${name} is not a valid path segment: ${err.message}`);
    }
  }
}

// ─────────────────────────────────────────────
// Diary
// ─────────────────────────────────────────────

/**
 * Resolve a diary path without hardcoding the storage layout in a caller.
 * @param {{project: string, date: string, session: string, draft?: boolean}} opts
 * @returns {string} absolute path to the final diary, or its draft
 */
function resolveDiaryPath({ project, date, session, draft = false }) {
  requireDiaryKey({ project, date, session });
  return draft ? getDiaryDraftPath(project, date, session) : getDiaryPath(project, date, session);
}

/**
 * Write a diary entry, creating parent directories as needed.
 * @returns {{path: string}}
 */
function writeDiary({ project, date, session, content }) {
  requireDiaryKey({ project, date, session });
  requireString(content, 'content');

  const filePath = getDiaryPath(project, date, session);
  if (!saveDiary(filePath, content)) {
    throw new Error(`Failed to write diary to ${filePath}`);
  }
  return { path: filePath };
}

/**
 * Promote an auto-generated draft to the final diary path.
 *
 * A rename, deliberately not a merge: any enrichment must already be written
 * into the draft file. Renaming keeps the draft from surviving as an orphan
 * alongside a duplicate final entry.
 *
 * @returns {{path: string, draftPath: string}}
 */
function finalizeDiaryDraft({ project, date, session }) {
  requireDiaryKey({ project, date, session });

  const draftPath = getDiaryDraftPath(project, date, session);
  const finalPath = getDiaryPath(project, date, session);

  if (!fs.existsSync(draftPath)) {
    throw new Error(`No diary draft found at ${draftPath}`);
  }

  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  fs.renameSync(draftPath, finalPath);
  return { path: finalPath, draftPath };
}

// ─────────────────────────────────────────────
// Reflection
// ─────────────────────────────────────────────

/**
 * Pick the reflection strategy and the diaries it covers, in one call.
 *
 * Composing the two steps is deliberate: a caller that picks a strategy and
 * then scans with a different one silently reflects over the wrong set.
 *
 * @param {string} project
 * @returns {{project: string, strategy: string, count: number, diaries: string[], ready: boolean}}
 */
function scanForReflection(project) {
  requireString(project, 'project');

  const logPath = getProcessedLogPath(project);
  const strategy = determineReflectStrategy(project, logPath);
  const diaries = scanDiaries(project, strategy, logPath);

  return {
    project,
    strategy,
    count: diaries.length,
    diaries,
    ready: diaries.length >= REFLECT_READY_MIN_DIARIES,
  };
}

/**
 * Whether enough unprocessed diaries have accumulated to offer a reflection.
 * Used by the SessionEnd hook's reflect-ready pending action.
 * @returns {{ready: boolean, strategy: string, count: number}}
 */
function checkReflectReady(project) {
  const { ready, strategy, count } = scanForReflection(project);
  return { ready, strategy, count };
}

/**
 * Close out a reflection: mark its diaries processed AND write the operation
 * record the curator reads as evidence.
 *
 * Both halves in one call because they are the same fact recorded twice — a
 * reflection that updates the log but writes no record is invisible to the
 * curator, and one that writes a record without updating the log re-analyzes
 * the same diaries next time.
 *
 * @param {object} opts
 * @param {string} opts.project
 * @param {string} opts.reflectId      — MUST start with `reflect-`
 * @param {string[]} [opts.diaries]    — diary filenames this reflection consumed
 * @param {string} [opts.reflection]   — reflection filename recorded in processed.log
 * @param {string} [opts.summary]
 * @param {string} [opts.session]
 * @param {string} [opts.projectId]
 * @param {string} [opts.homeDir]      — test seam; defaults to the real home
 * @param {string} [opts.createdAt]
 * @returns {{reflectId: string, project: string, diaryCount: number, processedLog: string|null}}
 */
function recordReflection({
  project,
  reflectId,
  diaries = [],
  reflection,
  summary = '',
  session = '',
  projectId = '',
  homeDir,
  createdAt,
}) {
  requireString(project, 'project');
  requireString(reflectId, 'reflectId');
  if (!Array.isArray(diaries)) {
    throw new Error(`diaries must be an array (got ${JSON.stringify(diaries)})`);
  }

  let processedLog = null;
  if (reflection && diaries.length > 0) {
    processedLog = getProcessedLogPath(project);
    updateProcessedLog(processedLog, diaries, reflection);
  }

  saveReflectionRecord({
    reflect_id: reflectId,
    project,
    project_id: projectId,
    session,
    created_at: createdAt || new Date().toISOString(),
    source_diary_ids: diaries,
    summary,
    homeDir,
  });

  return { reflectId, project, diaryCount: diaries.length, processedLog };
}

// ─────────────────────────────────────────────
// Recall
// ─────────────────────────────────────────────

/**
 * Write the operation record for a manual recall, so the curator has evidence
 * the recall happened.
 *
 * @param {object} opts
 * @param {string} opts.project
 * @param {string} opts.recallId       — MUST start with `recall-`
 * @param {string} [opts.query]
 * @param {string[]} [opts.instinctIds]
 * @param {string} [opts.summary]
 * @param {string} [opts.session]
 * @param {string} [opts.projectId]
 * @param {string} [opts.homeDir]      — test seam; defaults to the real home
 * @param {string} [opts.createdAt]
 * @returns {{recallId: string, project: string, instinctCount: number}}
 */
function recordRecall({
  project,
  recallId,
  query = '',
  instinctIds = [],
  summary = '',
  session = '',
  projectId = '',
  homeDir,
  createdAt,
}) {
  requireString(project, 'project');
  requireString(recallId, 'recallId');
  if (!Array.isArray(instinctIds)) {
    throw new Error(`instinctIds must be an array (got ${JSON.stringify(instinctIds)})`);
  }

  saveRecallRecord({
    recall_id: recallId,
    project,
    project_id: projectId,
    session,
    created_at: createdAt || new Date().toISOString(),
    recall_query: query,
    returned_instinct_ids: instinctIds,
    summary,
    homeDir,
  });

  return { recallId, project, instinctCount: instinctIds.length };
}

module.exports = {
  REFLECT_READY_MIN_DIARIES,
  // Diary
  resolveDiaryPath,
  writeDiary,
  finalizeDiaryDraft,
  // Reflection
  scanForReflection,
  checkReflectReady,
  recordReflection,
  // Recall
  recordRecall,
};
