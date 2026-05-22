// tests/scripts/reflect.test.js

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

describe('reflect.js CLI', () => {
  const scriptPath = path.join(__dirname, '../../skills/arc-reflecting/scripts/reflect.js');

  describe('strategy command', () => {
    it('returns a valid strategy', () => {
      const result = execFileSync(
        'node',
        [scriptPath, 'strategy', '--project', 'nonexistent-project'],
        { encoding: 'utf-8' },
      );
      expect(['unprocessed', 'project_focused', 'recent_window']).toContain(result.trim());
    });

    it('exits with error when missing project', () => {
      expect(() => {
        execFileSync('node', [scriptPath, 'strategy'], { encoding: 'utf-8', stdio: 'pipe' });
      }).toThrow();
    });
  });

  describe('scan command', () => {
    it('exits with error when missing arguments', () => {
      expect(() => {
        execFileSync('node', [scriptPath, 'scan', '--project', 'test'], {
          encoding: 'utf-8',
          stdio: 'pipe',
        });
      }).toThrow();
    });
  });

  describe('update-log command', () => {
    it('exits with error when missing arguments', () => {
      expect(() => {
        execFileSync('node', [scriptPath, 'update-log', '--project', 'test'], {
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
        expect(err.stdout.toString()).toContain('Usage:');
        expect(err.status).toBe(1);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Criterion 1: save-record command emits a reflection operation record
// ---------------------------------------------------------------------------

describe('reflect.js save-record command (criterion 1)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-reflect-op-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  const scriptPath = path.join(__dirname, '../../skills/arc-reflecting/scripts/reflect.js');

  it('saves a reflection operation record to ~/.arcforge/reflections/<project>/', () => {
    const reflectId = 'reflect-20260522T010000Z-abcd1234';
    execFileSync(
      'node',
      [
        scriptPath,
        'save-record',
        '--project',
        'test-project',
        '--reflect-id',
        reflectId,
        '--session',
        'session-abc',
        '--diaries',
        'diary-1.md,diary-2.md',
        '--summary',
        'Grep pattern found',
        '--home-dir',
        tmpDir,
      ],
      { encoding: 'utf-8' },
    );

    const expectedPath = path.join(
      tmpDir,
      '.arcforge',
      'reflections',
      'test-project',
      `${reflectId}.md`,
    );
    expect(fs.existsSync(expectedPath)).toBe(true);

    const content = fs.readFileSync(expectedPath, 'utf-8');
    expect(content).toContain(`reflect_id: ${reflectId}`);
    expect(content).toContain('Grep pattern found');
  });

  it('exits with error when missing required --project', () => {
    expect(() => {
      execFileSync('node', [scriptPath, 'save-record', '--reflect-id', 'reflect-x'], {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    }).toThrow();
  });

  it('exits with error when missing required --reflect-id', () => {
    expect(() => {
      execFileSync('node', [scriptPath, 'save-record', '--project', 'test-project'], {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    }).toThrow();
  });
});
