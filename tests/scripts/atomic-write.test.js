const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');

const { atomicWriteFile } = require('../../scripts/lib/atomic-write');

describe('atomicWriteFile', () => {
  let dir;
  let dest;
  let sentinel;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-write-'));
    dest = path.join(dir, 'state.json');
    sentinel = path.join(dir, 'sentinel.txt');
    fs.writeFileSync(sentinel, 'untouched');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // The temp name is random; pin it so something can be planted there first.
  function pinTempName() {
    jest.spyOn(crypto, 'randomBytes').mockReturnValueOnce(Buffer.from('0123456789ab', 'hex'));
    return path.join(dir, `.atomic-${process.pid}-0123456789ab.tmp`);
  }

  it('never writes through a symlink planted at the temp path', () => {
    const tmp = pinTempName();
    fs.symlinkSync(sentinel, tmp);
    expect(() => atomicWriteFile(dest, 'new state')).toThrow(`Cannot create temp file ${tmp}`);
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('untouched');
    expect(fs.lstatSync(tmp).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(dest)).toBe(false);
  });

  it('never overwrites a regular file planted at the temp path', () => {
    const tmp = pinTempName();
    fs.writeFileSync(tmp, 'planted');
    expect(() => atomicWriteFile(dest, 'new state')).toThrow(`Cannot create temp file ${tmp}`);
    expect(fs.readFileSync(tmp, 'utf8')).toBe('planted');
    expect(fs.existsSync(dest)).toBe(false);
  });

  it('fails naming the temp path when a directory stands there, writing nothing', () => {
    const tmp = pinTempName();
    fs.mkdirSync(tmp);
    expect(() => atomicWriteFile(dest, 'new state')).toThrow(`Cannot create temp file ${tmp}`);
    expect(fs.existsSync(dest)).toBe(false);
    expect(fs.statSync(tmp).isDirectory()).toBe(true);
  });

  it('replaces a symlink at the destination instead of writing through it', () => {
    fs.symlinkSync(sentinel, dest);
    atomicWriteFile(dest, 'new state');
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('untouched');
    expect(fs.lstatSync(dest).isFile()).toBe(true);
    expect(fs.readFileSync(dest, 'utf8')).toBe('new state');
  });

  it('leaves no temp file behind when the write fails', () => {
    // A full disk fails mid-write, after the temp file exists with part of the data.
    const realWrite = fs.writeFileSync;
    jest.spyOn(fs, 'writeFileSync').mockImplementationOnce((target) => {
      realWrite(target, 'partial');
      throw new Error('ENOSPC: no space left on device');
    });
    expect(() => atomicWriteFile(dest, 'new state')).toThrow('ENOSPC');
    expect(fs.readdirSync(dir)).toEqual(['sentinel.txt']);
  });

  it('leaves no temp file behind when the rename fails', () => {
    jest.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw new Error('EXDEV: cross-device link not permitted');
    });
    expect(() => atomicWriteFile(dest, 'new state')).toThrow('EXDEV');
    expect(fs.readdirSync(dir)).toEqual(['sentinel.txt']);
  });

  it('keeps the original error code as the cause when the temp file cannot be created', () => {
    jest.spyOn(fs, 'openSync').mockImplementationOnce(() => {
      throw Object.assign(new Error('EMFILE: too many open files'), { code: 'EMFILE' });
    });
    let thrown;
    try {
      atomicWriteFile(dest, 'new state');
    } catch (err) {
      thrown = err;
    }
    expect(thrown.message).toMatch(/^Cannot create temp file /);
    expect(thrown.cause.code).toBe('EMFILE');
  });

  it("removes a temp file left by a dead writer and keeps a live writer's", () => {
    const dead = spawnSync(process.execPath, ['-e', '']).pid;
    const deadTemp = path.join(dir, `.atomic-${dead}-0123456789ab.tmp`);
    const liveTemp = path.join(dir, `.atomic-${process.ppid}-ba9876543210.tmp`);
    fs.writeFileSync(deadTemp, 'abandoned');
    fs.writeFileSync(liveTemp, 'in flight');
    atomicWriteFile(dest, 'new state');
    expect(fs.existsSync(deadTemp)).toBe(false);
    expect(fs.readFileSync(liveTemp, 'utf8')).toBe('in flight');
    expect(fs.readFileSync(dest, 'utf8')).toBe('new state');
  });

  // Every writer used to share `<dest>.tmp`: one writer's cleanup unlinked
  // another's in-flight temp, and a rename could publish a temp another writer
  // had only just created. A reader polling the destination then saw it empty
  // or cut short, and writers failed on each other's temp (#253).
  it('lets concurrent writer processes replace one file without a reader seeing it torn', async () => {
    const writers = 8;
    const iterations = 150;
    const writer = `
      const { atomicWriteFile } = require(${JSON.stringify(require.resolve('../../scripts/lib/atomic-write'))});
      const [dest, id, n] = process.argv.slice(1);
      let failed = 0;
      for (let i = 0; i < Number(n); i++) {
        try {
          atomicWriteFile(dest, JSON.stringify({ id, i, pad: 'x'.repeat(50000) }));
        } catch {
          failed++;
        }
      }
      process.stdout.write(String(failed));
    `;
    const runs = Array.from({ length: writers }, (_, id) => {
      const child = spawn(process.execPath, ['-e', writer, dest, String(id), String(iterations)]);
      let out = '';
      child.stdout.on('data', (chunk) => {
        out += chunk;
      });
      return new Promise((resolve) => child.on('close', () => resolve(Number(out))));
    });
    let running = true;
    const done = Promise.all(runs).finally(() => {
      running = false;
    });
    let reads = 0;
    let torn = 0;
    while (running) {
      let text = null;
      try {
        text = fs.readFileSync(dest, 'utf8');
      } catch {
        // Not written yet: no write has been published.
      }
      if (text !== null) {
        reads++;
        try {
          JSON.parse(text);
        } catch {
          torn++;
        }
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
    const failures = await done;
    expect(reads).toBeGreaterThan(0);
    expect({ torn, failures }).toEqual({ torn: 0, failures: Array(writers).fill(0) });
    expect(JSON.parse(fs.readFileSync(dest, 'utf8')).pad).toHaveLength(50000);
    expect(fs.readdirSync(dir).sort()).toEqual(['sentinel.txt', 'state.json']);
  }, 60000);
});
