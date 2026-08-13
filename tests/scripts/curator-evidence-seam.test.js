// tests/scripts/curator-evidence-seam.test.js
//
// Seam test for observe hook → batch-assembler → curator prompt.
//
// THE DEFECT THIS PINS: `hooks/observe/main.js` writes the evidence fields as
// `input` / `path` / `pattern` (+ `operation_kind`), but `batch-assembler.js`
// read `input_summary` / `path_summary` / `pattern_summary`. Those names never
// agreed — both sides arrived in the same commit (5f8c8b5, the v3.1.0 curator
// pivot) already mismatched. All three were therefore permanently `undefined`,
// so every batch reached the LLM curator carrying tool names and timestamps and
// nothing else, and Layer 4 was proposing from an empty description of what
// happened. `operation_kind` was attached to the item but never rendered, so a
// read and an edit of the same file were indistinguishable.
//
// WHY THE EXISTING SUITE MISSED IT: tests/observer-daemon/run-tests.sh (E2E-G3)
// asserts "queue.jsonl has a candidate after analysis" and passes — but it runs
// against a STUBBED `claude` that returns a hardcoded proposal after reading the
// batch manifest for real ids. The stub never depends on evidence CONTENT, so
// the prompt could be empty and that test stayed green.
//
// This test therefore uses NO stub. It drives the real hook entry point, runs
// the real assembler, and asserts on the real prompt text.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const OBSERVE_HOOK = path.join(__dirname, '../../hooks/observe/main.js');

/**
 * Fire the real observe hook the way hooks.json does: phase as argv[2], the
 * hook payload on stdin. Returns nothing; the hook appends to observations.jsonl.
 */
function observe(phase, home, projectDir, payload) {
  execFileSync('node', [OBSERVE_HOOK, phase], {
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    stdio: 'pipe',
    env: {
      ...process.env,
      ARCFORGE_HOME: home,
      CLAUDE_PROJECT_DIR: projectDir,
      CLAUDE_SESSION_ID: 'seam-session',
    },
  });
}

describe('observe → batch-assembler → curator prompt (no stub)', () => {
  let home;
  let projectDir;
  let project;
  let prompt;
  let observations;

  beforeAll(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'curator-seam-'));
    projectDir = path.join(home, 'seam-proj');
    project = path.basename(projectDir);
    fs.mkdirSync(projectDir, { recursive: true });

    // Learning must be enabled or the hook's fast path exits before recording.
    const configPath = path.join(home, 'learning', 'config.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ scope: 'global', enabled: true }));

    const base = { session_id: 'seam-session', cwd: projectDir };

    // One of each evidence-bearing tool class, pre phase (which is the phase
    // that carries the evidence patch) plus a post phase for outcome.
    observe('pre', home, projectDir, {
      ...base,
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'npm test -- parser' },
    });
    observe('post', home, projectDir, {
      ...base,
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'npm test -- parser' },
      tool_response: { stdout: '1 failing', exit_code: 1 },
    });
    observe('pre', home, projectDir, {
      ...base,
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: 'src/parser.js' },
    });
    observe('pre', home, projectDir, {
      ...base,
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: 'src/parser.js', old_string: 'a', new_string: 'b' },
    });
    observe('pre', home, projectDir, {
      ...base,
      hook_event_name: 'PreToolUse',
      tool_name: 'Grep',
      tool_input: { pattern: 'handleRequest', path: 'src/' },
    });
    // A tool outside the Layer 2 allowlist: recorded, but with its evidence
    // omitted. It stays in the batch and the ingestor rejects any proposal that
    // cites it (`evidence_ref_omitted_upstream`), so the batch has to say so.
    observe('pre', home, projectDir, {
      ...base,
      hook_event_name: 'PreToolUse',
      tool_name: 'Task',
      tool_input: { prompt: 'spawn a subagent' },
    });

    const obsPath = path.join(home, 'observations', project, 'observations.jsonl');
    observations = fs
      .readFileSync(obsPath, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    // Assemble with the real assembler, reading the real records.
    const previousHome = process.env.ARCFORGE_HOME;
    process.env.ARCFORGE_HOME = home;
    try {
      const modPath = require.resolve('../../scripts/lib/learning-curator/batch-assembler');
      delete require.cache[modPath];
      const { assembleBatch } = require(modPath);
      const result = assembleBatch({ project });
      prompt = fs.readFileSync(result.prompt_path, 'utf-8');
    } finally {
      if (previousHome === undefined) delete process.env.ARCFORGE_HOME;
      else process.env.ARCFORGE_HOME = previousHome;
    }
  });

  afterAll(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  // --- Upstream half: the hook really did record the evidence -------------

  it('the hook records Bash commands under `input`', () => {
    const rec = observations.find((o) => o.tool === 'Bash' && o.event === 'tool_start');
    expect(rec).toBeDefined();
    expect(rec.input).toBe('npm test -- parser');
    expect(rec.operation_kind).toBe('shell');
    expect(rec.evidence_status).toBe('present');
  });

  it('the hook records file paths under `path`, with the operation kind', () => {
    const read = observations.find((o) => o.tool === 'Read');
    const edit = observations.find((o) => o.tool === 'Edit');
    expect(read.path).toBe('src/parser.js');
    expect(read.operation_kind).toBe('read');
    expect(edit.path).toBe('src/parser.js');
    expect(edit.operation_kind).toBe('edit');
  });

  // --- The seam: does any of it survive into the prompt? -------------------

  it('the prompt carries the Bash command, not just the tool name', () => {
    expect(prompt).toContain('npm test -- parser');
  });

  it('the prompt carries the file path a Read/Edit touched', () => {
    expect(prompt).toContain('src/parser.js');
  });

  it('the prompt carries the Grep pattern', () => {
    expect(prompt).toContain('handleRequest');
  });

  it('the prompt distinguishes a read from an edit of the same file', () => {
    // Both carry path_summary: src/parser.js — operation_kind is the ONLY thing
    // that tells them apart, which is why it has to be rendered.
    expect(prompt).toContain('**operation_kind**: read');
    expect(prompt).toContain('**operation_kind**: edit');
    expect(prompt).toContain('**operation_kind**: shell');
  });

  it('the prompt still carries the post-phase outcome', () => {
    expect(prompt).toMatch(/\*\*outcome\*\*: \w+/);
  });

  it('marks evidence that was omitted upstream as uncitable', () => {
    // The ingestor rejects proposals citing a non-`present` item. The curator
    // can only obey that if the batch tells it which items those are.
    const omitted = observations.find((o) => o.tool === 'Task');
    expect(omitted.evidence_status).not.toBe('present');
    expect(prompt).toContain('**evidence_status**: omitted_unsupported_tool — DO NOT CITE');
  });

  it('does not clutter citable items with a status line', () => {
    // Only the exceptions are annotated; marking every present item would bury
    // the signal it exists to carry.
    const bashBlock = prompt
      .split('---')
      .find((b) => b.includes('**tool**: Bash') && b.includes('tool_start'));
    expect(bashBlock).not.toContain('evidence_status');
  });

  it('an observation evidence item is not reduced to name and timestamp', () => {
    // The regression shape stated positively: the Bash item must carry more
    // than the skeleton fields. This is what failed before the fix.
    const bashItem = prompt
      .split('---')
      .find((block) => block.includes('**tool**: Bash') && block.includes('tool_start'));
    expect(bashItem).toBeDefined();
    expect(bashItem).toContain('**input_summary**:');
  });
});
