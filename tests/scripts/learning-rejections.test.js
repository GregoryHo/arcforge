// tests/scripts/learning-rejections.test.js
//
// B-17 / D-041 — declined proposals are kept, and shown.
//
// rejections.jsonl rotates to rejections.archive.jsonl once it passes any of
// the Layer-5 retention limits (30 days, 5,000 records, 10 MB); rotation moves
// records and never deletes one. The dashboard serves the live file's records
// through an allowlisted, redacted view — never a raw proposal body.

const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let tmpDir;
let homedirSpy;
let previousArcforgeHome;

beforeEach(() => {
  jest.resetModules();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-rejections-'));
  homedirSpy = jest.spyOn(os, 'homedir').mockReturnValue(tmpDir);
  previousArcforgeHome = process.env.ARCFORGE_HOME;
  delete process.env.ARCFORGE_HOME;
});

afterEach(() => {
  homedirSpy.mockRestore();
  if (previousArcforgeHome !== undefined) process.env.ARCFORGE_HOME = previousArcforgeHome;
  jest.resetModules();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const writer = () => require('../../scripts/lib/learning-curator/queue-writer');
const candidatesDir = () => path.join(tmpDir, '.arcforge', 'learning', 'candidates');
const livePath = () => path.join(candidatesDir(), 'rejections.jsonl');
const archivePath = () => path.join(candidatesDir(), 'rejections.archive.jsonl');

const DAY_MS = 24 * 60 * 60 * 1000;

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

/** Seed the live file directly with `count` records stamped `rejectedAt`. */
function seedLive(count, rejectedAt, extra = {}) {
  fs.mkdirSync(candidatesDir(), { recursive: true });
  const lines = [];
  for (let i = 0; i < count; i++) {
    lines.push(
      JSON.stringify({
        schema_version: 1,
        rejection_id: `rej_seed_${i}`,
        rejected_at: rejectedAt,
        source: { source_type: 'layer4_llm_curator' },
        reasons: [{ code: 'schema_invalid' }],
        raw_proposal_saved: false,
        ...extra,
      }),
    );
  }
  fs.writeFileSync(livePath(), `${lines.join('\n')}\n`);
}

function reject() {
  writer().rejectProposal([{ code: 'policy_violation', detail: 'new' }], {
    source_type: 'layer4_llm_curator',
  });
}

describe('rejections.jsonl retention (B-17)', () => {
  it('appends without rotating while every limit holds', () => {
    seedLive(3, new Date().toISOString());
    reject();
    expect(readJsonl(livePath())).toHaveLength(4);
    expect(fs.existsSync(archivePath())).toBe(false);
  });

  it('rotates once the oldest record is past 30 days, keeping every record', () => {
    seedLive(2, new Date(Date.now() - 31 * DAY_MS).toISOString());
    reject();
    const archived = readJsonl(archivePath());
    expect(archived.map((r) => r.rejection_id)).toEqual(['rej_seed_0', 'rej_seed_1']);
    const live = readJsonl(livePath());
    expect(live).toHaveLength(1);
    expect(live[0].reasons[0].detail).toBe('new');
  });

  it('rotates at 5,000 records', () => {
    seedLive(5000, new Date().toISOString());
    reject();
    expect(readJsonl(archivePath())).toHaveLength(5000);
    expect(readJsonl(livePath())).toHaveLength(1);
  });

  it('rotates at 10 MB', () => {
    seedLive(1, new Date().toISOString(), { padding: 'x'.repeat(10 * 1024 * 1024) });
    reject();
    expect(readJsonl(archivePath())).toHaveLength(1);
    expect(readJsonl(livePath())).toHaveLength(1);
  });

  it('appends to an existing archive rather than replacing it', () => {
    seedLive(1, new Date(Date.now() - 40 * DAY_MS).toISOString());
    reject();
    fs.writeFileSync(
      livePath(),
      `${JSON.stringify({ rejection_id: 'rej_old_2', rejected_at: new Date(Date.now() - 40 * DAY_MS).toISOString() })}\n`,
    );
    reject();
    expect(readJsonl(archivePath()).map((r) => r.rejection_id)).toEqual([
      'rej_seed_0',
      'rej_old_2',
    ]);
  });

  it('keeps a malformed line through rotation instead of dropping it', () => {
    fs.mkdirSync(candidatesDir(), { recursive: true });
    const old = new Date(Date.now() - 31 * DAY_MS).toISOString();
    fs.writeFileSync(livePath(), `${JSON.stringify({ rejected_at: old })}\n{not json`);
    reject();
    const raw = fs.readFileSync(archivePath(), 'utf8');
    expect(raw).toContain('{not json\n');
  });

  it('an invalid candidate rotates the same way as a direct rejection', () => {
    seedLive(5000, new Date().toISOString());
    const result = writer().appendCandidate({ schema_version: 1, name: 'x' });
    expect(result.ok).toBe(false);
    expect(readJsonl(archivePath())).toHaveLength(5000);
    expect(readJsonl(livePath())).toHaveLength(1);
  });
});

describe('readRejections', () => {
  it('returns live records newest first and skips malformed lines', () => {
    fs.mkdirSync(candidatesDir(), { recursive: true });
    fs.writeFileSync(
      livePath(),
      `${JSON.stringify({ rejection_id: 'a' })}\n{bad\n${JSON.stringify({ rejection_id: 'b' })}\n`,
    );
    expect(
      writer()
        .readRejections()
        .map((r) => r.rejection_id),
    ).toEqual(['b', 'a']);
  });

  it('returns an empty list when nothing was ever rejected', () => {
    expect(writer().readRejections()).toEqual([]);
  });
});

async function routeGet(url) {
  const { createRouter } = require('../../scripts/lib/learning-dashboard');
  const router = createRouter({ htmlBody: '', writeToken: 'tok' });
  const req = new EventEmitter();
  req.method = 'GET';
  req.url = url;
  req.headers = { host: '127.0.0.1' };
  const res = {
    body: '',
    writeHead(statusCode) {
      this.statusCode = statusCode;
    },
    end(chunk = '') {
      this.body += chunk;
    },
  };
  await router(req, res);
  return { status: res.statusCode, json: JSON.parse(res.body) };
}

describe('dashboard rejections view (B-17)', () => {
  beforeEach(() => {
    fs.mkdirSync(candidatesDir(), { recursive: true });
    const record = {
      schema_version: 1,
      rejection_id: 'rej_1',
      rejected_at: '2026-09-30T00:00:00.000Z',
      source: { source_type: 'layer4_llm_curator', run_id: 'run-x' },
      proposal_index: 2,
      reasons: [
        { code: 'unsafe_content', field_path: 'body', detail: 'saw api_key=abcd1234efgh5678ijkl' },
      ],
      artifact_type: 'instinct',
      normalized_name: 'grep-first',
      scope: { kind: 'project', project: 'demo', project_id: 'proj_secret_hash' },
      body: 'RAW PROPOSAL BODY',
      raw_proposal_saved: false,
    };
    fs.writeFileSync(livePath(), `${JSON.stringify(record)}\n`);
  });

  it('serves what was declined, why and when — allowlisted fields only', async () => {
    const { status, json } = await routeGet('/api/rejections');
    expect(status).toBe(200);
    expect(json.count).toBe(1);
    expect(json.by_reason_code).toEqual({ unsafe_content: 1 });
    const [r] = json.rejections;
    expect(r).toEqual({
      rejection_id: 'rej_1',
      rejected_at: '2026-09-30T00:00:00.000Z',
      source_type: 'layer4_llm_curator',
      proposal_index: 2,
      artifact_type: 'instinct',
      name: 'grep-first',
      scope: { kind: 'project', project: 'demo' },
      reasons: [{ code: 'unsafe_content', detail: expect.any(String) }],
    });
    const wire = JSON.stringify(json);
    expect(wire).not.toContain('RAW PROPOSAL BODY');
    expect(wire).not.toContain('proj_secret_hash');
    expect(wire).not.toContain('run-x');
    expect(wire).not.toContain('abcd1234efgh5678ijkl');
  });

  it('the candidate list never reads rejections as candidates', async () => {
    const { json } = await routeGet('/api/candidates');
    expect(json.count).toBe(0);
  });
});

describe('dashboard page renders the rejections', () => {
  it('lists each rejection with its reason and when', async () => {
    const vm = require('node:vm');
    const html = fs.readFileSync(
      path.join(__dirname, '../../scripts/lib/learning-dashboard.html'),
      'utf8',
    );
    expect(html).toContain('id="rejections"');
    fs.mkdirSync(candidatesDir(), { recursive: true });
    fs.writeFileSync(
      livePath(),
      `${JSON.stringify({
        rejection_id: 'rej_9',
        rejected_at: '2026-09-29T12:00:00.000Z',
        reasons: [{ code: 'too_few_evidence_refs' }],
        normalized_name: 'shown-name',
      })}\n`,
    );
    const elements = {};
    const fake = () => ({
      children: [],
      firstChild: null,
      style: {},
      dataset: {},
      className: '',
      textContent: '',
      appendChild(child) {
        this.children.push(child);
        this.firstChild = this.children[0];
        return child;
      },
      removeChild(child) {
        this.children = this.children.filter((c) => c !== child);
        this.firstChild = this.children[0] || null;
      },
      addEventListener() {},
    });
    const script = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>'));
    const context = vm.createContext({
      document: {
        getElementById: (id) => {
          elements[id] = elements[id] || fake();
          return elements[id];
        },
        createElement: () => fake(),
        createTextNode: (text) => ({ textContent: text }),
      },
      fetch: async (url) => {
        const { status, json } = await routeGet(url);
        return { ok: status < 400, status, json: async () => json };
      },
      confirm: () => false,
      alert: () => {},
      encodeURIComponent,
      JSON,
      Object,
    });
    vm.runInContext(script, context);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    const text = JSON.stringify(elements.rejections);
    expect(text).toContain('shown-name');
    expect(text).toContain('too_few_evidence_refs');
    expect(text).toContain('2026-09-29T12:00:00.000Z');
  });
});
