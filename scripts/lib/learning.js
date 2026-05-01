const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const VALID_SCOPES = new Set(['project', 'global']);
const VALID_STATUSES = new Set(['pending', 'approved', 'rejected', 'materialized']);
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

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
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

function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
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
  if (!Array.isArray(candidate.evidence) || candidate.evidence.length === 0) {
    errors.push('evidence must contain at least one item');
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
    (candidate) => candidate.id === record.id,
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
  if (!VALID_STATUSES.has(status) || status === 'pending') {
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

function readJsonLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function releaseSignalScore(observation) {
  const text = `${observation.input || ''}\n${observation.output || ''}`.toLowerCase();
  let score = 0;
  if (/\b(release|ship|cut a release|prepare release)\b|發版/.test(text)) score += 2;
  if (/\b(changelog|release notes?)\b/.test(text)) score += 1;
  if (/\b(version|npm version|bump)\b/.test(text)) score += 1;
  if (/\b(git tag|tag v?\d|tag and push)\b/.test(text)) score += 1;
  if (/\b(npm test|npm run test|full tests?|npm run lint|preflight)\b/.test(text)) score += 1;
  if (/\b(push|handoff|pr preparation)\b/.test(text)) score += 1;
  return score;
}

function releaseReason(observation) {
  const parts = [];
  const text = `${observation.input || ''}\n${observation.output || ''}`.toLowerCase();
  if (/\b(release|ship|cut a release|prepare release)\b|發版/.test(text))
    parts.push('release request');
  if (/\b(changelog|release notes?)\b/.test(text)) parts.push('changelog or release notes');
  if (/\b(version|npm version|bump)\b/.test(text)) parts.push('version bump');
  if (/\b(git tag|tag v?\d|tag and push)\b/.test(text)) parts.push('tagging');
  if (/\b(npm test|npm run test|full tests?|npm run lint|preflight)\b/.test(text)) {
    parts.push('tests or lint');
  }
  if (/\b(push|handoff|pr preparation)\b/.test(text)) parts.push('push or handoff');
  return parts.join(', ');
}

function buildReleaseCandidate(observations, { scope, now }) {
  const date = now.slice(0, 10).replace(/-/g, '');
  const evidence = observations.map((observation) => ({
    session_id: observation.session || 'unknown',
    source: 'observation',
    reason: releaseReason(observation),
  }));
  return {
    id: `arc-releasing-${date}-001`,
    scope,
    artifact_type: 'skill',
    name: 'arc-releasing',
    summary: 'Project release flow repeated across multiple sessions.',
    trigger: 'when the user asks to cut, ship, bump, prepare, or complete a release',
    evidence,
    confidence: 0.72,
    status: 'pending',
    created_at: now,
    updated_at: now,
  };
}

function analyzeLearning({
  scope = 'project',
  projectRoot = process.cwd(),
  homeDir,
  now = new Date().toISOString(),
} = {}) {
  assertScope(scope);
  if (!isLearningEnabled({ scope, projectRoot, homeDir })) {
    return { scope, enabled: false, emitted: 0, candidates: [] };
  }
  if (scope !== 'project') {
    return { scope, enabled: true, emitted: 0, candidates: [] };
  }

  const observations = readJsonLines(getObservationPath({ projectRoot, homeDir }));
  const projectId = getProjectId(projectRoot);
  const existing = loadCandidates({ scope, projectRoot, homeDir }).find(
    (candidate) =>
      candidate.scope === scope &&
      candidate.artifact_type === 'skill' &&
      candidate.name === 'arc-releasing',
  );
  if (existing) {
    return { scope, enabled: true, emitted: 0, candidates: [existing] };
  }

  const releaseBySession = new Map();
  for (const observation of observations) {
    if (observation.project_id !== projectId) continue;
    if (releaseSignalScore(observation) < 2) continue;
    const session = observation.session || 'unknown';
    if (!releaseBySession.has(session)) releaseBySession.set(session, observation);
  }

  if (releaseBySession.size < 2) {
    return { scope, enabled: true, emitted: 0, candidates: [] };
  }

  const candidate = buildReleaseCandidate([...releaseBySession.values()], { scope, now });
  const written = appendCandidate(candidate, { scope, projectRoot, homeDir });
  return {
    scope,
    enabled: true,
    emitted: written.duplicate ? 0 : 1,
    candidates: [written.candidate],
  };
}

module.exports = {
  REQUIRED_CANDIDATE_FIELDS,
  VALID_SCOPES,
  VALID_STATUSES,
  appendCandidate,
  assertCanMaterialize,
  analyzeLearning,
  getCandidateQueuePath,
  getLearningConfigPath,
  getObservationPath,
  getProjectId,
  isLearningEnabled,
  loadCandidates,
  readLearningConfig,
  setLearningEnabled,
  transitionCandidate,
  validateCandidate,
};
