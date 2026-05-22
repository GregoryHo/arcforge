/**
 * reflect-record-writer.js — Layer 3 reflection operation record writer.
 *
 * Exports:
 *   saveReflectionRecord(options) — write a reflection operation record to
 *     ~/.arcforge/reflections/<project>/<reflect_id>.md
 *
 * This is distinct from the instinct file written by instinct-writer.js.
 * Operation records track that a /reflect session happened; instinct files
 * record individual learned instincts. Keeping paths separate prevents
 * provenance loops with Layer 8 activated instincts.
 */

const path = require('node:path');
const os = require('node:os');

const { atomicWriteFile } = require('./utils');

/**
 * Write a reflection operation record.
 *
 * @param {object} options
 * @param {string} options.reflect_id    — record ID, e.g. reflect-<ISO date>-<8 hex>
 * @param {string} options.project       — project slug
 * @param {string} options.project_id    — stable project hash
 * @param {string} options.session       — session ID
 * @param {string} options.created_at    — ISO 8601 timestamp
 * @param {string[]} options.source_diary_ids — diary files scanned during reflect
 * @param {string} options.summary       — one-paragraph summary of the reflection
 * @param {string} [options.homeDir]     — override HOME (tests use this)
 */
function saveReflectionRecord({
  reflect_id,
  project,
  project_id,
  session,
  created_at,
  source_diary_ids,
  summary,
  homeDir: homeOverride,
}) {
  if (typeof reflect_id !== 'string' || !reflect_id.trim()) {
    throw new Error('saveReflectionRecord: reflect_id must be a non-empty string');
  }
  if (typeof project !== 'string' || !project.trim()) {
    throw new Error('saveReflectionRecord: project must be a non-empty string');
  }

  const homeDir = homeOverride || os.homedir();
  const dir = path.join(homeDir, '.arcforge', 'reflections', project);
  const filePath = path.join(dir, `${reflect_id}.md`);

  const diaryList = Array.isArray(source_diary_ids)
    ? source_diary_ids.map((d) => `  - ${d}`).join('\n')
    : '';

  const content = [
    '---',
    `reflect_id: ${reflect_id}`,
    `project: ${project}`,
    `project_id: ${project_id || ''}`,
    `session: ${session || ''}`,
    `created_at: ${created_at || new Date().toISOString()}`,
    `source: reflection`,
    diaryList ? `source_diary_ids:\n${diaryList}` : 'source_diary_ids: []',
    '---',
    '',
    `# Reflection: ${reflect_id}`,
    '',
    summary || '',
    '',
  ].join('\n');

  atomicWriteFile(filePath, content);
}

module.exports = { saveReflectionRecord };
