// tests/scripts/reflect.test.js

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('reflect.js CLI', () => {
  const scriptPath = path.join(__dirname, '../../skills/arc-reflecting/scripts/reflect.js');

  describe('strategy command', () => {
    it('returns a valid strategy', () => {
      const result = execFileSync('node', [scriptPath, 'strategy', '--project', 'nonexistent-project'], { encoding: 'utf-8' });
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
        execFileSync('node', [scriptPath, 'scan', '--project', 'test'], { encoding: 'utf-8', stdio: 'pipe' });
      }).toThrow();
    });
  });

  describe('update-log command', () => {
    it('exits with error when missing arguments', () => {
      expect(() => {
        execFileSync('node', [scriptPath, 'update-log', '--project', 'test'], { encoding: 'utf-8', stdio: 'pipe' });
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
