const fs = require('node:fs');
const path = require('node:path');

const {
  parseTaskList,
  validateTaskList,
  updateTaskStatus,
  TASK_STATUSES,
} = require('../../scripts/lib/task-list');
const { REPO_ROOT } = require('./skill-tree');

// ---------------------------------------------------------------------------
// D3 task list format (v1) — schema tests.
// ---------------------------------------------------------------------------
//
// Spec: docs/decisions/task-list-format.md. The positive cases pin the
// grammar the loop depends on; the negative cases are the point of the suite —
// a format whose parser accepts malformed input silently drops tasks, and a
// dropped task is one the loop never runs.

const BANNER =
  '> arcforge task list v1 — status markers: `[ ]` pending, `[~]` in-progress, `[x]` done, `[!]` blocked.';

const GOOD = [
  '# Tasks: parser rewrite',
  '',
  BANNER,
  '',
  '- [x] T1 — Write the failing test',
  '  - verify: `npm run test:scripts`',
  '- [~] T2 — Implement the parser',
  '- [ ] T3 Wire it into the loop',
  '  - verify: npm test',
  '- [!] T4 — Publish',
  '  - note: waiting on release credentials',
  '',
].join('\n');

describe('the frozen spec and the parser agree', () => {
  // The spec doc is the artifact humans and P2's loop.js author read. If it
  // drifts from the parser, both stay green while the format quietly forks —
  // so the doc's own example is parsed as a test input, not transcribed.
  const SPEC = path.join(REPO_ROOT, 'docs', 'decisions', 'task-list-format.md');

  const firstMarkdownFence = (content) => {
    const m = content.match(/```markdown\n([\s\S]*?)```/);
    if (!m) throw new Error(`${SPEC} has no \`\`\`markdown example fence`);
    return m[1];
  };

  it('the example in the spec doc validates', () => {
    const example = firstMarkdownFence(fs.readFileSync(SPEC, 'utf8'));
    const parsed = validateTaskList(example);
    expect(parsed.version).toBe(1);
    expect(parsed.tasks.map((t) => t.status).sort()).toEqual([
      'blocked',
      'done',
      'in-progress',
      'pending',
    ]);
  });
});

describe('parseTaskList — valid sample', () => {
  const parsed = parseTaskList(GOOD);

  it('reads the banner version and the title', () => {
    expect(parsed.version).toBe(1);
    expect(parsed.title).toBe('Tasks: parser rewrite');
  });

  it('reads every task in file order', () => {
    expect(parsed.tasks.map((t) => t.id)).toEqual(['T1', 'T2', 'T3', 'T4']);
  });

  it('maps all four markers to their status', () => {
    expect(parsed.tasks.map((t) => t.status)).toEqual([
      'done',
      'in-progress',
      'pending',
      'blocked',
    ]);
    expect(TASK_STATUSES).toEqual(['pending', 'in-progress', 'done', 'blocked']);
  });

  it('keeps the task text without its separator', () => {
    expect(parsed.tasks[0].text).toBe('Write the failing test');
    expect(parsed.tasks[2].text).toBe('Wire it into the loop');
  });

  it('attaches verify and note to the right task, unquoting backticks', () => {
    expect(parsed.tasks[0].verify).toBe('npm run test:scripts');
    expect(parsed.tasks[2].verify).toBe('npm test');
    expect(parsed.tasks[1].verify).toBeNull();
    expect(parsed.tasks[3].note).toBe('waiting on release credentials');
  });

  it('records a 1-based line number for each task', () => {
    expect(parsed.tasks[0].line).toBe(5);
  });

  it('ignores prose and unrelated bullets', () => {
    const doc = `${BANNER}\n\nSome prose.\n\n- a plain bullet\n\n- [ ] T1 Do it\n`;
    expect(parseTaskList(doc).tasks).toHaveLength(1);
  });
});

describe('parseTaskList — malformed input must fail', () => {
  const bad = (doc) => () => parseTaskList(doc);

  it('rejects a checkbox line with no task id', () => {
    expect(bad(`${BANNER}\n- [ ] do the thing\n`)).toThrow(/malformed task line/);
  });

  it('rejects a checkbox line with no text', () => {
    expect(bad(`${BANNER}\n- [ ] T1\n`)).toThrow(/malformed task line/);
  });

  it('rejects an unknown status marker', () => {
    expect(bad(`${BANNER}\n- [?] T1 Do it\n`)).toThrow(/unknown status marker/);
  });

  it('rejects an empty marker', () => {
    expect(bad(`${BANNER}\n- [] T1 Do it\n`)).toThrow(/unknown status marker/);
  });

  it('rejects an indented checkbox (no nesting in v1)', () => {
    expect(bad(`${BANNER}\n- [ ] T1 Do it\n  - [ ] T2 Sub\n`)).toThrow(/malformed task line/);
  });

  it('rejects a detail bullet with no owning task', () => {
    expect(bad(`${BANNER}\n  - verify: npm test\n`)).toThrow(/does not belong to any task/);
  });

  it('rejects an unknown detail key', () => {
    expect(bad(`${BANNER}\n- [ ] T1 Do it\n  - owner: greg\n`)).toThrow(/unknown detail key/);
  });

  it('rejects a duplicated detail key on one task', () => {
    const doc = `${BANNER}\n- [ ] T1 Do it\n  - verify: a\n  - verify: b\n`;
    expect(bad(doc)).toThrow(/duplicate "verify:"/);
  });

  it('reports the offending line number and content', () => {
    expect(bad(`${BANNER}\n- [ ] T1 Do it\n- [z] T2 Nope\n`)).toThrow(/line 3/);
    expect(bad(`${BANNER}\n- [ ] T1 Do it\n- [z] T2 Nope\n`)).toThrow(/\[z\] T2 Nope/);
  });

  it('rejects non-string content', () => {
    expect(() => parseTaskList(null)).toThrow(TypeError);
    expect(() => parseTaskList({})).toThrow(/requires string content/);
  });
});

describe('validateTaskList', () => {
  it('accepts the valid sample and returns the parse', () => {
    expect(validateTaskList(GOOD).tasks).toHaveLength(4);
  });

  it('rejects a file with no self-description banner', () => {
    expect(() => validateTaskList('- [ ] T1 Do it\n')).toThrow(/banner/);
  });

  it('rejects a file with no tasks', () => {
    expect(() => validateTaskList(`${BANNER}\n\njust prose\n`)).toThrow(/no tasks/);
  });

  it('rejects duplicate task ids', () => {
    const doc = `${BANNER}\n- [ ] T1 One\n- [x] T1 Two\n`;
    expect(() => validateTaskList(doc)).toThrow(/duplicate task id T1/);
  });

  it('rejects a blocked task with no note', () => {
    expect(() => validateTaskList(`${BANNER}\n- [!] T1 Stuck\n`)).toThrow(/blocked with no/);
  });

  it('allows gaps in the id sequence (deleting a task never renumbers)', () => {
    const doc = `${BANNER}\n- [ ] T1 One\n- [ ] T7 Seven\n`;
    expect(validateTaskList(doc).tasks.map((t) => t.id)).toEqual(['T1', 'T7']);
  });
});

describe('updateTaskStatus', () => {
  it('walks a task through all four states', () => {
    let doc = `${BANNER}\n- [ ] T1 Do it\n`;
    for (const status of ['in-progress', 'blocked', 'done', 'pending']) {
      doc = updateTaskStatus(doc, 'T1', status);
      expect(parseTaskList(doc).tasks[0].status).toBe(status);
    }
  });

  it('changes only the marker character, leaving the rest byte-identical', () => {
    const before = GOOD;
    const after = updateTaskStatus(before, 'T2', 'done');
    expect(after.split('\n').filter((l, i) => l !== before.split('\n')[i])).toEqual([
      '- [x] T2 — Implement the parser',
    ]);
    expect(after.length).toBe(before.length);
  });

  it('touches only the addressed task', () => {
    const after = parseTaskList(updateTaskStatus(GOOD, 'T3', 'done'));
    expect(after.tasks.map((t) => t.status)).toEqual(['done', 'in-progress', 'done', 'blocked']);
  });

  it('preserves detail bullets and comments', () => {
    const after = updateTaskStatus(GOOD, 'T1', 'pending');
    expect(after).toContain('  - verify: `npm run test:scripts`');
    expect(after).toContain('# Tasks: parser rewrite');
  });

  it('rejects an unknown status', () => {
    expect(() => updateTaskStatus(GOOD, 'T1', 'almost')).toThrow(/unknown status "almost"/);
  });

  it('rejects an unknown id and names the known ones', () => {
    expect(() => updateTaskStatus(GOOD, 'T9', 'done')).toThrow(/no task with id T9/);
    expect(() => updateTaskStatus(GOOD, 'T9', 'done')).toThrow(/T1, T2, T3, T4/);
  });

  it('rejects an empty id', () => {
    expect(() => updateTaskStatus(GOOD, '', 'done')).toThrow(TypeError);
  });

  it('propagates a parse error rather than writing to a malformed file', () => {
    expect(() => updateTaskStatus(`${BANNER}\n- [?] T1 Do it\n`, 'T1', 'done')).toThrow(
      /unknown status marker/,
    );
  });
});

// ---------------------------------------------------------------------------
// updateTaskStatus(…, note) — the writer can state a blocking reason.
//
// validateTaskList REQUIRES a note: on every [!] task, so a writer that can set
// `blocked` but not attach a reason emits a file its own validator rejects.
// These cases pin that the round-trip closes.
// ---------------------------------------------------------------------------

describe('updateTaskStatus with a note', () => {
  it('blocking a task with a note produces a list that still validates', () => {
    const doc = `${BANNER}\n- [ ] T1 Do it\n`;
    const after = updateTaskStatus(doc, 'T1', 'blocked', 'verify command failed twice');
    expect(() => validateTaskList(after)).not.toThrow();
    const task = parseTaskList(after).tasks[0];
    expect(task.status).toBe('blocked');
    expect(task.note).toBe('verify command failed twice');
  });

  it('blocking WITHOUT a note is what validateTaskList rejects (the reason this exists)', () => {
    const after = updateTaskStatus(`${BANNER}\n- [ ] T1 Do it\n`, 'T1', 'blocked');
    expect(() => validateTaskList(after)).toThrow(/blocked with no "note:"/);
  });

  it('inserts the note below an existing detail block, matching its indent', () => {
    const doc = [BANNER, '- [ ] T1 Do it', '    - verify: `npm test`', ''].join('\n');
    const after = updateTaskStatus(doc, 'T1', 'blocked', 'flaky');
    expect(after.split('\n')).toEqual([
      BANNER,
      '- [ ] T1 Do it'.replace('[ ]', '[!]'),
      '    - verify: `npm test`',
      '    - note: flaky',
      '',
    ]);
    expect(parseTaskList(after).tasks[0].verify).toBe('npm test');
  });

  it('replaces an existing note instead of adding a second one', () => {
    const after = updateTaskStatus(GOOD, 'T4', 'blocked', 'still waiting on the signing key');
    expect(after).not.toContain('waiting on release credentials');
    expect(after.match(/- note:/g)).toHaveLength(1);
    expect(parseTaskList(after).tasks[3].note).toBe('still waiting on the signing key');
  });

  it('leaves every other task and the surrounding prose untouched', () => {
    const before = GOOD.split('\n');
    const after = updateTaskStatus(GOOD, 'T2', 'blocked', 'upstream API changed').split('\n');
    expect(after.filter((l) => !before.includes(l))).toEqual([
      '- [!] T2 — Implement the parser',
      '  - note: upstream API changed',
    ]);
  });

  it('collapses a multi-line reason into one line (the grammar has no continuation)', () => {
    const after = updateTaskStatus(`${BANNER}\n- [ ] T1 Do it\n`, 'T1', 'blocked', 'a\nb\n  c');
    expect(parseTaskList(after).tasks[0].note).toBe('a b c');
    expect(() => validateTaskList(after)).not.toThrow();
  });

  it('rejects an empty or non-string note rather than writing a bullet with no value', () => {
    expect(() => updateTaskStatus(GOOD, 'T1', 'blocked', '   ')).toThrow(TypeError);
    expect(() => updateTaskStatus(GOOD, 'T1', 'blocked', 42)).toThrow(TypeError);
  });

  it('a note can be attached to any status, not only blocked', () => {
    const after = updateTaskStatus(`${BANNER}\n- [ ] T1 Do it\n`, 'T1', 'done', 'landed in #42');
    const task = parseTaskList(after).tasks[0];
    expect(task.status).toBe('done');
    expect(task.note).toBe('landed in #42');
  });
});
