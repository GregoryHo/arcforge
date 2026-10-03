#!/usr/bin/env node
/**
 * Contract tests for the `session` CLI group (cli B-9): save, resume, list,
 * alias set|remove|list.
 *
 * Each test runs `node scripts/cli.js session ...` with ARCFORGE_HOME and
 * CLAUDE_PROJECT_DIR pointed at tmp dirs, so the archive tree and aliases.json
 * can be inspected directly.
 */

const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI_PATH = path.resolve(__dirname, '../../scripts/cli.js');

console.log('Testing cli.js session subcommands...\n');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-cli-session-'));
const HOME = path.join(tmp, 'home');
const PROJECT_DIR = path.join(tmp, 'my-proj');
const SESSIONS = path.join(HOME, 'sessions', 'my-proj');
fs.mkdirSync(PROJECT_DIR, { recursive: true });

const FIVE = `# Parser work

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

function runCli(args, { input = '', expectFail = false } = {}) {
  const env = { ...process.env, ARCFORGE_HOME: HOME, CLAUDE_PROJECT_DIR: PROJECT_DIR };
  try {
    const stdout = execFileSync('node', [CLI_PATH, ...args], {
      encoding: 'utf8',
      env,
      cwd: PROJECT_DIR,
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (expectFail) throw new Error(`expected failure, but got: ${stdout}`);
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    if (!expectFail) {
      console.error('STDOUT:', err.stdout);
      console.error('STDERR:', err.stderr);
      throw err;
    }
    return { stdout: err.stdout || '', stderr: err.stderr || '', exitCode: err.status || 1 };
  }
}

// The path `save` reports writing.
function savedPath(stdout) {
  return stdout.match(/^Saved session archive: (.+) \(alias /m)[1];
}

// Every archive saved today under `alias`.
function archivesOf(alias) {
  const dir = path.join(SESSIONS, today);
  const name = new RegExp(`^archive-${alias}-\\d{8}T\\d{6}Z(-\\d+)?\\.md$`);
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => name.test(f)) : [];
}

function readAliases() {
  return JSON.parse(fs.readFileSync(path.join(SESSIONS, 'aliases.json'), 'utf8'));
}

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}\n    ${err.message}`);
    failed++;
  }
}

// A tracker record the metrics header reads — with user message text that
// must never reach an archive (learning B-20).
const today = new Date().toISOString().slice(0, 10);
fs.mkdirSync(path.join(SESSIONS, today), { recursive: true });
fs.writeFileSync(
  path.join(SESSIONS, today, 'session-abc.json'),
  JSON.stringify({
    sessionId: 'session-abc',
    started: `${today}T10:00:00.000Z`,
    lastUpdated: `${today}T10:42:00.000Z`,
    toolCalls: 120,
    userMessages: 8,
    filesModified: ['src/a.js'],
    userMessageContent: ['please fix the secret-sauce bug'],
  }),
);

// --- save ---
let firstPath;
test('save <alias> --from -: sections on stdin → archive + alias', () => {
  const { stdout } = runCli(['session', 'save', 'parser', '--from', '-'], { input: FIVE });
  firstPath = savedPath(stdout);
  assert.strictEqual(path.dirname(firstPath), fs.realpathSync(path.join(SESSIONS, today)));
  assert.match(path.basename(firstPath), /^archive-parser-\d{8}T\d{6}Z(-\d+)?\.md$/);
  const md = fs.readFileSync(firstPath, 'utf8');
  assert.match(md, /^# Parser work\n/);
  assert.match(md, /\*\*Session:\*\* session-abc/);
  assert.match(
    md,
    /\*\*Metrics:\*\* as the session-tracker record holds them at \S+T10:42:00\.000Z — since the record's last diary capture or resume, not since the session began/,
  );
  assert.match(md, /\*\*Duration:\*\* ~42 minutes/);
  assert.match(md, /\*\*Tool calls:\*\* 120/);
  assert.match(md, /\*\*User messages:\*\* 8/);
  assert.match(md, /\*\*Files modified:\*\* 1\n- `src\/a\.js`/);
  assert.doesNotMatch(md, /secret-sauce|Conversation Trail/);
  assert.strictEqual(readAliases().aliases.parser.sessionPath, firstPath);
});

test('save --from <path>: reads the sections from a file', () => {
  const file = path.join(PROJECT_DIR, 'handover.md');
  fs.writeFileSync(file, FIVE.replace('# Parser work', '# Second'));
  const { stdout } = runCli(['session', 'save', 'second', '--from', 'handover.md']);
  const md = fs.readFileSync(savedPath(stdout), 'utf8');
  assert.match(md, /^# Second\n/);
});

test('save: input missing a section fails, naming it', () => {
  const { exitCode, stderr } = runCli(['session', 'save', 'bad', '--from', '-'], {
    input: FIVE.replace(/## Decisions[\s\S]*?(?=## Next)/, ''),
    expectFail: true,
  });
  assert.notStrictEqual(exitCode, 0);
  assert.match(stderr, /missing handover section\(s\): Decisions/);
  assert.deepStrictEqual(archivesOf('bad'), []);
});

test('save: a path-like alias is refused, leaving no archive', () => {
  for (const alias of ['../escape', 'a.b']) {
    const { exitCode, stderr } = runCli(['session', 'save', alias, '--from', '-'], {
      input: FIVE,
      expectFail: true,
    });
    assert.notStrictEqual(exitCode, 0);
    assert.match(stderr, /Invalid alias/);
  }
  assert.ok(!fs.existsSync(path.join(HOME, 'sessions', 'escape')));
});

test('save without an alias, or without --from, prints usage', () => {
  for (const args of [
    ['session', 'save'],
    ['session', 'save', 'x'],
  ]) {
    const { exitCode, stderr } = runCli(args, { input: FIVE, expectFail: true });
    assert.notStrictEqual(exitCode, 0);
    assert.match(stderr, /Usage: arcforge session save <alias> --from <path\|->/);
  }
  assert.deepStrictEqual(archivesOf('x'), []);
});

test('save: an existing alias is refused without --force; with it, a new archive, the old stays', () => {
  const old = readAliases().aliases.second.sessionPath;
  const { exitCode, stderr } = runCli(['session', 'save', 'second', '--from', '-'], {
    input: FIVE,
    expectFail: true,
  });
  assert.notStrictEqual(exitCode, 0);
  assert.match(stderr, /alias "second" already exists — pass --force/);
  assert.strictEqual(archivesOf('second').length, 1);
  const { stdout } = runCli(['session', 'save', 'second', '--from', '-', '--force'], {
    input: FIVE.replace('# Parser work', '# Second again'),
  });
  const now = savedPath(stdout);
  assert.notStrictEqual(now, old);
  assert.strictEqual(archivesOf('second').length, 2);
  assert.match(fs.readFileSync(old, 'utf8'), /^# Second\n/);
  assert.match(fs.readFileSync(now, 'utf8'), /^# Second again\n/);
  assert.strictEqual(readAliases().aliases.second.sessionPath, now);
});

test('save --session <id-prefix>: reads that record, and an unknown prefix is refused', () => {
  fs.writeFileSync(
    path.join(SESSIONS, today, 'session-zzz9.json'),
    JSON.stringify({ sessionId: 'session-zzz9', lastUpdated: `${today}T09:00:00.000Z` }),
  );
  const picked = savedPath(
    runCli(['session', 'save', 'picked', '--from', '-', '--session', 'zzz'], { input: FIVE })
      .stdout,
  );
  const md = fs.readFileSync(picked, 'utf8');
  assert.match(md, /\*\*Session:\*\* session-zzz9/);
  assert.match(md, /\*\*Files modified:\*\* none recorded/);
  const { exitCode, stderr } = runCli(
    ['session', 'save', 'nope', '--from', '-', '--session', 'qqq'],
    { input: FIVE, expectFail: true },
  );
  assert.notStrictEqual(exitCode, 0);
  assert.match(stderr, /no session-tracker record matches --session "qqq"/);
  runCli(['session', 'alias', 'remove', 'picked']);
  fs.rmSync(picked);
});

test('save: a --session or --from with no value is refused, naming the flag', () => {
  for (const [args, flag] of [
    [['--from', '-', '--session'], '--session'],
    [['--session', '--from', '-'], '--session'],
    [['--from'], '--from'],
    [['--from', '--force'], '--from'],
    [['--from', '-', '--session=zzz'], '--session'],
    [['--from=-'], '--from'],
  ]) {
    const { exitCode, stderr } = runCli(['session', 'save', 'dangling', ...args], {
      input: FIVE,
      expectFail: true,
    });
    assert.notStrictEqual(exitCode, 0);
    assert.match(stderr, new RegExp(`${flag} needs a value`));
  }
  assert.deepStrictEqual(archivesOf('dangling'), []);
  assert.ok(!readAliases().aliases.dangling);
});

// --- resume ---
test('resume <alias>: prints the header and the five sections', () => {
  const { stdout } = runCli(['session', 'resume', 'parser']);
  assert.match(stdout, /^Source: /);
  assert.match(stdout, /\*\*Alias:\*\* parser/);
  for (const h of ['Where it stands', 'Done', 'Unfinished', 'Decisions', 'Next']) {
    assert.match(stdout, new RegExp(`## ${h}\n`));
  }
});

test('resume <path>: reads a .handovers/ file', () => {
  fs.mkdirSync(path.join(PROJECT_DIR, '.handovers'), { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, '.handovers', `${today}-parser.md`), FIVE);
  const { stdout } = runCli(['session', 'resume', `.handovers/${today}-parser.md`]);
  assert.match(stdout, /# Parser work/);
  assert.match(stdout, /## Next\n1\. node scripts\/cli\.js parse/);
});

test('resume: a v5 archive is refused, naming the format', () => {
  const v5 = path.join(SESSIONS, '2026-04-17', 'session-old.md');
  fs.mkdirSync(path.dirname(v5), { recursive: true });
  fs.writeFileSync(v5, '# Session\n\n## Summary\nx\n\n## What Worked\ny\n\n## Next Step\nz\n');
  const { exitCode, stderr } = runCli(['session', 'resume', v5], { expectFail: true });
  assert.notStrictEqual(exitCode, 0);
  assert.match(stderr, /v5 session archive format .* is not supported/);
});

test('resume: an unknown alias fails, naming it and the project', () => {
  const { exitCode, stderr } = runCli(['session', 'resume', 'nope'], { expectFail: true });
  assert.notStrictEqual(exitCode, 0);
  assert.match(stderr, /no session alias "nope" in project "my-proj", and no file \.\/nope/);
});

test('resume <name>: a file of that name in cwd is read when no alias has it', () => {
  fs.writeFileSync(path.join(PROJECT_DIR, 'HANDOVER'), FIVE);
  const { stdout } = runCli(['session', 'resume', 'HANDOVER']);
  assert.match(stdout, /# Parser work/);
  fs.rmSync(path.join(PROJECT_DIR, 'HANDOVER'));
});

// --- list ---
test('list --json: archives only, newest first, with aliases', () => {
  const { stdout } = runCli(['session', 'list', '--json']);
  const result = JSON.parse(stdout);
  assert.strictEqual(result.project, 'my-proj');
  assert.deepStrictEqual(
    result.archives.map((a) => a.aliases),
    [['second'], [], ['parser']],
  );
  for (const a of result.archives) {
    assert.deepStrictEqual(Object.keys(a).sort(), ['aliases', 'date', 'path', 'title']);
  }
});

test('list --limit 1: one entry; a bad limit fails', () => {
  const { stdout } = runCli(['session', 'list', '--limit', '1', '--json']);
  assert.strictEqual(JSON.parse(stdout).archives.length, 1);
  const { exitCode, stderr } = runCli(['session', 'list', '--limit', '0'], { expectFail: true });
  assert.notStrictEqual(exitCode, 0);
  assert.match(stderr, /--limit must be a positive integer/);
});

test('list: a --limit with no value, or not a positive integer, fails naming the flag', () => {
  for (const args of [['--limit'], ['--limit=2'], ['--limit', '--json']]) {
    const { exitCode, stdout, stderr } = runCli(['session', 'list', ...args], {
      expectFail: true,
    });
    assert.notStrictEqual(exitCode, 0);
    assert.match(stdout + stderr, /--limit needs a value/);
  }
  for (const bad of ['1.5', 'abc', '0']) {
    const { exitCode, stderr } = runCli(['session', 'list', '--limit', bad], { expectFail: true });
    assert.notStrictEqual(exitCode, 0);
    assert.match(stderr, new RegExp(`--limit must be a positive integer, got "${bad}"`));
  }
});

test('list (text): one line per archive', () => {
  const { stdout } = runCli(['session', 'list']);
  assert.match(stdout, /parser/);
  assert.match(stdout, /archive-second-\d{8}T\d{6}Z/);
});

// --- alias ---
test('alias set <name> <archive-path>: points a new name at an archive', () => {
  runCli(['session', 'alias', 'set', 'pw', firstPath]);
  assert.strictEqual(readAliases().aliases.pw.sessionPath, firstPath);
  runCli(['session', 'alias', 'set', 'pw2', firstPath]);
  assert.strictEqual(readAliases().aliases.pw2.sessionPath, firstPath);
});

test('alias set: an existing name is refused without --force, repointed with it', () => {
  const secondPath = readAliases().aliases.second.sessionPath;
  const { exitCode, stderr } = runCli(['session', 'alias', 'set', 'pw', secondPath], {
    expectFail: true,
  });
  assert.notStrictEqual(exitCode, 0);
  assert.match(stderr, /alias "pw" already exists — pass --force/);
  runCli(['session', 'alias', 'set', 'pw', secondPath, '--force']);
  assert.strictEqual(readAliases().aliases.pw.sessionPath, secondPath);
});

test('alias set: the target is a path, never another alias', () => {
  const { exitCode, stderr } = runCli(['session', 'alias', 'set', 'pw3', 'parser'], {
    expectFail: true,
  });
  assert.notStrictEqual(exitCode, 0);
  assert.match(stderr, /not a file: .*parser/);
});

test('alias set: a former reserved word is an ordinary name', () => {
  runCli(['session', 'alias', 'set', 'list', firstPath]);
  assert.strictEqual(readAliases().aliases.list.sessionPath, firstPath);
  runCli(['session', 'alias', 'remove', 'list']);
});

test('save/resume: constructor, toString and __proto__ are ordinary alias names', () => {
  for (const name of ['constructor', 'toString', '__proto__']) {
    const { exitCode, stderr } = runCli(['session', 'resume', name], { expectFail: true });
    assert.notStrictEqual(exitCode, 0);
    assert.match(stderr, new RegExp(`${name}.*my-proj|my-proj.*${name}`));
    const { stdout } = runCli(['session', 'save', name, '--from', '-'], { input: FIVE });
    assert.match(stdout, new RegExp(`alias "${name}", new\\)`));
    const saved = savedPath(stdout);
    assert.ok(Object.hasOwn(readAliases().aliases, name));
    assert.strictEqual(readAliases().aliases[name].sessionPath, saved);
    assert.match(runCli(['session', 'resume', name]).stdout, /## Where it stands/);
    runCli(['session', 'alias', 'remove', name]);
    assert.ok(!Object.hasOwn(readAliases().aliases, name));
  }
});

test('alias set: a target that is not the five sections is refused', () => {
  const v5 = path.join(SESSIONS, '2026-04-17', 'session-old.md');
  const { exitCode, stderr } = runCli(['session', 'alias', 'set', 'old', v5], { expectFail: true });
  assert.notStrictEqual(exitCode, 0);
  assert.match(stderr, /v5 session archive format/);
  assert.ok(!readAliases().aliases.old);
});

test('alias set: a .handovers/ file is refused, pointing at resume <path>', () => {
  const { exitCode, stderr } = runCli(
    ['session', 'alias', 'set', 'ho', `.handovers/${today}-parser.md`],
    { expectFail: true },
  );
  assert.notStrictEqual(exitCode, 0);
  assert.match(stderr, /not a session archive/);
  assert.match(stderr, /arcforge session resume <path>/);
  assert.ok(!readAliases().aliases.ho);
});

test('alias set: an archive outside this project, or one with no engine header, is refused', () => {
  const outside = path.join(tmp, 'copied-archive.md');
  fs.copyFileSync(firstPath, outside);
  const noHeader = path.join(SESSIONS, today, 'archive-fake-20261003T000000Z.md');
  fs.writeFileSync(noHeader, FIVE);
  for (const target of [outside, noHeader]) {
    const { exitCode, stderr } = runCli(['session', 'alias', 'set', 'fake', target], {
      expectFail: true,
    });
    assert.notStrictEqual(exitCode, 0);
    assert.match(stderr, /not a session archive of project "my-proj"/);
  }
  assert.ok(!readAliases().aliases.fake);
  fs.rmSync(noHeader);
});

test('alias set: a symlink inside the tree to an archive outside it is refused', () => {
  const outside = path.join(tmp, 'linked-archive.md');
  fs.copyFileSync(firstPath, outside);
  const link = path.join(SESSIONS, today, 'archive-link-20261003T000000Z.md');
  fs.symlinkSync(outside, link);
  const { exitCode, stderr } = runCli(['session', 'alias', 'set', 'linked', link], {
    expectFail: true,
  });
  assert.notStrictEqual(exitCode, 0);
  assert.match(stderr, /not a session archive of project "my-proj"/);
  assert.ok(!readAliases().aliases.linked);
  fs.rmSync(link);
});

test('alias set: a symlink inside the tree stores the archive real path, and list shows it', () => {
  const link = path.join(SESSIONS, today, 'link-to-first.md');
  fs.symlinkSync(firstPath, link);
  runCli(['session', 'alias', 'set', 'viasym', link]);
  assert.strictEqual(readAliases().aliases.viasym.sessionPath, fs.realpathSync(firstPath));
  const { archives } = JSON.parse(runCli(['session', 'list', '--json']).stdout);
  const first = archives.find((a) => fs.realpathSync(a.path) === fs.realpathSync(firstPath));
  assert.ok(first.aliases.includes('viasym'), `aliases on ${first.path}: ${first.aliases}`);
  runCli(['session', 'alias', 'remove', 'viasym']);
  fs.rmSync(link);
});

test('alias list --json: every alias with its path', () => {
  const { stdout } = runCli(['session', 'alias', 'list', '--json']);
  const result = JSON.parse(stdout);
  assert.strictEqual(result.project, 'my-proj');
  assert.deepStrictEqual(result.aliases.map((a) => a.name).sort(), [
    'parser',
    'pw',
    'pw2',
    'second',
  ]);
});

test('alias remove <name>: drops it; an unknown name fails', () => {
  runCli(['session', 'alias', 'remove', 'pw2']);
  assert.ok(!readAliases().aliases.pw2);
  const { exitCode, stderr } = runCli(['session', 'alias', 'remove', 'pw2'], { expectFail: true });
  assert.notStrictEqual(exitCode, 0);
  assert.match(stderr, /not found/);
});

test('alias without an action prints usage', () => {
  const { exitCode, stderr } = runCli(['session', 'alias'], { expectFail: true });
  assert.notStrictEqual(exitCode, 0);
  assert.match(stderr, /Usage: arcforge session alias <set\|remove\|list>/);
});

// --- bare session ---
test('session without subcommand fails with usage', () => {
  const { exitCode, stderr } = runCli(['session'], { expectFail: true });
  assert.notStrictEqual(exitCode, 0);
  assert.match(stderr, /Usage: arcforge session <save\|resume\|list\|alias>/);
});

// --- help names what the counts are ---
test('--help says the save header counts are not session totals', () => {
  const help = runCli(['--help']).stdout.replace(/\s+/g, ' ');
  assert.match(
    help,
    /as the session-tracker record holds them at its lastUpdated stamp — since the record's last diary capture or resume, not since the session began/,
  );
});

// --- independence (B-3, B-9): works with learning off and no worktree ---
test('works with learning never enabled', () => {
  assert.ok(!fs.existsSync(path.join(HOME, 'learning.json')));
  runCli(['session', 'list']);
});

fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
