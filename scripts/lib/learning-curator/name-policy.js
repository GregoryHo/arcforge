/**
 * name-policy.js — the one rule a candidate `name` has to pass (B-14, D-035).
 *
 * A name becomes the draft filename Layer 7 writes, the heading of that draft
 * and the heading of the instinct Layer 8 activates, and every card renders it.
 * So it is checked once, at Layer 5 ingestion, against two things: the draft
 * writer's own filename policy (L7-12) and the redactor. A name the queue
 * accepts is then never refused `path_policy_rejected` at materialization, and
 * is never shown differently from how it is stored. Nothing normalizes a name:
 * one candidate has one name.
 *
 * Owned here rather than in `materialize.js` so Layer 5's validator and Layer
 * 7's writer share one implementation without Layer 5 loading the draft writer.
 */

const { sanitizeFilename } = require('../utils');
const { redactObservationText } = require('../sanitize-observation');

/**
 * The longest draft filename stem L7-12 will accept, in bytes.
 *
 * `NAME_MAX` is 255 *bytes* per path component on byte-limited filesystems —
 * ext4 and friends, which is where CI runs and where a large share of users
 * are. The binding write is not the `.md` draft: `atomicWriteFile` puts the
 * content in `<stem>.md.tmp` and renames it into place, so the temporary name,
 * 7 bytes longer than the stem, is the one that has to fit. 255 - 7 = 248.
 *
 * A fixed byte bound rather than a probe of the target filesystem, because
 * the ingestion check and the write it protects can only be one rule if both
 * compute the same answer — and a probe would make that answer depend on where
 * the draft root happens to live. macOS/APFS counts characters rather than
 * bytes, so this is stricter than that platform needs: a 120-character CJK name
 * is 360 bytes and is refused there too, deliberately.
 */
const MAX_DRAFT_NAME_BYTES = 248;

/**
 * The name policy of L7-12, in words a reviewer can act on. "Blank" covers both
 * halves of what `sanitizeFilename` rejects at the top — an empty string and a
 * whitespace-only one. The length is in bytes because the filesystem limit is,
 * so a non-ASCII name reaches it well short of that many characters.
 */
const NAME_POLICY_SUMMARY =
  'a draft filename may not be blank, may not contain a path separator, ".." or a control ' +
  `character, and may not exceed ${MAX_DRAFT_NAME_BYTES} bytes once encoded`;

/**
 * The whole filename policy of L7-12, as the one check that enforces it.
 *
 * @param {string} name
 * @returns {string} The validated name, unchanged.
 * @throws {Error} If the name cannot be a draft filename.
 */
function checkDraftName(name) {
  const safeName = sanitizeFilename(name);
  const bytes = Buffer.byteLength(safeName, 'utf8');
  if (bytes > MAX_DRAFT_NAME_BYTES) {
    throw new Error(
      `Invalid filename: ${bytes} bytes exceeds the ${MAX_DRAFT_NAME_BYTES}-byte limit`,
    );
  }
  return safeName;
}

/**
 * Whether L7-12 would accept this name as a draft filename.
 *
 * @param {string} name
 * @returns {boolean}
 */
function isMaterializableName(name) {
  try {
    checkDraftName(name);
    return true;
  } catch {
    return false;
  }
}

/**
 * Why Layer 5 must not admit this name, or `[]` when it may.
 *
 * The details are fixed strings: `sanitizeFilename`'s own error message embeds
 * the name, and the name is exactly what may carry a secret, so it is never
 * copied into a rejection record.
 *
 * @param {string} name — already known to be a string within the length limit
 * @returns {Array<[string, string]>} `[code, detail]` pairs for the `name` field
 */
function nameRejections(name) {
  const reasons = [];
  if (!isMaterializableName(name)) reasons.push(['schema_invalid', NAME_POLICY_SUMMARY]);
  if (redactObservationText(name) !== name) {
    reasons.push(['unsafe_content', 'name would be altered by the redactor']);
  }
  return reasons;
}

module.exports = {
  MAX_DRAFT_NAME_BYTES,
  NAME_POLICY_SUMMARY,
  checkDraftName,
  isMaterializableName,
  nameRejections,
};
