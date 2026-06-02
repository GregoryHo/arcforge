const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { readJsonFile, writeJsonFile } = require('./utils');

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

function oneLine(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderSkillDraft(candidate) {
  const description = JSON.stringify(`Use when ${oneLine(candidate.trigger)}`);
  return `---
name: ${candidate.name}
description: ${description}
---

# ${candidate.name}

> Draft artifact only. This file is intentionally inactive until explicitly activated.

Generated from learning candidate: ${candidate.id}

## Trigger

${candidate.trigger}

## Summary

${candidate.summary}

## Workflow

1. Confirm the user's request matches the trigger.
2. Review the evidence below and adapt the learned behavior to the current task.
3. Apply the workflow only when it fits the active project context.
4. Verify the result with the strongest relevant project checks before reporting completion.

## Evidence

${candidate.evidence.map((item) => `- ${item.source}: ${item.reason} (${item.session_id})`).join('\n')}
`;
}

function renderSkillTestDraft(candidate) {
  const safeName = candidate.name.replace(/-/g, '_');
  return `from pathlib import Path


def test_${safeName}_draft_is_not_active():
    draft = Path(__file__).with_suffix(Path(__file__).suffix + ".draft")
    assert draft.name.endswith(".draft")


def test_${safeName}_draft_frontmatter_mentions_candidate():
    draft = Path(__file__).parents[2] / "skills" / "${candidate.name}" / "SKILL.md.draft"
    text = draft.read_text()
    assert "name: ${candidate.name}" in text
    assert "candidate: ${candidate.id}" in text or "${candidate.id}" in text
`;
}

function renderInstinctDraft(candidate) {
  return `---
name: ${candidate.name}
description: ${JSON.stringify(`Instinct learned from observation: ${oneLine(candidate.summary)}`)}
artifact_type: instinct
status: draft
---

# ${candidate.name}

> Draft instinct — inactive until explicitly activated.

Generated from learning candidate: ${candidate.id}

## Trigger

${candidate.trigger}

## Behavior

${candidate.summary}

## Evidence

${candidate.evidence.map((item) => `- ${item.source}: ${item.reason} (${item.session_id})`).join('\n')}
`;
}

function renderCommandDraft(candidate) {
  return `---
name: ${candidate.name}
description: ${JSON.stringify(`Use when ${oneLine(candidate.trigger)}`)}
artifact_type: command
status: draft
---

# /${candidate.name}

> Draft command — inactive until explicitly activated.

Generated from learning candidate: ${candidate.id}

## Trigger

${candidate.trigger}

## Behavior

${candidate.summary}

## Evidence

${candidate.evidence.map((item) => `- ${item.source}: ${item.reason} (${item.session_id})`).join('\n')}
`;
}

function renderAgentDraft(candidate) {
  return `---
name: ${candidate.name}
description: ${JSON.stringify(`Use when ${oneLine(candidate.trigger)}`)}
artifact_type: agent
status: draft
---

# ${candidate.name} agent

> Draft agent definition — inactive until explicitly activated.

Generated from learning candidate: ${candidate.id}

## Trigger

${candidate.trigger}

## Mission

${candidate.summary}

## Evidence

${candidate.evidence.map((item) => `- ${item.source}: ${item.reason} (${item.session_id})`).join('\n')}
`;
}

function renderEvalDraft(candidate) {
  return `---
name: ${candidate.name}
description: ${JSON.stringify(`Eval scaffold for ${oneLine(candidate.summary)}`)}
artifact_type: eval
status: draft
---

# ${candidate.name} eval

> Draft eval — inactive until explicitly activated.

Generated from learning candidate: ${candidate.id}

## Hypothesis

${candidate.summary}

## Trigger

${candidate.trigger}

## Evidence

${candidate.evidence.map((item) => `- ${item.source}: ${item.reason} (${item.session_id})`).join('\n')}
`;
}

function renderRepoConventionPatchDraft(candidate) {
  // Draft is a human-readable proposal, not an actual unified diff. Activation
  // is intentionally refused for this type — the user must apply it manually
  // after review.
  return `# Proposed repo convention patch (draft only — apply manually)

Candidate: ${candidate.id}
Target: ${candidate.target || 'AGENTS.md'}

## Trigger

${candidate.trigger}

## Proposed change

${candidate.summary}

## Evidence

${candidate.evidence.map((item) => `- ${item.source}: ${item.reason} (${item.session_id})`).join('\n')}
`;
}

function renderDraft(candidate) {
  switch (candidate.artifact_type) {
    case 'skill':
      return [renderSkillDraft(candidate), renderSkillTestDraft(candidate)];
    case 'instinct':
      return [renderInstinctDraft(candidate)];
    case 'command':
      return [renderCommandDraft(candidate)];
    case 'agent':
      return [renderAgentDraft(candidate)];
    case 'eval':
      return [renderEvalDraft(candidate)];
    case 'repo_convention_patch':
      return [renderRepoConventionPatchDraft(candidate)];
    default:
      throw new Error(`unsupported artifact_type: ${candidate.artifact_type}`);
  }
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

function listObservationFiles(observationPath) {
  const files = [];
  if (fs.existsSync(observationPath)) files.push(observationPath);

  const archiveDir = path.join(path.dirname(observationPath), 'archive');
  if (fs.existsSync(archiveDir)) {
    for (const entry of fs.readdirSync(archiveDir).sort()) {
      if (entry.endsWith('.jsonl')) files.push(path.join(archiveDir, entry));
    }
  }
  return files;
}

function readObservationFiles(observationPath) {
  return listObservationFiles(observationPath).flatMap((filePath) => readJsonLines(filePath));
}

function getObservationRoot({ homeDir } = {}) {
  return path.join(homePath(homeDir), '.arcforge', 'observations');
}

function normalizeToolName(tool) {
  return oneLine(tool || 'unknown') || 'unknown';
}

function toolSlugComponent(tool) {
  return (
    normalizeToolName(tool)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unknown'
  );
}

function toolDisplayName(tool) {
  const words = normalizeToolName(tool)
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9 ]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!words) return 'Unknown';
  return words
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function sequenceKey(tools) {
  return JSON.stringify(tools.map(toolSlugComponent));
}

function sequenceSlug(tools) {
  return tools.map(toolSlugComponent).join('-');
}

function sequenceStableSlug(tools) {
  const key = sequenceKey(tools);
  return `${sequenceSlug(tools)}-${shortHash(key)}`;
}

function sequenceDisplay(tools) {
  return tools.map(toolDisplayName).join(' → ');
}

function projectIdentity(observation, fallback) {
  return oneLine(
    observation.__arcforge_project_id ||
      observation.project_id ||
      observation.__arcforge_project ||
      fallback,
  );
}

function observationProjectName(observation, fallback) {
  return oneLine(
    observation.__arcforge_project || fallback || observation.project || 'unknown-project',
  );
}

function sessionKey(observation, { includeProjectIdentity = false } = {}) {
  const key = oneLine(observation.session || observation.session_id || 'unknown');
  if (!includeProjectIdentity) return key;
  return `${projectIdentity(observation, observationProjectName(observation))}:${key}`;
}

function startedToolObservations(observations) {
  return observations
    .filter((observation) => observation.event === 'tool_start' && observation.tool)
    .sort((a, b) => String(a.ts || '').localeCompare(String(b.ts || '')));
}

function groupBySession(observations, options = {}) {
  const groups = new Map();
  for (const observation of observations) {
    const key = sessionKey(observation, options);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(observation);
  }
  return groups;
}

function collapseConsecutiveTools(observations) {
  const tools = [];
  for (const observation of observations) {
    const tool = normalizeToolName(observation.tool);
    if (toolSlugComponent(tools[tools.length - 1]) !== toolSlugComponent(tool)) tools.push(tool);
  }
  return tools;
}

function shortHash(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 8);
}

function assignUniqueSlugs(patterns) {
  const counts = new Map();
  for (const pattern of patterns) {
    counts.set(pattern.slug, (counts.get(pattern.slug) || 0) + 1);
  }
  return patterns.map((pattern) => ({
    ...pattern,
    slug: counts.get(pattern.slug) > 1 ? `${pattern.slug}-${shortHash(pattern.key)}` : pattern.slug,
  }));
}

function collectWorkflowPatterns(
  observations,
  { minSessions = 2, requireDistinctProjects = false, includeProjectInSession = false } = {},
) {
  const patterns = new Map();
  const sessions = groupBySession(startedToolObservations(observations), {
    includeProjectIdentity: includeProjectInSession,
  });

  for (const [sessionId, sessionObservations] of sessions.entries()) {
    const tools = collapseConsecutiveTools(sessionObservations).slice(0, 4);
    if (tools.length < 2) continue;

    const key = sequenceKey(tools);
    if (!patterns.has(key)) {
      patterns.set(key, {
        key,
        slug: sequenceStableSlug(tools),
        tools,
        display: sequenceDisplay(tools),
        sessions: new Map(),
        projects: new Set(),
      });
    }

    const first = sessionObservations[0];
    const pattern = patterns.get(key);
    pattern.sessions.set(sessionId, first);
    pattern.projects.add(projectIdentity(first, observationProjectName(first)));
  }

  const sorted = [...patterns.values()]
    .filter((pattern) => pattern.sessions.size >= minSessions)
    .filter((pattern) => !requireDistinctProjects || pattern.projects.size >= 2)
    .sort((a, b) => {
      if (b.projects.size !== a.projects.size) return b.projects.size - a.projects.size;
      if (b.sessions.size !== a.sessions.size) return b.sessions.size - a.sessions.size;
      if (b.tools.length !== a.tools.length) return b.tools.length - a.tools.length;
      return a.key.localeCompare(b.key);
    });

  return assignUniqueSlugs(sorted);
}

function latestTimestampScore(pattern, now) {
  const timestamps = [...pattern.sessions.values()]
    .map((observation) => Date.parse(observation.ts || ''))
    .filter((value) => Number.isFinite(value));
  if (timestamps.length === 0) return 0.5;
  const nowMs = Number.isFinite(Date.parse(now || '')) ? Date.parse(now) : Date.now();
  const newestMs = Math.max(...timestamps);
  const ageDays = Math.max(0, (nowMs - newestMs) / 86_400_000);
  return Math.max(0, 1 - ageDays / 90);
}

function patternOutcomeScore(pattern) {
  const outcomes = [...pattern.sessions.values()]
    .map((observation) => observation.outcome)
    .filter(Boolean);
  if (outcomes.length === 0) return 0.5;
  const successes = outcomes.filter((outcome) => outcome === 'success').length;
  const errors = outcomes.filter((outcome) => outcome === 'error').length;
  return Math.max(
    0,
    Math.min(1, 0.5 + successes / outcomes.length / 2 - errors / outcomes.length / 2),
  );
}

function userConfirmationScore(pattern) {
  return [...pattern.sessions.values()].some((observation) => observation.user_confirmed === true)
    ? 1
    : 0.5;
}

function contradictionScore(pattern) {
  return [...pattern.sessions.values()].some(
    (observation) => observation.contradiction === true || observation.negative_evidence === true,
  )
    ? 0
    : 1;
}

function projectSpecificityScore(pattern) {
  // Higher diversity means lower project-specificity risk.
  return Math.min(1, pattern.projects.size / 3);
}

function privacyRiskScore(pattern) {
  const hasRawPayload = [...pattern.sessions.values()].some(
    (observation) =>
      typeof observation.input === 'string' ||
      typeof observation.output === 'string' ||
      typeof observation.command === 'string',
  );
  return hasRawPayload ? 0.2 : 1;
}

function computeGlobalScore(pattern, { now }) {
  const factors = {
    project_diversity: Math.min(1, pattern.projects.size / 3),
    session_diversity: Math.min(1, pattern.sessions.size / 6),
    recency: latestTimestampScore(pattern, now),
    outcome: patternOutcomeScore(pattern),
    user_confirmation: userConfirmationScore(pattern),
    contradiction_absence: contradictionScore(pattern),
    project_specificity: projectSpecificityScore(pattern),
    privacy_risk: privacyRiskScore(pattern),
  };
  const score =
    factors.project_diversity * 0.22 +
    factors.session_diversity * 0.18 +
    factors.recency * 0.14 +
    factors.outcome * 0.12 +
    factors.user_confirmation * 0.1 +
    factors.contradiction_absence * 0.1 +
    factors.project_specificity * 0.07 +
    factors.privacy_risk * 0.07;
  return {
    score: Number(Math.min(1, score).toFixed(3)),
    factors: Object.fromEntries(
      Object.entries(factors).map(([key, value]) => [key, Number(value.toFixed(3))]),
    ),
  };
}

function buildWorkflowCandidate(pattern, { scope, now }) {
  const global = scope === 'global';
  const id = `arc-learned-${scope}-${pattern.slug}-workflow`;
  const name = global
    ? `arc-global-${pattern.slug}-workflow`
    : `arc-learned-${pattern.slug}-workflow`;
  const evidence = [...pattern.sessions.entries()].map(([sessionId, observation]) => ({
    session_id: oneLine(observation.session || observation.session_id || sessionId),
    source: global ? `project:${observationProjectName(observation)}` : 'observation',
    reason: global
      ? `Repeated ${pattern.display} workflow appears across projects`
      : `Repeated ${pattern.display} workflow in project observations`,
  }));
  const confidence = Math.min(
    0.85,
    0.55 + pattern.sessions.size * 0.05 + pattern.projects.size * 0.05,
  );

  const scoring = global ? computeGlobalScore(pattern, { now }) : null;

  const candidate = {
    id,
    scope,
    artifact_type: 'skill',
    name,
    summary: global
      ? `Global behavior repeated across ${pattern.projects.size} projects and ${pattern.sessions.size} sessions: ${pattern.display}.`
      : `Project behavior repeated across ${pattern.sessions.size} sessions: ${pattern.display}.`,
    trigger: global
      ? `when work across projects repeatedly follows the ${pattern.display} tool workflow`
      : `when this project work repeatedly follows the ${pattern.display} tool workflow`,
    evidence,
    confidence,
    status: 'pending',
    pattern_key: pattern.key,
    created_at: now,
    updated_at: now,
  };

  if (global) {
    candidate.distinct_project_count = pattern.projects.size;
    candidate.session_count = pattern.sessions.size;
    candidate.score = scoring.score;
    candidate.score_factors = scoring.factors;
  }

  return candidate;
}

function appendAnalyzerCandidates(candidates, { scope, projectRoot, homeDir }) {
  const written = [];
  for (const candidate of candidates) {
    const result = appendCandidate(candidate, { scope, projectRoot, homeDir });
    if (!result.duplicate) written.push(result.candidate);
  }
  return written;
}

function analyzeProjectLearning({ projectRoot = process.cwd(), homeDir, now }) {
  const projectId = getProjectId(projectRoot);
  const observations = readObservationFiles(getObservationPath({ projectRoot, homeDir })).filter(
    (observation) => observation.project_id === projectId,
  );
  const patterns = collectWorkflowPatterns(observations, { minSessions: 2 });
  const candidates = patterns.map((pattern) =>
    buildWorkflowCandidate(pattern, { scope: 'project', now }),
  );
  const written = appendAnalyzerCandidates(candidates, { scope: 'project', projectRoot, homeDir });
  return { scope: 'project', enabled: true, emitted: written.length, candidates: written };
}

function readGlobalObservations({ homeDir } = {}) {
  const root = getObservationRoot({ homeDir });
  if (!fs.existsSync(root)) return [];

  const observations = [];
  for (const projectName of fs.readdirSync(root).sort()) {
    const projectDir = path.join(root, projectName);
    if (!fs.statSync(projectDir).isDirectory()) continue;
    const records = readObservationFiles(path.join(projectDir, 'observations.jsonl'));
    for (const record of records) {
      observations.push({
        ...record,
        project: projectName,
        __arcforge_project: projectName,
        __arcforge_project_id: projectName,
      });
    }
  }
  return observations;
}

function analyzeGlobalLearning({ projectRoot = process.cwd(), homeDir, now }) {
  const observations = readGlobalObservations({ homeDir });
  const patterns = collectWorkflowPatterns(observations, {
    minSessions: 2,
    requireDistinctProjects: true,
    includeProjectInSession: true,
  });
  const candidates = patterns.map((pattern) =>
    buildWorkflowCandidate(pattern, { scope: 'global', now }),
  );
  const written = appendAnalyzerCandidates(candidates, { scope: 'global', projectRoot, homeDir });
  return { scope: 'global', enabled: true, emitted: written.length, candidates: written };
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
  if (scope === 'global') return analyzeGlobalLearning({ projectRoot, homeDir, now });
  return analyzeProjectLearning({ projectRoot, homeDir, now });
}

function triggerAutomaticLearning({
  projectRoot = process.cwd(),
  homeDir,
  now = new Date().toISOString(),
} = {}) {
  const project = analyzeLearning({ scope: 'project', projectRoot, homeDir, now });
  const global = isLearningEnabled({ scope: 'global', projectRoot, homeDir })
    ? analyzeLearning({ scope: 'global', projectRoot, homeDir, now })
    : { scope: 'global', enabled: false, emitted: 0, candidates: [] };
  return { project, global };
}

// ---------------------------------------------------------------------------
// Outcome-aware learning
//
// Look for sessions where an error tool_end was followed by an Edit and then
// a Bash success — a small, common "fix-and-rerun" signal. Emits an instinct
// candidate. All evidence stays bounded ("test command passed after edit").
// ---------------------------------------------------------------------------

function findOutcomeRepairSessions(observations, { includeProjectIdentity = false } = {}) {
  const ordered = [...observations].sort((a, b) =>
    String(a.ts || '').localeCompare(String(b.ts || '')),
  );
  const sessions = new Map();
  for (const obs of ordered) {
    const key = sessionKey(obs, { includeProjectIdentity });
    if (!sessions.has(key)) sessions.set(key, []);
    sessions.get(key).push(obs);
  }

  const matches = [];
  for (const [sessionId, events] of sessions.entries()) {
    let phase = 'await_error';
    let pendingRerunKind = null;
    for (const event of events) {
      const tool = normalizeToolName(event.tool);
      const toolSlug = toolSlugComponent(tool);
      if (event.event === 'tool_end' && event.outcome === 'error') {
        if (phase === 'await_error') phase = 'await_edit';
        pendingRerunKind = null;
      } else if (event.event === 'tool_start' && (toolSlug === 'edit' || toolSlug === 'write')) {
        if (phase === 'await_edit') phase = 'await_success';
        pendingRerunKind = null;
      } else if (event.event === 'tool_start' && toolSlug === 'bash') {
        const commandKind = oneLine(event.semantic?.command_kind || 'unknown');
        pendingRerunKind = commandKind === 'test' || commandKind === 'build' ? commandKind : null;
      } else if (event.event === 'tool_end' && event.outcome === 'success' && toolSlug === 'bash') {
        if (phase === 'await_success' && pendingRerunKind) {
          matches.push({
            sessionId,
            project: observationProjectName(event),
            project_id: projectIdentity(event, observationProjectName(event)),
            command_kind: pendingRerunKind,
            ts: oneLine(event.ts || ''),
          });
          break;
        }
        pendingRerunKind = null;
      }
    }
  }
  return matches;
}

function buildOutcomeRepairCandidate(matches, { scope, now }) {
  if (matches.length === 0) return null;
  const slug = 'outcome-repair-edit-then-test';
  const id = `arc-learned-${scope}-${slug}-instinct`;
  const evidence = matches.slice(0, 8).map((match) => ({
    session_id: match.sessionId || 'unknown',
    source: scope === 'global' ? `project:${match.project}` : 'observation',
    reason: 'test command passed after edit following error',
  }));
  const confidence = Math.min(0.8, 0.5 + 0.05 * matches.length);
  return {
    id,
    scope,
    artifact_type: 'instinct',
    name: `arc-learned-${slug}`,
    summary: `Recurring fix loop: an error was followed by an edit and a successful re-run.`,
    trigger:
      'when a tool errored and the next response was an edit followed by a successful test/build command',
    evidence,
    confidence,
    status: 'pending',
    pattern_key: `outcome:${slug}`,
    created_at: now,
    updated_at: now,
  };
}

function analyzeOutcomeRepair({
  scope = 'project',
  projectRoot = process.cwd(),
  homeDir,
  now = new Date().toISOString(),
} = {}) {
  assertScope(scope);
  if (!isLearningEnabled({ scope, projectRoot, homeDir })) {
    return { scope, enabled: false, emitted: 0, candidates: [] };
  }
  const observations =
    scope === 'global'
      ? readGlobalObservations({ homeDir })
      : readObservationFiles(getObservationPath({ projectRoot, homeDir })).filter(
          (observation) => observation.project_id === getProjectId(projectRoot),
        );
  const matches = findOutcomeRepairSessions(observations, {
    includeProjectIdentity: scope === 'global',
  });
  const candidate = buildOutcomeRepairCandidate(matches, { scope, now });
  const written = candidate
    ? appendAnalyzerCandidates([candidate], { scope, projectRoot, homeDir })
    : [];
  return { scope, enabled: true, emitted: written.length, candidates: written };
}

// ---------------------------------------------------------------------------
// Transcript habit extraction
//
// Parses a Claude Code transcript JSONL file and emits privacy-safe instinct
// or repo_convention_patch candidates from corrections / strong preferences.
// Never persists raw user/assistant text.
// ---------------------------------------------------------------------------

const HABIT_PATTERNS = [
  {
    kind: 'instinct',
    regex: /\bdon'?t\s+([a-zA-Z][a-zA-Z\s-]{2,40})/i,
    prefix: 'user correction observed',
  },
  {
    kind: 'instinct',
    regex: /\bnever\s+([a-zA-Z][a-zA-Z\s-]{2,40})/i,
    prefix: 'user correction observed',
  },
  {
    kind: 'instinct',
    regex: /\bstop\s+([a-zA-Z][a-zA-Z\s-]{2,40})/i,
    prefix: 'user correction observed',
  },
  {
    kind: 'instinct',
    regex: /\balways\s+([a-zA-Z][a-zA-Z\s-]{2,40})/i,
    prefix: 'user preference observed',
  },
  {
    kind: 'repo_convention_patch',
    regex: /\bfrom\s+now\s+on[,:]?\s+([a-zA-Z][a-zA-Z\s-]{2,60})/i,
    prefix: 'repo convention preference observed',
  },
  {
    kind: 'instinct',
    regex: /(?:不要|別|不要再)\s*([^\n]{2,80})/u,
    prefix: 'user correction observed',
  },
  {
    kind: 'repo_convention_patch',
    regex: /(?:以後|下次|預設)\s*([^\n]{2,80})/u,
    prefix: 'repo convention preference observed',
  },
];

function extractUserMessageText(line) {
  if (!line) return null;
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (!parsed || parsed.type !== 'user' || !parsed.message) return null;
  const content = parsed.message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('\n');
  }
  return null;
}

function safeHabitSummary(prefix, fingerprint) {
  // Do not echo transcript content, even bounded. Persist only a category plus a
  // short source-event fingerprint so reviewers can correlate duplicate habits
  // without storing or hashing private conversation text.
  return `${prefix} (source_fingerprint:${fingerprint})`;
}

function extractTranscriptHabits(transcriptPath) {
  if (!fs.existsSync(transcriptPath)) return [];
  const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);
  const habits = [];
  lines.forEach((line, lineIndex) => {
    const text = extractUserMessageText(line);
    if (!text) return;
    HABIT_PATTERNS.forEach(({ kind, regex, prefix }, patternIndex) => {
      const match = text.match(regex);
      if (!match) return;
      const sourceKey = `${kind}:${prefix}:line-${lineIndex}:pattern-${patternIndex}`;
      const fingerprint = shortHash(sourceKey);
      const summary = safeHabitSummary(prefix, fingerprint);
      const slug = `habit-${fingerprint}`;
      habits.push({ kind, summary, slug, prefix });
    });
  });
  return habits;
}

function buildHabitCandidate(habit, { scope, sessionId, now }) {
  const slugBase = `habit-${habit.kind === 'repo_convention_patch' ? 'convention' : 'instinct'}-${habit.slug}`;
  const id = `arc-learned-${scope}-${slugBase}`;
  return {
    id,
    scope,
    artifact_type: habit.kind,
    name: `arc-learned-${slugBase}`,
    summary: habit.summary,
    trigger: `when ${habit.prefix} appears in conversation`,
    evidence: [
      {
        session_id: sessionId,
        source: 'transcript',
        reason: habit.summary,
      },
    ],
    confidence: 0.6,
    status: 'pending',
    pattern_key: `transcript:${habit.kind}:${habit.slug}`,
    created_at: now,
    updated_at: now,
  };
}

function analyzeTranscriptHabits({
  transcriptPath,
  sessionId = 'unknown',
  scope = 'project',
  projectRoot = process.cwd(),
  homeDir,
  now = new Date().toISOString(),
} = {}) {
  assertScope(scope);
  if (!isLearningEnabled({ scope, projectRoot, homeDir })) {
    return { scope, enabled: false, emitted: 0, candidates: [] };
  }
  if (!transcriptPath) {
    throw new Error('analyzeTranscriptHabits requires a transcriptPath');
  }
  const habits = extractTranscriptHabits(transcriptPath);
  // Deduplicate by slug+kind so a single transcript run does not flood the queue.
  const seen = new Set();
  const candidates = [];
  for (const habit of habits) {
    const key = `${habit.kind}:${habit.slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(buildHabitCandidate(habit, { scope, sessionId, now }));
  }
  const written = appendAnalyzerCandidates(candidates, { scope, projectRoot, homeDir });
  return { scope, enabled: true, emitted: written.length, candidates: written };
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
  analyzeLearning,
  analyzeOutcomeRepair,
  analyzeTranscriptHabits,
  extractTranscriptHabits,
  getCandidateQueuePath,
  getLearningConfigPath,
  getObservationPath,
  getProjectId,
  inspectCandidate,
  isLearningEnabled,
  listLearningInbox,
  listMaterializedDrafts,
  loadCandidates,
  materializeCandidate,
  readLearningConfig,
  setLearningEnabled,
  transitionCandidate,
  triggerAutomaticLearning,
  validateCandidate,
};
