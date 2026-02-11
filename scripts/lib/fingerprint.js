/**
 * Fingerprint — trigger fingerprinting and Jaccard similarity
 *
 * Provides text similarity utilities for comparing instinct triggers
 * and detecting semantic duplicates across projects.
 */

const fs = require('node:fs');
const path = require('node:path');
const { parseConfidenceFrontmatter } = require('./confidence');

// Common English stop words to filter out
const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'this',
  'that',
  'these',
  'those',
  'i',
  'you',
  'he',
  'she',
  'it',
  'we',
  'they',
  'when',
  'if',
  'then',
  'not',
  'no',
  'so',
  'as',
  'just',
  'also',
]);

/**
 * Build a fingerprint (set of normalized tokens) from a trigger string.
 * Normalizes: lowercase -> split on whitespace/punctuation -> remove stop words -> sort -> Set
 *
 * @param {string} trigger - The trigger text to fingerprint
 * @returns {Set<string>} Unique sorted tokens
 */
function buildTriggerFingerprint(trigger) {
  if (!trigger || typeof trigger !== 'string') return new Set();

  const tokens = trigger
    .toLowerCase()
    .split(/[\s\-_.,;:!?'"()[\]{}/\\]+/)
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t));

  return new Set(tokens.sort());
}

/**
 * Calculate Jaccard similarity between two sets.
 * J(A,B) = |A intersection B| / |A union B|
 *
 * @param {Set<string>} setA - First set
 * @param {Set<string>} setB - Second set
 * @returns {number} Similarity score 0.0-1.0
 */
function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0.0 : intersection / union;
}

/**
 * Find instincts in a directory that have similar triggers.
 *
 * @param {string} trigger - The trigger text to compare against
 * @param {string} dir - Directory containing instinct .md files
 * @param {number} [threshold=0.6] - Minimum Jaccard similarity
 * @returns {Array<{file: string, trigger: string, similarity: number}>}
 */
function findSimilarInstincts(trigger, dir, threshold = 0.6) {
  if (!fs.existsSync(dir)) return [];

  const queryFp = buildTriggerFingerprint(trigger);
  if (queryFp.size < 3) return []; // Too short for meaningful comparison

  const results = [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));

  for (const file of files) {
    const filePath = path.join(dir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter } = parseConfidenceFrontmatter(content);

    if (!frontmatter.trigger) continue;

    const fileFp = buildTriggerFingerprint(frontmatter.trigger);
    const similarity = jaccardSimilarity(queryFp, fileFp);

    if (similarity >= threshold) {
      results.push({
        file,
        trigger: frontmatter.trigger,
        similarity,
      });
    }
  }

  return results.sort((a, b) => b.similarity - a.similarity);
}

module.exports = {
  STOP_WORDS,
  buildTriggerFingerprint,
  jaccardSimilarity,
  findSimilarInstincts,
};
