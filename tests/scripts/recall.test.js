// tests/scripts/recall.test.js
//
// Criterion 1: recall.js save-record command emits a recall operation record.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const scriptPath = path.join(__dirname, '../../skills/arc-recalling/scripts/recall.js');

describe('recall.js CLI', () => {
  describe('check-duplicate command', () => {
    it('exits with error when missing arguments', () => {
      expect(() => {
        execFileSync('node', [scriptPath, 'check-duplicate'], {
          encoding: 'utf-8',
          stdio: 'pipe',
        });
      }).toThrow();
    });
  });

  describe('usage', () => {
    it('shows usage when no command given', () => {
      try {
        execFileSync('node', [scriptPath], { encoding: 'utf-8', stdio: 'pipe' });
      } catch (err) {
        expect(err.stdout.toString()).toContain('recall');
        expect(err.status).toBe(1);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Criterion 1: save-record command emits a recall operation record
// ---------------------------------------------------------------------------

describe('recall.js save-record command (criterion 1)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-recall-op-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('saves a recall operation record to ~/.arcforge/recalls/<project>/', () => {
    const recallId = 'recall-20260522T010000Z-abcd1234';
    execFileSync(
      'node',
      [
        scriptPath,
        'save-record',
        '--project',
        'test-project',
        '--recall-id',
        recallId,
        '--session',
        'session-abc',
        '--query',
        'grep patterns',
        '--summary',
        'Found grep instinct',
        '--home-dir',
        tmpDir,
      ],
      { encoding: 'utf-8' },
    );

    const expectedPath = path.join(
      tmpDir,
      '.arcforge',
      'recalls',
      'test-project',
      `${recallId}.md`,
    );
    expect(fs.existsSync(expectedPath)).toBe(true);

    const content = fs.readFileSync(expectedPath, 'utf-8');
    expect(content).toContain(`recall_id: ${recallId}`);
    expect(content).toContain('Found grep instinct');
  });

  it('exits with error when missing required --project', () => {
    expect(() => {
      execFileSync('node', [scriptPath, 'save-record', '--recall-id', 'recall-x'], {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    }).toThrow();
  });

  it('exits with error when missing required --recall-id', () => {
    expect(() => {
      execFileSync('node', [scriptPath, 'save-record', '--project', 'test-project'], {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    }).toThrow();
  });
});
