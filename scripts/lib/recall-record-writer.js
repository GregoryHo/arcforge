/**
 * recall-record-writer.js — Layer 3 recall operation record writer.
 *
 * Exports:
 *   saveRecallRecord(options) — write a recall operation record to
 *     ~/.arcforge/recalls/<project>/<recall_id>.md
 *
 * Recall is a query operation, not a candidate-proposing operation.
 * The record captures that a /recall query happened and what instincts
 * were returned. This is separate from instinct-writer.js to prevent
 * provenance loops with Layer 8 activated instincts.
 */

const path = require('node:path');
const os = require('node:os');

const { atomicWriteFile } = require('./utils');

/**
 * Write a recall operation record.
 *
 * @param {object} options
 * @param {string} options.recall_id              — record ID
 * @param {string} options.project                — project slug
 * @param {string} options.project_id             — stable project hash
 * @param {string} options.session                — session ID
 * @param {string} options.created_at             — ISO 8601 timestamp
 * @param {string} options.recall_query           — the query string used
 * @param {string[]} options.returned_instinct_ids — instinct IDs returned by the query
 * @param {string} options.summary                — one-paragraph summary of the recall
 * @param {string} [options.homeDir]              — override HOME (tests use this)
 */
function saveRecallRecord({
  recall_id,
  project,
  project_id,
  session,
  created_at,
  recall_query,
  returned_instinct_ids,
  summary,
  homeDir: homeOverride,
}) {
  if (typeof recall_id !== 'string' || !recall_id.trim()) {
    throw new Error('saveRecallRecord: recall_id must be a non-empty string');
  }
  if (typeof project !== 'string' || !project.trim()) {
    throw new Error('saveRecallRecord: project must be a non-empty string');
  }

  const homeDir = homeOverride || os.homedir();
  const dir = path.join(homeDir, '.arcforge', 'recalls', project);
  const filePath = path.join(dir, `${recall_id}.md`);

  const instinctList = Array.isArray(returned_instinct_ids)
    ? returned_instinct_ids.map((id) => `  - ${id}`).join('\n')
    : '';

  const content = [
    '---',
    `recall_id: ${recall_id}`,
    `project: ${project}`,
    `project_id: ${project_id || ''}`,
    `session: ${session || ''}`,
    `created_at: ${created_at || new Date().toISOString()}`,
    `source: manual`,
    `recall_query: ${recall_query || ''}`,
    instinctList ? `returned_instinct_ids:\n${instinctList}` : 'returned_instinct_ids: []',
    '---',
    '',
    `# Recall: ${recall_id}`,
    '',
    summary || '',
    '',
  ].join('\n');

  atomicWriteFile(filePath, content);
}

module.exports = { saveRecallRecord };
