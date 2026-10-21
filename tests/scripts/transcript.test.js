// tests/scripts/transcript.test.js

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  parseTranscript,
  MAX_USER_MESSAGES,
  MSG_TRUNCATE_LENGTH,
} = require('../../scripts/lib/transcript');

describe('transcript parser', () => {
  const testDir = path.join(os.tmpdir(), `transcript-test-${Date.now()}`);

  beforeAll(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function writeTranscript(name, lines) {
    const filePath = path.join(testDir, name);
    fs.writeFileSync(filePath, lines.map((l) => JSON.stringify(l)).join('\n'));
    return filePath;
  }

  describe('parseTranscript', () => {
    it('returns null for non-existent file', () => {
      expect(parseTranscript('/nonexistent/path.jsonl')).toBeNull();
    });

    it('returns null for empty transcript', () => {
      const filePath = path.join(testDir, 'empty.jsonl');
      fs.writeFileSync(filePath, '');
      expect(parseTranscript(filePath)).toBeNull();
    });

    it('returns null when no user messages or tools found', () => {
      const filePath = writeTranscript('no-data.jsonl', [{ type: 'system', content: 'hello' }]);
      expect(parseTranscript(filePath)).toBeNull();
    });

    it('extracts user messages from direct format', () => {
      const filePath = writeTranscript('direct-user.jsonl', [
        { type: 'user', content: 'Hello world' },
        { type: 'user', content: 'Fix the bug' },
      ]);

      const result = parseTranscript(filePath);
      expect(result.userMessages).toEqual(['Hello world', 'Fix the bug']);
      expect(result.totalMessages).toBe(2);
    });

    it('extracts user messages from role-based format', () => {
      const filePath = writeTranscript('role-user.jsonl', [
        { role: 'user', content: 'message one' },
      ]);

      const result = parseTranscript(filePath);
      expect(result.userMessages).toEqual(['message one']);
    });

    it('extracts user messages from nested Claude Code format', () => {
      const filePath = writeTranscript('nested-user.jsonl', [
        {
          type: 'user',
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'nested message' }],
          },
        },
      ]);

      const result = parseTranscript(filePath);
      expect(result.userMessages).toEqual(['nested message']);
    });

    it('truncates long user messages', () => {
      const longMessage = 'x'.repeat(500);
      const filePath = writeTranscript('long-msg.jsonl', [{ type: 'user', content: longMessage }]);

      const result = parseTranscript(filePath);
      expect(result.userMessages[0].length).toBe(MSG_TRUNCATE_LENGTH);
    });

    it('keeps only last N user messages', () => {
      const messages = Array.from({ length: 20 }, (_, i) => ({
        type: 'user',
        content: `message ${i}`,
      }));
      const filePath = writeTranscript('many-msgs.jsonl', messages);

      const result = parseTranscript(filePath);
      expect(result.userMessages.length).toBe(MAX_USER_MESSAGES);
      expect(result.userMessages[0]).toBe('message 10');
      expect(result.totalMessages).toBe(20);
    });

    it('extracts tool names from direct tool_use entries', () => {
      const filePath = writeTranscript('tools-direct.jsonl', [
        { type: 'tool_use', tool_name: 'Read', tool_input: { file_path: '/foo.js' } },
        { type: 'tool_use', tool_name: 'Grep', tool_input: { pattern: 'test' } },
        { type: 'tool_use', tool_name: 'Read', tool_input: { file_path: '/bar.js' } },
      ]);

      const result = parseTranscript(filePath);
      expect(result.toolsUsed).toContain('Read');
      expect(result.toolsUsed).toContain('Grep');
      // Deduplicates
      expect(result.toolsUsed.filter((t) => t === 'Read').length).toBe(1);
    });

    it('extracts tool names from assistant content blocks', () => {
      const filePath = writeTranscript('tools-nested.jsonl', [
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'tool_use', name: 'Edit', input: { file_path: '/src/app.js' } },
              { type: 'text', text: 'some output' },
              { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } },
            ],
          },
        },
      ]);

      const result = parseTranscript(filePath);
      expect(result.toolsUsed).toContain('Edit');
      expect(result.toolsUsed).toContain('Bash');
    });

    it('tracks files modified by Edit and Write tools', () => {
      const filePath = writeTranscript('files-modified.jsonl', [
        { type: 'tool_use', tool_name: 'Edit', tool_input: { file_path: '/src/a.js' } },
        { type: 'tool_use', tool_name: 'Write', tool_input: { file_path: '/src/b.js' } },
        { type: 'tool_use', tool_name: 'Read', tool_input: { file_path: '/src/c.js' } },
      ]);

      const result = parseTranscript(filePath);
      expect(result.filesModified).toContain('/src/a.js');
      expect(result.filesModified).toContain('/src/b.js');
      // Read doesn't modify
      expect(result.filesModified).not.toContain('/src/c.js');
    });

    it('tracks files modified from nested assistant content blocks', () => {
      const filePath = writeTranscript('files-nested.jsonl', [
        {
          type: 'assistant',
          message: {
            content: [{ type: 'tool_use', name: 'Write', input: { file_path: '/new-file.ts' } }],
          },
        },
      ]);

      const result = parseTranscript(filePath);
      expect(result.filesModified).toContain('/new-file.ts');
    });

    it('handles malformed lines gracefully', () => {
      const filePath = path.join(testDir, 'malformed.jsonl');
      fs.writeFileSync(
        filePath,
        [
          'not json at all',
          JSON.stringify({ type: 'user', content: 'valid message' }),
          '{ broken json',
        ].join('\n'),
      );

      const result = parseTranscript(filePath);
      expect(result.userMessages).toEqual(['valid message']);
    });

    it('skips empty user messages', () => {
      const filePath = writeTranscript('empty-msgs.jsonl', [
        { type: 'user', content: '' },
        { type: 'user', content: '   ' },
        { type: 'user', content: 'actual content' },
      ]);

      const result = parseTranscript(filePath);
      expect(result.userMessages).toEqual(['actual content']);
    });

    it('handles mixed formats in single transcript', () => {
      const filePath = writeTranscript('mixed.jsonl', [
        { type: 'user', content: 'direct message' },
        { type: 'user', message: { role: 'user', content: 'nested string' } },
        { type: 'tool_use', tool_name: 'Glob', tool_input: {} },
        {
          type: 'assistant',
          message: {
            content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/test.js' } }],
          },
        },
      ]);

      const result = parseTranscript(filePath);
      expect(result.userMessages).toEqual(['direct message', 'nested string']);
      expect(result.toolsUsed).toContain('Glob');
      expect(result.toolsUsed).toContain('Edit');
      expect(result.filesModified).toContain('/test.js');
    });
  });

  describe('parseTranscript size bound', () => {
    const userLine = (i) => ({ type: 'user', content: `message ${i}` });

    it('parses a transcript under the bound whole, without truncated', () => {
      const filePath = writeTranscript('under-bound.jsonl', [
        userLine(1),
        { type: 'tool_use', tool_name: 'Write', tool_input: { file_path: '/a.js' } },
        userLine(2),
      ]);
      const size = fs.statSync(filePath).size;

      const bounded = parseTranscript(filePath, { maxBytes: size });
      expect(bounded).toEqual(parseTranscript(filePath));
      expect(bounded).toEqual({
        userMessages: ['message 1', 'message 2'],
        toolsUsed: ['Write'],
        filesModified: ['/a.js'],
        totalMessages: 2,
      });
    });

    it('over the bound parses only the tail, drops its first line, sets truncated', () => {
      const lines = Array.from({ length: 100 }, (_, i) => userLine(i));
      const filePath = writeTranscript('over-bound.jsonl', lines);
      // Exactly the last 10 lines: the window opens on a line boundary, and its
      // first line is dropped all the same, since the reader cannot tell.
      const maxBytes = lines
        .slice(90)
        .map((l) => JSON.stringify(l))
        .join('\n').length;

      const result = parseTranscript(filePath, { maxBytes });
      expect(result.truncated).toBe(true);
      expect(result.userMessages).toEqual(Array.from({ length: 9 }, (_, i) => `message ${91 + i}`));
      expect(result.totalMessages).toBe(9);

      // A few bytes more opens mid-way through line 89: that cut line is
      // dropped and line 90 is now kept whole.
      const midLine = parseTranscript(filePath, { maxBytes: maxBytes + 5 });
      expect(midLine.userMessages).toEqual(['message 90', ...result.userMessages]);
    });

    it('parses a ~50 MB transcript in bounded time', () => {
      const filler = {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'x'.repeat(1000) }] },
      };
      const chunk = `${Array.from({ length: 1000 }, () => JSON.stringify(filler)).join('\n')}\n`;
      const filePath = path.join(testDir, 'huge.jsonl');
      const fd = fs.openSync(filePath, 'w');
      while (fs.fstatSync(fd).size < 50 * 1024 * 1024) fs.writeSync(fd, chunk);
      fs.writeSync(fd, `${JSON.stringify(userLine('last'))}\n`);
      fs.closeSync(fd);

      const start = Date.now();
      const result = parseTranscript(filePath);
      const elapsed = Date.now() - start;

      expect(result.truncated).toBe(true);
      expect(result.userMessages).toEqual(['message last']);
      expect(elapsed).toBeLessThan(1000);
    });
  });
});
