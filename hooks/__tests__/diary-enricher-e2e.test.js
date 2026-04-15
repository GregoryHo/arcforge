/**
 * Diary Enricher End-to-End Integration Test
 *
 * Spawns the REAL claude haiku subprocess against a stub draft and asserts
 * the draft gets enriched at its new ~/.arcforge/diaries/ location.
 *
 * Why this path: Claude Code v2.1.78+ blocks nested `claude` subprocesses
 * from writing under ~/.claude/* even with --dangerously-skip-permissions.
 * Drafts moved to ~/.arcforge/diaries/ so the enricher can write them.
 *
 * Opt-in: set ENRICHER_E2E=1 to run. Requires:
 *  - `claude` CLI on PATH
 *  - Anthropic API credit (one haiku call per run)
 *  - Network access
 *
 * Runtime: ~30-90s per trial.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const RUN_E2E = process.env.ENRICHER_E2E === '1';
const POLL_INTERVAL_MS = 1000;
const TIMEOUT_MS = 180_000;

const STUB_DRAFT = `# Session Diary: e2e-test

**Date:** 2026-04-15
**Session ID:** session-e2e-test-fixture

## Session Metrics

- **Duration**: ~5 minutes
- **Tool calls**: 42
- **User messages**: 3

## Decisions Made

<!-- TO BE ENRICHED — Fill from conversation memory -->
-

## User Preferences Observed

<!-- TO BE ENRICHED — What preferences did the user express? -->
-

## Challenges & Solutions

<!-- TO BE ENRICHED — What went wrong and how was it resolved? -->
- **Challenge**:
- **Solution**:
- **Generalizable?**: Yes/No

## Completed

<!-- TO BE ENRICHED — What was accomplished this session? -->
-

## In Progress

<!-- TO BE ENRICHED — What's still ongoing? -->
-

## Context for Next Session

<!-- TO BE ENRICHED — What context would help next time? -->
-
`;

async function waitForEnrichment(draftPath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(draftPath)) {
      const content = fs.readFileSync(draftPath, 'utf-8');
      if (!content.includes('TO BE ENRICHED')) return content;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return null;
}

describe('E2E: diary enricher full spawn cycle', { skip: !RUN_E2E }, () => {
  it('enriches a stub draft via real claude haiku subprocess', async () => {
    // Write under real $HOME so `claude` CLI can find its own config/auth.
    // Isolate via a unique project name so cleanup is scoped.
    const project = `e2e-enricher-test-${process.pid}-${Date.now()}`;
    const date = '2026-04-15';
    const sessionId = 'session-e2e-test-fixture';
    const diariesProjectDir = path.join(os.homedir(), '.arcforge', 'diaries', project);
    const diariesDateDir = path.join(diariesProjectDir, date);
    const sessionsProjectDir = path.join(os.homedir(), '.arcforge', 'sessions', project);
    fs.mkdirSync(diariesDateDir, { recursive: true });
    fs.mkdirSync(sessionsProjectDir, { recursive: true });

    try {
      const draftPath = path.join(diariesDateDir, `diary-${sessionId}-draft.md`);
      fs.writeFileSync(draftPath, STUB_DRAFT);

      const { spawnDiaryEnricher } = require('../session-tracker/end');

      const session = {
        project,
        sessionId,
        date,
        started: '2026-04-15T10:00:00Z',
        lastUpdated: '2026-04-15T10:05:00Z',
        userMessages: 3,
        toolCalls: 42,
        filesModified: ['/tmp/example.js'],
        userMessageContent: ['fix the auth bug', 'rerun tests', 'ship it'],
        toolsUsed: ['Read', 'Edit', 'Bash'],
      };

      spawnDiaryEnricher(draftPath, session);

      const enriched = await waitForEnrichment(draftPath, TIMEOUT_MS);
      const logPath = path.join(sessionsProjectDir, 'enricher.log');
      const logTail = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf-8').slice(-500) : '';
      assert.ok(
        enriched,
        `Draft was not enriched within ${TIMEOUT_MS}ms. Content still contains "TO BE ENRICHED".\n` +
          `enricher.log tail:\n${logTail}`,
      );

      assert.ok(enriched.includes('## Session Metrics'), 'metrics section should survive');
      assert.ok(
        enriched.includes('Tool calls'),
        'auto-generated metrics should survive enrichment',
      );
      assert.ok(fs.existsSync(logPath), 'enricher.log should exist (stderr capture working)');
    } finally {
      fs.rmSync(diariesProjectDir, { recursive: true, force: true });
      fs.rmSync(sessionsProjectDir, { recursive: true, force: true });
    }
  });
});
