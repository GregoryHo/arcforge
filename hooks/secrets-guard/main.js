#!/usr/bin/env node
/**
 * secrets-guard — PreToolUse WARN-first scan for hardcoded credentials.
 *
 * Scans the resulting content of an Edit/Write, and the string of a `git commit`
 * Bash command, for common key/token shapes (AWS access keys, private-key PEM
 * headers, provider tokens, hardcoded credential assignments). On a hit it emits
 * a user-facing WARNING (systemMessage) — NOT a deny in 5.0. A test-credential
 * allowlist (lines/paths containing test/example/fixture/dummy/…) suppresses the
 * common false positives.
 *
 * The warning names the finding category but never echoes the matched secret,
 * so the message itself cannot leak the credential. Untrusted path fragments in
 * the message are stripped of control characters (security.md).
 */

const path = require('node:path');
const { readStdinSync, parseStdinJson, output } = require('../../scripts/lib/utils');
const { computeWriteContent, computeEditContent } = require('../../scripts/lib/resulting-content');

const SECRET_PATTERNS = [
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'private key block', re: /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/ },
  { name: 'Slack token', re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[0-9A-Za-z]{20,}\b/ },
  {
    name: 'hardcoded credential',
    re: /\b(?:api[_-]?key|secret|token|password|passwd|access[_-]?key|auth[_-]?token|client[_-]?secret)\b\s*[:=]\s*['"][^'"\n]{12,}['"]/i,
  },
];

// Lines (or file paths) that look like test/example material — a hit there is a
// fixture, not a leak. Warn-only tolerates the occasional miss.
const ALLOWLIST_RE =
  /\b(?:test|tests|example|examples|fixture|fixtures|sample|dummy|placeholder|redacted|changeme|fake|mock|your[_-]?\w*|xxx+)\b/i;

/** Strip control characters from an untrusted string (security.md). */
function sanitize(str) {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control char sanitization
  return String(str).replace(/[\x00-\x1f\x7f]/g, '');
}

/** A path that clearly holds test/fixture material — skip scanning it entirely. */
function isTestPath(filePath) {
  return /(?:^|\/)(?:tests?|__tests__|fixtures?|examples?|mocks?)(?:\/|$)|\.(?:test|spec)\./i.test(
    filePath,
  );
}

/**
 * Scan text for secret shapes, returning the distinct finding categories.
 * Allowlisted lines are skipped.
 * @param {string} text
 * @returns {string[]}
 */
function scanForSecrets(text) {
  if (typeof text !== 'string' || !text) return [];
  const findings = [];
  for (const line of text.split('\n')) {
    if (ALLOWLIST_RE.test(line)) continue;
    for (const { name, re } of SECRET_PATTERNS) {
      if (re.test(line)) {
        findings.push(name);
        break;
      }
    }
  }
  return [...new Set(findings)];
}

function buildWarning(findings, where) {
  return (
    `\n⚠️ Possible secret detected in ${where}: ${findings.join(', ')}.\n` +
    'If this is a real credential, remove it before it lands — commit history is hard to ' +
    'scrub and a leaked key must be rotated. Prefer an env var or a secret manager. ' +
    '(Warning only, not a block; test/example/fixture credentials are ignored.)\n'
  );
}

/**
 * Pure decision core for a PreToolUse event. Returns a warning string, or null.
 * @param {Object|null} input - Parsed hook stdin.
 * @returns {string|null}
 */
function evaluate(input) {
  if (!input) return null;
  const tool = input.tool_name;

  if (tool === 'Edit' || tool === 'Write') {
    const filePath = input.tool_input?.file_path;
    if (typeof filePath !== 'string' || !filePath) return null;
    if (isTestPath(filePath)) return null;
    const cwd = input.cwd || process.cwd();
    const absPath = path.resolve(cwd, filePath);
    const content =
      tool === 'Write'
        ? computeWriteContent(input.tool_input)
        : computeEditContent(input.tool_input, absPath);
    const findings = scanForSecrets(content);
    if (findings.length === 0) return null;
    return buildWarning(findings, `\`${sanitize(filePath)}\``);
  }

  if (tool === 'Bash') {
    const command = input.tool_input?.command;
    if (typeof command !== 'string' || !/\bgit\s+commit\b/.test(command)) return null;
    const findings = scanForSecrets(command);
    if (findings.length === 0) return null;
    return buildWarning(findings, 'the git commit command');
  }

  return null;
}

function main() {
  try {
    const warning = evaluate(parseStdinJson(readStdinSync()));
    if (warning) {
      output({ systemMessage: warning });
    }
  } catch {
    // Non-blocking — never crash the session.
  }
}

module.exports = {
  evaluate,
  scanForSecrets,
  isTestPath,
  SECRET_PATTERNS,
  ALLOWLIST_RE,
};

if (require.main === module) {
  main();
}
