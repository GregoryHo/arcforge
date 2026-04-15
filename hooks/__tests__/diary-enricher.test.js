/**
 * Diary Enricher Regression Tests
 *
 * Guards the fixes for the silent enrichment failure discovered 2026-04-15:
 * - end.js spawnDiaryEnricher used --max-turns 2 (insufficient → "Reached max turns").
 * - end.js piped enricher stderr to 'ignore' (silent failure invisible for ~30 days).
 * - inject-context.js never warned about stale unenriched drafts.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const END_JS = path.join(__dirname, '..', 'session-tracker', 'end.js');

// ─────────────────────────────────────────────
// end.js: spawnDiaryEnricher invocation hardening
// ─────────────────────────────────────────────

describe('spawnDiaryEnricher invocation', () => {
  const source = fs.readFileSync(END_JS, 'utf-8');

  it('uses --max-turns >= 5 (haiku needs room to read AND write)', () => {
    const match = source.match(/'--max-turns',\s*'(\d+)'/);
    assert.ok(match, 'spawnDiaryEnricher must pass --max-turns');
    const turns = parseInt(match[1], 10);
    assert.ok(
      turns >= 5,
      `--max-turns must be at least 5 to allow Read+Write turns (got ${turns}). ` +
        '2 was the broken default — caused "Reached max turns (2)" silent failure.',
    );
  });

  it('does not silently discard enricher stderr', () => {
    // Find the spawn(...) call body
    const spawnIdx = source.indexOf('spawn(');
    assert.ok(spawnIdx !== -1, 'expected spawn(...) call');
    const tail = source.slice(spawnIdx, spawnIdx + 1500);
    const stdioMatch = tail.match(/stdio:\s*\[([^\]]+)\]/);
    assert.ok(stdioMatch, 'expected stdio array on spawn');
    const stdioPositions = stdioMatch[1].split(',').map((s) => s.trim());
    const stderrPosition = stdioPositions[2];
    assert.ok(
      stderrPosition && stderrPosition !== "'ignore'" && stderrPosition !== '"ignore"',
      `stderr (stdio[2]) must NOT be 'ignore' — silent failure regression. Got: ${stderrPosition}`,
    );
  });
});

// ─────────────────────────────────────────────
// inject-context.js: stale-draft healthcheck
// ─────────────────────────────────────────────

describe('inject-context.js stale-draft healthcheck', () => {
  it('exports loadStaleDraftWarning', () => {
    delete require.cache[require.resolve('../session-tracker/inject-context')];
    const mod = require('../session-tracker/inject-context');
    assert.ok(
      typeof mod.loadStaleDraftWarning === 'function',
      'loadStaleDraftWarning should be exported',
    );
  });

  it('returns null when no project sessions dir exists', () => {
    delete require.cache[require.resolve('../session-tracker/inject-context')];
    const { loadStaleDraftWarning } = require('../session-tracker/inject-context');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'test-stale-empty-'));
    const originalHome = process.env.HOME;
    process.env.HOME = tmp;
    try {
      const result = loadStaleDraftWarning('nonexistent-project');
      assert.strictEqual(result, null);
    } finally {
      process.env.HOME = originalHome;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('returns null when drafts exist but are all enriched', () => {
    delete require.cache[require.resolve('../session-tracker/inject-context')];
    const { loadStaleDraftWarning } = require('../session-tracker/inject-context');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'test-stale-clean-'));
    const originalHome = process.env.HOME;
    process.env.HOME = tmp;
    try {
      const dir = path.join(tmp, '.arcforge', 'diaries', 'demo', '2026-04-15');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'diary-session-aaa-draft.md'),
        '# Diary\n\n## Decisions\n- did stuff\n',
      );
      const result = loadStaleDraftWarning('demo');
      assert.strictEqual(result, null);
    } finally {
      process.env.HOME = originalHome;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('returns a warning when 1+ drafts contain TO BE ENRICHED', () => {
    delete require.cache[require.resolve('../session-tracker/inject-context')];
    const { loadStaleDraftWarning } = require('../session-tracker/inject-context');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'test-stale-stub-'));
    const originalHome = process.env.HOME;
    process.env.HOME = tmp;
    try {
      const dir = path.join(tmp, '.arcforge', 'diaries', 'demo', '2026-04-15');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'diary-session-bbb-draft.md'),
        '# Diary\n\n## Decisions\n<!-- TO BE ENRICHED -->\n- \n',
      );
      fs.writeFileSync(
        path.join(dir, 'diary-session-ccc-draft.md'),
        '# Diary\n\n## Decisions\n<!-- TO BE ENRICHED -->\n- \n',
      );
      const result = loadStaleDraftWarning('demo');
      assert.ok(result && typeof result === 'object', 'expected warning object');
      assert.strictEqual(result.count, 2);
      assert.ok(result.message && /2/.test(result.message), 'message should mention count');
    } finally {
      process.env.HOME = originalHome;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
