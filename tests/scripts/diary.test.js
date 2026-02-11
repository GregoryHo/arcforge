// tests/scripts/diary.test.js

const { execFileSync } = require('node:child_process');
const _fs = require('node:fs');
const path = require('node:path');
const _os = require('node:os');

describe('diary.js CLI', () => {
  const scriptPath = path.join(__dirname, '../../skills/arc-journaling/scripts/diary.js');

  describe('path command', () => {
    it('returns correct path for given arguments', () => {
      const result = execFileSync(
        'node',
        [
          scriptPath,
          'path',
          '--project',
          'test-project',
          '--date',
          '2026-01-15',
          '--session',
          'abc123',
        ],
        { encoding: 'utf-8' },
      );
      expect(result.trim()).toContain('.claude');
      expect(result.trim()).toContain('sessions');
      expect(result.trim()).toContain('test-project');
      expect(result.trim()).toContain('2026-01-15');
      expect(result.trim()).toContain('diary-abc123.md');
    });

    it('exits with error when missing arguments', () => {
      expect(() => {
        execFileSync('node', [scriptPath, 'path', '--project', 'test-project'], {
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
