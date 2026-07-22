/**
 * secrets-guard tests (Node --test runner).
 *
 * WARN-first: a hit returns a warning string (rendered as a systemMessage);
 * allowlisted / benign / non-target inputs return null. The guard never echoes
 * the matched secret into the warning.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { evaluate, scanForSecrets } = require('../secrets-guard/main');

// A 16-char AKIA body with no allowlist word on the line.
const AWS_KEY = 'AKIA1234567890ABCDEF';

describe('secrets-guard scanForSecrets', () => {
  it('flags an AWS access key id', () => {
    assert.deepStrictEqual(scanForSecrets(`const k = "${AWS_KEY}";`), ['AWS access key id']);
  });

  it('flags a hardcoded credential assignment', () => {
    assert.deepStrictEqual(scanForSecrets('password = "supersecret123"'), ['hardcoded credential']);
  });

  it('flags a private-key PEM header', () => {
    assert.deepStrictEqual(scanForSecrets('-----BEGIN RSA PRIVATE KEY-----'), [
      'private key block',
    ]);
  });

  it('skips allowlisted (test/example/fixture) lines', () => {
    assert.deepStrictEqual(scanForSecrets(`const k = "${AWS_KEY}"; // example fixture`), []);
    assert.deepStrictEqual(scanForSecrets('test_password = "supersecret123"'), []);
  });

  it('returns nothing for benign content', () => {
    assert.deepStrictEqual(scanForSecrets('const total = a + b;\nreturn total;'), []);
    assert.deepStrictEqual(scanForSecrets(''), []);
    assert.deepStrictEqual(scanForSecrets(null), []);
  });
});

describe('secrets-guard evaluate', () => {
  it('warns on a Write introducing a secret', () => {
    const warning = evaluate({
      tool_name: 'Write',
      tool_input: { file_path: 'src/config.js', content: `const key = "${AWS_KEY}";\n` },
      cwd: '/tmp',
    });
    assert.ok(warning, 'should warn');
    assert.ok(warning.includes('AWS access key id'), 'names the finding category');
    assert.ok(!warning.includes(AWS_KEY), 'must NOT echo the secret itself');
  });

  it('warns when an Edit adds a secret in new_string', () => {
    const warning = evaluate({
      tool_name: 'Edit',
      tool_input: {
        file_path: 'src/config.js',
        old_string: 'const port = 3000;',
        new_string: `const key = "${AWS_KEY}";`,
      },
      cwd: '/tmp',
    });
    assert.ok(warning, 'should warn');
    assert.ok(warning.includes('AWS access key id'), 'names the finding category');
    assert.ok(!warning.includes(AWS_KEY), 'must NOT echo the secret itself');
  });

  it('scans ONLY the added text of an Edit, not a pre-existing on-disk secret', () => {
    // A real file whose UNCHANGED body holds a secret; the Edit only rewrites a
    // benign line. The guard must not re-warn on the pre-existing secret — an Edit
    // scans new_string alone, never the whole resulting file.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'secrets-guard-'));
    const file = path.join(dir, 'config.js');
    fs.writeFileSync(file, `const key = "${AWS_KEY}";\nconst port = 3000;\n`);
    try {
      const warning = evaluate({
        tool_name: 'Edit',
        tool_input: {
          file_path: file,
          old_string: 'const port = 3000;',
          new_string: 'const port = 8080;',
        },
        cwd: dir,
      });
      assert.strictEqual(warning, null, 'benign edit must not warn on a pre-existing secret');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('warns on a git commit command carrying a secret', () => {
    const warning = evaluate({
      tool_name: 'Bash',
      tool_input: { command: `git commit -m "add ${AWS_KEY} to prod"` },
      cwd: '/tmp',
    });
    assert.ok(warning, 'should warn');
    assert.ok(warning.includes('AWS access key id'));
  });

  it('stays silent for a secret in a test/fixture path', () => {
    assert.strictEqual(
      evaluate({
        tool_name: 'Write',
        tool_input: { file_path: 'tests/fixtures/keys.js', content: `const k = "${AWS_KEY}";` },
        cwd: '/tmp',
      }),
      null,
    );
  });

  it('stays silent for allowlisted content', () => {
    assert.strictEqual(
      evaluate({
        tool_name: 'Write',
        tool_input: { file_path: 'src/config.js', content: `const k = "${AWS_KEY}"; // dummy` },
        cwd: '/tmp',
      }),
      null,
    );
  });

  it('ignores non-git Bash commands and non-target tools', () => {
    assert.strictEqual(
      evaluate({ tool_name: 'Bash', tool_input: { command: `echo ${AWS_KEY}` }, cwd: '/tmp' }),
      null,
    );
    assert.strictEqual(evaluate({ tool_name: 'Read', tool_input: { file_path: 'x' } }), null);
    assert.strictEqual(evaluate(null), null);
  });
});
