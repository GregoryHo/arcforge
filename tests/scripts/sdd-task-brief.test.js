const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { buildTaskBrief } = require('../../skills/arc-agent-driven/scripts/task-brief');

let repoDir;

function git(args) {
  return execFileSync('git', args, { cwd: repoDir, encoding: 'utf8', stdio: 'pipe' }).trim();
}

beforeEach(() => {
  repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-task-brief-'));
  git(['init', '-q']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'Test']);
  git(['config', 'commit.gpgsign', 'false']);
});

afterEach(() => {
  fs.rmSync(repoDir, { recursive: true, force: true });
});

describe('buildTaskBrief path-traversal guard', () => {
  it('rejects a --number that would escape the .arcforge/sdd/ workspace', () => {
    expect(() =>
      buildTaskBrief({
        task: 'do the thing',
        base: 'HEAD',
        number: 'x/../../../../etc/evil',
        cwd: repoDir,
      }),
    ).toThrow(/path separators|parent directory|filename/i);
  });

  it('writes nothing — not even the workspace — for a traversal-y --number', () => {
    expect(() =>
      buildTaskBrief({
        task: 'do the thing',
        base: 'HEAD',
        number: 'x/../../../../etc/evil',
        cwd: repoDir,
      }),
    ).toThrow();
    // The guard fires before the workspace is created, so no brief is written
    // anywhere — inside or outside the repo.
    expect(fs.existsSync(path.join(repoDir, '.arcforge'))).toBe(false);
  });

  it('writes a valid numeric task brief inside the .arcforge/sdd/ workspace', () => {
    const { outPath } = buildTaskBrief({
      task: 'do the thing',
      base: 'HEAD',
      number: '7',
      cwd: repoDir,
    });
    expect(path.basename(outPath)).toBe('task-7-brief.md');
    expect(path.basename(path.dirname(outPath))).toBe('sdd');
    expect(path.basename(path.dirname(path.dirname(outPath)))).toBe('.arcforge');
    expect(fs.existsSync(outPath)).toBe(true);
  });
});
