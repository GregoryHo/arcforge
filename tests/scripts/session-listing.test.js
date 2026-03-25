// tests/scripts/session-listing.test.js

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const testDir = path.join(
  os.tmpdir(),
  `session-listing-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
);
fs.mkdirSync(testDir, { recursive: true });

// Mock os.homedir() — Node caches the real value, env override doesn't work
let homedirSpy;

beforeAll(() => {
  homedirSpy = jest.spyOn(os, 'homedir').mockReturnValue(testDir);
});

afterAll(() => {
  homedirSpy.mockRestore();
  fs.rmSync(testDir, { recursive: true, force: true });
});

function getSessionUtils() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes('session-utils')) delete require.cache[key];
  }
  return require('../../scripts/lib/session-utils');
}

describe('session listing', () => {
  const project = 'test-project';
  const dateStr = '2026-03-13';

  beforeAll(() => {
    const sessionDir = path.join(testDir, '.claude', 'sessions', project, dateStr);
    fs.mkdirSync(sessionDir, { recursive: true });

    const session1 = {
      sessionId: 'session-abc123',
      project,
      date: dateStr,
      started: '2026-03-13T10:00:00Z',
      lastUpdated: '2026-03-13T11:00:00Z',
      toolCalls: 50,
      userMessages: 8,
      filesModified: ['src/app.js'],
    };

    const session2 = {
      sessionId: 'session-def456',
      project,
      date: dateStr,
      started: '2026-03-13T14:00:00Z',
      lastUpdated: '2026-03-13T15:30:00Z',
      toolCalls: 120,
      userMessages: 15,
      filesModified: ['src/api.js', 'src/utils.js'],
    };

    fs.writeFileSync(path.join(sessionDir, 'session-abc123.json'), JSON.stringify(session1));
    fs.writeFileSync(path.join(sessionDir, 'session-def456.json'), JSON.stringify(session2));
  });

  describe('listSessions', () => {
    it('lists sessions for a project', () => {
      const { listSessions } = getSessionUtils();
      const { sessions, total } = listSessions(project);
      expect(total).toBe(2);
      expect(sessions.length).toBe(2);
    });

    it('returns empty for non-existent project', () => {
      const { listSessions } = getSessionUtils();
      const { sessions, total } = listSessions('nonexistent');
      expect(total).toBe(0);
      expect(sessions).toEqual([]);
    });

    it('sorts by lastUpdated descending', () => {
      const { listSessions } = getSessionUtils();
      const { sessions } = listSessions(project);
      expect(sessions[0].sessionId).toBe('session-def456');
      expect(sessions[1].sessionId).toBe('session-abc123');
    });

    it('respects limit', () => {
      const { listSessions } = getSessionUtils();
      const { sessions } = listSessions(project, { limit: 1 });
      expect(sessions.length).toBe(1);
    });

    it('filters by date', () => {
      const { listSessions } = getSessionUtils();
      const { sessions } = listSessions(project, { date: '2026-03-14' });
      expect(sessions.length).toBe(0);
    });

    it('includes saved session .md files with type=saved', () => {
      const { listSessions } = getSessionUtils();
      const sessionDir = path.join(testDir, '.claude', 'sessions', project, dateStr);
      fs.writeFileSync(
        path.join(sessionDir, 'session-my-feature.md'),
        '# Session: 2026-03-13\n**Project:** test-project\n\n## Summary\nBuilt feature X',
      );

      const { sessions, total } = listSessions(project);
      expect(total).toBe(3); // 2 json + 1 md
      const saved = sessions.find((s) => s.type === 'saved');
      expect(saved).toBeDefined();
      expect(saved.sessionId).toBe('my-feature');
    });

    it('marks auto-tracked sessions with type=auto', () => {
      const { listSessions } = getSessionUtils();
      const { sessions } = listSessions(project);
      const auto = sessions.filter((s) => s.type === 'auto');
      expect(auto.length).toBe(2);
    });

    it('filters sessions by query on sessionId', () => {
      const { listSessions } = getSessionUtils();
      const { sessions } = listSessions(project, { query: 'abc' });
      expect(sessions.length).toBe(1);
      expect(sessions[0].sessionId).toBe('session-abc123');
    });

    it('query filter is case-insensitive', () => {
      const { listSessions } = getSessionUtils();
      const { sessions } = listSessions(project, { query: 'DEF' });
      expect(sessions.length).toBe(1);
      expect(sessions[0].sessionId).toBe('session-def456');
    });

    it('query matches saved sessions by alias', () => {
      const { listSessions } = getSessionUtils();
      const { sessions } = listSessions(project, { query: 'feature' });
      expect(sessions.length).toBe(1);
      expect(sessions[0].type).toBe('saved');
    });

    it('returns empty for non-matching query', () => {
      const { listSessions } = getSessionUtils();
      const { sessions } = listSessions(project, { query: 'zzz-nonexistent' });
      expect(sessions.length).toBe(0);
    });
  });

  describe('getSessionById', () => {
    it('finds session by full ID', () => {
      const { getSessionById } = getSessionUtils();
      const session = getSessionById(project, 'session-abc123');
      expect(session).not.toBeNull();
      expect(session.sessionId).toBe('session-abc123');
    });

    it('finds session by prefix', () => {
      const { getSessionById } = getSessionUtils();
      const session = getSessionById(project, 'abc123');
      expect(session).not.toBeNull();
      expect(session.sessionId).toBe('session-abc123');
    });

    it('returns null for no match', () => {
      const { getSessionById } = getSessionUtils();
      expect(getSessionById(project, 'zzz999')).toBeNull();
    });
  });
});

describe('session generation', () => {
  const session = {
    sessionId: 'session-test123',
    project: 'my-project',
    date: '2026-03-13',
    started: '2026-03-13T10:00:00Z',
    lastUpdated: '2026-03-13T11:30:00Z',
    toolCalls: 45,
    userMessages: 7,
    filesModified: ['src/app.js'],
  };

  describe('generateSession', () => {
    it('generates session markdown with session data', () => {
      const { generateSession } = getSessionUtils();
      const md = generateSession(session);
      expect(md).toContain('# Session:');
      expect(md).toContain('my-project');
      expect(md).toContain('session-test123');
      expect(md).toContain('45');
    });

    it('includes transcript data when provided', () => {
      const { generateSession } = getSessionUtils();
      const transcriptData = {
        userMessages: ['fix the login bug', 'looks good'],
        toolsUsed: ['Read', 'Edit', 'Bash'],
        filesModified: ['/src/auth.js', '/src/login.js'],
      };

      const md = generateSession(session, transcriptData);
      expect(md).toContain('Read, Edit, Bash');
      expect(md).toContain('/src/auth.js');
      expect(md).toContain('fix the login bug');
    });

    it('includes enrichment when provided', () => {
      const { generateSession } = getSessionUtils();
      const md = generateSession(session, null, {
        summary: 'Fixed authentication flow',
        nextStep: 'Add unit tests for login',
      });
      expect(md).toContain('Fixed authentication flow');
      expect(md).toContain('Add unit tests for login');
    });

    it('adds TO BE ENRICHED placeholders when no enrichment', () => {
      const { generateSession } = getSessionUtils();
      const md = generateSession(session);
      expect(md).toContain('TO BE ENRICHED');
    });
  });

  describe('parseSessionSections', () => {
    it('parses project from frontmatter line', () => {
      const { parseSessionSections } = getSessionUtils();
      const content = '# Header\n**Project:** my-project\n\n## Summary\nDone stuff';
      const sections = parseSessionSections(content);
      expect(sections.project).toBe('my-project');
    });

    it('parses named sections', () => {
      const { parseSessionSections } = getSessionUtils();
      const content = '## Summary\nDid things\n\n## Next Step\nDo more things';
      const sections = parseSessionSections(content);
      expect(sections.summary).toBe('Did things');
      expect(sections.nextStep).toBe('Do more things');
    });
  });

  describe('formatSessionBriefing', () => {
    it('formats structured briefing', () => {
      const { formatSessionBriefing } = getSessionUtils();
      const content = [
        '# Session: 2026-03-13',
        '**Project:** my-project',
        '',
        '## Summary',
        'Built the auth system',
        '',
        '## Next Step',
        'Add tests',
      ].join('\n');

      const briefing = formatSessionBriefing(content, '/path/to/session.md');
      expect(briefing).toContain('SESSION LOADED: /path/to/session.md');
      expect(briefing).toContain('PROJECT: my-project');
      expect(briefing).toContain('Built the auth system');
      expect(briefing).toContain('Add tests');
      expect(briefing).toContain('Ready to continue');
    });

    it('skips TO BE ENRICHED sections', () => {
      const { formatSessionBriefing } = getSessionUtils();
      const content = '## Summary\n<!-- TO BE ENRICHED -->\n## Next Step\n<!-- TO BE ENRICHED -->';
      const briefing = formatSessionBriefing(content, '/path.md');
      expect(briefing).not.toContain('WHAT WE WERE DOING');
      expect(briefing).not.toContain('NEXT STEP');
    });
  });
});
