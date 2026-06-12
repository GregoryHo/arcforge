const {
  isStalled,
  isRetryStorm,
  checkStopConditions,
  parseLoopArgs,
  detectWorktree,
  buildTaskPrompt,
} = require('../../scripts/loop');

/**
 * Helper: build a minimal loop state with sensible defaults.
 */
function makeState(overrides = {}) {
  return {
    iteration: 0,
    completed_tasks: [],
    failed_tasks: [],
    errors: [],
    last_progress_at: null,
    total_cost: 0,
    status: 'running',
    ...overrides,
  };
}

/**
 * Helper: create an error entry for state.errors.
 */
function makeError(taskId, timestamp = '2026-03-17T10:00:00Z', extra = {}) {
  return {
    task_id: taskId,
    iteration: 1,
    error: 'something failed',
    timestamp,
    attempt: 1,
    ...extra,
  };
}

describe('loop safety mechanisms', () => {
  describe('isStalled', () => {
    it('returns false on a fresh loop (iteration 0)', () => {
      const state = makeState({ iteration: 0 });
      expect(isStalled(state)).toBe(false);
    });

    it('returns false when iteration count is below STALL_THRESHOLD and no progress yet', () => {
      const state = makeState({ iteration: 1 });
      expect(isStalled(state)).toBe(false);
    });

    it('returns true when iteration >= STALL_THRESHOLD with no progress ever', () => {
      // STALL_THRESHOLD is 2 — after 2 iterations with no completed tasks
      const state = makeState({ iteration: 2 });
      expect(isStalled(state)).toBe(true);
    });

    it('returns true when iteration exceeds STALL_THRESHOLD with no progress ever', () => {
      const state = makeState({ iteration: 5 });
      expect(isStalled(state)).toBe(true);
    });

    it('returns false when progress was made and no errors since', () => {
      const state = makeState({
        iteration: 10,
        last_progress_at: '2026-03-17T10:00:00Z',
        errors: [],
      });
      expect(isStalled(state)).toBe(false);
    });

    it('returns false when fewer than STALL_THRESHOLD errors occurred since last progress', () => {
      const state = makeState({
        iteration: 5,
        last_progress_at: '2026-03-17T10:00:00Z',
        errors: [
          // One error after progress — below threshold of 2
          makeError('task-1', '2026-03-17T10:01:00Z'),
        ],
      });
      expect(isStalled(state)).toBe(false);
    });

    it('returns true when STALL_THRESHOLD errors occurred after last progress', () => {
      const state = makeState({
        iteration: 5,
        last_progress_at: '2026-03-17T10:00:00Z',
        errors: [
          makeError('task-1', '2026-03-17T10:01:00Z'),
          makeError('task-2', '2026-03-17T10:02:00Z'),
        ],
      });
      expect(isStalled(state)).toBe(true);
    });

    it('ignores errors that occurred before last_progress_at', () => {
      const state = makeState({
        iteration: 10,
        last_progress_at: '2026-03-17T10:05:00Z',
        errors: [
          // These 3 errors all predate last progress — should be ignored
          makeError('task-1', '2026-03-17T10:01:00Z'),
          makeError('task-2', '2026-03-17T10:02:00Z'),
          makeError('task-3', '2026-03-17T10:03:00Z'),
        ],
      });
      expect(isStalled(state)).toBe(false);
    });

    it('correctly handles mix of old and new errors', () => {
      const state = makeState({
        iteration: 10,
        last_progress_at: '2026-03-17T10:05:00Z',
        errors: [
          // 2 old errors (before progress)
          makeError('task-1', '2026-03-17T10:01:00Z'),
          makeError('task-2', '2026-03-17T10:02:00Z'),
          // 2 new errors (after progress) — meets threshold
          makeError('task-3', '2026-03-17T10:06:00Z'),
          makeError('task-4', '2026-03-17T10:07:00Z'),
        ],
      });
      expect(isStalled(state)).toBe(true);
    });
  });

  describe('isRetryStorm', () => {
    it('returns false with no errors', () => {
      const state = makeState();
      expect(isRetryStorm(state)).toBe(false);
    });

    it('returns false with fewer than 3 total errors', () => {
      const state = makeState({
        errors: [makeError('task-1'), makeError('task-1')],
      });
      expect(isRetryStorm(state)).toBe(false);
    });

    it('returns true when same task fails 3 times in recent window', () => {
      const state = makeState({
        errors: [
          makeError('task-1', '2026-03-17T10:00:00Z'),
          makeError('task-1', '2026-03-17T10:01:00Z'),
          makeError('task-1', '2026-03-17T10:02:00Z'),
        ],
      });
      expect(isRetryStorm(state)).toBe(true);
    });

    it('returns false when 3 errors come from different tasks', () => {
      const state = makeState({
        errors: [
          makeError('task-1', '2026-03-17T10:00:00Z'),
          makeError('task-2', '2026-03-17T10:01:00Z'),
          makeError('task-3', '2026-03-17T10:02:00Z'),
        ],
      });
      expect(isRetryStorm(state)).toBe(false);
    });

    it('only inspects the last 6 errors (sliding window)', () => {
      const state = makeState({
        errors: [
          // These 3 old errors for task-1 should be outside the window
          makeError('task-1', '2026-03-17T10:00:00Z'),
          makeError('task-1', '2026-03-17T10:01:00Z'),
          makeError('task-1', '2026-03-17T10:02:00Z'),
          // 6 recent diverse errors push old ones out of window
          makeError('task-2', '2026-03-17T10:03:00Z'),
          makeError('task-3', '2026-03-17T10:04:00Z'),
          makeError('task-4', '2026-03-17T10:05:00Z'),
          makeError('task-5', '2026-03-17T10:06:00Z'),
          makeError('task-6', '2026-03-17T10:07:00Z'),
          makeError('task-7', '2026-03-17T10:08:00Z'),
        ],
      });
      expect(isRetryStorm(state)).toBe(false);
    });

    it('detects storm within the last 6 even with older diverse errors', () => {
      const state = makeState({
        errors: [
          // Old diverse errors
          makeError('task-a', '2026-03-17T10:00:00Z'),
          makeError('task-b', '2026-03-17T10:01:00Z'),
          makeError('task-c', '2026-03-17T10:02:00Z'),
          // Recent storm for task-x (within last 6)
          makeError('task-d', '2026-03-17T10:03:00Z'),
          makeError('task-x', '2026-03-17T10:04:00Z'),
          makeError('task-x', '2026-03-17T10:05:00Z'),
          makeError('task-x', '2026-03-17T10:06:00Z'),
        ],
      });
      expect(isRetryStorm(state)).toBe(true);
    });

    it('returns true at exactly 3 occurrences (boundary)', () => {
      const state = makeState({
        errors: [
          makeError('task-1'),
          makeError('task-2'),
          makeError('task-1'),
          makeError('task-2'),
          makeError('task-1'),
          makeError('task-2'),
        ],
      });
      // Both task-1 and task-2 appear 3 times in a 6-error window
      expect(isRetryStorm(state)).toBe(true);
    });
  });

  describe('checkStopConditions', () => {
    it('returns null when no stop conditions are met', () => {
      const state = makeState({
        iteration: 1,
        last_progress_at: '2026-03-17T10:00:00Z',
        total_cost: 0,
      });
      expect(checkStopConditions(state, null)).toBeNull();
    });

    it('returns "cost_limit" when total_cost >= maxCost', () => {
      const state = makeState({ total_cost: 10 });
      expect(checkStopConditions(state, 10)).toBe('cost_limit');
    });

    it('returns "cost_limit" when total_cost exceeds maxCost', () => {
      const state = makeState({ total_cost: 15 });
      expect(checkStopConditions(state, 10)).toBe('cost_limit');
    });

    it('ignores cost when maxCost is null', () => {
      const state = makeState({
        iteration: 1,
        total_cost: 9999,
        last_progress_at: '2026-03-17T10:00:00Z',
      });
      expect(checkStopConditions(state, null)).toBeNull();
    });

    it('returns "stalled" when loop is stalled', () => {
      const state = makeState({ iteration: 3 });
      expect(checkStopConditions(state, null)).toBe('stalled');
    });

    it('returns "retry_storm" when retry storm is detected', () => {
      const state = makeState({
        iteration: 1,
        last_progress_at: '2026-03-17T10:00:00Z',
        errors: [
          makeError('task-1', '2026-03-17T09:00:00Z'),
          makeError('task-1', '2026-03-17T09:01:00Z'),
          makeError('task-1', '2026-03-17T09:02:00Z'),
        ],
      });
      expect(checkStopConditions(state, null)).toBe('retry_storm');
    });

    it('checks cost before stall (cost_limit takes priority)', () => {
      const state = makeState({
        iteration: 5,
        total_cost: 20,
      });
      // Both stalled (iteration 5, no progress) and over cost
      expect(checkStopConditions(state, 10)).toBe('cost_limit');
    });

    it('checks stall before retry storm (stall takes priority)', () => {
      const state = makeState({
        iteration: 5,
        errors: [
          makeError('task-1', '2026-03-17T10:00:00Z'),
          makeError('task-1', '2026-03-17T10:01:00Z'),
          makeError('task-1', '2026-03-17T10:02:00Z'),
        ],
      });
      // Both stalled (iteration 5, no progress) and retry storm
      expect(checkStopConditions(state, null)).toBe('stalled');
    });
  });
});

describe('parseLoopArgs', () => {
  it('should parse --epic flag', () => {
    const result = parseLoopArgs(['--pattern', 'sequential', '--epic', 'epic-001']);
    expect(result.epic).toBe('epic-001');
    expect(result.pattern).toBe('sequential');
  });

  it('should default epic to null when not specified', () => {
    const result = parseLoopArgs(['--pattern', 'dag']);
    expect(result.epic).toBeNull();
  });

  it('should parse --epic with other flags', () => {
    const result = parseLoopArgs(['--epic', 'my-epic', '--max-runs', '10', '--max-cost', '5']);
    expect(result.epic).toBe('my-epic');
    expect(result.maxRuns).toBe(10);
    expect(result.maxCost).toBe(5);
  });

  it('should parse --task-timeout in seconds to taskTimeoutMs', () => {
    const result = parseLoopArgs(['--task-timeout', '900']);
    expect(result.taskTimeoutMs).toBe(900000);
  });

  it('should default spawn pass-through options to null', () => {
    const result = parseLoopArgs([]);
    expect(result.taskTimeoutMs).toBeNull();
    expect(result.permissionMode).toBeNull();
    expect(result.allowedTools).toBeNull();
  });

  it('should pass through --permission-mode and --allowed-tools values', () => {
    const result = parseLoopArgs([
      '--permission-mode',
      'acceptEdits',
      '--allowed-tools',
      'Bash,Read',
    ]);
    expect(result.permissionMode).toBe('acceptEdits');
    expect(result.allowedTools).toBe('Bash,Read');
  });
});

describe('buildTaskPrompt', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { Coordinator } = require('../../scripts/lib/coordinator');

  let tmpDir;
  let savedPm;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-prompt-'));
    // Pin package-manager detection to lock-file resolution for determinism
    savedPm = process.env.CLAUDE_PACKAGE_MANAGER;
    delete process.env.CLAUDE_PACKAGE_MANAGER;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (savedPm !== undefined) process.env.CLAUDE_PACKAGE_MANAGER = savedPm;
  });

  /**
   * Helper: write a per-spec dag.yaml fixture (sdd-v2 layout) and return a
   * Coordinator bound to it. Mirrors tests/integration/sdd-v2-pipeline.
   */
  function makeSpecProject({
    specId = 'demo-spec',
    specPathValue = 'epics/epic-parser/epic.md',
    createEpicDoc = true,
    nodeProject = true,
    lintScript = false,
  } = {}) {
    const specDir = path.join(tmpDir, 'specs', specId);
    fs.mkdirSync(specDir, { recursive: true });
    const lines = ['epics:', '  - id: epic-parser', '    name: Parser Primitives'];
    if (specPathValue) lines.push(`    spec_path: ${specPathValue}`);
    lines.push(
      '    status: pending',
      '    worktree: null',
      '    depends_on: []',
      '    features:',
      '      - id: fr-parser-001',
      '        name: parseInteger Primitive',
      '        status: pending',
      '        depends_on: []',
      '',
    );
    fs.writeFileSync(path.join(specDir, 'dag.yaml'), lines.join('\n'));
    if (createEpicDoc) {
      const epicDir = path.join(specDir, 'epics', 'epic-parser');
      fs.mkdirSync(epicDir, { recursive: true });
      fs.writeFileSync(path.join(epicDir, 'epic.md'), '# Epic: Parser Primitives\n');
    }
    if (nodeProject) {
      const scripts = lintScript ? { test: 'jest', lint: 'biome check .' } : { test: 'jest' };
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'fixture', version: '1.0.0', scripts }),
      );
      // Lock file pins detectPackageManager to npm regardless of host config
      fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '{}');
    }
    return new Coordinator(tmpDir, specId);
  }

  it('emits a spec-dir-relative spec_path resolvable from the spawn cwd (sdd-v2 fixture convention)', () => {
    const coord = makeSpecProject();
    const prompt = buildTaskPrompt(coord.dag.getTask('epic-parser'), coord, tmpDir);

    const match = prompt.match(/^Spec: (.+)$/m);
    expect(match).not.toBeNull();
    expect(match[1]).toBe(path.join('specs', 'demo-spec', 'epics', 'epic-parser', 'epic.md'));
    // The emitted path must exist from the spawn cwd (projectRoot)
    expect(fs.existsSync(path.resolve(tmpDir, match[1]))).toBe(true);
  });

  it('emits the epic docs directory when specs/<spec-id>/epics/<epic-id>/ exists', () => {
    const coord = makeSpecProject();
    const prompt = buildTaskPrompt(coord.dag.getTask('epic-parser'), coord, tmpDir);

    const match = prompt.match(/^Epic docs: (.+)$/m);
    expect(match).not.toBeNull();
    expect(fs.existsSync(path.resolve(tmpDir, match[1]))).toBe(true);
  });

  it('resolves project-root-relative spec_path (arc-planning convention)', () => {
    const coord = makeSpecProject({
      specPathValue: 'specs/demo-spec/epics/epic-parser/epic.md',
    });
    const prompt = buildTaskPrompt(coord.dag.getTask('epic-parser'), coord, tmpDir);

    const match = prompt.match(/^Spec: (.+)$/m);
    expect(match).not.toBeNull();
    expect(match[1]).toBe(path.join('specs', 'demo-spec', 'epics', 'epic-parser', 'epic.md'));
    expect(fs.existsSync(path.resolve(tmpDir, match[1]))).toBe(true);
  });

  it('resolves the parent epic spec source for feature tasks via taskContext', () => {
    const coord = makeSpecProject();
    const prompt = buildTaskPrompt(coord.dag.getTask('fr-parser-001'), coord, tmpDir);

    const match = prompt.match(/^Spec: (.+)$/m);
    expect(match).not.toBeNull();
    expect(fs.existsSync(path.resolve(tmpDir, match[1]))).toBe(true);
  });

  it('omits the Specs section for legacy dags without spec_path', () => {
    const coord = makeSpecProject({ specPathValue: null, createEpicDoc: false });
    const prompt = buildTaskPrompt(coord.dag.getTask('epic-parser'), coord, tmpDir);

    expect(prompt).not.toContain('Spec:');
    expect(prompt).not.toContain('## Specs');
  });

  it('omits spec_path entries that do not exist on disk', () => {
    const coord = makeSpecProject({ createEpicDoc: false });
    const prompt = buildTaskPrompt(coord.dag.getTask('epic-parser'), coord, tmpDir);

    expect(prompt).not.toContain('Spec:');
  });

  it('uses the detected test command for Node projects', () => {
    const coord = makeSpecProject();
    const prompt = buildTaskPrompt(coord.dag.getTask('epic-parser'), coord, tmpDir);

    expect(prompt).toContain('Run `npm test` and verify all tests pass');
  });

  it('emits a pytest verification line for pyproject projects', () => {
    const coord = makeSpecProject({ nodeProject: false });
    fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '[project]\nname = "fixture"\n');
    const prompt = buildTaskPrompt(coord.dag.getTask('epic-parser'), coord, tmpDir);

    expect(prompt).toContain('Run `pytest tests/ -v` and verify all tests pass');
    expect(prompt).not.toContain('npm test');
  });

  it('omits the verification block when the project type is unknown', () => {
    const coord = makeSpecProject({ nodeProject: false });
    const prompt = buildTaskPrompt(coord.dag.getTask('epic-parser'), coord, tmpDir);

    expect(prompt).not.toContain('## Verification');
  });

  it('emits the lint line only when package.json has a lint script', () => {
    const withLint = makeSpecProject({ lintScript: true });
    const promptWithLint = buildTaskPrompt(withLint.dag.getTask('epic-parser'), withLint, tmpDir);
    expect(promptWithLint).toContain('Run `npm run lint` and fix any issues');

    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'fixture', version: '1.0.0', scripts: { test: 'jest' } }),
    );
    const withoutLint = new Coordinator(tmpDir, 'demo-spec');
    const promptNoLint = buildTaskPrompt(
      withoutLint.dag.getTask('epic-parser'),
      withoutLint,
      tmpDir,
    );
    expect(promptNoLint).not.toContain('npm run lint');
  });
});

describe('detectWorktree', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');

  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should detect worktree when .arcforge-epic exists', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.arcforge-epic'),
      'epic: eval-core\nbase_worktree: /project/root\n',
    );
    const result = detectWorktree(tmpDir);
    expect(result.inWorktree).toBe(true);
    expect(result.epicId).toBe('eval-core');
    expect(result.basePath).toBe('/project/root');
  });

  it('should return inWorktree false when no marker file', () => {
    const result = detectWorktree(tmpDir);
    expect(result.inWorktree).toBe(false);
    expect(result.epicId).toBeNull();
    expect(result.basePath).toBeNull();
  });

  it('should handle malformed marker file gracefully', () => {
    fs.writeFileSync(path.join(tmpDir, '.arcforge-epic'), 'garbage content');
    const result = detectWorktree(tmpDir);
    expect(result.inWorktree).toBe(true);
    expect(result.epicId).toBeNull();
  });
});
