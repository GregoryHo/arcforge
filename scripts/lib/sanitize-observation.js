/**
 * Shared observation sanitizer — Decision 5 keyword + value form coverage.
 *
 * Used by: hooks/observe/main.js (Layer 2), Layer 4 daemon prompt assembly,
 * Layer 5 queue validation, and dashboard backend sanitization.
 *
 * Fail-closed rule (Layer 2): if a field cannot be proven safe, do not persist.
 * This module ONLY performs redaction; callers decide whether the post-redact
 * result is safe enough to persist.
 */

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Truncate a string to maxLen characters, appending '...[truncated]' when cut.
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
function truncate(str, maxLen) {
  if (!str || str.length <= maxLen) return str || '';
  return `${str.substring(0, maxLen)}...[truncated]`;
}

// ---------------------------------------------------------------------------
// Ordered replacement regexes — most-specific first
// ---------------------------------------------------------------------------

// 1. Private key blocks (multi-line)
const PRIVATE_KEY_RE =
  /-----BEGIN [^-\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\n]*PRIVATE KEY-----/g;

// 2. JWT-shaped strings: eyJ{10+}.{10+}.{10+}
const JWT_RE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

// 3. URL credentials: scheme://user:pass@host
const URL_CREDENTIALS_RE = /(https?:\/\/)[^:@/\s]+:[^@/\s]+@/g;

// 4a. Authorization: Bearer/Basic <token> — standard HTTP header form
//     Matches full "Authorization: Bearer token" (case-insensitive on keyword)
const AUTHORIZATION_HEADER_RE = /\bAuthorization\s*:\s*(Bearer|Basic)\s+\S+/gi;

// 4b. auth / authorization keyword with Bearer/Basic followed by a token
//     Handles "auth: Bearer token123" which isn't matched by 4a
const AUTH_KEYWORD_BEARER_RE = /\b(auth|authorization)\s*[=:]\s*(Bearer|Basic)\s+\S+/gi;

// 5. Suffixed uppercase env-var assignments: NAME_API_KEY=value, NAME_TOKEN=value
//    Matches OPENAI_API_KEY=..., GITHUB_TOKEN=..., etc.
const ENV_VAR_APIKEY_RE = /\b[A-Z][A-Z0-9_]*_API_KEY\s*=\s*\S+/g;
const ENV_VAR_TOKEN_RE = /\b[A-Z][A-Z0-9_]*_TOKEN\s*=\s*\S+/g;

// 6a–6d. Keyword key=value / key: value forms.
//
// Full keyword union — used for quoted-value forms (JSON, YAML) since those
// are unambiguous. authorization / auth are included so JSON "authorization":
// and YAML authorization: "..." get redacted even though they are also handled
// by the dedicated Bearer/Basic steps above.
const KEYWORD_UNION =
  'api[_-]key|secret|password|passwd|token|authorization|credentials?|auth|cookie|set-cookie|x-api-key';

// Bare-value keyword union — excludes authorization / auth because:
//   - Standard "Authorization: Bearer xxx" is handled by step 4a.
//   - "auth: Bearer xxx" form is handled by step 4b.
//   - Plain "authorization: somevalue" bare (no quotes) would be mis-processed
//     because the bare-value regex stops at the first space — leaving multi-word
//     values like "Bearer token" only half-redacted.
//   After steps 4a/4b fire, the remaining text contains "Authorization: Bearer [REDACTED]"
//   which the bare-value regex would partially re-match.
const KEYWORD_UNION_BARE =
  'api[_-]key|secret|password|passwd|token|credentials?|cookie|set-cookie|x-api-key';

// 6a. JSON form: "keyword":"value" or "keyword": "value"
const KW_JSON_DQUOTED_RE = new RegExp(`"(${KEYWORD_UNION})"\\s*:\\s*"[^"]*"`, 'gi');

// 6b. Unquoted key with double-quoted value (colon): keyword: "value"
const KW_KEY_DQUOTED_VALUE_RE = new RegExp(`\\b(${KEYWORD_UNION})\\b\\s*:\\s*"[^"]*"`, 'gi');

// 6b2. Unquoted key with double-quoted value (equals): keyword="value"
//      Handles shell assignment forms like api_key="secret"
const KW_KEY_EQ_DQUOTED_VALUE_RE = new RegExp(`\\b(${KEYWORD_UNION})\\b\\s*=\\s*"[^"]*"`, 'gi');

// 6c. Unquoted key with single-quoted value: keyword: 'value' or keyword='value'
const KW_KEY_SQUOTED_VALUE_RE = new RegExp(`\\b(${KEYWORD_UNION})\\b\\s*[=:]\\s*'[^']*'`, 'gi');

// 6d. Bare key=value or key: value (stops at whitespace or JSON delimiters).
//     Uses KEYWORD_UNION_BARE (excludes auth/authorization) to avoid
//     re-processing already-redacted Authorization Bearer/Basic output.
//     Excludes '[' and ']' so [REDACTED] markers are not re-matched.
const KW_KEY_BARE_VALUE_RE = new RegExp(
  `\\b(${KEYWORD_UNION_BARE})\\b\\s*[=:]\\s*[^\\s,}"'\\[\\]]+`,
  'gi',
);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Redact secret-like values from a text string.
 * Does not truncate — call sanitizeObservationPayload for truncation.
 *
 * Replacement steps are ordered from most-specific to most-general:
 *   1. Private key blocks
 *   2. JWT-shaped tokens
 *   3. URL credentials
 *   4. Authorization Bearer/Basic headers (both standard and auth: keyword form)
 *   5. Suffixed env-var assignments (*_API_KEY, *_TOKEN)
 *   6. Keyword key=value / key: value forms (JSON, YAML, dotenv, shell)
 *
 * Idempotent: applying twice equals applying once because the [REDACTED] /
 * [REDACTED-JWT] / [REDACTED-KEY] markers contain '[' which is excluded from
 * the bare-value charset.
 *
 * @param {string|null|undefined} value
 * @returns {string}
 */
function redactObservationText(value) {
  if (!value) return '';
  let text = String(value);

  // 1. Private key blocks
  text = text.replace(PRIVATE_KEY_RE, '[REDACTED-KEY]');

  // 2. JWT-shaped tokens
  text = text.replace(JWT_RE, '[REDACTED-JWT]');

  // 3. URL credentials
  text = text.replace(URL_CREDENTIALS_RE, '$1[REDACTED]@');

  // 4a. Authorization: Bearer/Basic headers
  text = text.replace(AUTHORIZATION_HEADER_RE, 'Authorization: $1 [REDACTED]');

  // 4b. auth/authorization keyword with Bearer/Basic token
  text = text.replace(AUTH_KEYWORD_BEARER_RE, '$1: $2 [REDACTED]');

  // 5. Suffixed env-var assignments
  text = text.replace(ENV_VAR_APIKEY_RE, (m) => `${m.slice(0, m.indexOf('=') + 1)}[REDACTED]`);
  text = text.replace(ENV_VAR_TOKEN_RE, (m) => `${m.slice(0, m.indexOf('=') + 1)}[REDACTED]`);

  // 6. Keyword key=value / key: value forms — most-constrained first
  text = text.replace(KW_JSON_DQUOTED_RE, (_m, kw) => `"${kw}":"[REDACTED]"`);
  text = text.replace(KW_KEY_DQUOTED_VALUE_RE, (_m, kw) => `${kw}: "[REDACTED]"`);
  text = text.replace(KW_KEY_EQ_DQUOTED_VALUE_RE, (_m, kw) => `${kw}="[REDACTED]"`);
  text = text.replace(KW_KEY_SQUOTED_VALUE_RE, (m, kw) => {
    const sepIdx = m.search(/[=:]/);
    const sep = m[sepIdx];
    return `${kw}${sep}'[REDACTED]'`;
  });
  text = text.replace(KW_KEY_BARE_VALUE_RE, (m, kw) => {
    const sepIdx = m.search(/[=:]/);
    const sep = m[sepIdx];
    return `${kw}${sep}[REDACTED]`;
  });

  return text;
}

/**
 * Sanitize and truncate an observation payload.
 * Applies redaction first, then truncation.
 *
 * @param {string|null|undefined} value
 * @param {number} maxLen  — maximum character count before truncation
 * @returns {string}
 */
function sanitizeObservationPayload(value, maxLen) {
  return truncate(redactObservationText(value), maxLen);
}

// Layer 2 SafeEvidencePatch evidence_status enum (canonical source).
// Importers must use these constants instead of inline string literals.
const EVIDENCE_STATUS = Object.freeze({
  PRESENT: 'present',
  OMITTED_NO_INPUT: 'omitted_no_input',
  OMITTED_UNSUPPORTED_TOOL: 'omitted_unsupported_tool',
  OMITTED_SAFETY: 'omitted_safety',
});

module.exports = {
  redactObservationText,
  sanitizeObservationPayload,
  EVIDENCE_STATUS,
};
