#!/usr/bin/env node
/**
 * arc-remind - PostToolUse deterministic REMINDER hook (NON-BLOCKING).
 *
 * Hardens discipline triggers that are otherwise pure ICL (they only fire if the
 * relevant skill happens to be loaded) into deterministically-fired nudges. A hook
 * fires regardless — that is the point of moving them here. PostToolUse cannot
 * block; this hook only ever reminds.
 *
 * Audience depends on whether an autonomous loop is LIVE for this checkout
 * (RV-5). In an ATTENDED session a human is present, so every nudge is a
 * user-facing `systemMessage` — human-in-the-loop, not an instruction for the
 * model to perform. When `loopSentinelPresent(cwd)` is true (a loop is driving
 * the session, possibly inside an epic worktree resolved via its `.arcforge-epic`
 * marker), the PR-boundary and eval-before-ship nudges ADDITIONALLY reach the
 * model over the PostToolUse model channel (same JSON object) — there is no
 * human watching the systemMessage, so the autopilot needs to see the gate
 * itself. The worktree-add, main-branch and spec→dag nudges stay user-only.
 *
 * Reminders (all rare / high-signal by construction):
 *   PR boundary   `gh pr create`/`merge`  -> verify (arc-verifying) + review
 *                                            (arc-requesting-review); notes whether
 *                                            a test ran this session
 *   worktree add  raw `git worktree add` in an arcforge project -> prefer the
 *                                            arcforge CLI in BOTH directions:
 *                                            `arcforge expand` for epic worktrees,
 *                                            `arcforge worktree add` for non-epic ones
 *   ship a skill  `git commit`/`push` after editing a SKILL.md (once/session)
 *                                         -> freshness-aware eval nudge: compares
 *                                            evals/benchmarks/latest.json (`generated`,
 *                                            mtime fallback) against the session's
 *                                            SKILL.md edits (arc-writing-skills Iron Law)
 *   SDD stage     write `specs/<id>/spec.xml` while its `dag.yaml` is missing
 *                                         -> plan next (arc-planning); once/spec-id
 *   edit on main  first code edit on main/master (once/session) -> prefer a branch
 *
 * State: per-session counters (test-seen, skill-edited, skill-ship-warned,
 * main-warned, spec-planned-<id>) plus a hook-local record of the SKILL.md
 * paths edited this session, so nudges stay rare and context-aware.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  readStdinSync,
  parseStdinJson,
  setSessionIdFromInput,
  output,
  outputPostToolUseFeedback,
  createSessionCounter,
  getTempDir,
  getSessionId,
} = require('../../scripts/lib/utils');
const { loopSentinelPresent } = require('../../scripts/lib/sdd-utils');

// Common test runners — broad enough to catch the usual suspects, scoped to avoid noise.
const TEST_CMD_RE =
  /\b(?:npm (?:run )?test|npm t|yarn test|pnpm (?:run )?test|jest|vitest|pytest|go test|cargo test|mvn test|gradle test|rspec|phpunit|ctest|make test)\b/;
const PR_BOUNDARY_RE = /\bgh\s+pr\s+(?:create|merge)\b/;
const WORKTREE_ADD_RE = /\bgit\s+worktree\s+add\b/;
const SHIP_RE = /\bgit\s+(?:commit|push)\b/;
const SKILL_FILE_RE = /(?:^|\/)SKILL\.md$/;
// A spec body written by arc-refining: specs/<id>/spec.xml. Captures the spec-id.
const SPEC_XML_RE = /(?:^|\/)specs\/([^/]+)\/spec\.xml$/;
// Doc-ish extensions that don't count as "implementing" — editing these on main
// is not the signal we want to nudge on.
const DOC_EXTENSIONS = new Set(['.md', '.mdx', '.txt', '.rst']);

function isTestCommand(command) {
  return typeof command === 'string' && TEST_CMD_RE.test(command);
}
function isPrBoundary(command) {
  return typeof command === 'string' && PR_BOUNDARY_RE.test(command);
}
function isWorktreeAdd(command) {
  return typeof command === 'string' && WORKTREE_ADD_RE.test(command);
}
function isShipCommand(command) {
  return typeof command === 'string' && SHIP_RE.test(command);
}
function isSkillFile(filePath) {
  return typeof filePath === 'string' && SKILL_FILE_RE.test(filePath);
}

/** The spec-id if filePath is a specs/<id>/spec.xml, else null. */
function specIdFromSpecXml(filePath) {
  if (typeof filePath !== 'string') return null;
  const m = filePath.match(SPEC_XML_RE);
  return m ? m[1] : null;
}

/**
 * After a spec.xml is written, is its sibling dag.yaml still missing? That is the
 * deterministic "refined, not yet planned" signal — checked from the written path's
 * own directory, never a global specs/ scan (a repo can hold several spec families).
 */
function dagMissingForSpec(filePath, cwd) {
  try {
    const abs = path.resolve(cwd, filePath);
    return !fs.existsSync(path.join(path.dirname(abs), 'dag.yaml'));
  } catch {
    return false;
  }
}

/** A code (non-doc) file — the kind of edit that signals "implementing". */
function isCodeFile(filePath) {
  if (typeof filePath !== 'string' || !filePath) return false;
  return !DOC_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

/** Parse a branch name out of `.git/HEAD` contents, or null (detached / unknown). */
function branchFromHead(headContent) {
  if (typeof headContent !== 'string') return null;
  const m = headContent.match(/^ref:\s*refs\/heads\/(.+)\s*$/m);
  return m ? m[1].trim() : null;
}

/** Is cwd's git checkout on the main/master branch? Cheap: reads cwd/.git/HEAD. */
function isMainBranch(cwd) {
  try {
    const branch = branchFromHead(fs.readFileSync(path.join(cwd, '.git', 'HEAD'), 'utf8'));
    return branch === 'main' || branch === 'master';
  } catch {
    return false;
  }
}

/** Heuristic: is cwd an arcforge-managed project (so `arcforge expand` applies)? */
function isArcforgeProject(cwd) {
  try {
    return fs.existsSync(path.join(cwd, 'specs'));
  } catch {
    return false;
  }
}

/** PR-boundary verify + review reminder, or null when not a PR command. */
function buildReminder(command, testSeen) {
  if (!isPrBoundary(command)) return null;
  const verifyNote = testSeen
    ? 'A test command ran this session.'
    : 'No test command was observed this session.';
  return (
    '\n🔍 PR boundary reached. Before treating this as complete:\n' +
    '  • Fresh verification evidence — see arc-verifying (run the actual checks now).\n' +
    '  • Review before merge — see arc-requesting-review.\n' +
    `  ${verifyNote}\n`
  );
}

function worktreeAddNudge() {
  return (
    '\n🌳 Manual `git worktree add` in an arcforge project. Prefer the arcforge CLI so ' +
    'the path is derived and hooks stay quiet (see arc-using-worktrees):\n' +
    '  • EPIC work → `arcforge expand --epic <id>` — writes the `.arcforge-epic` marker ' +
    'and keeps the DAG in sync.\n' +
    '  • Non-epic work (a branch, experiment, or review checkout) → `arcforge worktree add ' +
    '<name>` — a managed worktree with no marker.\n'
  );
}

function mainBranchNudge() {
  return (
    '\n🌿 You’re editing code directly on `main`/`master`. For feature work, arcforge ' +
    'workflows prefer a dedicated branch or epic worktree (arc-executing-tasks / ' +
    'arc-coordinating) so main stays releasable. Ignore if working on main is intentional here.\n'
  );
}

function evalBeforeShipNudge() {
  return (
    '\n🧪 You edited a skill this session and are committing. arc-writing-skills’ Iron Law: ' +
    're-run the skill’s eval (RED → GREEN → REFACTOR) before shipping a behavioral change — ' +
    'an untested skill edit should not ship.\n'
  );
}

// ── Freshness-aware eval-before-ship ─────────────────────────────────────────
// Hook-local session state (this hook is the only consumer of a path list, so
// it stays here rather than growing the shared utils.js API): a JSON array of
// the SKILL.md paths edited this session, stored beside the session counters.

/** Path of the hook-local session state file recording edited SKILL.md paths. */
function skillEditStatePath() {
  return path.join(getTempDir(), `arcforge-arc-remind-skill-paths-${getSessionId()}`);
}

/** Record a SKILL.md edit for this session (absolute path, deduped). */
function recordSkillEdit(filePath, cwd) {
  try {
    const abs = path.resolve(cwd, filePath);
    const paths = readSkillEdits();
    if (!paths.includes(abs)) {
      paths.push(abs);
      fs.writeFileSync(skillEditStatePath(), JSON.stringify(paths));
    }
  } catch {
    // Non-blocking — the nudge degrades to its generic form without this state.
  }
}

/** The SKILL.md paths recorded this session ([] when none or unreadable). */
function readSkillEdits() {
  try {
    const parsed = JSON.parse(fs.readFileSync(skillEditStatePath(), 'utf8'));
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Timestamp (ms) of the latest benchmark evidence in cwd, or null when none
 * exists. Prefers latest.json's `generated` ISO field (written by the eval
 * engine); falls back to file mtime when the JSON is malformed or `generated`
 * is missing/unparseable.
 */
function latestBenchmarkTime(cwd) {
  try {
    const file = path.join(cwd, 'evals', 'benchmarks', 'latest.json');
    if (!fs.existsSync(file)) return null;
    let generated = NaN;
    try {
      generated = Date.parse(JSON.parse(fs.readFileSync(file, 'utf8')).generated);
    } catch {
      // Malformed JSON — fall through to the mtime fallback.
    }
    return Number.isFinite(generated) ? generated : fs.statSync(file).mtimeMs;
  } catch {
    return null;
  }
}

/** Latest mtime (ms) across the recorded SKILL.md paths, or null when none stat. */
function lastSkillEditTime(paths) {
  let latest = null;
  for (const p of paths) {
    try {
      const t = fs.statSync(p).mtimeMs;
      if (latest === null || t > latest) latest = t;
    } catch {
      // Deleted since the edit — skip.
    }
  }
  return latest;
}

/** Skill names (the SKILL.md's parent directory) for the recorded edit paths. */
function skillNamesFromPaths(paths) {
  return [...new Set(paths.map((p) => path.basename(path.dirname(p))))];
}

function staleEvalNudge(skillNames, benchTime) {
  return (
    `\n🧪 You edited ${skillNames} this session and are committing. No eval result newer ` +
    `than your skill edit exists — evals/benchmarks/latest.json was generated ` +
    `${new Date(benchTime).toISOString()}, before the edit. arc-writing-skills’ Iron Law: ` +
    're-run the skill’s eval (RED → GREEN → REFACTOR) before shipping a behavioral change.\n'
  );
}

function freshEvalNudge(skillNames, benchTime) {
  return (
    `\n🧪 You edited ${skillNames} this session and are committing. ` +
    `evals/benchmarks/latest.json (generated ${new Date(benchTime).toISOString()}) is newer ` +
    `than your skill edit — fresh eval evidence exists. Confirm it covers ${skillNames} ` +
    'before shipping.\n'
  );
}

/**
 * Freshness-aware eval-before-ship nudge. Three branches:
 *   no benchmark / no datable edit -> the generic Iron Law nudge (byte-identical
 *                                     to the pre-freshness behavior)
 *   benchmark older than the last SKILL.md edit -> stale: says concretely that
 *                                     no eval result newer than the edit exists
 *   benchmark strictly newer       -> fresh: evidence postdates the edit
 */
function buildEvalShipNudge(cwd) {
  const edits = readSkillEdits();
  const editTime = lastSkillEditTime(edits);
  const benchTime = latestBenchmarkTime(cwd);
  if (benchTime === null || editTime === null) return evalBeforeShipNudge();
  const names = skillNamesFromPaths(edits).join(', ');
  if (benchTime > editTime) return freshEvalNudge(names, benchTime);
  return staleEvalNudge(names, benchTime);
}

function planAfterSpecNudge(specId) {
  return (
    `\n📐 \`specs/${specId}/spec.xml\` is written but there's no \`dag.yaml\` yet. ` +
    'The next SDD stage is planning — see arc-planning to turn the refined spec into an ' +
    'executable DAG before implementing. Ignore if you’re still refining.\n'
  );
}

function counter(name) {
  return createSessionCounter(name);
}
function bump(name) {
  const c = counter(name);
  c.write(c.read() + 1);
}

/**
 * Emit an autopilot-aware nudge (RV-5). Attended (no live loop sentinel for
 * cwd): user-facing `systemMessage` only — unchanged behavior. Autopilot
 * (`loopSentinelPresent(cwd)` true, worktree-aware via AF-2): ADDITIONALLY
 * surface the same text to the model over the PostToolUse model channel, kept
 * in the single merged JSON object the helper guarantees. systemMessage stays
 * present in both modes.
 */
function emitNudge(cwd, text) {
  if (loopSentinelPresent(cwd)) {
    outputPostToolUseFeedback(text, { systemMessage: text });
  } else {
    output({ systemMessage: text });
  }
}

function main() {
  try {
    const input = parseStdinJson(readStdinSync());
    if (!input) return;
    setSessionIdFromInput(input);
    const tool = input.tool_name;

    // Edit/Write: track SKILL.md edits, and nudge once on the first code edit to main.
    if (tool === 'Edit' || tool === 'Write') {
      const filePath = input.tool_input?.file_path || '';
      const cwd = input.cwd || process.cwd();
      if (isSkillFile(filePath)) {
        bump('arc-remind-skill-edited');
        recordSkillEdit(filePath, cwd);
      }

      // SDD stage nudge: spec.xml written but its dag.yaml is missing -> plan next.
      // Once per spec-id (spec.xml is written across several edits).
      const specId = specIdFromSpecXml(filePath);
      if (specId && dagMissingForSpec(filePath, cwd)) {
        const warned = `arc-remind-spec-planned-${specId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        if (counter(warned).read() === 0) {
          bump(warned);
          output({ systemMessage: planAfterSpecNudge(specId) });
          return;
        }
      }

      if (
        isCodeFile(filePath) &&
        counter('arc-remind-main-warned').read() === 0 &&
        isMainBranch(cwd)
      ) {
        bump('arc-remind-main-warned');
        output({ systemMessage: mainBranchNudge() });
      }
      return;
    }

    if (tool !== 'Bash') return;
    const command = input.tool_input?.command || '';
    const cwd = input.cwd || process.cwd();

    // Record that a test ran (used by the PR-boundary note); a test command is
    // never also one of the trigger commands below, so stop here.
    if (isTestCommand(command)) {
      bump('arc-remind-test-seen');
      return;
    }

    if (isPrBoundary(command)) {
      emitNudge(cwd, buildReminder(command, counter('arc-remind-test-seen').read() > 0));
      return;
    }

    if (isWorktreeAdd(command) && isArcforgeProject(cwd)) {
      output({ systemMessage: worktreeAddNudge() });
      return;
    }

    // Ship-a-skill nudge: committing/pushing after editing a SKILL.md, once/session.
    if (
      isShipCommand(command) &&
      counter('arc-remind-skill-edited').read() > 0 &&
      counter('arc-remind-skill-ship-warned').read() === 0
    ) {
      bump('arc-remind-skill-ship-warned');
      emitNudge(cwd, buildEvalShipNudge(cwd));
    }
  } catch {
    // Non-blocking — never crash the session.
  }
}

module.exports = {
  isTestCommand,
  isPrBoundary,
  isWorktreeAdd,
  isShipCommand,
  isSkillFile,
  isCodeFile,
  specIdFromSpecXml,
  dagMissingForSpec,
  branchFromHead,
  isMainBranch,
  isArcforgeProject,
  buildReminder,
  worktreeAddNudge,
  evalBeforeShipNudge,
  skillEditStatePath,
  recordSkillEdit,
  readSkillEdits,
  latestBenchmarkTime,
  lastSkillEditTime,
  skillNamesFromPaths,
  staleEvalNudge,
  freshEvalNudge,
  buildEvalShipNudge,
  mainBranchNudge,
  planAfterSpecNudge,
  emitNudge,
  TEST_CMD_RE,
  PR_BOUNDARY_RE,
  SPEC_XML_RE,
};

if (require.main === module) {
  main();
}
