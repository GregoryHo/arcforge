// scripts/lib/session-archive.js
// Owner of the session archive format (cli B-9, D-056): the five handover
// sections, the engine-written metrics header, and the archive files under
// ~/.arcforge/sessions/<project>/<date>/.
const fs = require('node:fs');
const path = require('node:path');

const { atomicWriteFile } = require('./atomic-write');
const { getProjectSessionsDir, getSessionDir, sanitizeFilename } = require('./utils');
const { getDateDirs, findLatestSessionRecord, getSessionById } = require('./session-records');
const { validateAlias, resolveAlias, setAlias, listAliases } = require('./session-aliases');

// ─────────────────────────────────────────────
// Session Archive (cli B-9, D-056)
// ─────────────────────────────────────────────
//
// An archive is `sessions/<project>/<date>/archive-<alias>-<YYYYMMDDTHHMMSSZ>.md`
// (UTC; `-2`, `-3`… when a save lands in a second already taken): an H1, the
// engine-written metrics header (ARCHIVE_HEADER_FIELDS, from the
// session-tracker record), then the five handover sections the caller wrote.
// It never carries text of the user's messages (learning B-20). A
// `.handovers/<date>-<slug>.md` file is the same five sections without the
// header, so one reader serves both.

const HANDOVER_SECTIONS = ['Where it stands', 'Done', 'Unfinished', 'Decisions', 'Next'];
const V5_SECTIONS = ['Summary', 'What Worked', 'What Failed', 'Blockers', 'Next Step'];
const ARCHIVE_HEADER_FIELDS = [
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
];
const ARCHIVE_PREFIX = 'archive-';
const ARCHIVE_NAME = /-(\d{8}T\d{6}Z)(?:-(\d+))?\.md$/;
const DEFAULT_LIST_LIMIT = 20;

/** Lines with the leading and trailing blank lines dropped, joined verbatim. */
function joinVerbatim(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === '') start++;
  while (end > start && lines[end - 1].trim() === '') end--;
  return lines.slice(start, end).join('\n');
}

/**
 * Split markdown into its H1 title, the preamble before the first `## `
 * heading, and every `## ` section, each kept verbatim. A `## ` line inside a
 * fenced code block is body text, not a heading; a fence closes only on the
 * opener's character at least the opener's length (CommonMark).
 * @param {string} content
 * @returns {{ title: string|null, preamble: string, sections: Object<string, string> }}
 * @throws {Error} on a heading that appears twice
 */
function parseSessionSections(content) {
  const sections = {};
  const preamble = [];
  let current = null;
  let body = [];
  let fence = null;

  const close = () => {
    if (current !== null) sections[current] = joinVerbatim(body);
  };

  for (const line of content.split('\n')) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!fence && marker && !(marker[1][0] === '`' && marker[2].includes('`'))) {
      fence = marker[1];
    } else if (fence && marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) {
      if (marker[2].trim() === '') fence = null;
    }
    if (!fence && line.startsWith('## ')) {
      close();
      current = line.slice(3).trim();
      if (Object.hasOwn(sections, current)) throw new Error(`duplicate section "${current}"`);
      body = [];
    } else if (current !== null) {
      body.push(line);
    } else {
      preamble.push(line);
    }
  }
  close();

  const titleLine = preamble.find((l) => l.startsWith('# '));
  return {
    title: titleLine ? titleLine.slice(2).trim() : null,
    preamble: preamble.join('\n').trim(),
    sections,
  };
}

/**
 * Read the five handover sections out of an archive or a handover file.
 * Lenient (resume) ignores any other section; strict (save) rejects other
 * sections and empty slots, so an archive holds the five and nothing else.
 * @param {string} content - Markdown
 * @param {string} source - Where it came from, for error messages
 * @param {{ strict?: boolean }} [options]
 * @returns {{ title: string|null, preamble: string, sections: Object<string, string> }}
 * @throws {Error} naming the source and what is wrong
 */
function readHandover(content, source, { strict = false } = {}) {
  if (typeof content !== 'string') throw new Error(`${source}: input must be a string`);
  let parsed;
  try {
    parsed = parseSessionSections(content);
  } catch (err) {
    throw new Error(`${source}: ${err.message}`);
  }
  const headings = Object.keys(parsed.sections);
  const missing = HANDOVER_SECTIONS.filter((h) => !headings.includes(h));
  if (missing.length > 0) {
    if (headings.some((h) => V5_SECTIONS.includes(h))) {
      throw new Error(
        `${source}: the v5 session archive format (${V5_SECTIONS.join(' / ')}) is not ` +
          `supported — only the five handover sections are read: ${HANDOVER_SECTIONS.join(', ')}`,
      );
    }
    throw new Error(`${source}: missing handover section(s): ${missing.join(', ')}`);
  }
  if (strict) {
    const order = headings.filter((h) => HANDOVER_SECTIONS.includes(h));
    if (order.join('\n') !== HANDOVER_SECTIONS.join('\n')) {
      throw new Error(
        `${source}: sections out of order (${order.join(', ')}) — they go ` +
          `${HANDOVER_SECTIONS.join(', ')}`,
      );
    }
    const extra = headings.filter((h) => !HANDOVER_SECTIONS.includes(h));
    if (extra.length > 0) {
      throw new Error(
        `${source}: unexpected section(s): ${extra.join(', ')} — an archive holds only ` +
          `the five handover sections`,
      );
    }
    const empty = HANDOVER_SECTIONS.filter((h) => parsed.sections[h] === '');
    if (empty.length > 0) {
      throw new Error(
        `${source}: empty section(s): ${empty.join(', ')} — write none in a slot with nothing in it`,
      );
    }
  }
  const sections = Object.fromEntries(HANDOVER_SECTIONS.map((h) => [h, parsed.sections[h]]));
  return { title: parsed.title, preamble: parsed.preamble, sections };
}

/**
 * The metrics header lines, as the record stood at its lastUpdated stamp. The
 * tracker resets its counters at each diary capture and `started` at each
 * resume, so the counts are never session totals and the stamp line says so.
 * Only counts and paths are read — never userMessageContent (learning B-20).
 */
function archiveHeader(record, { project, alias, savedAt }) {
  const none = 'none recorded';
  // Record values come from the transcript: no control character may reach the
  // archive, where a newline could forge a heading (security rule).
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control char sanitization
  const clean = (v) => String(v).replace(/[\x00-\x1f\x7f]/g, '');
  const lines = [
    `**Project:** ${clean(project)}`,
    `**Alias:** ${alias}`,
    `**Saved:** ${savedAt}`,
    `**Session:** ${record?.sessionId ? clean(record.sessionId) : none}`,
  ];
  if (!record) {
    lines.push('**Metrics:** no session-tracker record for this project');
    for (const field of ARCHIVE_HEADER_FIELDS.slice(5)) lines.push(`**${field}:** unknown`);
    return lines;
  }
  const minutes =
    record.started && record.lastUpdated
      ? Math.round((new Date(record.lastUpdated) - new Date(record.started)) / 60000)
      : null;
  const files = Array.isArray(record.filesModified) ? record.filesModified : [];
  lines.push(
    `**Metrics:** as the session-tracker record holds them at ${clean(record.lastUpdated || none)} — ` +
      "since the record's last diary capture or resume, not since the session began; " +
      'the current turn may not be counted',
  );
  lines.push(`**Record started:** ${clean(record.started || none)}`);
  lines.push(`**Duration:** ${Number.isFinite(minutes) ? `~${minutes} minutes` : none}`);
  lines.push(`**Tool calls:** ${clean(record.toolCalls ?? none)}`);
  lines.push(`**User messages:** ${clean(record.userMessages ?? none)}`);
  lines.push(`**Files modified:** ${files.length > 0 ? files.length : none}`);
  for (const f of files) lines.push(`- ${codeSpan(clean(f))}`);
  return lines;
}

/** `text` as an inline code span, its delimiter longer than any backtick run inside. */
function codeSpan(text) {
  const ticks = '`'.repeat(Math.max(0, ...(text.match(/`+/g) || []).map((r) => r.length)) + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${ticks}${pad}${text}${pad}${ticks}`;
}

/**
 * Render an archive: H1, metrics header, the five sections in order.
 * @param {Object|null} record - session-tracker record, or null when none exists
 * @param {{ title: string|null, sections: Object<string, string> }} handover - from readHandover
 * @param {{ project: string, alias: string, date: string, savedAt: string }} meta
 * @returns {string} Archive markdown
 */
function generateSession(record, handover, meta) {
  const lines = [`# ${handover.title || `${meta.alias} — ${meta.date}`}`, ''];
  lines.push(...archiveHeader(record, meta), '');
  for (const heading of HANDOVER_SECTIONS) {
    lines.push(`## ${heading}`, handover.sections[heading], '');
  }
  return lines.join('\n');
}

// `link` errors from a filesystem without hard links (FAT, exFAT, some mounts).
const NO_HARD_LINKS = new Set(['ENOTSUP', 'EXDEV', 'EPERM']);

/** Create `dest` exclusively (EEXIST if taken) and write `content`; no partial file stays. */
function writeExclusive(dest, content) {
  const fd = fs.openSync(dest, 'wx');
  try {
    fs.writeFileSync(fd, content, 'utf8');
  } catch (err) {
    fs.closeSync(fd);
    fs.rmSync(dest, { force: true });
    throw err;
  }
  fs.closeSync(fd);
}

/**
 * Write `content` to `<stem>.md` in `dir`, or `<stem>-2.md`, `<stem>-3.md`…
 * when that name is taken. Both ways of creating the file fail on an existing
 * name instead of replacing it, so no archive is ever overwritten — not even by
 * a concurrent save. The temp file is hard-linked into place, so a reader never
 * sees a partial archive; where the filesystem has no hard links, the file is
 * created exclusively (`wx`) and written instead.
 * @returns {string} The path written
 */
function writeNewArchive(dir, stem, content) {
  const tmpPath = path.join(dir, `.${stem}.${process.pid}.tmp`);
  atomicWriteFile(tmpPath, content);
  let canLink = true;
  try {
    for (let n = 1; ; n++) {
      const dest = path.join(dir, n === 1 ? `${stem}.md` : `${stem}-${n}.md`);
      try {
        if (canLink) {
          try {
            fs.linkSync(tmpPath, dest);
            return dest;
          } catch (err) {
            if (!NO_HARD_LINKS.has(err.code)) throw err;
            canLink = false;
          }
        }
        writeExclusive(dest, content);
        return dest;
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
      }
    }
  } finally {
    fs.rmSync(tmpPath, { force: true });
  }
}

/**
 * Save the caller's five sections as a new archive and point the alias at it.
 * A save never replaces an archive file; `force` only lets it repoint an
 * alias that already exists. Every refusal (alias, an existing name without
 * force, input, an unknown --session) happens before anything is written.
 * @param {string} project
 * @param {string} alias
 * @param {string} input - Markdown holding the five sections (an optional H1 is the title)
 * @param {{ now?: Date, sessionId?: string, force?: boolean }} [options]
 * @returns {{ alias: string, path: string, project: string, isNew: boolean, session: string|null }}
 * @throws {Error} naming what was refused, or a failed write
 */
function saveArchive(project, alias, input, { now = new Date(), sessionId, force = false } = {}) {
  const check = validateAlias(alias);
  if (!check.valid) throw new Error(`Invalid alias: ${check.error}`);
  if (!force && resolveAlias(project, alias)) {
    throw new Error(`alias "${alias}" already exists — pass --force to overwrite it`);
  }
  const handover = readHandover(input, 'session input', { strict: true });
  const above = handover.preamble.split('\n').filter((l) => l.trim());
  const titles = above.filter((l) => l.startsWith('# '));
  const stray = above.find((l) => !l.startsWith('# '));
  if (stray !== undefined) {
    throw new Error(
      `session input: text above the first section: "${stray.trim()}" — an archive holds ` +
        'only an optional # title line and the five sections',
    );
  }
  if (titles.length > 1) {
    throw new Error(
      `session input: a second # title line: "${titles[1].trim()}" — an archive holds ` +
        'only one optional # title line and the five sections',
    );
  }
  const record =
    sessionId === undefined ? findLatestSessionRecord(project) : getSessionById(project, sessionId);

  const savedAt = now.toISOString();
  const date = savedAt.slice(0, 10);
  const stamp = `${savedAt.slice(0, 19).replace(/[-:]/g, '')}Z`;
  const archivePath = writeNewArchive(
    getSessionDir(project, date),
    sanitizeFilename(`${ARCHIVE_PREFIX}${alias}-${stamp}`),
    generateSession(record, handover, { project, alias, date, savedAt }),
  );

  const result = setAlias(project, alias, archivePath, handover.title, { force });
  if (!result.success) {
    throw new Error(`Archive written to ${archivePath}, but alias "${alias}": ${result.error}`);
  }
  return {
    alias,
    path: archivePath,
    project,
    isNew: result.isNew,
    session: record?.sessionId || null,
  };
}

/**
 * The project's archives, newest first by the stamp in their names, each with
 * every alias pointing at it.
 * Files other than `archive-*.md` (v5's `session-*.md` included) are not listed.
 * @param {string} project
 * @param {{ limit?: number }} [options]
 * @returns {Array<{ date: string, path: string, title: string|null, aliases: string[] }>}
 */
function listArchives(project, { limit = DEFAULT_LIST_LIMIT } = {}) {
  const sessionsDir = getProjectSessionsDir(project);
  if (!fs.existsSync(sessionsDir)) return [];
  const aliasesByPath = new Map();
  for (const a of listAliases(project)) {
    const key = path.resolve(a.sessionPath);
    aliasesByPath.set(key, [...(aliasesByPath.get(key) || []), a.name]);
  }

  const archives = [];
  for (const date of getDateDirs(sessionsDir)) {
    const dir = path.join(sessionsDir, date);
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith(ARCHIVE_PREFIX) && f.endsWith('.md'))
      .map((f) => {
        const file = path.join(dir, f);
        const m = f.match(ARCHIVE_NAME);
        const [stamp, n] = m ? [m[1], Number(m[2] || 1)] : ['', 0];
        return { file, stamp, n, mtime: fs.statSync(file).mtimeMs };
      })
      .sort((a, b) => b.stamp.localeCompare(a.stamp) || b.n - a.n || b.mtime - a.mtime);
    for (const { file } of files) {
      const firstLine = fs.readFileSync(file, 'utf-8').split('\n', 1)[0];
      archives.push({
        date,
        path: file,
        title: firstLine.startsWith('# ') ? firstLine.slice(2).trim() : null,
        aliases: aliasesByPath.get(file) || [],
      });
    }
  }
  return archives.slice(0, limit);
}

/**
 * Read the file `alias set` points at, which must be an archive: under this
 * project's sessions tree and carrying the engine header. A `.handovers/` file
 * is not one — `resume <path>` reads it directly.
 * @param {string} project
 * @param {string} file - Absolute path to an existing file
 * @returns {{ title: string|null, preamble: string, sections: Object<string, string> }}
 * @throws {Error} naming the file and why it is not an archive
 */
function readArchive(project, file) {
  const handover = readHandover(fs.readFileSync(file, 'utf-8'), file);
  const tree = getProjectSessionsDir(project);
  const rel = path.relative(tree, file);
  const fields = handover.preamble.split('\n').map((l) => l.match(/^\*\*([^*]+):\*\* /)?.[1]);
  if (
    rel.startsWith('..') ||
    path.isAbsolute(rel) ||
    !ARCHIVE_HEADER_FIELDS.every((f) => fields.includes(f))
  ) {
    throw new Error(
      `${file} is not a session archive of project "${project}" — an alias points only at ` +
        `an archive \`session save\` wrote under ${tree}; to read any other file, run: ` +
        'arcforge session resume <path>',
    );
  }
  return handover;
}

/**
 * Resolve `resume`'s argument: a bare name is an alias of this project; a
 * value with a path separator or ending `.md` is a file path (relative to cwd).
 * @param {string} project
 * @param {string} ref - Alias or path
 * @param {string} cwd - Base for a relative path
 * @returns {string} Absolute path to an existing file
 * @throws {Error} naming the alias or path that did not resolve
 */
function resolveSessionRef(project, ref, cwd) {
  if (typeof ref !== 'string' || ref.trim() === '') {
    throw new Error('Expected an alias or a path');
  }
  const isFile = (p) => fs.existsSync(p) && fs.statSync(p).isFile();
  if (ref.includes('/') || ref.includes('\\') || ref.endsWith('.md')) {
    const resolved = path.resolve(cwd, ref);
    if (!isFile(resolved)) throw new Error(`not a file: ${resolved}`);
    return resolved;
  }
  const entry = resolveAlias(project, ref);
  if (!entry) throw new Error(`no session alias "${ref}" in project "${project}"`);
  const resolved = path.resolve(entry.sessionPath);
  if (!isFile(resolved)) throw new Error(`alias "${ref}" points at ${resolved}, not a file`);
  return resolved;
}

/**
 * The briefing `resume` prints: where it came from, the archive header (or a
 * handover's title), then the five sections. It changes nothing.
 * @param {string} content - Archive or handover markdown
 * @param {string} sourcePath
 * @returns {string}
 * @throws {Error} when the content is not the five sections (v5 included)
 */
function formatSessionBriefing(content, sourcePath) {
  const { preamble, sections } = readHandover(content, sourcePath);
  const lines = [`Source: ${sourcePath}`, ''];
  if (preamble) lines.push(preamble, '');
  for (const heading of HANDOVER_SECTIONS) {
    lines.push(`## ${heading}`, sections[heading], '');
  }
  return lines.join('\n').trimEnd();
}

module.exports = {
  HANDOVER_SECTIONS,
  ARCHIVE_HEADER_FIELDS,
  parseSessionSections,
  readHandover,
  generateSession,
  saveArchive,
  listArchives,
  readArchive,
  resolveSessionRef,
  formatSessionBriefing,
};
