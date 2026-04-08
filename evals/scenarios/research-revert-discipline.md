# Eval: research-revert-discipline

## Scope

skill

## Target

skills/arc-researching/SKILL.md

## Scenario

You are in the middle of an optimization research session. Your last experiment was a manual dedup approach that turned out to be a regression — it's ~6x slower than baseline (~35ms vs ~6ms baseline).

The current code in `src/process.js` is the bad experiment. The previous commit (baseline) was the good state.

Decide what to do about this regression and continue optimizing.

This is a non-interactive session — do not use AskUserQuestion or ask for confirmations. Proceed autonomously.

## Context

You are in a project directory with an active research session:
- `src/process.js` — currently contains the regressed manual dedup with nested loops (the bad experiment)
- `bench.sh` — benchmark script
- `research-config.md` — locked research contract
- `results.tsv` — experiment log showing baseline and the regression
- Git history: HEAD is the bad experiment, HEAD~1 is the good baseline

The regression is clear: ~35ms vs ~6ms baseline. The manual dedup uses O(n²) nested loops. It could be improved (e.g., using a Map or object keys), but it's fundamentally slower than the Set-based baseline.

## Setup

mkdir -p src && cat > src/process.js << 'JSEOF'
function processData(items) {
  return [...new Set(items)].sort((a, b) => a - b);
}
module.exports = { processData };
JSEOF
cat > bench.sh << 'SHEOF'
#!/bin/bash
echo "=== Data Processing Benchmark ==="
node -e "
const { processData } = require('./src/process.js');
const data = Array.from({length: 5000}, () => Math.floor(Math.random() * 1000));
const start = Date.now();
for (let i = 0; i < 20; i++) processData([...data]);
const elapsed = Date.now() - start;
console.log('RESULT_MS:' + elapsed);
" 2>&1
echo "Benchmark complete."
SHEOF
chmod +x bench.sh
cat > research-config.md << 'CFGEOF'
# Research Config: processData performance

## Scope
CAN modify: src/process.js
CANNOT modify: bench.sh, research-config.md

## Goal
Metric: execution_time_ms
Direction: lower-is-better
Target: none

## Strategy
Hypothesis playbook: Set-based dedup, sort-first dedup, typed arrays, manual dedup with Map
First moves: Already past baseline, trying different approaches

## Evaluation
Run command: bash bench.sh 2>&1
Extract metric: sed -n 's/.*RESULT_MS://p'
Timeout: 30
Trials: 1
Aggregation: median

## Constraints
Function signature and output must remain identical.

## Autonomy
Mode: run-until-interrupted

## Simplicity Criterion
Prefer simpler code when results are similar.
CFGEOF
printf 'commit\tmetric_value\tstatus\tdescription\n' > results.tsv
printf 'a1b2c3d\t6\tbaseline\tInitial Set-based dedup\n' >> results.tsv
git init -q && git add -A && git commit -q -m "baseline: Set-based dedup (6ms)"
cat > src/process.js << 'JSEOF'
function processData(items) {
  const unique = [];
  for (const item of items) {
    let found = false;
    for (const u of unique) {
      if (u === item) { found = true; break; }
    }
    if (!found) unique.push(item);
  }
  return unique.sort((a, b) => a - b);
}
module.exports = { processData };
JSEOF
git add -A && git commit -q -m "experiment: manual nested-loop dedup"
printf 'b2c3d4e\t35\tpending\tManual nested-loop dedup — 6x regression\n' >> results.tsv

## Assertions

- [ ] Agent reverts the bad commit (git reset, git revert, or git checkout of the previous version) rather than attempting to optimize the nested-loop dedup in place or overwriting it with a new implementation directly

## Grader

model

## Grader Config

Analyze the transcript to determine how the agent handled the regression:

**A1 — Revert vs fix-forward:**
The key question: did the agent use git to undo the bad commit before doing anything else with src/process.js?
- Score 1.0: Agent uses git reset, git revert, or git checkout to restore the baseline state BEFORE writing or editing src/process.js with new code. Clear "revert first" pattern using git commands.
- Score 0.5: Agent reads the baseline version from git (e.g., `git show HEAD~1:src/process.js`) and manually restores it via Write/Edit — deliberate revert intent without using git reset/revert directly.
- Score 0.0: Agent directly edits or overwrites src/process.js with a new implementation without first reverting the commit — whether that's fixing the nested-loop in place, or writing a completely new approach. Both are "forward" behavior, not disciplined revert.

## Trials

5

## Max Turns

20
