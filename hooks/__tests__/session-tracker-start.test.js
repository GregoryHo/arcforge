/**
 * session-tracker/start.js — checkDaemon honours the learning opt-in.
 *
 * learning B-1 / D-023: the observer daemon starts only when learning is
 * enabled in some scope for the project the session is in. The daemon path is
 * injected as a stub script so no real daemon is ever spawned here; the stub
 * leaves a marker file when it runs.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const START_PATH = require.resolve('../session-tracker/start');
const LEARNING_PATH = require.resolve('../../scripts/lib/learning');

describe('session-tracker/start: checkDaemon and the learning opt-in', () => {
  let testDir;
  let projectRoot;
  let stubDaemon;
  let marker;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-start-daemon-'));
    projectRoot = path.join(testDir, 'demo-project');
    fs.mkdirSync(projectRoot, { recursive: true });
    process.env.HOME = testDir;
    process.env.ARCFORGE_HOME = path.join(testDir, '.arcforge');
    process.env.CLAUDE_PROJECT_DIR = projectRoot;
    delete process.env.ARCFORGE_OBSERVE_NO_SPAWN;

    marker = path.join(testDir, 'daemon-ran');
    stubDaemon = path.join(testDir, 'stub-daemon.sh');
    fs.writeFileSync(stubDaemon, `#!/usr/bin/env bash\necho "$1" > "${marker}"\n`);

    delete require.cache[START_PATH];
    delete require.cache[LEARNING_PATH];
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
    delete require.cache[START_PATH];
    delete require.cache[LEARNING_PATH];
  });

  it('does not start the daemon when learning is off in every scope', () => {
    const { checkDaemon } = require('../session-tracker/start');

    assert.strictEqual(checkDaemon({ daemonPath: stubDaemon }), 'learning-disabled');
    assert.strictEqual(fs.existsSync(marker), false, 'daemon must not have been started');
  });

  it('does not start the daemon after the user opted out again', () => {
    const { setLearningEnabled } = require('../../scripts/lib/learning');
    setLearningEnabled({ scope: 'project', enabled: true, projectRoot });
    setLearningEnabled({ scope: 'project', enabled: false, projectRoot });
    const { checkDaemon } = require('../session-tracker/start');

    assert.strictEqual(checkDaemon({ daemonPath: stubDaemon }), 'learning-disabled');
    assert.strictEqual(fs.existsSync(marker), false, 'daemon must not have been started');
  });

  it('starts the daemon, and records the project root, under the project opt-in', () => {
    const {
      setLearningEnabled,
      isLearningEnabledForProject,
    } = require('../../scripts/lib/learning');
    setLearningEnabled({ scope: 'project', enabled: true, projectRoot });
    const { checkDaemon } = require('../session-tracker/start');

    assert.strictEqual(checkDaemon({ daemonPath: stubDaemon }), 'started');
    assert.strictEqual(fs.readFileSync(marker, 'utf8').trim(), 'start');
    assert.strictEqual(isLearningEnabledForProject('demo-project'), true);
  });

  it('starts the daemon under the global opt-in', () => {
    const { setLearningEnabled } = require('../../scripts/lib/learning');
    setLearningEnabled({ scope: 'global', enabled: true, projectRoot });
    const { checkDaemon } = require('../session-tracker/start');

    assert.strictEqual(checkDaemon({ daemonPath: stubDaemon }), 'started');
    assert.strictEqual(fs.existsSync(marker), true);
  });

  it('still honours ARCFORGE_OBSERVE_NO_SPAWN when learning is on', () => {
    const { setLearningEnabled } = require('../../scripts/lib/learning');
    setLearningEnabled({ scope: 'global', enabled: true, projectRoot });
    process.env.ARCFORGE_OBSERVE_NO_SPAWN = '1';
    const { checkDaemon } = require('../session-tracker/start');

    assert.strictEqual(checkDaemon({ daemonPath: stubDaemon }), 'no-spawn-env');
    assert.strictEqual(fs.existsSync(marker), false);
  });
});
