// scripts/lib/transcript.js
const fs = require('node:fs');

const MAX_USER_MESSAGES = 10;
const MAX_TOOLS = 20;
const MAX_FILES = 30;
const MSG_TRUNCATE_LENGTH = 200;
// Every output is a capped tail, so a long session's transcript is parsed only
// from its last 8 MiB rather than read and split whole on every Stop/PreCompact.
const MAX_TRANSCRIPT_BYTES = 8 * 1024 * 1024;

/**
 * Read a transcript, or only its last `maxBytes` when it is larger.
 * The tail drops everything up to and including its first newline, which may
 * be the end of a line cut in half.
 *
 * @param {string} transcriptPath
 * @param {number} maxBytes
 * @returns {{ content: string, truncated: boolean } | null} null when unreadable
 */
function readTranscriptWindow(transcriptPath, maxBytes) {
  let fd;
  try {
    fd = fs.openSync(transcriptPath, 'r');
    const { size } = fs.fstatSync(fd);
    if (size <= maxBytes) {
      return { content: fs.readFileSync(fd, 'utf8'), truncated: false };
    }
    const buf = Buffer.alloc(maxBytes);
    const bytesRead = fs.readSync(fd, buf, 0, maxBytes, size - maxBytes);
    const window = buf.subarray(0, bytesRead);
    const firstNewline = window.indexOf(0x0a);
    const content = firstNewline === -1 ? '' : window.subarray(firstNewline + 1).toString('utf8');
    return { content, truncated: true };
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/**
 * Parse a JSONL transcript file to extract session summary data.
 *
 * Handles two JSONL formats:
 * - Direct entries: { type: 'user', content: '...' }
 * - Claude Code format: { type: 'user', message: { role: 'user', content: [...] } }
 *
 * Tool uses can appear as:
 * - Direct entries: { type: 'tool_use', tool_name: '...', tool_input: { file_path: '...' } }
 * - Content blocks inside assistant messages: { type: 'assistant', message: { content: [{ type: 'tool_use', name: '...', input: { file_path: '...' } }] } }
 *
 * A transcript over `maxBytes` is parsed from its tail only and the result
 * carries `truncated: true`. Then `toolsUsed`/`filesModified` are first-seen
 * within that window and `totalMessages` counts the window's user messages —
 * nothing outside this module and its tests reads `totalMessages`.
 *
 * @param {string} transcriptPath - Path to the JSONL transcript file
 * @param {Object} [opts]
 * @param {number} [opts.maxBytes=MAX_TRANSCRIPT_BYTES] - Read bound; larger files are tail-read
 * @returns {{ userMessages: string[], toolsUsed: string[], filesModified: string[], totalMessages: number, truncated?: boolean } | null}
 */
function parseTranscript(transcriptPath, opts = {}) {
  const window = readTranscriptWindow(transcriptPath, opts.maxBytes || MAX_TRANSCRIPT_BYTES);
  if (!window || !window.content) return null;

  const lines = window.content.split('\n').filter(Boolean);
  const userMessages = [];
  const toolsUsed = new Set();
  const filesModified = new Set();
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);

      // Collect user messages (truncated to MSG_TRUNCATE_LENGTH chars each)
      if (entry.type === 'user' || entry.role === 'user' || entry.message?.role === 'user') {
        const rawContent = entry.message?.content ?? entry.content;
        const text =
          typeof rawContent === 'string'
            ? rawContent
            : Array.isArray(rawContent)
              ? rawContent.map((c) => c?.text || '').join(' ')
              : '';
        if (text.trim()) {
          userMessages.push(text.trim().slice(0, MSG_TRUNCATE_LENGTH));
        }
      }

      // Collect tool names and modified files (direct tool_use entries)
      if (entry.type === 'tool_use' || entry.tool_name) {
        collectToolUse(
          entry.tool_name || entry.name,
          entry.tool_input || entry.input,
          toolsUsed,
          filesModified,
        );
      }

      // Extract tool uses from assistant message content blocks
      if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
        for (const block of entry.message.content) {
          if (block.type === 'tool_use') {
            collectToolUse(block.name, block.input, toolsUsed, filesModified);
          }
        }
      }
    } catch {
      // skip malformed lines
    }
  }

  if (userMessages.length === 0 && toolsUsed.size === 0) return null;

  const result = {
    userMessages: userMessages.slice(-MAX_USER_MESSAGES),
    toolsUsed: Array.from(toolsUsed).slice(0, MAX_TOOLS),
    filesModified: Array.from(filesModified).slice(0, MAX_FILES),
    totalMessages: userMessages.length,
  };
  if (window.truncated) result.truncated = true;
  return result;
}

/**
 * Collect tool name and file modification from a tool use entry.
 * @param {string} toolName
 * @param {Object} toolInput
 * @param {Set<string>} toolsUsed
 * @param {Set<string>} filesModified
 */
function collectToolUse(toolName, toolInput, toolsUsed, filesModified) {
  if (toolName) toolsUsed.add(toolName);
  const filePath = toolInput?.file_path || '';
  if (filePath && (toolName === 'Edit' || toolName === 'Write')) {
    filesModified.add(filePath);
  }
}

module.exports = {
  parseTranscript,
  // Exported for testing
  MAX_USER_MESSAGES,
  MAX_TOOLS,
  MAX_FILES,
  MSG_TRUNCATE_LENGTH,
  MAX_TRANSCRIPT_BYTES,
};
