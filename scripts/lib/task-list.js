/**
 * task-list.js — the D3 markdown checkbox task list (format v1).
 *
 * The task list is the loop's ONLY state: it has to survive a `/compact`, a
 * dead session, and a human editing it mid-run, so it is a plain markdown file
 * and nothing else. This module is its single owner (D8) — skills read and
 * write it through the CLI, never by reparsing markdown themselves.
 *
 * Grammar, and the reasoning behind it: docs/plans/v6/decisions/task-list-format.md
 *
 *   > arcforge task list v1 — …banner…
 *
 *   - [x] T1 — Write the failing test
 *     - verify: `npm run test:scripts`
 *   - [!] T2 — Publish
 *     - note: waiting on release credentials
 *
 * Library tier: pure string in, structured data out; throws with context.
 */

const TASK_STATUSES = ['pending', 'in-progress', 'done', 'blocked'];

const MARKER_TO_STATUS = new Map([
  [' ', 'pending'],
  ['~', 'in-progress'],
  ['x', 'done'],
  ['!', 'blocked'],
]);

const STATUS_TO_MARKER = new Map([...MARKER_TO_STATUS].map(([m, s]) => [s, m]));

// `> arcforge task list v1 …` — the self-description contract. A fresh subagent
// reading the file with no context learns the notation from this line, and the
// version lets a future grammar change be detected instead of mis-parsed.
const BANNER_RE = /^>\s*arcforge task list v(\d+)\b/i;

// Any list item that opens with a checkbox — matched loosely ON PURPOSE so a
// malformed one is reported rather than silently skipped.
const CHECKBOX_LINE_RE = /^\s*-\s*\[(.?)\]\s*(.*)$/;
// The strict shape: `- [m] T1 — text` (the separator is optional).
const TASK_LINE_RE = /^-\s\[(.?)\]\s+(T\d+)(?:\s*[—:-]\s*|\s+)(\S.*)$/;
// An indented detail bullet: `  - verify: …` / `  - note: …`
const DETAIL_LINE_RE = /^\s+-\s+([a-z]+):\s*(\S.*)$/;
const DETAIL_KEYS = new Set(['verify', 'note']);
const TITLE_RE = /^#\s+(\S.*)$/;

const EXPECTED_SHAPE = '- [ |~|x|!] T<n> <text>';

function fail(message, lineNo, line) {
  const where = lineNo ? ` (line ${lineNo})` : '';
  const shown = line === undefined ? '' : `\n  line: ${line}`;
  throw new Error(`task list${where}: ${message}${shown}`);
}

/** Strip surrounding backticks from a detail value: `npm test` → npm test. */
function unquote(value) {
  const t = value.trim();
  return t.startsWith('`') && t.endsWith('`') && t.length > 1 ? t.slice(1, -1).trim() : t;
}

/**
 * Parse a task list into structured form.
 *
 * @param {string} content full markdown file contents
 * @returns {{ version: number|null, title: string|null,
 *   tasks: {id:string,status:string,text:string,verify:string|null,note:string|null,line:number}[] }}
 * @throws {TypeError} when content is not a string
 * @throws {Error} on a malformed checkbox line, an unknown marker, an orphan
 *   detail bullet, or an unknown detail key — never silently skipped, because a
 *   dropped task is a task the loop will never run.
 */
function parseTaskList(content) {
  if (typeof content !== 'string') {
    throw new TypeError(`parseTaskList requires string content, got ${typeof content}`);
  }

  const lines = content.split('\n');
  const tasks = [];
  let version = null;
  let title = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    const banner = line.match(BANNER_RE);
    if (banner) {
      version = Number(banner[1]);
      continue;
    }

    if (title === null) {
      const t = line.match(TITLE_RE);
      if (t) {
        title = t[1].trim();
        continue;
      }
    }

    const detail = line.match(DETAIL_LINE_RE);
    if (detail) {
      const [, key, value] = detail;
      if (!DETAIL_KEYS.has(key)) {
        fail(
          `unknown detail key "${key}"; expected one of ${[...DETAIL_KEYS].join(', ')}`,
          lineNo,
          line,
        );
      }
      const owner = tasks[tasks.length - 1];
      if (!owner) fail(`"${key}:" bullet does not belong to any task`, lineNo, line);
      if (owner[key] !== null) fail(`duplicate "${key}:" for task ${owner.id}`, lineNo, line);
      owner[key] = unquote(value);
      continue;
    }

    if (!CHECKBOX_LINE_RE.test(line)) continue; // prose, blank lines, other bullets

    const task = line.match(TASK_LINE_RE);
    if (!task) fail(`malformed task line; expected "${EXPECTED_SHAPE}"`, lineNo, line);

    const [, marker, id, text] = task;
    if (!MARKER_TO_STATUS.has(marker)) {
      fail(
        `unknown status marker "[${marker}]"; expected one of ${[...MARKER_TO_STATUS.keys()]
          .map((m) => `[${m}]`)
          .join(' ')}`,
        lineNo,
        line,
      );
    }

    tasks.push({
      id,
      status: MARKER_TO_STATUS.get(marker),
      text: text.trim(),
      verify: null,
      note: null,
      line: lineNo,
    });
  }

  return { version, title, tasks };
}

/**
 * Parse, then enforce the semantic rules a loop depends on.
 *
 * @param {string} content
 * @returns {ReturnType<typeof parseTaskList>}
 * @throws {Error} when the self-description banner is missing, the list is
 *   empty, an id repeats, or a blocked task states no reason.
 */
function validateTaskList(content) {
  const parsed = parseTaskList(content);

  if (parsed.version === null) {
    fail('missing the "> arcforge task list v<N>" banner; the file must describe its own format');
  }
  if (parsed.tasks.length === 0) {
    fail('contains no tasks');
  }

  const seen = new Map();
  for (const task of parsed.tasks) {
    if (seen.has(task.id)) {
      fail(`duplicate task id ${task.id} (first seen on line ${seen.get(task.id)})`, task.line);
    }
    seen.set(task.id, task.line);
    if (task.status === 'blocked' && !task.note) {
      fail(`task ${task.id} is blocked with no "note:" reason`, task.line);
    }
  }

  return parsed;
}

/**
 * Set one task's status, preserving the rest of the file byte for byte.
 *
 * @param {string} content
 * @param {string} id task id, e.g. 'T3'
 * @param {string} status one of TASK_STATUSES
 * @returns {string} updated content
 * @throws {Error} on an unknown status or an id that is not in the list
 */
function updateTaskStatus(content, id, status) {
  if (typeof id !== 'string' || !id.trim()) {
    throw new TypeError('updateTaskStatus requires a non-empty task id');
  }
  if (!STATUS_TO_MARKER.has(status)) {
    fail(`unknown status "${status}"; expected one of ${TASK_STATUSES.join(', ')}`);
  }

  const parsed = parseTaskList(content);
  const target = parsed.tasks.find((t) => t.id === id);
  if (!target) {
    const known = parsed.tasks.map((t) => t.id).join(', ') || '(none)';
    fail(`no task with id ${id}; known ids: ${known}`);
  }

  const marker = STATUS_TO_MARKER.get(status);
  const lines = content.split('\n');
  const idx = target.line - 1;
  lines[idx] = lines[idx].replace(/\[(.?)\]/, `[${marker}]`);
  return lines.join('\n');
}

module.exports = { parseTaskList, validateTaskList, updateTaskStatus, TASK_STATUSES };
