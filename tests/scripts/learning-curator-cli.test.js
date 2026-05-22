// tests/scripts/learning-curator-cli.test.js
//
// Slice E.2 — CLI integration tests (assemble-batch + ingest-proposal subcommands).
// Uses execFileSync so HOME can be passed via env to child processes.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const CLI_PATH = path.resolve(__dirname, '../../scripts/lib/learning-curator/cli.js');

// ---------------------------------------------------------------------------
// HOME isolation — for child processes, pass HOME via env
// ---------------------------------------------------------------------------

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-cli-test-'));
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup failures
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedObservations(project, count = 12) {
  const obsDir = path.join(tmpDir, '.arcforge', 'observations', project);
  fs.mkdirSync(obsDir, { recursive: true });
  const obsPath = path.join(obsDir, 'observations.jsonl');
  for (let i = 0; i < count; i++) {
    const rec = {
      ts: `2026-05-21T01:${String(i).padStart(2, '0')}:00.000Z`,
      event: 'tool_start',
      tool: 'Read',
      session: 'session-abc123',
      project,
      project_id: 'proj_abc123456789ab',
      evidence_status: 'present',
      input_summary: `reading file ${i}`,
    };
    fs.appendFileSync(obsPath, `${JSON.stringify(rec)}\n`, 'utf8');
  }
  return obsPath;
}

function runCLI(args) {
  // Pass HOME to child process so Node's os.homedir() in the subprocess respects it
  const result = execFileSync('node', [CLI_PATH, ...args], {
    env: { ...process.env, HOME: tmpDir },
    encoding: 'utf8',
  });
  return result.trim();
}

// ---------------------------------------------------------------------------
// Test: assemble-batch subcommand
// ---------------------------------------------------------------------------

describe('CLI assemble-batch', () => {
  test('prints valid JSON line to stdout with expected fields', () => {
    const project = 'cli-test-project';
    seedObservations(project, 12);

    const output = runCLI(['assemble-batch', '--project', project]);
    const parsed = JSON.parse(output);

    expect(parsed.batch_id).toMatch(/^batch_/);
    expect(parsed.batch_hash).toBeTruthy();
    expect(parsed.manifest_path).toBeTruthy();
    expect(parsed.prompt_path).toBeTruthy();
    expect(parsed.project).toBe(project);
  });

  test('manifest file exists at manifest_path', () => {
    const project = 'manifest-check-project';
    seedObservations(project, 12);

    const output = runCLI(['assemble-batch', '--project', project]);
    const parsed = JSON.parse(output);

    expect(fs.existsSync(parsed.manifest_path)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(parsed.manifest_path, 'utf8'));
    expect(manifest.schema_version).toBe(1);
    expect(manifest.batch_id).toBe(parsed.batch_id);
  });

  test('prompt file exists at prompt_path', () => {
    const project = 'prompt-check-project';
    seedObservations(project, 12);

    const output = runCLI(['assemble-batch', '--project', project]);
    const parsed = JSON.parse(output);

    expect(fs.existsSync(parsed.prompt_path)).toBe(true);
    const promptContent = fs.readFileSync(parsed.prompt_path, 'utf8');
    expect(promptContent.length).toBeGreaterThan(100);
  });

  test('secrets in observations are redacted in prompt', () => {
    const project = 'redact-test-project';
    const obsDir = path.join(tmpDir, '.arcforge', 'observations', project);
    fs.mkdirSync(obsDir, { recursive: true });
    const obsPath = path.join(obsDir, 'observations.jsonl');
    for (let i = 0; i < 12; i++) {
      const rec = {
        ts: `2026-05-21T01:${String(i).padStart(2, '0')}:00.000Z`,
        event: 'tool_start',
        tool: 'Bash',
        session: 'session-abc123',
        project,
        project_id: 'proj_abc123456789ab',
        evidence_status: 'present',
        input_summary:
          i === 5 ? 'OPENAI_API_KEY=sk-super-secret-key command ran' : `normal op ${i}`,
      };
      fs.appendFileSync(obsPath, `${JSON.stringify(rec)}\n`, 'utf8');
    }

    const output = runCLI(['assemble-batch', '--project', project]);
    const parsed = JSON.parse(output);
    const promptContent = fs.readFileSync(parsed.prompt_path, 'utf8');

    expect(promptContent).not.toContain('sk-super-secret-key');
    expect(promptContent).toContain('[REDACTED]');
  });
});

// ---------------------------------------------------------------------------
// Test: help subcommand
// ---------------------------------------------------------------------------

describe('CLI help', () => {
  test('prints usage information', () => {
    const output = runCLI(['help']);
    expect(output.toLowerCase()).toMatch(/usage|subcommand|assemble-batch|ingest-proposal/);
  });
});

// ---------------------------------------------------------------------------
// PR-F: record-run-failure subcommand
// ---------------------------------------------------------------------------

describe('CLI record-run-failure', () => {
  test('writes manifest file and prints JSON result', () => {
    const output = runCLI([
      'record-run-failure',
      '--batch-id',
      'batch_test_rf_001',
      '--parse-status',
      'transport_error',
      '--detail',
      'claude exit 1',
    ]);
    const parsed = JSON.parse(output);
    expect(parsed.run_id).toMatch(/^curator_run_/);
    expect(parsed.parse_status).toBe('transport_error');
    expect(parsed.accepted).toBe(0);
    expect(parsed.rejected).toBe(0);

    // Manifest file must exist
    const runsDir = path.join(tmpDir, '.arcforge', 'learning', 'curator-runs');
    const manifestPath = path.join(runsDir, `${parsed.run_id}.manifest.json`);
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.parse_status).toBe('transport_error');
  });

  test('timeout parse-status persists correctly', () => {
    const output = runCLI([
      'record-run-failure',
      '--batch-id',
      'batch_test_rf_002',
      '--parse-status',
      'timeout',
      '--detail',
      'watchdog killed claude',
    ]);
    const parsed = JSON.parse(output);
    expect(parsed.parse_status).toBe('timeout');
  });

  test('cli_not_found parse-status persists correctly', () => {
    const output = runCLI([
      'record-run-failure',
      '--batch-id',
      'batch_test_rf_003',
      '--parse-status',
      'cli_not_found',
    ]);
    const parsed = JSON.parse(output);
    expect(parsed.parse_status).toBe('cli_not_found');
  });

  test('invalid parse-status exits non-zero', () => {
    const { spawnSync } = require('node:child_process');
    const result = spawnSync(
      'node',
      [
        CLI_PATH,
        'record-run-failure',
        '--batch-id',
        'batch_test_rf_bad',
        '--parse-status',
        'invalid_status',
      ],
      {
        env: { ...process.env, HOME: tmpDir },
        encoding: 'utf8',
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/parse-status|invalid|allowed/i);
  });

  test('missing batch-id exits non-zero', () => {
    const { spawnSync } = require('node:child_process');
    const result = spawnSync(
      'node',
      [CLI_PATH, 'record-run-failure', '--parse-status', 'timeout'],
      {
        env: { ...process.env, HOME: tmpDir },
        encoding: 'utf8',
      },
    );
    expect(result.status).not.toBe(0);
  });
});
