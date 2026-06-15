const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { readJsonFile, writeJsonFile } = require('./utils');
const { renderDraft } = require('./learning-drafts');

const VALID_SCOPES = new Set(['project', 'global']);
const VALID_STATUSES = new Set(['pending', 'approved', 'rejected', 'materialized', 'activated']);
const VALID_ARTIFACT_TYPES = new Set([
  'skill',
  'instinct',
  'command',
  'agent',
  'eval',
  'repo_convention_patch',
]);
// Artifact types that are draft-only — materialization writes a draft, but
// activation must remain a manual review step (e.g., a patch against AGENTS.md
// or another shared file). Activation refuses these explicitly.
const DRAFT_ONLY_ARTIFACT_TYPES = new Set(['repo_convention_patch']);
const REQUIRED_CANDIDATE_FIELDS = [
  'id',
  'scope',
  'artifact_type',
  'name',
  'summary',
  'trigger',
  'evidence',
  'confidence',
  'status',
  'created_at',
  'updated_at',
];

function homePath(homeDir) {
  return homeDir || os.homedir();
}

function getProjectId(projectRoot = process.cwd()) {
  return crypto.createHash('sha256').update(path.resolve(projectRoot)).digest('hex').slice(0, 16);
}

function assertScope(scope) {
  if (!VALID_SCOPES.has(scope)) {
    throw new Error(`scope must be one of: ${[...VALID_SCOPES].join(', ')}`);
  }
}

function getLearningConfigPath({ scope, projectRoot = process.cwd(), homeDir } = {}) {
  assertScope(scope);
  if (scope === 'global')
    return path.join(homePath(homeDir), '.arcforge', 'learning', 'config.json');
  return path.join(projectRoot, '.arcforge', 'learning', 'config.json');
}

function getCandidateQueuePath({ scope, projectRoot = process.cwd(), homeDir } = {}) {
  assertScope(scope);
  const base =
    scope === 'global'
      ? path.join(homePath(homeDir), '.arcforge', 'learning')
      : path.join(projectRoot, '.arcforge', 'learning');
  return path.join(base, 'candidates', 'queue.jsonl');
}

function getObservationPath({ projectRoot = process.cwd(), homeDir } = {}) {
  return path.join(
    homePath(homeDir),
    '.arcforge',
    'observations',
    path.basename(projectRoot),
    'observations.jsonl',
  );
}

function defaultScopeConfig(scope) {
  return { scope, enabled: false };
}

function readScopeConfig({ scope, projectRoot = process.cwd(), homeDir } = {}) {
  const raw = readJsonFile(getLearningConfigPath({ scope, projectRoot, homeDir }), null);
  if (!raw || typeof raw !== 'object') return defaultScopeConfig(scope);
  return { ...defaultScopeConfig(scope), ...raw, scope, enabled: raw.enabled === true };
}

function readLearningConfig({ projectRoot = process.cwd(), homeDir } = {}) {
  return {
    project: readScopeConfig({ scope: 'project', projectRoot, homeDir }),
    global: readScopeConfig({ scope: 'global', projectRoot, homeDir }),
  };
}

function isLearningEnabled({ scope = 'project', projectRoot = process.cwd(), homeDir } = {}) {
  return readScopeConfig({ scope, projectRoot, homeDir }).enabled === true;
}

/**
 * Kill-switch for SessionStart injection of activated instincts (ICL-4).
 *
 * DEFAULT ON: injection happens unless `inject_activated_instincts` is set to
 * the literal `false` in the global learning config. Any other value (absent,
 * true, missing config file) leaves injection enabled. The switch is read from
 * the global-scope config because activated-instinct injection is a HOME-global
 * behavior, not project-scoped.
 *
 * @returns {boolean} true when injection is enabled
 */
function isInjectActivatedInstinctsEnabled({ homeDir } = {}) {
  const config = readJsonFile(getLearningConfigPath({ scope: 'global', homeDir }), null);
  if (config && config.inject_activated_instincts === false) return false;
  return true;
}

function setLearningEnabled({
  scope = 'project',
  enabled,
  projectRoot = process.cwd(),
  homeDir,
  now = new Date().toISOString(),
} = {}) {
  assertScope(scope);
  const config = { scope, enabled: enabled === true, updated_at: now };
  writeJsonFile(getLearningConfigPath({ scope, projectRoot, homeDir }), config);
  return config;
}

function validateCandidate(candidate) {
  const errors = [];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { ok: false, errors: ['candidate must be an object'] };
  }

  for (const field of REQUIRED_CANDIDATE_FIELDS) {
    if (!(field in candidate)) errors.push(`missing required field: ${field}`);
  }

  if ('scope' in candidate && !VALID_SCOPES.has(candidate.scope)) {
    errors.push('scope must be project or global');
  }
  if ('status' in candidate && !VALID_STATUSES.has(candidate.status)) {
    errors.push(`status must be one of: ${[...VALID_STATUSES].join(', ')}`);
  }
  if ('artifact_type' in candidate && !VALID_ARTIFACT_TYPES.has(candidate.artifact_type)) {
    errors.push(`artifact_type must be one of: ${[...VALID_ARTIFACT_TYPES].join(', ')}`);
  }
  if (!Array.isArray(candidate.evidence) || candidate.evidence.length === 0) {
    errors.push('evidence must contain at least one item');
  } else {
    candidate.evidence.forEach((item, index) => {
      if (!item || typeof item !== 'object' || Object.getPrototypeOf(item) !== Object.prototype) {
        errors.push(`evidence[${index}] must be a plain object`);
        return;
      }
      const allowedFields = new Set(['session_id', 'source', 'reason']);
      for (const field of Object.keys(item)) {
        if (!allowedFields.has(field)) {
          errors.push(`evidence[${index}] contains unsupported field: ${field}`);
        }
      }
      for (const field of allowedFields) {
        const value = item[field];
        if (typeof value !== 'string' || value.trim() === '') {
          errors.push(`evidence[${index}].${field} must be a non-empty string`);
        }
      }
    });
  }
  if (
    typeof candidate.confidence !== 'number' ||
    candidate.confidence < 0 ||
    candidate.confidence > 1
  ) {
    errors.push('confidence must be a number between 0 and 1');
  }

  return { ok: errors.length === 0, errors };
}

function appendJsonLine(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

function appendCandidate(
  candidate,
  { scope = candidate?.scope || 'project', projectRoot = process.cwd(), homeDir } = {},
) {
  assertScope(scope);
  const record = { ...candidate, scope };
  const validation = validateCandidate(record);
  if (!validation.ok) {
    throw new Error(`invalid candidate: ${validation.errors.join('; ')}`);
  }
  const queuePath = getCandidateQueuePath({ scope, projectRoot, homeDir });
  const existing = loadCandidates({ scope, projectRoot, homeDir }).find(
    (candidate) =>
      candidate.id === record.id ||
      (record.pattern_key &&
        candidate.scope === record.scope &&
        candidate.pattern_key === record.pattern_key),
  );
  if (existing) {
    return { path: queuePath, candidate: existing, duplicate: true };
  }
  appendJsonLine(queuePath, record);
  return { path: queuePath, candidate: record, duplicate: false };
}

function loadCandidates({ scope = 'project', projectRoot = process.cwd(), homeDir } = {}) {
  assertScope(scope);
  const queuePath = getCandidateQueuePath({ scope, projectRoot, homeDir });
  if (!fs.existsSync(queuePath)) return [];
  return fs
    .readFileSync(queuePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function rewriteCandidates(
  candidates,
  { scope = 'project', projectRoot = process.cwd(), homeDir } = {},
) {
  const queuePath = getCandidateQueuePath({ scope, projectRoot, homeDir });
  fs.mkdirSync(path.dirname(queuePath), { recursive: true });
  const content =
    candidates.length > 0 ? `${candidates.map((c) => JSON.stringify(c)).join('\n')}\n` : '';
  fs.writeFileSync(queuePath, content, 'utf8');
  return queuePath;
}

function transitionCandidate(
  id,
  status,
  { scope = 'project', projectRoot = process.cwd(), homeDir, now = new Date().toISOString() } = {},
) {
  if (!VALID_STATUSES.has(status) || status === 'pending' || status === 'activated') {
    throw new Error('status transition must be approved, rejected, or materialized');
  }
  const candidates = loadCandidates({ scope, projectRoot, homeDir });
  const index = candidates.findIndex((candidate) => candidate.id === id);
  if (index === -1) throw new Error(`candidate not found: ${id}`);

  const updated = { ...candidates[index], status, updated_at: now };
  if (status === 'materialized') {
    assertCanMaterialize(candidates[index]);
  }
  const validation = validateCandidate(updated);
  if (!validation.ok) {
    throw new Error(`invalid candidate: ${validation.errors.join('; ')}`);
  }
  candidates[index] = updated;
  rewriteCandidates(candidates, { scope, projectRoot, homeDir });
  return updated;
}

function assertCanMaterialize(candidate) {
  if (candidate?.status !== 'approved') {
    throw new Error('candidate must be approved before materialization');
  }
  return true;
}

function skillTestName(skillName) {
  return `test_skill_${skillName.replace(/-/g, '_')}.py`;
}

function assertSafeSkillName(name) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name || '')) {
    throw new Error('candidate skill name must be lowercase kebab-case');
  }
}

function assertSafeArtifactName(name) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name || '')) {
    throw new Error('candidate name must be lowercase kebab-case');
  }
}

// Path mapping per artifact type. Draft paths must be relative, normalized
// (no `..`), and stay under the intended directory. Active paths drop the
// `.draft` suffix. Skill is intentionally a special case (two files).
const ARTIFACT_PATHS = {
  skill: (name) => ({
    draft: [
      path.join('skills', name, 'SKILL.md.draft'),
      path.join('tests', 'skills', `${skillTestName(name)}.draft`),
    ],
    active: [
      path.join('skills', name, 'SKILL.md'),
      path.join('tests', 'skills', skillTestName(name)),
    ],
  }),
  instinct: (name) => ({
    draft: [path.join('.arcforge', 'learning', 'instincts', `${name}.md.draft`)],
    active: [path.join('.arcforge', 'learning', 'instincts', `${name}.md`)],
  }),
  command: (name) => ({
    draft: [path.join('commands', `${name}.md.draft`)],
    active: [path.join('commands', `${name}.md`)],
  }),
  agent: (name) => ({
    draft: [path.join('agents', `${name}.md.draft`)],
    active: [path.join('agents', `${name}.md`)],
  }),
  eval: (name) => ({
    draft: [path.join('evals', name, 'EVAL.md.draft')],
    active: [path.join('evals', name, 'EVAL.md')],
  }),
  repo_convention_patch: (name) => ({
    // Draft only — activation refuses for this type.
    draft: [path.join('.arcforge', 'learning', 'patches', `${name}.patch.draft`)],
    active: [],
  }),
};

function ensureArtifactType(candidate) {
  if (!VALID_ARTIFACT_TYPES.has(candidate.artifact_type)) {
    throw new Error(`unsupported artifact_type: ${candidate.artifact_type}`);
  }
  if (candidate.artifact_type === 'skill') {
    assertSafeSkillName(candidate.name);
  } else {
    assertSafeArtifactName(candidate.name);
  }
}

function assertNormalizedRelativePath(relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    throw new Error('artifact path must be a non-empty string');
  }
  if (path.isAbsolute(relativePath)) {
    throw new Error(`artifact path must be relative: ${relativePath}`);
  }
  const normalized = path.normalize(relativePath);
  if (normalized !== relativePath) {
    throw new Error(`artifact path is not normalized: ${relativePath}`);
  }
  if (normalized.split(path.sep).includes('..')) {
    throw new Error(`artifact path may not traverse parent directories: ${relativePath}`);
  }
}

function getDraftArtifactPaths(candidate) {
  ensureArtifactType(candidate);
  const paths = ARTIFACT_PATHS[candidate.artifact_type](candidate.name).draft;
  paths.forEach(assertNormalizedRelativePath);
  return paths;
}

function getActiveArtifactPaths(candidate) {
  ensureArtifactType(candidate);
  const paths = ARTIFACT_PATHS[candidate.artifact_type](candidate.name).active;
  paths.forEach(assertNormalizedRelativePath);
  return paths;
}

function materializeCandidate(
  id,
  { scope = 'project', projectRoot = process.cwd(), homeDir, now = new Date().toISOString() } = {},
) {
  assertScope(scope);
  if (scope !== 'project') {
    throw new Error('only project candidate materialization is supported');
  }
  const candidates = loadCandidates({ scope, projectRoot, homeDir });
  const index = candidates.findIndex((candidate) => candidate.id === id);
  if (index === -1) throw new Error(`candidate not found: ${id}`);

  const candidate = candidates[index];
  const validation = validateCandidate(candidate);
  if (!validation.ok) {
    throw new Error(`invalid candidate: ${validation.errors.join('; ')}`);
  }
  if (candidate.scope !== scope) {
    throw new Error('candidate scope must match requested materialization scope');
  }
  assertCanMaterialize(candidate);
  const draftPaths = getDraftArtifactPaths(candidate);
  const draftAbsPaths = draftPaths.map((relativePath) => path.join(projectRoot, relativePath));
  const draftBodies = renderDraft(candidate);
  if (draftBodies.length !== draftAbsPaths.length) {
    throw new Error('internal error: draft renderer produced mismatched body count');
  }

  const existingDrafts = draftAbsPaths.filter((p) => fs.existsSync(p));
  if (existingDrafts.length > 0) {
    throw new Error(
      `cannot materialize: draft artifact already exists: ${existingDrafts.map((p) => path.relative(projectRoot, p)).join(', ')}`,
    );
  }

  const updated = {
    ...candidate,
    status: 'materialized',
    draft_paths: draftPaths,
    updated_at: now,
  };
  candidates[index] = updated;
  rewriteCandidates(candidates, { scope, projectRoot, homeDir });

  const writtenDrafts = [];
  try {
    for (let i = 0; i < draftAbsPaths.length; i++) {
      fs.mkdirSync(path.dirname(draftAbsPaths[i]), { recursive: true });
      fs.writeFileSync(draftAbsPaths[i], draftBodies[i], { encoding: 'utf8', flag: 'wx' });
      writtenDrafts.push(draftAbsPaths[i]);
    }
  } catch (err) {
    for (const p of writtenDrafts.reverse()) {
      try {
        fs.unlinkSync(p);
      } catch {
        // Best-effort cleanup; surface the original failure.
      }
    }
    const latest = loadCandidates({ scope, projectRoot, homeDir });
    const latestIndex = latest.findIndex((c) => c.id === id);
    if (latestIndex !== -1 && latest[latestIndex].status === 'materialized') {
      latest[latestIndex] = candidate;
      rewriteCandidates(latest, { scope, projectRoot, homeDir });
    }
    throw err;
  }

  return { scope, candidate: updated, draft_paths: draftPaths };
}

function assertRecordedDraftPaths(candidate, expectedDraftPaths) {
  if (!Array.isArray(candidate.draft_paths)) {
    throw new Error('candidate draft paths must match materialized artifacts');
  }
  if (
    candidate.draft_paths.length !== expectedDraftPaths.length ||
    expectedDraftPaths.some((draftPath, index) => candidate.draft_paths[index] !== draftPath)
  ) {
    throw new Error('candidate draft paths must match materialized artifacts');
  }
}

function activateCandidate(
  id,
  { scope = 'project', projectRoot = process.cwd(), homeDir, now = new Date().toISOString() } = {},
) {
  assertScope(scope);
  if (scope !== 'project') {
    throw new Error('only project candidate activation is supported');
  }
  const candidates = loadCandidates({ scope, projectRoot, homeDir });
  const index = candidates.findIndex((candidate) => candidate.id === id);
  if (index === -1) throw new Error(`candidate not found: ${id}`);

  const candidate = candidates[index];
  const validation = validateCandidate(candidate);
  if (!validation.ok) {
    throw new Error(`invalid candidate: ${validation.errors.join('; ')}`);
  }
  if (candidate.scope !== scope) {
    throw new Error('candidate scope must match requested activation scope');
  }
  if (candidate.status !== 'materialized') {
    throw new Error('candidate must be materialized before activation');
  }
  if (DRAFT_ONLY_ARTIFACT_TYPES.has(candidate.artifact_type)) {
    throw new Error(
      `${candidate.artifact_type} candidates are draft-only — review and apply the draft manually; automatic activation is refused`,
    );
  }

  const draftRelPaths = getDraftArtifactPaths(candidate);
  assertRecordedDraftPaths(candidate, draftRelPaths);
  const activeRelPaths = getActiveArtifactPaths(candidate);
  if (activeRelPaths.length === 0) {
    throw new Error(
      `no active artifact paths defined for artifact_type: ${candidate.artifact_type}`,
    );
  }
  const draftAbsPaths = draftRelPaths.map((rel) => path.join(projectRoot, rel));
  const activeAbsPaths = activeRelPaths.map((rel) => path.join(projectRoot, rel));

  const missingDrafts = draftAbsPaths.filter((p) => !fs.existsSync(p));
  if (missingDrafts.length > 0) {
    throw new Error(
      `cannot activate: draft artifact missing: ${missingDrafts.map((p) => path.relative(projectRoot, p)).join(', ')}`,
    );
  }

  const conflicting = activeAbsPaths.filter((p) => fs.existsSync(p));
  if (conflicting.length > 0) {
    throw new Error(
      `cannot activate: active artifact already exists: ${conflicting.map((p) => path.relative(projectRoot, p)).join(', ')}`,
    );
  }

  for (let i = 0; i < draftAbsPaths.length; i++) {
    fs.mkdirSync(path.dirname(activeAbsPaths[i]), { recursive: true });
    fs.renameSync(draftAbsPaths[i], activeAbsPaths[i]);
  }

  const updated = {
    ...candidate,
    status: 'activated',
    active_paths: activeRelPaths,
    activated_at: now,
    updated_at: now,
  };
  candidates[index] = updated;
  rewriteCandidates(candidates, { scope, projectRoot, homeDir });
  return { scope, candidate: updated, active_paths: activeRelPaths };
}

function nextActionsFor(candidate) {
  switch (candidate.status) {
    case 'pending':
      return ['approve or reject this candidate before any artifact is written'];
    case 'approved':
      return ['materialize the candidate to write inactive draft artifacts'];
    case 'materialized':
      if (DRAFT_ONLY_ARTIFACT_TYPES.has(candidate.artifact_type)) {
        return [
          'review the draft proposal at draft_paths',
          'apply manually after review; automatic activation is refused for this artifact type',
        ];
      }
      return [
        'review the draft artifacts at draft_paths',
        'activate explicitly when satisfied to promote drafts to active artifacts',
      ];
    case 'activated':
      return ['already active — no further action required'];
    case 'rejected':
      return ['rejected — no action available; create a new candidate if needed'];
    default:
      return [];
  }
}

function safeArtifactPaths(candidate, getter) {
  try {
    return getter(candidate);
  } catch {
    return null;
  }
}

function reviewEvidence(evidence) {
  return evidence.map((item) => ({
    session_id: item.session_id,
    source: item.source,
    reason: item.reason,
  }));
}

function reviewCandidate(candidate) {
  return {
    id: candidate.id,
    scope: candidate.scope,
    artifact_type: candidate.artifact_type,
    name: candidate.name,
    summary: candidate.summary,
    trigger: candidate.trigger,
    evidence: reviewEvidence(candidate.evidence),
    confidence: candidate.confidence,
    status: candidate.status,
    created_at: candidate.created_at,
    updated_at: candidate.updated_at,
    ...(candidate.materialized_at ? { materialized_at: candidate.materialized_at } : {}),
    ...(candidate.activated_at ? { activated_at: candidate.activated_at } : {}),
  };
}

function inspectCandidate(id, { scope, projectRoot = process.cwd(), homeDir } = {}) {
  assertScope(scope);
  const candidates = loadCandidates({ scope, projectRoot, homeDir });
  const found = candidates.find((c) => c.id === id);
  if (!found) throw new Error(`candidate not found: ${id}`);

  const validation = validateCandidate(found);
  if (!validation.ok) {
    throw new Error(`invalid candidate: ${validation.errors.join('; ')}`);
  }
  if (found.scope !== scope) {
    throw new Error('candidate scope must match requested inspection scope');
  }

  const draftRel = safeArtifactPaths(found, getDraftArtifactPaths);
  const activeRel = safeArtifactPaths(found, getActiveArtifactPaths);
  const toEntry = (relativePath) => ({
    path: relativePath,
    exists: fs.existsSync(path.join(projectRoot, relativePath)),
  });

  const artifacts = {};
  if (scope === 'project') {
    if (draftRel) artifacts.draft_paths = draftRel.map(toEntry);
    if (activeRel) artifacts.active_paths = activeRel.map(toEntry);
  }

  return {
    scope,
    candidate: reviewCandidate(found),
    next_actions: nextActionsFor(found),
    artifacts,
  };
}

function listMaterializedDrafts({ scope, projectRoot = process.cwd(), homeDir } = {}) {
  assertScope(scope);
  const candidates = loadCandidates({ scope, projectRoot, homeDir });
  const drafts = candidates
    .filter((c) => c.status === 'materialized' && c.scope === scope)
    .map((c) => inspectCandidate(c.id, { scope, projectRoot, homeDir }));
  return { scope, count: drafts.length, drafts };
}

function commandScopeFlag(scope) {
  return scope === 'global' ? '--global' : '--project';
}

function nextCommandFor(candidate) {
  const base = 'arc learn';
  const scopeFlag = commandScopeFlag(candidate.scope);
  if (candidate.scope === 'global' && candidate.status !== 'pending') {
    return `${base} inspect ${candidate.id} ${scopeFlag}`;
  }
  switch (candidate.status) {
    case 'pending':
      return `${base} approve ${candidate.id} ${scopeFlag}`;
    case 'approved':
      return `${base} materialize ${candidate.id} ${scopeFlag}`;
    case 'materialized':
      if (DRAFT_ONLY_ARTIFACT_TYPES.has(candidate.artifact_type)) {
        return `${base} inspect ${candidate.id} ${scopeFlag}`;
      }
      return `${base} activate ${candidate.id} ${scopeFlag}`;
    case 'activated':
    case 'rejected':
      return `${base} inspect ${candidate.id} ${scopeFlag}`;
    default:
      return `${base} inspect ${candidate.id} ${scopeFlag}`;
  }
}

function inboxStatusRank(status) {
  return (
    {
      approved: 0,
      pending: 1,
      materialized: 2,
      activated: 3,
      rejected: 4,
    }[status] ?? 99
  );
}

function listLearningInbox({ scope, projectRoot = process.cwd(), homeDir } = {}) {
  assertScope(scope);
  const candidates = loadCandidates({ scope, projectRoot, homeDir }).filter(
    (c) => c.scope === scope,
  );
  const counts = {};
  const groups = { by_status: {}, by_artifact_type: {} };

  for (const candidate of candidates) {
    counts[candidate.status] = (counts[candidate.status] || 0) + 1;
    if (!groups.by_status[candidate.status]) groups.by_status[candidate.status] = [];
    groups.by_status[candidate.status].push(candidate.id);
    if (!groups.by_artifact_type[candidate.artifact_type]) {
      groups.by_artifact_type[candidate.artifact_type] = [];
    }
    groups.by_artifact_type[candidate.artifact_type].push(candidate.id);
  }

  const compactCandidates = candidates
    .slice()
    .sort((a, b) => {
      const rank = inboxStatusRank(a.status) - inboxStatusRank(b.status);
      if (rank !== 0) return rank;
      const confidence = (b.confidence || 0) - (a.confidence || 0);
      if (confidence !== 0) return confidence;
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    })
    .map((candidate) => ({
      id: candidate.id,
      scope: candidate.scope,
      artifact_type: candidate.artifact_type,
      name: candidate.name,
      summary: candidate.summary,
      confidence: candidate.confidence,
      status: candidate.status,
      created_at: candidate.created_at,
      updated_at: candidate.updated_at,
      next_command: nextCommandFor(candidate),
      next_actions: nextActionsFor(candidate),
    }));

  return { scope, count: candidates.length, counts, groups, candidates: compactCandidates };
}

function acceptCandidate(
  id,
  { scope = 'project', projectRoot = process.cwd(), homeDir, now = new Date().toISOString() } = {},
) {
  assertScope(scope);
  if (scope !== 'project') {
    throw new Error('only project candidate accept flow is supported');
  }
  const candidates = loadCandidates({ scope, projectRoot, homeDir });
  const candidate = candidates.find((c) => c.id === id);
  if (!candidate) throw new Error(`candidate not found: ${id}`);
  if (candidate.scope !== scope) {
    throw new Error('candidate scope must match requested accept scope');
  }
  if (candidate.status === 'pending') {
    transitionCandidate(id, 'approved', { scope, projectRoot, homeDir, now });
    try {
      return materializeCandidate(id, { scope, projectRoot, homeDir, now });
    } catch (err) {
      const latest = loadCandidates({ scope, projectRoot, homeDir });
      const latestIndex = latest.findIndex((c) => c.id === id);
      if (latestIndex !== -1 && latest[latestIndex].status === 'approved') {
        latest[latestIndex] = candidate;
        rewriteCandidates(latest, { scope, projectRoot, homeDir });
      }
      throw err;
    }
  }
  if (candidate.status === 'approved') {
    return materializeCandidate(id, { scope, projectRoot, homeDir, now });
  }
  if (candidate.status === 'materialized') {
    return { scope, candidate, draft_paths: candidate.draft_paths || [] };
  }
  throw new Error('candidate must be pending, approved, or materialized to accept');
}

module.exports = {
  REQUIRED_CANDIDATE_FIELDS,
  VALID_SCOPES,
  VALID_STATUSES,
  VALID_ARTIFACT_TYPES,
  DRAFT_ONLY_ARTIFACT_TYPES,
  acceptCandidate,
  activateCandidate,
  appendCandidate,
  assertCanMaterialize,
  getCandidateQueuePath,
  getLearningConfigPath,
  getObservationPath,
  getProjectId,
  inspectCandidate,
  isLearningEnabled,
  isInjectActivatedInstinctsEnabled,
  listLearningInbox,
  listMaterializedDrafts,
  loadCandidates,
  materializeCandidate,
  readLearningConfig,
  setLearningEnabled,
  transitionCandidate,
  validateCandidate,
};
