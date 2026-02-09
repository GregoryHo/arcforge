/**
 * Instinct Writer -- shared instinct creation utility
 *
 * Centralizes instinct file creation for: reflect.js, recall.js, instinct.js
 */

const fs = require('fs');
const path = require('path');
const { sanitizeFilename } = require('./utils');
const { getInstinctsDir, getGlobalInstinctsDir, getInstinctsGlobalIndex } = require('./session-utils');
const { appendToIndex } = require('./global-index');
const { INITIAL, MAX_CONFIDENCE } = require('./confidence');

/**
 * Save an instinct to disk with proper frontmatter format.
 * @param {Object} opts
 * @param {string} opts.id - Instinct identifier (used as filename)
 * @param {string} opts.trigger - When this instinct fires
 * @param {string} opts.action - What to do when triggered
 * @param {string} opts.project - Project name
 * @param {string} [opts.domain='general'] - Domain category
 * @param {string} [opts.source='manual'] - Source: 'observation'|'reflection'|'manual'
 * @param {string} [opts.evidence=''] - Evidence from session
 * @param {number} [opts.maxConfidence] - Cap for confidence (e.g., 0.85 for reflect)
 * @param {number} [opts.evidenceCount=0] - Number of evidence instances
 * @returns {{ path: string, confidence: number, isNew: boolean }}
 */
function saveInstinct({ id, trigger, action, project, domain = 'general', source = 'manual', evidence = '', maxConfidence, evidenceCount = 0 }) {
  sanitizeFilename(id);

  const cap = maxConfidence ?? MAX_CONFIDENCE;
  const confidence = Math.min(cap, INITIAL + 0.05 * evidenceCount);

  const dir = getInstinctsDir(project);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${id}.md`);
  const isNew = !fs.existsSync(filePath);

  const today = new Date().toISOString().split('T')[0];
  const content = `---
id: ${id}
trigger: "${trigger}"
action: "${action}"
domain: ${domain}
source: ${source}
confidence: ${confidence.toFixed(2)}
extracted: ${today}
last_confirmed: ${today}
confirmations: 0
contradictions: 0
evidence: "${evidence}"
---

# ${id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}

## Trigger
${trigger}

## Action
${action}
`;

  fs.writeFileSync(filePath, content, 'utf-8');

  const indexPath = getInstinctsGlobalIndex();
  appendToIndex(indexPath, id, project, confidence, 'instinct');

  return { path: filePath, confidence, isNew };
}

/**
 * Check if an instinct with the given ID already exists.
 * @param {string} id - Instinct ID
 * @param {string} project - Project name
 * @returns {string} 'duplicate|project|{path}' or 'duplicate|global|{path}' or 'unique'
 */
function checkInstinctDuplicate(id, project) {
  sanitizeFilename(id);

  const projectPath = path.join(getInstinctsDir(project), `${id}.md`);
  if (fs.existsSync(projectPath)) {
    return `duplicate|project|${projectPath}`;
  }

  const globalPath = path.join(getGlobalInstinctsDir(), `${id}.md`);
  if (fs.existsSync(globalPath)) {
    return `duplicate|global|${globalPath}`;
  }

  return 'unique';
}

module.exports = {
  saveInstinct,
  checkInstinctDuplicate
};
