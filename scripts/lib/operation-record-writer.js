/**
 * operation-record-writer.js — Layer 3 operation record writer.
 *
 * Single helper for reflect/recall operation records. The records share
 * structure (frontmatter + markdown body, atomic write to a per-project dir)
 * and differ only in the field set the operation emits.
 *
 * Operation records are distinct from instinct files (instinct-writer.js):
 * they track that an arc-reflecting or arc-recalling session happened, not the learned
 * instincts themselves. Keeping the storage roots separate prevents
 * provenance loops with Layer 8 activated instincts.
 */

const path = require('node:path');
const os = require('node:os');

const { atomicWriteFile } = require('./utils');

// Map operation kind → directory name under ~/.arcforge/.
// reflect → reflections (not "reflects") matches the spec storage path.
const KIND_DIRS = { reflect: 'reflections', recall: 'recalls' };

// Filename prefix the curator batch-assembler matches on
// (^reflect-.*\.md$ / ^recall-.*\.md$ in learning-curator/batch-assembler.js).
// The id becomes `<id>.md`, so the id MUST carry this prefix or the assembler
// silently skips the record. Fail fast at the writer instead.
const KIND_ID_PREFIX = { reflect: 'reflect-', recall: 'recall-' };

/**
 * Serialize a YAML frontmatter list field, or emit `[]` when empty.
 * Note: relies on existing project convention (hand-rolled YAML, not js-yaml).
 * Callers should not pass values containing `\n` or unescaped `:` characters.
 */
function serializeListField(name, values) {
  if (!Array.isArray(values) || values.length === 0) return `${name}: []`;
  const items = values.map((v) => `  - ${v}`).join('\n');
  return `${name}:\n${items}`;
}

/**
 * Common writer used by saveReflectionRecord and saveRecallRecord.
 * @param {object} opts
 * @param {'reflect'|'recall'} opts.kind
 * @param {string} opts.id
 * @param {string} opts.project
 * @param {string} opts.project_id
 * @param {string} opts.session
 * @param {string} opts.created_at
 * @param {string} opts.source            — 'reflection' or 'manual'
 * @param {string} opts.summary
 * @param {Array<[string, string|string[]]>} opts.extraFields — kind-specific frontmatter
 *        Each entry is [fieldName, value]. Arrays render as YAML lists; strings as scalars.
 * @param {string} [opts.homeDir]         — test override
 */
function writeOperationRecord({
  kind,
  id,
  project,
  project_id,
  session,
  created_at,
  source,
  summary,
  extraFields = [],
  homeDir: homeOverride,
}) {
  if (typeof id !== 'string' || !id.trim()) {
    throw new Error(`writeOperationRecord: id must be a non-empty string`);
  }
  if (typeof project !== 'string' || !project.trim()) {
    throw new Error(`writeOperationRecord: project must be a non-empty string`);
  }

  const homeDir = homeOverride || os.homedir();
  const dirName = KIND_DIRS[kind];
  if (!dirName) throw new Error(`writeOperationRecord: unknown kind "${kind}"`);

  // Fail fast when the id lacks the prefix the curator batch-assembler matches
  // on — otherwise the record writes successfully but is invisible to the
  // assembler, a silent provenance gap (ICL-5).
  const prefix = KIND_ID_PREFIX[kind];
  if (!id.startsWith(prefix)) {
    throw new Error(
      `writeOperationRecord: ${kind} id must start with "${prefix}" so the curator ` +
        `batch-assembler can match it (got "${id}")`,
    );
  }

  const dir = path.join(homeDir, '.arcforge', dirName, project);
  const filePath = path.join(dir, `${id}.md`);

  const idFieldName = `${kind}_id`;
  const titleVerb = kind === 'reflect' ? 'Reflection' : 'Recall';

  const extraLines = extraFields.map(([name, value]) =>
    Array.isArray(value) ? serializeListField(name, value) : `${name}: ${value ?? ''}`,
  );

  const content = [
    '---',
    `${idFieldName}: ${id}`,
    `project: ${project}`,
    `project_id: ${project_id || ''}`,
    `session: ${session || ''}`,
    `created_at: ${created_at || new Date().toISOString()}`,
    `source: ${source}`,
    ...extraLines,
    '---',
    '',
    `# ${titleVerb}: ${id}`,
    '',
    summary || '',
    '',
  ].join('\n');

  atomicWriteFile(filePath, content);
}

/**
 * Write a reflection operation record to
 * ~/.arcforge/reflections/<project>/<reflect_id>.md.
 */
function saveReflectionRecord({
  reflect_id,
  project,
  project_id,
  session,
  created_at,
  source_diary_ids,
  summary,
  homeDir,
}) {
  writeOperationRecord({
    kind: 'reflect',
    id: reflect_id,
    project,
    project_id,
    session,
    created_at,
    source: 'reflection',
    summary,
    extraFields: [['source_diary_ids', source_diary_ids]],
    homeDir,
  });
}

/**
 * Write a recall operation record to
 * ~/.arcforge/recalls/<project>/<recall_id>.md.
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
  homeDir,
}) {
  writeOperationRecord({
    kind: 'recall',
    id: recall_id,
    project,
    project_id,
    session,
    created_at,
    source: 'manual',
    summary,
    extraFields: [
      ['recall_query', recall_query || ''],
      ['returned_instinct_ids', returned_instinct_ids],
    ],
    homeDir,
  });
}

module.exports = {
  writeOperationRecord,
  saveReflectionRecord,
  saveRecallRecord,
};
