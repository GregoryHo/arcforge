// tests/scripts/arcforge-home-isolation.test.js
//
// Regression lock for the v6/P5 home-resolver unification.
//
// THE DEFECT THIS PINS: the engine used to carry two independent home
// resolvers. `getArcforgeHome()` honored ARCFORGE_HOME, but the whole curator
// layer (queue-writer, dashboard-events, proposal-ingestor, batch-assembler,
// materialize, activate), the observer daemon script, operation-record-writer
// and worktree-paths resolved `os.homedir()`/`$HOME` directly. Consequences:
//   - `eval-trial-env.js` sets only ARCFORGE_HOME, so any trial that reached
//     those modules wrote into the REAL user home while believing it was
//     isolated;
//   - the learning e2e probe could not be run at all without redirecting HOME,
//     because "walk the curator chain" and "do not touch the real home" were
//     mutually exclusive.
//
// Every assertion below sets ARCFORGE_HOME to a throwaway directory and demands
// that the derived path land under it. A module that regresses to os.homedir()
// produces a path under the real home and fails here.
//
// The second half asserts the OTHER half of the contract: with ARCFORGE_HOME
// unset, every resolver still produces exactly `<home>/.arcforge/...`. The fix
// must be invisible to a real session.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** Load a module fresh so any module-level path capture is re-evaluated. */
function freshRequire(relPath) {
  const abs = require.resolve(relPath);
  delete require.cache[abs];
  return require(abs);
}

/** Run `fn` with ARCFORGE_HOME set (or deleted when `home` is null). */
function withArcforgeHome(home, fn) {
  const previous = process.env.ARCFORGE_HOME;
  if (home === null) delete process.env.ARCFORGE_HOME;
  else process.env.ARCFORGE_HOME = home;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.ARCFORGE_HOME;
    else process.env.ARCFORGE_HOME = previous;
  }
}

/** Where a regressed module would write instead of the redirected home. */
const realArcforgeRoot = path.join(os.homedir(), '.arcforge');

describe('ARCFORGE_HOME redirects every arcforge-root resolver', () => {
  let home;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-home-lock-'));
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  /** Assert a produced path lives under the redirected home, not the real one. */
  const expectIsolated = (produced, label) => {
    expect(typeof produced).toBe('string');
    expect(`${label}: ${produced}`).toBe(`${label}: ${produced}`);
    expect(produced.startsWith(home)).toBe(true);
    expect(produced.startsWith(os.homedir())).toBe(false);
  };

  it('utils.getArcforgeHome is the resolver everything else defers to', () => {
    withArcforgeHome(home, () => {
      const { getArcforgeHome } = freshRequire('../../scripts/lib/utils');
      expect(getArcforgeHome()).toBe(home);
    });
  });

  it('learning-curator/queue-writer writes the candidate store under it', () => {
    withArcforgeHome(home, () => {
      const qw = freshRequire('../../scripts/lib/learning-curator/queue-writer');
      // No path getters are exported; drive the real writer and observe where
      // the store lands. An invalid record still produces a rejections file.
      try {
        qw.rejectProposal(['regression lock'], { source: 'test' });
      } catch {
        // Store may refuse the shape; the directory creation is what matters.
      }
      const candidates = path.join(home, 'learning', 'candidates');
      expect(fs.existsSync(candidates)).toBe(true);
      expectIsolated(candidates, 'queue-writer candidates dir');
    });
  });

  it('learning-curator/dashboard-events resolves the same store as queue-writer', () => {
    withArcforgeHome(home, () => {
      const events = fs.readFileSync(
        path.join(__dirname, '../../scripts/lib/learning-curator/dashboard-events.js'),
        'utf8',
      );
      const writer = fs.readFileSync(
        path.join(__dirname, '../../scripts/lib/learning-curator/queue-writer.js'),
        'utf8',
      );
      // Both must derive from getArcforgeHome(); two writers of one file that
      // disagree on its location is the defect class this whole test exists for.
      expect(events).toContain("path.join(getArcforgeHome(), 'learning', 'candidates')");
      expect(writer).toContain("path.join(getArcforgeHome(), 'learning', 'candidates')");
      expect(events).not.toContain('os.homedir()');
    });
  });

  it('learning.js resolves global config, queue and observations under it', () => {
    withArcforgeHome(home, () => {
      const learning = freshRequire('../../scripts/lib/learning');
      expectIsolated(learning.getLearningConfigPath({ scope: 'global' }), 'global config');
      expectIsolated(learning.getCandidateQueuePath({ scope: 'global' }), 'global queue');
      expectIsolated(learning.getObservationPath({ projectRoot: '/tmp/proj' }), 'observations');
    });
  });

  it('session-utils resolves instincts, diaries and observations under it', () => {
    withArcforgeHome(home, () => {
      const su = freshRequire('../../scripts/lib/session-utils');
      expectIsolated(su.getInstinctsDir('proj'), 'instincts dir');
      expectIsolated(su.getInstinctsArchivedDir('proj'), 'archived instincts dir');
      expectIsolated(su.getGlobalInstinctsDir(), 'global instincts dir');
      expectIsolated(su.getObservationsPath('proj'), 'observations path');
      expectIsolated(su.getProcessedLogPath('proj'), 'processed log');
    });
  });

  it('operation-record-writer writes reflect and recall records under it', () => {
    // This is the one assertion here that WRITES rather than deriving a path,
    // so it is also the one that can pollute the real home if the module
    // regresses. A unique project name per run keeps a leak identifiable, and
    // the finally block removes anything that escaped — a failing test must not
    // also leave litter in the developer's home.
    const project = `p5lock-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
    const escaped = [
      path.join(realArcforgeRoot, 'reflections', project),
      path.join(realArcforgeRoot, 'recalls', project),
    ];
    try {
      withArcforgeHome(home, () => {
        const writer = freshRequire('../../scripts/lib/operation-record-writer');
        writer.saveReflectionRecord({ reflect_id: 'reflect-lock', project, source_diary_ids: [] });
        writer.saveRecallRecord({ recall_id: 'recall-lock', project, returned_instinct_ids: [] });

        expect(fs.existsSync(path.join(home, 'reflections', project, 'reflect-lock.md'))).toBe(
          true,
        );
        expect(fs.existsSync(path.join(home, 'recalls', project, 'recall-lock.md'))).toBe(true);
        // Explicit: nothing may have landed in the real home.
        expect(escaped.filter((p) => fs.existsSync(p))).toEqual([]);
      });
    } finally {
      for (const dir of escaped) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('worktree-paths resolves the worktree root under it', () => {
    withArcforgeHome(home, () => {
      const wp = freshRequire('../../scripts/lib/worktree-paths');
      expectIsolated(wp.getWorktreeRoot(), 'worktree root');
    });
  });

  it('learning-dashboard resolves its root and action log under it', () => {
    withArcforgeHome(home, () => {
      const src = fs.readFileSync(
        path.join(__dirname, '../../scripts/lib/learning-dashboard.js'),
        'utf8',
      );
      expect(src).toContain('getArcforgeHome()');
      expect(src).not.toContain("path.join(os.homedir(), '.arcforge'");
    });
  });

  it('materialize and activate resolve their default root through the shared resolver', () => {
    for (const file of ['materialize.js', 'activate.js']) {
      const src = fs.readFileSync(
        path.join(__dirname, '../../scripts/lib/learning-curator', file),
        'utf8',
      );
      expect(src).toContain('arcforgeRoot || getArcforgeHome()');
      expect(src).not.toContain("path.join(os.homedir(), '.arcforge')");
    }
  });

  it('batch-assembler and proposal-ingestor fall back to the shared resolver', () => {
    for (const file of ['batch-assembler.js', 'proposal-ingestor.js']) {
      const src = fs.readFileSync(
        path.join(__dirname, '../../scripts/lib/learning-curator', file),
        'utf8',
      );
      expect(src).toContain("homeDir ? path.join(homeDir, '.arcforge') : getArcforgeHome()");
      expect(src).not.toMatch(/homeOverride \|\| os\.homedir\(\)/);
    }
  });

  it('the observer daemon script honors ARCFORGE_HOME with a $HOME fallback', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../scripts/lib/learning-curator/observer-daemon.sh'),
      'utf8',
    );
    // biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter expansion, not a JS template
    expect(src).toContain('ARCFORGE_DIR="${ARCFORGE_HOME:-${HOME}/.arcforge}"');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter expansion, not a JS template
    expect(src).not.toContain('ARCFORGE_DIR="${HOME}/.arcforge"');
  });

  it('no production module under scripts/ resolves an arcforge root from os.homedir()', () => {
    // The scan is the real lock: a NEW module reintroducing the split resolver
    // fails here even though no assertion above names it.
    const roots = [path.join(__dirname, '../../scripts')];
    const offenders = [];

    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith('.js') || entry.name.endsWith('.test.js')) continue;
        // utils.js owns the definition of getArcforgeHome itself.
        if (full.endsWith(path.join('scripts', 'lib', 'utils.js'))) continue;
        const text = fs.readFileSync(full, 'utf8');
        for (const line of text.split('\n')) {
          if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) continue;
          if (
            /os\.homedir\(\)[^)]*['"]\.arcforge['"]|['"]\.arcforge['"][^)]*os\.homedir\(\)/.test(
              line,
            )
          ) {
            offenders.push(`${path.relative(roots[0], full)}: ${line.trim()}`);
          }
        }
      }
    };
    walk(roots[0]);

    expect(offenders).toEqual([]);
  });
});

describe('with ARCFORGE_HOME unset the resolution is unchanged', () => {
  // The fix must be invisible to a real session: every resolver still lands on
  // exactly <home>/.arcforge/... A regression that made ARCFORGE_HOME mandatory,
  // or that changed the default layout, fails here.
  const realRoot = path.join(os.homedir(), '.arcforge');

  it('getArcforgeHome falls back to ~/.arcforge', () => {
    withArcforgeHome(null, () => {
      const { getArcforgeHome } = freshRequire('../../scripts/lib/utils');
      expect(getArcforgeHome()).toBe(realRoot);
    });
  });

  it('learning.js global paths keep their historical shape', () => {
    withArcforgeHome(null, () => {
      const learning = freshRequire('../../scripts/lib/learning');
      expect(learning.getLearningConfigPath({ scope: 'global' })).toBe(
        path.join(realRoot, 'learning', 'config.json'),
      );
      expect(learning.getCandidateQueuePath({ scope: 'global' })).toBe(
        path.join(realRoot, 'learning', 'candidates', 'queue.jsonl'),
      );
    });
  });

  it('worktree root keeps its historical shape', () => {
    withArcforgeHome(null, () => {
      const wp = freshRequire('../../scripts/lib/worktree-paths');
      expect(wp.getWorktreeRoot()).toBe(path.join(realRoot, 'worktrees'));
    });
  });

  it('an explicit homeDir override still wins over both', () => {
    // Tests and callers that pass homeDir keep the <home>/.arcforge shape even
    // when ARCFORGE_HOME points somewhere else — the override is the innermost
    // scope, and existing suites depend on it.
    const explicit = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-explicit-'));
    try {
      withArcforgeHome('/somewhere/else', () => {
        const learning = freshRequire('../../scripts/lib/learning');
        expect(learning.getLearningConfigPath({ scope: 'global', homeDir: explicit })).toBe(
          path.join(explicit, '.arcforge', 'learning', 'config.json'),
        );
        const wp = freshRequire('../../scripts/lib/worktree-paths');
        expect(wp.getWorktreeRoot(explicit)).toBe(path.join(explicit, '.arcforge', 'worktrees'));
      });
    } finally {
      fs.rmSync(explicit, { recursive: true, force: true });
    }
  });
});
