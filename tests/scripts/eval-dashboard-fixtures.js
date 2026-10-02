/**
 * eval-dashboard-fixtures.js — temp-project fixtures and a mock request/response
 * pair for the eval dashboard router suites.
 *
 * Helper module, not a suite: jest's testMatch only picks up `*.test.js`.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { RESULTS_DIR, SCENARIOS_DIR } = require('../../scripts/lib/eval');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'test-dashboard-'));
}

function writeScenario(dir, filename, content) {
  const scenariosDir = path.join(dir, SCENARIOS_DIR);
  fs.mkdirSync(scenariosDir, { recursive: true });
  fs.writeFileSync(path.join(scenariosDir, filename), content);
}

function writeResult(dir, scenarioName, runId, condition, results) {
  const runDir = path.join(dir, RESULTS_DIR, scenarioName, runId);
  fs.mkdirSync(runDir, { recursive: true });
  const jsonl = `${results.map((r) => JSON.stringify(r)).join('\n')}\n`;
  fs.writeFileSync(path.join(runDir, `${condition}.jsonl`), jsonl);
}

function writeTranscript(dir, scenarioName, runId, filename, content) {
  const transcriptsDir = path.join(dir, RESULTS_DIR, scenarioName, runId, 'transcripts');
  fs.mkdirSync(transcriptsDir, { recursive: true });
  fs.writeFileSync(path.join(transcriptsDir, filename), content);
}

function mockReqRes(url) {
  const res = {
    statusCode: null,
    headers: {},
    body: '',
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body || '';
    },
    write() {},
    on() {},
  };
  const req = { url, headers: { host: 'localhost:3333' } };
  return { req, res };
}

function callRouter(router, url) {
  const { req, res } = mockReqRes(url);
  router(req, res);
  return {
    status: res.statusCode,
    json: () => JSON.parse(res.body),
    text: () => res.body,
  };
}

module.exports = {
  makeTempDir,
  writeScenario,
  writeResult,
  writeTranscript,
  mockReqRes,
  callRouter,
};
