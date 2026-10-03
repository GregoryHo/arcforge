// tests/scripts/session-schemas.test.js
//
// Schema tests for the two on-disk formats behind `arcforge session` (cli B-9):
// the session archive (owner: scripts/lib/session-utils.js) and the per-project
// alias index aliases.json (owner: scripts/lib/session-aliases.js).
//
// Each format gets both sides: the real writer's real output must have the
// pinned shape, and malformed input must be rejected by the reader.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  generateSession,
  readHandover,
  saveArchive,
  HANDOVER_SECTIONS,
  ARCHIVE_HEADER_FIELDS,
} = require('../../scripts/lib/session-utils');
const { getAliasesPath, setAlias } = require('../../scripts/lib/session-aliases');

const FIVE = `# Parser work — 2026-10-03

## Where it stands
feat/parser; npm test — 41 passed

## Done
- tokenizer — verified by npm test

## Unfinished
- parser wiring — written but untested

## Decisions
- hand-rolled parser — because zero deps; rejected a PEG library

## Next
1. node scripts/cli.js parse fixtures/a.txt
`;

const RECORD = {
  sessionId: 'session-abc',
  project: 'proj',
  date: '2026-10-03',
  started: '2026-10-03T10:00:00.000Z',
  lastUpdated: '2026-10-03T10:42:00.000Z',
  toolCalls: 120,
  userMessages: 8,
  filesModified: ['src/a.js', 'src/b.js'],
  userMessageContent: ['please fix the secret-sauce bug'],
  toolsUsed: ['Read', 'Edit'],
};

let home;
let prevHome;

beforeAll(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'session-schemas-'));
  prevHome = process.env.ARCFORGE_HOME;
  process.env.ARCFORGE_HOME = home;
});

afterAll(() => {
  if (prevHome === undefined) delete process.env.ARCFORGE_HOME;
  else process.env.ARCFORGE_HOME = prevHome;
  fs.rmSync(home, { recursive: true, force: true });
});

const META = {
  project: 'proj',
  alias: 'parser-work',
  date: '2026-10-03',
  savedAt: '2026-10-03T11:00:00.000Z',
};

describe('session archive format', () => {
  const archive = () => generateSession(RECORD, readHandover(FIVE, 'input'), META);

  it('opens with one H1, then the header fields in their pinned order', () => {
    const lines = archive().split('\n');
    expect(lines[0]).toBe('# Parser work — 2026-10-03');
    const fields = lines
      .map((l) => l.match(/^\*\*([^*]+):\*\* /))
      .filter(Boolean)
      .map((m) => m[1]);
    expect(fields).toEqual(ARCHIVE_HEADER_FIELDS);
    expect(ARCHIVE_HEADER_FIELDS).toEqual([
      'Project',
      'Alias',
      'Saved',
      'Session',
      'Metrics',
      'Record started',
      'Duration',
      'Tool calls',
      'User messages',
      'Files modified',
    ]);
  });

  it('fills the metrics header from the session-tracker record', () => {
    const md = archive();
    expect(md).toContain('**Project:** proj');
    expect(md).toContain('**Alias:** parser-work');
    expect(md).toContain('**Saved:** 2026-10-03T11:00:00.000Z');
    expect(md).toContain('**Session:** session-abc');
    expect(md).toContain('**Record started:** 2026-10-03T10:00:00.000Z');
    expect(md).toContain('**Duration:** ~42 minutes');
    expect(md).toContain('**Tool calls:** 120');
    expect(md).toContain('**User messages:** 8');
    expect(md).toContain('**Files modified:** 2\n- src/a.js\n- src/b.js');
  });

  it('holds exactly the five handover sections, in order, and nothing else', () => {
    const headings = archive()
      .split('\n')
      .filter((l) => l.startsWith('## '))
      .map((l) => l.slice(3));
    expect(headings).toEqual(HANDOVER_SECTIONS);
    expect(HANDOVER_SECTIONS).toEqual([
      'Where it stands',
      'Done',
      'Unfinished',
      'Decisions',
      'Next',
    ]);
  });

  it('carries no text of the user messages and no Conversation Trail (learning B-20)', () => {
    const md = archive();
    expect(md).not.toContain('secret-sauce');
    expect(md).not.toContain('Conversation Trail');
    expect(md).not.toContain('Tools Used');
  });

  it('names the lastUpdated stamp on a line of its own, and never calls the counts totals', () => {
    const md = archive();
    expect(md).toContain(
      '**Metrics:** as the session-tracker record holds them at 2026-10-03T10:42:00.000Z — ' +
        "since the record's last diary capture or resume, not since the session began; " +
        'the current turn may not be counted',
    );
    expect(md).not.toMatch(/total/i);
  });

  it('reads none recorded for files when the record has none, never 0 or a guess', () => {
    const md = generateSession({ ...RECORD, filesModified: [] }, readHandover(FIVE, 'input'), META);
    expect(md).toContain('**Files modified:** none recorded\n');
    const noKey = { ...RECORD };
    delete noKey.filesModified;
    delete noKey.userMessages;
    const md2 = generateSession(noKey, readHandover(FIVE, 'input'), META);
    expect(md2).toContain('**Files modified:** none recorded');
    expect(md2).toContain('**User messages:** none recorded');
  });

  it('marks every metric none recorded when no session record exists', () => {
    const md = generateSession(null, readHandover(FIVE, 'input'), META);
    expect(md).toContain('**Session:** none recorded');
    expect(md).toContain('**Metrics:** no session-tracker record for this project');
    for (const field of [
      'Record started',
      'Duration',
      'Tool calls',
      'User messages',
      'Files modified',
    ]) {
      expect(md).toContain(`**${field}:** none recorded`);
    }
  });

  it('falls back to the alias and date for the H1 when the input has none', () => {
    const noTitle = FIVE.replace(/^# .*\n/, '');
    const md = generateSession(RECORD, readHandover(noTitle, 'input'), META);
    expect(md.split('\n')[0]).toBe('# parser-work — 2026-10-03');
  });

  it('round-trips: the written archive reads back as the same five sections', () => {
    const back = readHandover(archive(), 'archive', { strict: true });
    expect(back.sections).toEqual(readHandover(FIVE, 'input').sections);
  });
});

describe('archive reader rejects what is not the five sections', () => {
  it('names the unsupported v5 format', () => {
    const v5 = '# Session: 2026-04-17\n\n## Summary\nx\n\n## What Worked\ny\n\n## Next Step\nz\n';
    expect(() => readHandover(v5, 'old.md')).toThrow(/old\.md: .*v5 session archive format/);
  });

  it('names each missing section', () => {
    const partial = FIVE.replace(/## Decisions[\s\S]*?(?=## Next)/, '');
    expect(() => readHandover(partial, 'x.md')).toThrow(
      /x\.md: missing handover section\(s\): Decisions/,
    );
  });

  it('rejects a duplicated section', () => {
    expect(() => readHandover(`${FIVE}\n## Done\nagain\n`, 'x.md')).toThrow(
      /duplicate section "Done"/,
    );
  });

  it('strict: rejects an extra section and an empty slot', () => {
    expect(() =>
      readHandover(`${FIVE}\n## Conversation Trail\n> hi\n`, 'in', { strict: true }),
    ).toThrow(/unexpected section\(s\): Conversation Trail/);
    const empty = FIVE.replace('- tokenizer — verified by npm test', '');
    expect(() => readHandover(empty, 'in', { strict: true })).toThrow(
      /empty section\(s\): Done.*none/,
    );
  });

  it('strict: rejects the five out of order, naming the order', () => {
    const swapped = FIVE.replace('## Done', '## TMP')
      .replace('## Unfinished', '## Done')
      .replace('## TMP', '## Unfinished');
    expect(() => readHandover(swapped, 'in', { strict: true })).toThrow(
      /out of order.*Where it stands, Done, Unfinished, Decisions, Next/,
    );
  });

  it('lenient (resume): ignores an extra section but still needs all five', () => {
    const extra = readHandover(`${FIVE}\n## Notes\nscratch\n`, 'in');
    expect(Object.keys(extra.sections)).toEqual(HANDOVER_SECTIONS);
  });

  it('does not split on a ## line inside a fenced code block', () => {
    const fenced = FIVE.replace(
      '- hand-rolled parser',
      '```md\n## Not a heading\n```\n- hand-rolled parser',
    );
    const parsed = readHandover(fenced, 'in', { strict: true });
    expect(parsed.sections.Decisions).toContain('## Not a heading');
  });
});

describe('aliases.json format', () => {
  it('is { version, aliases } with { sessionPath, createdAt, updatedAt, title } entries', () => {
    const saved = saveArchive('schema-proj', 'first', FIVE, {
      now: new Date('2026-10-03T12:00:00.000Z'),
    });
    setAlias('schema-proj', 'second', saved.path);
    const data = JSON.parse(fs.readFileSync(getAliasesPath('schema-proj'), 'utf8'));
    expect(Object.keys(data).sort()).toEqual(['aliases', 'version']);
    expect(data.version).toBe('1.0');
    expect(Object.keys(data.aliases).sort()).toEqual(['first', 'second']);
    for (const entry of Object.values(data.aliases)) {
      expect(Object.keys(entry).sort()).toEqual(['createdAt', 'sessionPath', 'title', 'updatedAt']);
      expect(entry.sessionPath).toBe(saved.path);
      expect(new Date(entry.createdAt).toISOString()).toBe(entry.createdAt);
      expect(new Date(entry.updatedAt).toISOString()).toBe(entry.updatedAt);
    }
    expect(data.aliases.first.title).toBe('Parser work — 2026-10-03');
    expect(data.aliases.second.title).toBeNull();
  });

  it('lives at <ARCFORGE_HOME>/sessions/<project>/aliases.json', () => {
    expect(getAliasesPath('schema-proj')).toBe(
      path.join(home, 'sessions', 'schema-proj', 'aliases.json'),
    );
  });
});
