// tests/scripts/session-archive.test.js
//
// Behaviour of the session archive engine behind `arcforge session` (cli B-9):
// which tracker record feeds the metrics header, where save writes, how list
// orders, how an alias or a path resolves, and what resume prints.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { findLatestSessionRecord, getSessionById } = require('../../scripts/lib/session-records');
const {
  saveArchive,
  listArchives,
  resolveSessionRef,
  formatSessionBriefing,
} = require('../../scripts/lib/session-archive');
const { resolveAlias, setAlias } = require('../../scripts/lib/session-aliases');

const FIVE = `# Parser work

## Where it stands
feat/parser; npm test — 41 passed

## Done
- tokenizer — verified by npm test

## Unfinished
none

## Decisions
none

## Next
1. node scripts/cli.js parse fixtures/a.txt
`;

let home;
let prevHome;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'session-archive-'));
  prevHome = process.env.ARCFORGE_HOME;
  process.env.ARCFORGE_HOME = home;
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.ARCFORGE_HOME;
  else process.env.ARCFORGE_HOME = prevHome;
  fs.rmSync(home, { recursive: true, force: true });
});

function writeRecord(project, date, record) {
  const dir = path.join(home, 'sessions', project, date);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${record.sessionId}.json`), JSON.stringify(record));
}

describe('findLatestSessionRecord', () => {
  it('returns null when the project has no tracker record', () => {
    expect(findLatestSessionRecord('none')).toBeNull();
  });

  it('picks the most recently updated record across date directories', () => {
    writeRecord('p', '2026-10-02', {
      sessionId: 'session-old',
      lastUpdated: '2026-10-02T23:00:00Z',
    });
    writeRecord('p', '2026-10-03', { sessionId: 'session-a', lastUpdated: '2026-10-03T09:00:00Z' });
    writeRecord('p', '2026-10-03', { sessionId: 'session-b', lastUpdated: '2026-10-03T10:00:00Z' });
    fs.mkdirSync(path.join(home, 'sessions', 'p', '2026-10-04'));
    expect(findLatestSessionRecord('p').sessionId).toBe('session-b');
  });

  it('a record in an older date directory with a later lastUpdated wins (midnight)', () => {
    writeRecord('p', '2026-10-02', {
      sessionId: 'session-overnight',
      started: '2026-10-02T23:30:00Z',
      lastUpdated: '2026-10-03T01:00:00Z',
    });
    writeRecord('p', '2026-10-03', {
      sessionId: 'session-today',
      started: '2026-10-03T00:10:00Z',
      lastUpdated: '2026-10-03T00:20:00Z',
    });
    expect(findLatestSessionRecord('p').sessionId).toBe('session-overnight');
  });

  it('breaks a lastUpdated tie by the later started', () => {
    writeRecord('p', '2026-10-02', {
      sessionId: 'session-early',
      started: '2026-10-02T22:00:00Z',
      lastUpdated: '2026-10-03T01:00:00Z',
    });
    writeRecord('p', '2026-10-03', {
      sessionId: 'session-late',
      started: '2026-10-03T00:30:00Z',
      lastUpdated: '2026-10-03T01:00:00Z',
    });
    writeRecord('p', '2026-10-01', {
      sessionId: 'session-mid',
      started: '2026-10-02T23:00:00Z',
      lastUpdated: '2026-10-03T01:00:00Z',
    });
    expect(findLatestSessionRecord('p').sessionId).toBe('session-late');
  });

  it('skips an unparseable record file', () => {
    writeRecord('p', '2026-10-03', { sessionId: 'session-a', lastUpdated: '2026-10-03T09:00:00Z' });
    fs.writeFileSync(path.join(home, 'sessions', 'p', '2026-10-03', 'session-bad.json'), '{');
    expect(findLatestSessionRecord('p').sessionId).toBe('session-a');
  });
});

describe('getSessionById', () => {
  beforeEach(() => {
    writeRecord('p', '2026-10-02', {
      sessionId: 'session-abc1',
      lastUpdated: '2026-10-02T09:00:00Z',
    });
    writeRecord('p', '2026-10-03', {
      sessionId: 'session-abd2',
      lastUpdated: '2026-10-03T09:00:00Z',
    });
  });

  it('selects the one record whose id starts with the prefix, with or without session-', () => {
    expect(getSessionById('p', 'abc').sessionId).toBe('session-abc1');
    expect(getSessionById('p', 'session-abd').sessionId).toBe('session-abd2');
  });

  it('refuses an ambiguous prefix, naming the matches', () => {
    expect(() => getSessionById('p', 'ab')).toThrow(
      /--session "ab" matches 2 records: session-abc1, session-abd2/,
    );
  });

  it('refuses a prefix that matches nothing, naming the project', () => {
    expect(() => getSessionById('p', 'zzz')).toThrow(
      /no session-tracker record matches --session "zzz" in project "p"/,
    );
  });
});

describe('saveArchive', () => {
  const now = new Date('2026-10-03T12:00:00.000Z');

  it('writes archive-<alias>-<UTC stamp>.md under sessions/<project>/<date>/, aliased', () => {
    writeRecord('p', '2026-10-03', {
      sessionId: 'session-b',
      started: '2026-10-03T11:00:00Z',
      lastUpdated: '2026-10-03T11:30:00Z',
      toolCalls: 9,
      userMessages: 2,
      filesModified: [],
    });
    const result = saveArchive('p', 'parser', FIVE, { now });
    const expected = path.join(
      home,
      'sessions',
      'p',
      '2026-10-03',
      'archive-parser-20261003T120000Z.md',
    );
    expect(result).toEqual({
      alias: 'parser',
      path: expected,
      project: 'p',
      isNew: true,
      session: 'session-b',
    });
    const md = fs.readFileSync(expected, 'utf8');
    expect(md).toContain('**Duration:** ~30 minutes');
    expect(md).toContain('**Files modified:** none recorded');
    expect(resolveAlias('p', 'parser').sessionPath).toBe(expected);
  });

  it('reads the record --session selects instead of the latest', () => {
    writeRecord('p', '2026-10-03', {
      sessionId: 'session-old',
      lastUpdated: '2026-10-03T08:00:00Z',
    });
    writeRecord('p', '2026-10-03', {
      sessionId: 'session-new',
      lastUpdated: '2026-10-03T09:00:00Z',
    });
    const result = saveArchive('p', 'picked', FIVE, { now, sessionId: 'old' });
    expect(result.session).toBe('session-old');
  });

  it('refuses a second save under the same alias without force, writing nothing', () => {
    const first = saveArchive('p', 'parser', FIVE, { now });
    const next = new Date('2026-10-04T08:00:00Z');
    expect(() => saveArchive('p', 'parser', FIVE, { now: next })).toThrow(
      /alias "parser" already exists.*--force/,
    );
    expect(fs.existsSync(path.join(home, 'sessions', 'p', '2026-10-04'))).toBe(false);
    expect(resolveAlias('p', 'parser').sessionPath).toBe(first.path);
  });

  it('never replaces an archive: a later same-day save writes a new file, the old one stays', () => {
    const first = saveArchive('p', 'parser', FIVE, { now });
    const later = saveArchive('p', 'parser', FIVE.replace('# Parser work', '# Later'), {
      now: new Date('2026-10-03T12:00:07.000Z'),
      force: true,
    });
    expect(path.basename(later.path)).toBe('archive-parser-20261003T120007Z.md');
    expect(fs.readFileSync(first.path, 'utf8')).toMatch(/^# Parser work\n/);
    expect(resolveAlias('p', 'parser').sessionPath).toBe(later.path);
  });

  it('a save in the same second as an existing archive takes the next -N suffix', () => {
    const names = [1, 2, 3].map(() =>
      path.basename(saveArchive('p', 'parser', FIVE, { now, force: true }).path),
    );
    expect(names).toEqual([
      'archive-parser-20261003T120000Z.md',
      'archive-parser-20261003T120000Z-2.md',
      'archive-parser-20261003T120000Z-3.md',
    ]);
    const dir = path.join(home, 'sessions', 'p', '2026-10-03');
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('with force, a second save repoints the alias and reports isNew false', () => {
    saveArchive('p', 'parser', FIVE, { now });
    const later = saveArchive('p', 'parser', FIVE, {
      now: new Date('2026-10-04T08:00:00Z'),
      force: true,
    });
    expect(later.isNew).toBe(false);
    expect(resolveAlias('p', 'parser').sessionPath).toBe(later.path);
    expect(later.path).toContain(`${path.sep}2026-10-04${path.sep}`);
  });

  it('rejects an invalid alias before writing anything', () => {
    for (const bad of ['../x', 'a/b', 'has space', 'a.b', 'x'.repeat(129), '']) {
      expect(() => saveArchive('p', bad, FIVE, { now })).toThrow(/alias/i);
    }
    expect(fs.existsSync(path.join(home, 'sessions', 'p'))).toBe(false);
  });

  it('rejects text above the first section other than the # title, naming it', () => {
    const stray = `# Parser work\nsome stray note\n\n${FIVE.replace('# Parser work\n', '')}`;
    expect(() => saveArchive('p', 'stray', stray, { now })).toThrow(
      /text above the first section: "some stray note"/,
    );
    expect(fs.existsSync(path.join(home, 'sessions', 'p'))).toBe(false);
  });

  it('rejects a second # title line above the first section, quoting it', () => {
    const two = `# T1\n# T2\n\n${FIVE.replace('# Parser work\n', '')}`;
    expect(() => saveArchive('p', 'twotitles', two, { now })).toThrow(
      /a second # title line: "# T2"/,
    );
    expect(fs.existsSync(path.join(home, 'sessions', 'p'))).toBe(false);
  });

  it('without hard links, creates each archive exclusively instead — never replacing one', () => {
    const spy = jest.spyOn(fs, 'linkSync').mockImplementation(() => {
      throw Object.assign(new Error('ENOTSUP: operation not supported'), { code: 'ENOTSUP' });
    });
    try {
      const first = saveArchive('p', 'fat', FIVE, { now });
      const second = saveArchive('p', 'fat', FIVE.replace('# Parser work', '# Second'), {
        now,
        force: true,
      });
      expect(path.basename(first.path)).toBe('archive-fat-20261003T120000Z.md');
      expect(path.basename(second.path)).toBe('archive-fat-20261003T120000Z-2.md');
      expect(fs.readFileSync(first.path, 'utf8')).toMatch(/^# Parser work\n/);
      expect(fs.readFileSync(second.path, 'utf8')).toMatch(/^# Second\n/);
      expect(resolveAlias('p', 'fat').sessionPath).toBe(second.path);
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
    const dir = path.join(home, 'sessions', 'p', '2026-10-03');
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('a link error other than no-hard-links still fails the save', () => {
    const spy = jest.spyOn(fs, 'linkSync').mockImplementation(() => {
      throw Object.assign(new Error('EIO: i/o error'), { code: 'EIO' });
    });
    try {
      expect(() => saveArchive('p', 'eio', FIVE, { now })).toThrow(/EIO/);
    } finally {
      spy.mockRestore();
    }
    expect(fs.readdirSync(path.join(home, 'sessions', 'p', '2026-10-03'))).toEqual([]);
  });

  it('rejects input that is not the five sections, naming the problem', () => {
    expect(() => saveArchive('p', 'x', '## Done\nstuff\n', { now })).toThrow(
      /missing handover section\(s\): Where it stands, Unfinished, Decisions, Next/,
    );
    expect(() => saveArchive('p', 'x', 42, { now })).toThrow(/input must be a string/);
  });
});

describe('save then resume', () => {
  it('round-trips a record whose file path carries a newline and a ## heading', () => {
    writeRecord('p', '2026-10-03', {
      sessionId: 'session-b',
      lastUpdated: '2026-10-03T11:30:00Z',
      filesModified: ['ok.js', 'x\n## Done\ny.js'],
    });
    const saved = saveArchive('p', 'evil', FIVE, { now: new Date('2026-10-03T12:00:00Z') });
    const briefing = formatSessionBriefing(fs.readFileSync(saved.path, 'utf8'), saved.path);
    expect(briefing).toContain('- `ok.js`\n- `x## Doney.js`');
    expect(briefing.match(/^## Done$/gm)).toHaveLength(1);
  });
});

describe('listArchives', () => {
  it('lists archives only, newest first, with every alias pointing at each', () => {
    writeRecord('p', '2026-10-03', { sessionId: 'session-b', lastUpdated: '2026-10-03T10:00:00Z' });
    const v5Dir = path.join(home, 'sessions', 'p', '2026-10-01');
    fs.mkdirSync(v5Dir, { recursive: true });
    fs.writeFileSync(path.join(v5Dir, 'session-old.md'), '## Summary\nx\n');
    const a = saveArchive('p', 'first', FIVE, { now: new Date('2026-10-02T12:00:00Z') });
    const b = saveArchive('p', 'second', FIVE, { now: new Date('2026-10-03T12:00:00Z') });
    setAlias('p', 'also-first', a.path);

    const list = listArchives('p');
    expect(list.map((e) => e.path)).toEqual([b.path, a.path]);
    expect(list[0]).toEqual({
      date: '2026-10-03',
      path: b.path,
      title: 'Parser work',
      aliases: ['second'],
    });
    expect(list[1].aliases.sort()).toEqual(['also-first', 'first']);
  });

  it('lists every archive of a re-saved alias, newest first, the alias on the newest only', () => {
    const now = new Date('2026-10-03T12:00:00.000Z');
    const a = saveArchive('p', 'parser', FIVE, { now });
    const b = saveArchive('p', 'parser', FIVE, { now, force: true });
    const c = saveArchive('p', 'parser', FIVE, {
      now: new Date('2026-10-03T12:00:01.000Z'),
      force: true,
    });
    const list = listArchives('p');
    expect(list.map((e) => e.path)).toEqual([c.path, b.path, a.path]);
    expect(list.map((e) => e.aliases)).toEqual([['parser'], [], []]);
  });

  it('honours limit and returns [] for a project with no archives', () => {
    saveArchive('p', 'one', FIVE, { now: new Date('2026-10-02T12:00:00Z') });
    saveArchive('p', 'two', FIVE, { now: new Date('2026-10-03T12:00:00Z') });
    expect(listArchives('p', { limit: 1 }).map((e) => e.aliases[0])).toEqual(['two']);
    expect(listArchives('empty')).toEqual([]);
  });
});

describe('resolveSessionRef', () => {
  it('resolves an alias to its archive path', () => {
    const saved = saveArchive('p', 'parser', FIVE, { now: new Date() });
    expect(resolveSessionRef('p', 'parser', home)).toBe(saved.path);
  });

  it('resolves a relative .md path against cwd, and an absolute one as is', () => {
    const dir = path.join(home, 'repo', '.handovers');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, '2026-10-03-parser.md');
    fs.writeFileSync(file, FIVE);
    expect(resolveSessionRef('p', '.handovers/2026-10-03-parser.md', path.join(home, 'repo'))).toBe(
      file,
    );
    expect(resolveSessionRef('p', file, '/')).toBe(file);
  });

  it('fails naming the alias, the project and the file when neither exists', () => {
    expect(() => resolveSessionRef('p', 'nope', home)).toThrow(
      /no session alias "nope" in project "p", and no file \.\/nope/,
    );
  });

  it('reads a bare name as a file in cwd when no alias has that name', () => {
    const file = path.join(home, 'HANDOVER');
    fs.writeFileSync(file, FIVE);
    expect(resolveSessionRef('p', 'HANDOVER', home)).toBe(file);
  });

  it('prefers the alias when a bare name is both an alias and a file', () => {
    const saved = saveArchive('p', 'parser', FIVE, { now: new Date() });
    fs.writeFileSync(path.join(home, 'parser'), FIVE);
    expect(resolveSessionRef('p', 'parser', home)).toBe(saved.path);
  });

  it('fails when a path does not name an existing file', () => {
    expect(() => resolveSessionRef('p', 'missing/x.md', home)).toThrow(/not a file: .*missing/);
  });

  it('fails when an alias points at a file that is gone', () => {
    const saved = saveArchive('p', 'parser', FIVE, { now: new Date() });
    fs.rmSync(saved.path);
    expect(() => resolveSessionRef('p', 'parser', home)).toThrow(
      /alias "parser" points at .* not a file/,
    );
  });
});

describe('formatSessionBriefing', () => {
  it('prints the source, the header and the five sections', () => {
    const saved = saveArchive('p', 'parser', FIVE, { now: new Date('2026-10-03T12:00:00Z') });
    const briefing = formatSessionBriefing(fs.readFileSync(saved.path, 'utf8'), saved.path);
    expect(briefing.split('\n')[0]).toBe(`Source: ${saved.path}`);
    expect(briefing).toContain('# Parser work');
    expect(briefing).toContain('**Alias:** parser');
    for (const h of ['Where it stands', 'Done', 'Unfinished', 'Decisions', 'Next']) {
      expect(briefing).toContain(`## ${h}`);
    }
    expect(briefing).toContain('node scripts/cli.js parse fixtures/a.txt');
  });

  it('reads a handover file the same way', () => {
    const briefing = formatSessionBriefing(`${FIVE}\n## Scratch\nignored\n`, 'h.md');
    expect(briefing).toContain('## Next');
    expect(briefing).not.toContain('Scratch');
  });

  it('refuses a v5 archive', () => {
    expect(() => formatSessionBriefing('## Summary\nx\n## Next Step\ny\n', 'old.md')).toThrow(
      /v5 session archive format/,
    );
  });
});
