// tests/scripts/learning-enabled-since.test.js
//
// The effective opt-in (learning B-19, D-051): the start of the unbroken
// stretch of any-scope authorization that reaches the present. It is both the
// stale-draft floor (hooks B-6) and the start of what the curator may analyze
// (learning B-1), so it is read by `learningEnabledSince` and
// `learningEnabledSinceForProject` alike. Each scope keeps its latest
// authorized period in `enabled_at` (its start) and `updated_at` (its latest
// transition — the disable that ended it, when disabled).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  getLearningConfigPath,
  learningEnabledSince,
  learningEnabledSinceForProject,
  recordProjectRoot,
  setLearningEnabled,
} = require('../../scripts/lib/learning');

const T1 = '2026-01-01T00:00:00.000Z';
const T2 = '2026-03-01T00:00:00.000Z';
const T3 = '2026-06-01T00:00:00.000Z';
const T4 = '2026-08-01T00:00:00.000Z';
const T5 = '2026-10-01T00:00:00.000Z';
// Kept for the cases moved from learning.test.js, which name them this way.
const EARLY = T1;
const LATE = T3;

describe('the effective learning opt-in', () => {
  let testDir;
  let projectRoot;
  let homeDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-enabled-since-'));
    projectRoot = path.join(testDir, 'project');
    homeDir = path.join(testDir, 'home');
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.mkdirSync(homeDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  const configPath = (scope) => getLearningConfigPath({ scope, projectRoot, homeDir });
  const set = (scope, enabled, now) =>
    setLearningEnabled({ scope, enabled, projectRoot, homeDir, now });
  const since = () => learningEnabledSince({ projectRoot, homeDir });
  const readConfig = (scope) => JSON.parse(fs.readFileSync(configPath(scope), 'utf8'));

  /**
   * A toggle as a 6.1.2–6.2.x engine records it: the config merged, `enabled`
   * set, `updated_at` stamped on a change and kept on a no-op — and neither
   * `enabled_at` nor `disabled_at` touched, because that engine does not know them.
   */
  function legacyToggle(scope, enabled, now) {
    const file = configPath(scope);
    const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    const changed = (existing.enabled === true) !== enabled;
    const updated_at = changed ? now : (existing.updated_at ?? now);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ ...existing, scope, enabled, updated_at }));
  }

  /** Write a scope's config by hand — a legacy or hand-edited file. */
  function writeConfig(scope, config, mtime) {
    const file = configPath(scope);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ scope, ...config }));
    if (mtime) fs.utimesSync(file, new Date(mtime), new Date(mtime));
    return file;
  }

  describe('learningEnabledSince', () => {
    it('is null when neither scope is enabled', () => {
      expect(since()).toBeNull();
    });

    it("returns the enabled scope's stamp", () => {
      set('project', true, LATE);
      expect(since()).toBe(Date.parse(LATE));
    });

    it('returns the EARLIEST scope — when enrichment first became authorized', () => {
      set('global', true, EARLY);
      set('project', true, LATE);
      expect(since()).toBe(Date.parse(EARLY));
    });

    // `learn enable --project` is a copy-paste step in four user-facing
    // surfaces, so re-running it on an already-enabled scope is routine. It
    // stamps no transition and must not move the floor.
    it('does not move when an already-enabled scope is enabled again', () => {
      set('project', true, EARLY);
      const config = set('project', true, LATE);
      // The CLI prints this returned config, so it carries the same stamps.
      expect(config.updated_at).toBe(EARLY);
      expect(config.enabled_at).toBe(EARLY);
      expect(since()).toBe(Date.parse(EARLY));
    });

    // A real consent toggle with no other scope on is a lapse, so it DOES move
    // the floor: nothing reaches back across an opt-out (D-023).
    it('moves when the only enabled scope is disabled and re-enabled', () => {
      set('project', true, EARLY);
      set('project', false, EARLY);
      set('project', true, LATE);
      expect(since()).toBe(Date.parse(LATE));
    });

    it('ignores a disabled scope whose period does not reach the live one', () => {
      set('project', true, EARLY);
      set('global', false, LATE);
      expect(since()).toBe(Date.parse(EARLY));
    });

    it.each([
      ['missing', { enabled: true }],
      ['unparseable', { enabled: true, updated_at: 'garbage' }],
      ['not a string', { enabled: true, updated_at: {} }],
    ])('falls back to the config mtime when updated_at is %s', (_label, config) => {
      const file = writeConfig('project', config);
      expect(since()).toBe(fs.statSync(file).mtimeMs);
    });

    // Writing an unstamped config MOVES its mtime, so the fallback above has to
    // be captured before the write rather than re-derived after it — otherwise
    // an idempotent re-enable silently retires every draft that failed
    // enrichment between the old mtime and the repeated command.
    it('preserves the mtime fallback when an unstamped enabled scope is enabled again', () => {
      writeConfig('project', { enabled: true }, EARLY);
      const config = set('project', true, LATE);
      expect(config.updated_at).toBe(EARLY);
      expect(since()).toBe(Date.parse(EARLY));
    });

    it('still stamps the transition when an unstamped scope is actually toggled', () => {
      writeConfig('project', { enabled: true }, EARLY);
      set('project', false, LATE);
      set('project', true, LATE);
      expect(since()).toBe(Date.parse(LATE));
    });

    // The preservation keys on "the state did not change", not on "the state is
    // on", so a no-op DISABLE materializes the mtime as well. That is inert: the
    // floor reads a disabled scope only through `enabled_at`, which a no-op
    // leaves absent, so a materialized mtime never becomes a period start.
    it('materializes the mtime on a no-op disable, where the floor ignores it', () => {
      writeConfig('project', { enabled: false }, EARLY);
      const config = set('project', false, LATE);
      expect(config.updated_at).toBe(EARLY);
      expect(config.enabled_at).toBeUndefined();
      expect(since()).toBeNull();
    });
  });

  // #164: disabling the scope that carries the earliest opt-in no longer
  // advances the floor while the other scope stays on.
  describe('overlapping scopes (D-051)', () => {
    it('keeps T1 when global (T1) is disabled at T3 after project came on at T2', () => {
      set('global', true, T1);
      set('project', true, T2);
      set('global', false, T3);
      expect(since()).toBe(Date.parse(T1));
      expect(readConfig('global')).toEqual({
        scope: 'global',
        enabled: false,
        updated_at: T3,
        enabled_at: T1,
        disabled_at: T3,
      });
    });

    it('keeps T1 the other way round: project (T1) off at T3, global on since T2', () => {
      set('project', true, T1);
      set('global', true, T2);
      set('project', false, T3);
      expect(since()).toBe(Date.parse(T1));
    });

    it('starts at T2 when global was off at T3 before project came on at T2 (a lapse)', () => {
      set('global', true, T1);
      set('global', false, T2);
      set('project', true, T3);
      expect(since()).toBe(Date.parse(T3));
    });

    // A disable and an enable stamped at the same instant leave the same state
    // whichever came first, so the engine cannot show they overlapped. It
    // reads a lapse: too late only hides a warning, too early breaks consent.
    it.each([
      ['after', ['project', true, T2], ['global', false, T2]],
      ['before', ['global', false, T2], ['project', true, T2]],
    ])('does not join a disable stamped at the instant the other scope came on (%s)', (_order, a, b) => {
      set('global', true, T1);
      set(...a);
      set(...b);
      expect(since()).toBe(Date.parse(T2));
    });

    it('is null when both scopes have been disabled, whatever their periods', () => {
      set('global', true, T1);
      set('project', true, T2);
      set('global', false, T3);
      set('project', false, T4);
      expect(since()).toBeNull();
    });

    // Residual (D-051): only a scope's latest period is kept, so an overlap
    // that ended before that scope's last re-enable is not recovered.
    it('does not recover an overlap older than the scope’s last re-enable', () => {
      set('global', true, T1);
      set('project', true, T2);
      set('global', false, T3);
      set('global', true, T4);
      expect(readConfig('global').enabled_at).toBe(T4);
      expect(since()).toBe(Date.parse(T2));
    });

    it('agrees through learningEnabledSinceForProject when the root is on record', () => {
      set('global', true, T1);
      set('project', true, T2);
      recordProjectRoot({ projectRoot, homeDir });
      set('global', false, T3);
      expect(learningEnabledSinceForProject('project', { homeDir })).toBe(Date.parse(T1));
    });
  });

  // A config written before `enabled_at` existed reads exactly as 6.2 read it:
  // its `updated_at` while enabled, nothing while disabled.
  describe('legacy configs without enabled_at', () => {
    it.each([
      ['project', 'global'],
      ['global', 'project'],
    ])('reads an enabled legacy %s scope by its updated_at', (scope) => {
      writeConfig(scope, { enabled: true, updated_at: T2 });
      expect(since()).toBe(Date.parse(T2));
    });

    it.each([
      ['project', 'global'],
      ['global', 'project'],
    ])('gives a disabled legacy %s scope no period', (scope, other) => {
      writeConfig(scope, { enabled: false, updated_at: T3 });
      set(other, true, T2);
      expect(since()).toBe(Date.parse(T2));
    });

    it('keeps the legacy start through its first disable', () => {
      writeConfig('global', { enabled: true, updated_at: T1 });
      set('project', true, T2);
      set('global', false, T3);
      expect(readConfig('global')).toMatchObject({
        enabled: false,
        updated_at: T3,
        enabled_at: T1,
      });
      expect(since()).toBe(Date.parse(T1));
    });

    it('keeps a legacy mtime start through its first disable', () => {
      writeConfig('global', { enabled: true }, T1);
      set('project', true, T2);
      set('global', false, T3);
      expect(readConfig('global').enabled_at).toBe(T1);
      expect(since()).toBe(Date.parse(T1));
    });

    it('gives a never-enabled scope no period through a disable', () => {
      set('project', true, T2);
      set('global', false, T1);
      expect(readConfig('global').enabled_at).toBeUndefined();
      expect(since()).toBe(Date.parse(T2));
    });
  });

  describe('what each write does to enabled_at', () => {
    it('an enable that changes the state writes it', () => {
      expect(set('project', true, T1)).toMatchObject({ updated_at: T1, enabled_at: T1 });
    });

    it('a re-enable after a disable starts a new period', () => {
      set('project', true, T1);
      set('project', false, T2);
      expect(set('project', true, T3)).toMatchObject({ updated_at: T3, enabled_at: T3 });
    });

    it('an idempotent enable leaves both stamps', () => {
      set('project', true, T1);
      set('project', true, T2);
      expect(readConfig('project')).toMatchObject({ updated_at: T1, enabled_at: T1 });
    });

    it('a disable keeps it and stamps the transition in updated_at and disabled_at', () => {
      set('project', true, T1);
      expect(set('project', false, T2)).toMatchObject({
        updated_at: T2,
        enabled_at: T1,
        disabled_at: T2,
      });
    });

    it('an idempotent disable leaves both stamps', () => {
      set('project', true, T1);
      set('project', false, T2);
      set('project', false, T3);
      expect(readConfig('project')).toMatchObject({
        updated_at: T2,
        enabled_at: T1,
        disabled_at: T2,
      });
    });

    it('keeps keys it does not own through every kind of write', () => {
      writeConfig('global', { enabled: false, inject_activated_instincts: false, x: 1 });
      for (const [enabled, now] of [
        [true, T1],
        [true, T2],
        [false, T3],
        [false, T4],
      ]) {
        set('global', enabled, now);
        expect(readConfig('global')).toMatchObject({ inject_activated_instincts: false, x: 1 });
      }
    });

    // Schema: the opt-in config's owner is learning.js, and this is the whole
    // shape it writes — `disabled_at` from the first disable on, equal to the
    // `updated_at` that disable stamped.
    it.each([
      [[[true, T1]], ['enabled', 'enabled_at', 'scope', 'updated_at']],
      [
        [
          [true, T1],
          [false, T2],
        ],
        ['disabled_at', 'enabled', 'enabled_at', 'scope', 'updated_at'],
      ],
    ])('writes exactly the keys it owns (%#)', (writes, keys) => {
      for (const [enabled, now] of writes) set('project', enabled, now);
      const config = readConfig('project');
      expect(Object.keys(config).sort()).toEqual(keys);
      expect(config.scope).toBe('project');
      expect(typeof config.enabled).toBe('boolean');
      for (const key of ['updated_at', 'enabled_at', 'disabled_at'].filter((k) => k in config)) {
        expect(Number.isNaN(Date.parse(config[key]))).toBe(false);
      }
      if (!config.enabled) expect(config.disabled_at).toBe(config.updated_at);
    });
  });

  describe('hand-edited and inconsistent stamps', () => {
    it.each([
      ['unparseable', 'garbage'],
      ['not a string', 42],
    ])('reads an enabled scope by updated_at when enabled_at is %s', (_label, value) => {
      writeConfig('project', { enabled: true, updated_at: T2, enabled_at: value });
      expect(since()).toBe(Date.parse(T2));
    });

    it('gives a disabled scope with an unusable enabled_at no period', () => {
      writeConfig('global', {
        enabled: false,
        updated_at: T3,
        enabled_at: 'garbage',
        disabled_at: T3,
      });
      set('project', true, T2);
      expect(since()).toBe(Date.parse(T2));
    });

    it('replaces an unusable enabled_at with the start it ends on a disable', () => {
      writeConfig('global', { enabled: true, updated_at: T1, enabled_at: 'garbage' });
      set('project', true, T2);
      set('global', false, T3);
      expect(readConfig('global').enabled_at).toBe(T1);
      expect(since()).toBe(Date.parse(T1));
    });

    it('gives a disabled scope with no usable updated_at no period', () => {
      writeConfig('global', { enabled: false, enabled_at: T1 });
      set('project', true, T2);
      expect(since()).toBe(Date.parse(T2));
    });

    // Clock skew: enabled_at later than the transition stamp.
    it('reads an enabled scope from enabled_at when it is later than updated_at', () => {
      writeConfig('project', { enabled: true, updated_at: T1, enabled_at: T2 });
      expect(since()).toBe(Date.parse(T2));
    });

    it('gives a disabled scope whose enabled_at is after its disable no period', () => {
      writeConfig('global', { enabled: false, updated_at: T2, enabled_at: T3, disabled_at: T2 });
      set('project', true, T2);
      expect(since()).toBe(Date.parse(T2));
    });

    // An enable written by an engine that did not know `enabled_at` (6.2.x)
    // stamps `updated_at` and leaves an older period's `enabled_at` behind.
    // The later stamp wins, so a stale start never reaches back across the
    // opt-out that ended that older period.
    it('does not reach back to an enabled_at older than the enable it carries', () => {
      writeConfig('project', { enabled: true, updated_at: T3, enabled_at: T1 });
      expect(since()).toBe(Date.parse(T3));
      set('project', false, T4);
      expect(readConfig('project').enabled_at).toBe(T3);
    });
  });

  // A disabled scope's period is trusted only when `disabled_at` equals its
  // `updated_at`: an engine that does not know the marker stamps `updated_at`
  // on its transitions and leaves the marker behind, so a mismatch means a
  // transition 6.3 did not record — and the period it would imply is unproven.
  describe('a period another engine may have touched', () => {
    it('trusts the period a 6.3 disable recorded', () => {
      writeConfig('global', { enabled: false, enabled_at: T1, updated_at: T3, disabled_at: T3 });
      set('project', true, T2);
      expect(since()).toBe(Date.parse(T1));
    });

    it('gives a disabled scope with no disabled_at no period', () => {
      writeConfig('global', { enabled: false, enabled_at: T1, updated_at: T3 });
      set('project', true, T2);
      expect(since()).toBe(Date.parse(T2));
    });

    it('gives a disabled scope whose disabled_at differs from updated_at no period', () => {
      writeConfig('global', { enabled: false, enabled_at: T1, updated_at: T3, disabled_at: T2 });
      set('project', true, T2);
      expect(since()).toBe(Date.parse(T2));
    });

    // QA's sequences (#164 review). Truth is T3 — the 6.2 enable after a lapse;
    // reading T1 would make the pre-lapse observations analyzable (D-023).
    it('6.3 g+T1, 6.3 g-T2, 6.2 g+T3, 6.3 p+T4, 6.2 g-T5 does not reach back to T1', () => {
      set('global', true, T1);
      set('global', false, T2);
      legacyToggle('global', true, T3);
      set('project', true, T4);
      legacyToggle('global', false, T5);
      expect(since()).toBe(Date.parse(T4));
    });

    it('6.2 g+T1, 6.3 g-T2, 6.2 g+T3, 6.2 p+T4, 6.2 g-T5 does not reach back to T1', () => {
      legacyToggle('global', true, T1);
      set('global', false, T2);
      legacyToggle('global', true, T3);
      legacyToggle('project', true, T4);
      legacyToggle('global', false, T5);
      expect(since()).toBe(Date.parse(T4));
    });

    // The enabled branch: a 6.2 enable after a 6.3 disable leaves the old
    // `enabled_at`, but its own `updated_at` is later and wins.
    it('6.3 g+T1, 6.3 g-T2, 6.2 g+T3 reads T3, and a 6.3 disable then keeps T3', () => {
      set('global', true, T1);
      set('global', false, T2);
      legacyToggle('global', true, T3);
      expect(since()).toBe(Date.parse(T3));
      set('project', true, T4);
      set('global', false, T5);
      expect(readConfig('global')).toMatchObject({ enabled_at: T3, disabled_at: T5 });
      expect(since()).toBe(Date.parse(T3));
    });

    // L1: a no-op disable materializes `updated_at` from the mtime, but it
    // writes no marker, so a hand-written start still gains no period.
    it('a no-op disable does not invent a period for a hand-written enabled_at', () => {
      writeConfig('global', { enabled: false, enabled_at: T1 }, T5);
      set('project', true, T4);
      expect(since()).toBe(Date.parse(T4));
      set('global', false, T5);
      expect(since()).toBe(Date.parse(T4));
    });
  });

  // B-19: a project with no recorded root is authorized by the global scope
  // alone, so its effective opt-in reads that scope and nothing else.
  describe('learningEnabledSinceForProject without a recorded root', () => {
    const forProject = () => learningEnabledSinceForProject('never-seen', { homeDir });

    it('is the global enabled_at while global is on', () => {
      set('global', true, T1);
      expect(forProject()).toBe(Date.parse(T1));
    });

    it('is the legacy global updated_at while global is on', () => {
      writeConfig('global', { enabled: true, updated_at: T2 });
      expect(forProject()).toBe(Date.parse(T2));
    });

    it('is null once global is off, whatever period it kept', () => {
      set('global', true, T1);
      set('global', false, T3);
      expect(forProject()).toBeNull();
    });
  });
});
