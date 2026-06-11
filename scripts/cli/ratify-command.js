/**
 * ratify-command.js — "arcforge ratify <spec-id> <D-id>" implementation.
 *
 * Interactively ratifies a proposed decision ledger entry, transitioning it from
 * status: proposed → accepted with a human-asserted ratified_by marker.
 *
 * B1 ENGINE GATE (PRIMARY, deterministic):
 *   Refuses to mint when ARCFORGE_MODE !== 'attended' OR a LIVE loop is
 *   detected via the lifecycle-aware sentinel check (loopSentinelPresent:
 *   .arcforge-loop.json with status "running" and a fresh heartbeat; a
 *   finished loop's sentinel stays on disk and does not block). This is the
 *   real floor — not harness-dependent.
 *
 * HONEST SCOPING (security note):
 *   ratified_by is a HUMAN-ASSERTED marker, NOT forgery-proof. Zero external
 *   deps means no credential layer (security.md). Its real strength comes from:
 *   (1) this engine mode-gate (ARCFORGE_MODE + loop sentinel), and
 *   (2) the sdd-ledger-guard hook (Task 3) that denies agent Edit/Write of
 *       status:accepted / ratified_by fields.
 *   The combination makes self-minting very difficult without deliberate bypass
 *   (--dangerously-skip-permissions), which is user choice, not a toolkit flaw.
 *
 * BYTE-PRESERVATION:
 *   decision and why fields are NEVER touched. The rewrite locates the target
 *   D-id block and surgically flips status + injects ratified_by + replaces
 *   authorized_values (if human edited). No YAML round-trip (avoids reformatting).
 *
 * @module ratify-command
 */

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { atomicWriteFile } = require('../lib/utils');
const { parseDecisionLedger, LOOP_SENTINEL, loopSentinelPresent } = require('../lib/sdd-utils');

/**
 * Perform a surgical rewrite of the decisions.yml content, transitioning
 * the target D-id entry from proposed → accepted.
 *
 * Strategy: locate the "- D-id: <id>" line and scan forward to the next
 * "- D-id:" line (or end of file), then splice in the new fields.
 *
 * BYTE-PRESERVATION guarantee: decision and why lines are copied verbatim
 * from the original (no round-trip through a YAML serializer).
 *
 * @param {string} content - Original YAML content.
 * @param {string} dId - The D-id to ratify.
 * @param {string[]} confirmedValues - Human-confirmed authorized_values.
 * @param {string} ratifiedBy - The ratified_by marker string.
 * @returns {string} Rewritten YAML content.
 */
function surgicalRewrite(content, dId, confirmedValues, ratifiedBy) {
  const lines = content.split('\n');

  // Find the line index for "- D-id: <dId>" (handles quoted and unquoted forms).
  const startIdx = lines.findIndex((line) => {
    const m = line.match(/^-\s+D-id:\s*["']?(.+?)["']?\s*$/);
    return m && m[1] === dId;
  });

  if (startIdx === -1) {
    throw new Error(`D-id "${dId}" not found in decisions.yml content`);
  }

  // Find the next "- D-id:" line or end of file.
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^-\s+D-id:/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }

  // Extract the original block.
  const blockLines = lines.slice(startIdx, endIdx);

  // Rewrite the block: flip status, inject ratified_by, replace authorized_values.
  const newBlock = [];
  let statusReplaced = false;
  let ratifiedByInserted = false;
  let inAuthorizedValues = false;
  let authorizedValuesReplaced = false;

  for (const line of blockLines) {
    // Replace status line.
    if (!statusReplaced && /^\s+status:/.test(line)) {
      newBlock.push(line.replace(/:\s*.+$/, ': accepted'));
      statusReplaced = true;
      // Insert ratified_by immediately after status.
      const indent = line.match(/^(\s+)/)?.[1] || '  ';
      newBlock.push(`${indent}ratified_by: "${ratifiedBy}"`);
      ratifiedByInserted = true;
      continue;
    }

    // Replace authorized_values block.
    if (!authorizedValuesReplaced && /^\s+authorized_values:/.test(line)) {
      inAuthorizedValues = true;
      const indent = line.match(/^(\s+)/)?.[1] || '  ';
      if (confirmedValues.length === 0) {
        newBlock.push(`${indent}authorized_values: []`);
      } else {
        newBlock.push(`${indent}authorized_values:`);
        for (const v of confirmedValues) {
          newBlock.push(`${indent}  - "${v}"`);
        }
      }
      authorizedValuesReplaced = true;
      continue;
    }

    // Skip old authorized_values list items.
    if (inAuthorizedValues && /^\s+- /.test(line)) {
      continue;
    }
    inAuthorizedValues = false;

    newBlock.push(line);
  }

  // Safety: if ratified_by was never inserted (no status line found), append it.
  if (!ratifiedByInserted) {
    newBlock.push(`  ratified_by: "${ratifiedBy}"`);
  }

  // Reassemble the file.
  return [...lines.slice(0, startIdx), ...newBlock, ...lines.slice(endIdx)].join('\n');
}

/**
 * Main ratify command handler.
 *
 * @param {string[]} positional - [specId, dId] positional arguments.
 * @param {string} projectRoot - Project root directory.
 * @returns {Promise<void>}
 */
async function runRatifyCommand(positional, projectRoot) {
  const specId = positional[0];
  const dId = positional[1];

  if (!specId || !dId) {
    console.error('Error: ratify requires two arguments: <spec-id> <D-id>');
    console.error('Usage: arcforge ratify <spec-id> <D-id>');
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // B1 ENGINE GATE (PRIMARY): refuse to mint in unattended or loop contexts.
  // This is deterministic and NOT harness-dependent.
  // -------------------------------------------------------------------------

  const mode = process.env.ARCFORGE_MODE;
  if (mode !== 'attended') {
    console.error(
      `Error: "arcforge ratify" requires ARCFORGE_MODE=attended.\n` +
        `Current mode: ${mode || '(unset, defaults to unattended)'}.\n` +
        `Ratification is a human-attended operation. Set ARCFORGE_MODE=attended\n` +
        `before running this command in a supervised session.`,
    );
    process.exit(1);
  }

  if (loopSentinelPresent(projectRoot)) {
    console.error(
      `Error: "arcforge ratify" refused — a live autonomous loop was detected\n` +
        `(${LOOP_SENTINEL} reports a running loop with a fresh heartbeat).\n` +
        `Ratification is a human decision and must not happen while a loop is running.\n` +
        `Recovery: wait for the loop to finish — a finished loop records a terminal\n` +
        `status and no longer blocks — then re-run in an attended session:\n` +
        `  arcforge ratify ${specId} ${dId}\n` +
        `If the loop was killed without finishing, this gate clears on its own once\n` +
        `the heartbeat is stale (30 minutes). Never delete ${LOOP_SENTINEL} — it is\n` +
        `the loop's resume state.`,
    );
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // Load and validate the ledger.
  // -------------------------------------------------------------------------

  const decisionsPath = path.resolve(projectRoot, 'specs', specId, 'decisions.yml');

  if (!fs.existsSync(decisionsPath)) {
    console.error(`Error: decisions.yml not found at ${decisionsPath}`);
    process.exit(1);
  }

  const entries = parseDecisionLedger(decisionsPath);
  if (!entries) {
    console.error(`Error: Could not parse decisions.yml at ${decisionsPath}`);
    process.exit(1);
  }

  const entry = entries.find((e) => e && String(e['D-id'] || '') === String(dId));
  if (!entry) {
    console.error(`Error: D-id "${dId}" not found in ${decisionsPath}`);
    process.exit(1);
  }

  if (String(entry.status || '') !== 'proposed') {
    console.error(
      `Error: D-id "${dId}" has status "${entry.status}" — only proposed decisions can be ratified.\n` +
        `Ratification transitions a decision from proposed → accepted.`,
    );
    process.exit(1);
  }

  const authValues = Array.isArray(entry.authorized_values) ? entry.authorized_values : [];

  // -------------------------------------------------------------------------
  // Interactive informed confirmation (§4.5 anti-rubber-stamp).
  // The human must see and confirm/edit each authorized value.
  //
  // Implementation: collect all stdin lines upfront (works with both TTY and
  // piped input), then consume them sequentially for each prompt. This avoids
  // the readline.question sequential-piped-stdin issue where later questions
  // receive empty string when stdin closes during an earlier question callback.
  // -------------------------------------------------------------------------

  console.log(`\nRatifying decision ${dId} in spec "${specId}"`);
  console.log('-'.repeat(60));
  console.log(`Decision: ${entry.decision}`);
  console.log(`Why:      ${entry.why}`);
  console.log('-'.repeat(60));
  console.log(`\nAuthorized values (${authValues.length} item(s)) -- review each carefully:`);
  console.log('You may press Enter to keep a value, or type a replacement.\n');

  // Collect all stdin lines upfront.
  const stdinLines = await new Promise((resolve) => {
    const lines = [];
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('line', (line) => lines.push(line));
    rl.once('close', () => resolve(lines));
    // If stdin is a TTY (interactive), rl will not close until Ctrl+D or the user
    // ends input — we cannot collect upfront in that case. For TTY, fall back to
    // per-question readline. Detect by checking process.stdin.isTTY.
    if (process.stdin.isTTY) {
      // TTY mode: resolve with a sentinel to signal interactive mode.
      resolve(null);
      rl.close();
    }
  });

  let lineIdx = 0;

  /**
   * Read the next input line. In piped (non-TTY) mode, pop from pre-collected lines.
   * In TTY (interactive) mode this code path is not used (stdinLines === null).
   */
  function nextLine() {
    if (stdinLines !== null && lineIdx < stdinLines.length) {
      const line = stdinLines[lineIdx++];
      process.stdout.write(`${line}\n`); // echo so output is readable
      return line;
    }
    return '';
  }

  if (stdinLines !== null) {
    // Piped stdin mode: use pre-collected lines.
    const confirmedValues = [];
    for (let i = 0; i < authValues.length; i++) {
      const original = String(authValues[i]);
      process.stdout.write(`\nAuthorized value ${i + 1}/${authValues.length}: "${original}"\n`);
      process.stdout.write('  Press Enter to confirm, or type a replacement value: ');
      const raw = nextLine();
      confirmedValues.push(raw.trim() === '' ? original : raw.trim());
    }

    process.stdout.write(`\n${'-'.repeat(30)}\n`);
    console.log('Confirmed authorized values:');
    for (const v of confirmedValues) {
      console.log(`  - "${v}"`);
    }

    process.stdout.write('\nProceed with ratification? (yes/no): ');
    const finalRaw = nextLine();
    const finalAnswer = finalRaw.trim().toLowerCase();

    if (finalAnswer !== 'yes' && finalAnswer !== 'y') {
      console.log('Ratification cancelled.');
      process.exit(0);
    }

    // Mint.
    const ratifiedBy = `${process.env.USER || 'human'}@${new Date().toISOString()}`;
    const originalContent = fs.readFileSync(decisionsPath, 'utf8');
    const newContent = surgicalRewrite(originalContent, dId, confirmedValues, ratifiedBy);
    atomicWriteFile(decisionsPath, newContent);

    console.log(`\nD-id "${dId}" ratified successfully.`);
    console.log(`  ratified_by: ${ratifiedBy}`);
    console.log(`  authorized_values: [${confirmedValues.map((v) => `"${v}"`).join(', ')}]`);
    console.log('\nIMPORTANT: Commit the updated decisions.yml to make the ratification durable.');
    console.log(
      '  Until committed, sdd-ledger-guard may flag the accepted entry if you Edit/Write the file.',
    );
  } else {
    // TTY (interactive) mode: use readline question sequentially.
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

    try {
      const confirmedValues = [];
      for (let i = 0; i < authValues.length; i++) {
        const original = String(authValues[i]);
        console.log(`\nAuthorized value ${i + 1}/${authValues.length}: "${original}"`);
        const raw = await ask('  Press Enter to confirm, or type a replacement value: ');
        confirmedValues.push(raw.trim() === '' ? original : raw.trim());
      }

      console.log(`\n${'-'.repeat(30)}`);
      console.log('Confirmed authorized values:');
      for (const v of confirmedValues) {
        console.log(`  - "${v}"`);
      }

      const finalRaw = await ask('\nProceed with ratification? (yes/no): ');
      const finalAnswer = finalRaw.trim().toLowerCase();

      if (finalAnswer !== 'yes' && finalAnswer !== 'y') {
        console.log('Ratification cancelled.');
        process.exit(0);
      }

      const ratifiedBy = `${process.env.USER || 'human'}@${new Date().toISOString()}`;
      const originalContent = fs.readFileSync(decisionsPath, 'utf8');
      const newContent = surgicalRewrite(originalContent, dId, confirmedValues, ratifiedBy);
      atomicWriteFile(decisionsPath, newContent);

      console.log(`\nD-id "${dId}" ratified successfully.`);
      console.log(`  ratified_by: ${ratifiedBy}`);
      console.log(`  authorized_values: [${confirmedValues.map((v) => `"${v}"`).join(', ')}]`);
      console.log(
        '\nIMPORTANT: Commit the updated decisions.yml to make the ratification durable.',
      );
      console.log(
        '  Until committed, sdd-ledger-guard may flag the accepted entry if you Edit/Write the file.',
      );
    } finally {
      rl.close();
    }
  }
}

module.exports = { runRatifyCommand, surgicalRewrite };
