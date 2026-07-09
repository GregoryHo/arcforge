# Eval: eval-arc-agent-driven-ledger-resume

<!--
Ported from skills/arc-agent-driven "Durable Progress Ledger". Behavior under
test: on resume of an interrupted arc-agent-driven run, the controller
reconciles the durable ledger (.arcforge/sdd/progress.md) against git log and
resumes at Task N+1 WITHOUT re-dispatching a ledger-complete task — the single
most expensive failure the skill exists to prevent.

Discriminative design: the ledger is the SOLE authoritative per-task completion
record. The session-visible task list shows every box UNCHECKED, commit messages
are opaque (wip/checkpoint), and all task work lands in ONE shared file, so
neither the task list, `git log`, nor `ls src/` reveals how many of the five
tasks are done. Only `.arcforge/sdd/progress.md` (whose path the treatment
learns from the skill, and which the baseline is never told about) records "3 of
5 complete". A baseline that anchors on the unchecked list under completeness
pressure restarts at Task 1; the skilled controller reads the ledger, confirms
the named commit ranges exist, and resumes at Task 4.
-->

## Scope
skill

## Target
skills/arc-agent-driven/SKILL.md

## Scenario
Pick up this interrupted run and drive it to completion — every task in `docs/tasks/config-loader-tasks.md` must end up done exactly once. Do NOT execute or implement any task yourself; determine and state the resume plan only.

Begin your response with a single line in exactly this form (nothing else on that line):

`NEXT: Task <number> — <task name>`

naming the one task you will dispatch next to resume the run. Then, in a few sentences, justify which tasks are already complete and why that is your resume point.

## Context
You are resuming an in-progress `arc-agent-driven` run in this git worktree. A previous session was executing the task list at `docs/tasks/config-loader-tasks.md` (5 tasks) by dispatching a fresh implementer plus reviewers per task. That session ended and its in-memory TodoWrite list and terminal narration are gone — you are a fresh session with no memory of what ran. The repository, its git history, and the run's workspace files are exactly as the previous session left them. Read-only tools (Read, Glob, Grep) are available.

## Preflight
skip

## Verdict Policy
non-regression

## Setup
mkdir -p src tests docs/tasks .arcforge/sdd

git init -q
git config user.email "eval@arcforge.test"
git config user.name "Eval Fixture"

cat > .gitignore <<'EOF'
.arcforge/
.claude/
node_modules/
EOF

# The run's task list — every box UNCHECKED. This is the only session-visible
# progress signal, and on its face it says nothing has been done yet.
cat > docs/tasks/config-loader-tasks.md <<'EOF'
# Tasks: config-loader

- [ ] Task 1: Scaffold the ConfigLoader class in src/config-loader.js
- [ ] Task 2: Implement YAML source-file parsing
- [ ] Task 3: Implement environment-variable overrides
- [ ] Task 4: Implement JSON Schema validation of the merged config
- [ ] Task 5: Implement a hot-reload file watcher
EOF

cat > README.md <<'EOF'
# config-loader

A small library that loads layered configuration.
EOF

git add README.md .gitignore docs/tasks/config-loader-tasks.md
git commit -q -m "chore: scaffold repo"
BASE=$(git rev-parse --short HEAD)

# Task 1 landed. Opaque commit message; all task work lands in ONE shared file,
# so listing src/ never reveals how many of the five tasks are done.
cat > src/config-loader.js <<'EOF'
'use strict';

class ConfigLoader {
  constructor(options = {}) {
    this.options = options;
    this.data = {};
  }

  get(key) {
    return this.data[key];
  }
}

module.exports = { ConfigLoader };
EOF
git add src/config-loader.js
git commit -q -m "wip"
H1=$(git rev-parse --short HEAD)

# Task 2 landed.
cat > src/config-loader.js <<'EOF'
'use strict';

const fs = require('node:fs');

function parseYaml(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^(\w+):\s*(.+)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

class ConfigLoader {
  constructor(options = {}) {
    this.options = options;
    this.data = {};
  }

  loadFile(path) {
    this.data = { ...this.data, ...parseYaml(fs.readFileSync(path, 'utf8')) };
    return this;
  }

  get(key) {
    return this.data[key];
  }
}

module.exports = { ConfigLoader, parseYaml };
EOF
cat > tests/config-loader.test.js <<'EOF'
'use strict';
const { parseYaml } = require('../src/config-loader');
test('parseYaml reads key/value lines', () => {
  expect(parseYaml('port: 8080')).toEqual({ port: '8080' });
});
EOF
git add -A
git commit -q -m "checkpoint"
H2=$(git rev-parse --short HEAD)

# Task 3 landed.
cat > src/config-loader.js <<'EOF'
'use strict';

const fs = require('node:fs');

function parseYaml(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^(\w+):\s*(.+)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function applyEnvOverrides(data, env) {
  const out = { ...data };
  for (const key of Object.keys(out)) {
    const envKey = key.toUpperCase();
    if (env[envKey] !== undefined) out[key] = env[envKey];
  }
  return out;
}

class ConfigLoader {
  constructor(options = {}) {
    this.options = options;
    this.data = {};
  }

  loadFile(path) {
    this.data = { ...this.data, ...parseYaml(fs.readFileSync(path, 'utf8')) };
    return this;
  }

  applyEnv(env = process.env) {
    this.data = applyEnvOverrides(this.data, env);
    return this;
  }

  get(key) {
    return this.data[key];
  }
}

module.exports = { ConfigLoader, parseYaml, applyEnvOverrides };
EOF
git add -A
git commit -q -m "wip: more"
H3=$(git rev-parse --short HEAD)

# Durable Progress Ledger — the SOLE authoritative per-task completion record.
# Runtime recovery artifact in the self-ignoring .arcforge/sdd/ workspace;
# deliberately NOT committed (git-ignored scratch). The named commit ranges are
# the real short hashes above, so the ledger reconciles against `git log`.
cat > .arcforge/sdd/progress.md <<EOF
# Durable Progress Ledger — config-loader

Task 1: complete (commits ${BASE}..${H1}, review clean)
Task 2: complete (commits ${H1}..${H2}, review clean)
Task 3: complete (commits ${H2}..${H3}, review clean)
EOF

# Snapshot the completed shared file so the grader can detect wasteful
# re-implementation of already-landed work (behavioral no-redispatch backstop).
python3 - <<'PY'
import hashlib, pathlib
p = pathlib.Path("src/config-loader.js")
pathlib.Path(".expected-src.sha256").write_text(hashlib.sha256(p.read_bytes()).hexdigest() + "\n")
PY

## Assertions
- [ ] A1: On resume, the agent reconciles progress against the durable ledger (`.arcforge/sdd/progress.md`) or git log — it consults the authoritative completion record, not only the all-unchecked task list.
- [ ] A2: The agent resumes at Task 4 — its declared next/dispatch task is the first task after the three the ledger marks complete.
- [ ] A3: The agent does NOT re-dispatch or re-implement a ledger-complete task (Tasks 1-3) — it neither declares a resume point at or before Task 3, nor dispatches/rewrites already-landed work.

## Grader
code

## Grader Config
python3 - <<'PY'
import hashlib, os, re, sys
from pathlib import Path

trial = Path(os.environ["TRIAL_DIR"])
tp = os.environ.get("TRANSCRIPT_PATH")
txt = Path(tp).read_text(errors="replace") if tp and Path(tp).exists() else ""

assistant_parts = re.findall(r"(?ms)^\[Assistant\]\s*(.*?)(?=^\[[A-Za-z]+(?: Tool)?:|\Z)", txt)
assistant_txt = "\n\n".join(assistant_parts) if assistant_parts else txt
alow = assistant_txt.lower()

def emit(label, ok, reason=""):
    print(f"{label}:{'PASS' if ok else 'FAIL' + (':' + reason if reason else '')}")

# ---- A1: reconciled progress against the durable ledger / git log ----
read_ledger = re.search(r"\[Tool: (?:Read|Bash)\][^\n]*\.arcforge/sdd/progress\.md", txt)
git_recon = re.search(r"\[Tool: Bash\][^\n]*\b(?:git log|git rev-parse|git cat-file|git show)\b", txt)
ledger_text = re.search(r"\.arcforge/sdd|progress\.md|progress ledger|durable (?:progress )?ledger", alow)
a1 = bool(read_ledger or git_recon or ledger_text)
emit("A1", a1, "did not consult the durable progress ledger / git log to reconcile progress")

# ---- Declared resume point (shared by A2 and A3) ----
next_task = None
for pat in [
    r"(?im)^\s*NEXT\b[^\n0-9]*?(\d+)",
    r"(?i)\bnext task\b[^\n0-9]{0,15}?(\d+)",
    r"(?i)\b(?:dispatch|dispatching|resume|resuming|start|starting|begin|beginning|continue|pick up|next up)\b[^\n0-9]{0,30}?\btask\s*(\d+)",
    r"(?i)\btask\s*(\d+)\b[^\n0-9]{0,20}?\b(?:is next|next|first up|to dispatch|to resume|to run)\b",
]:
    m = re.search(pat, assistant_txt)
    if m:
        next_task = int(m.group(1))
        break
if next_task is None:
    if re.search(r"(?i)(?:next|dispatch\w*|resume\w*|begin with|start with)[^\n]{0,40}(?:json )?schema validation", alow):
        next_task = 4

# ---- A2: resumes at Task N+1 (Task 4) ----
a2 = next_task == 4
emit("A2", a2, f"declared next task = {next_task}; expected Task 4 (resume after 3 ledger-complete tasks)")

# ---- A3: does NOT re-dispatch / re-implement a ledger-complete task (Tasks 1-3) ----
restart_declared = next_task is not None and next_task <= 3
redispatch_tool = re.search(
    r"\[Tool: Task\][^\n]*(?:task\s*[123]\b|scaffold|parseyaml|yaml (?:source|file|pars)|env(?:ironment)?[- ]?var|env overrides)",
    txt,
    re.IGNORECASE,
)
fs_reimpl = False
exp_path = trial / ".expected-src.sha256"
src_path = trial / "src" / "config-loader.js"
if exp_path.exists() and src_path.exists():
    actual = hashlib.sha256(src_path.read_bytes()).hexdigest()
    fs_reimpl = actual != exp_path.read_text().strip()
a3 = not (restart_declared or bool(redispatch_tool) or fs_reimpl)
emit("A3", a3, "re-dispatched or re-implemented a ledger-complete task (Tasks 1-3)")

sys.exit(0 if all([a1, a2, a3]) else 1)
PY

## Trials
5

## Version
1
