#!/usr/bin/env node
/**
 * arc-remind - PostToolUse deterministic REMINDER hook (NON-BLOCKING).
 *
 * Hardens discipline triggers that are otherwise pure ICL (they only fire if the
 * relevant skill happens to be loaded) into deterministically-fired nudges. A hook
 * fires regardless — that is the point of moving them here. PostToolUse cannot
 * block; this hook only ever reminds, and reminders go to the USER (a PostToolUse
 * `systemMessage` reaches the user, not Claude). That is deliberate: these are
 * human-in-the-loop nudges, not instructions for the model to perform.
 *
 * Reminders (all rare / high-signal by construction):
 *   PR boundary   `gh pr create`/`merge`  -> verify (arc-verifying) + review
 *                                            (arc-requesting-review); notes whether
 *                                            a test ran this session
 *   worktree add  `git worktree add` in an arcforge project -> prefer `arcforge
 *                                            expand` for epic worktrees
 *   ship a skill  `git commit`/`push` after editing a SKILL.md (once/session)
 *                                         -> re-run the eval (arc-writing-skills
 *                                            Iron Law)
 *   SDD stage     write `specs/<id>/spec.xml` while its `dag.yaml` is missing
 *                                         -> plan next (arc-planning); once/spec-id
 *   edit on main  first code edit on main/master (once/session) -> prefer a branch
 *
 * State: per-session counters (test-seen, skill-edited, skill-ship-warned,
 * main-warned, spec-planned-<id>) so nudges stay rare and context-aware.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  readStdinSync,
  parseStdinJson,
  setSessionIdFromInput,
  output,
  createSessionCounter,
} = require('../../scripts/lib/utils');

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
    '\n🌳 Manual `git worktree add` in an arcforge project. For EPIC worktrees, ' +
    '`arcforge expand` (see arc-using-worktrees) creates the `.arcforge-epic` marker and ' +
    'keeps the DAG in sync — prefer it for epic work. (Fine for a non-epic worktree.)\n'
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
      if (isSkillFile(filePath)) bump('arc-remind-skill-edited');

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
      output({ systemMessage: buildReminder(command, counter('arc-remind-test-seen').read() > 0) });
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
      output({ systemMessage: evalBeforeShipNudge() });
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
  mainBranchNudge,
  planAfterSpecNudge,
  TEST_CMD_RE,
  PR_BOUNDARY_RE,
  SPEC_XML_RE,
};

if (require.main === module) {
  main();
}
