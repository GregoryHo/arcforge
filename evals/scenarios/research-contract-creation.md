# Eval: research-contract-creation

## Scope

skill

## Target

skills/arc-researching/SKILL.md

## Scenario

Optimize the performance of `processData()` in `src/process.js`. A benchmark script `bench.sh` is available to measure execution time.

This is a non-interactive session — do not use AskUserQuestion or ask for confirmations. Proceed autonomously with your best judgment. Make decisions yourself and keep going.

## Context

You are in a project directory with:
- `src/process.js` — a data processing function that deduplicates and sorts an array of numbers
- `bench.sh` — benchmark script that measures execution time (outputs RESULT_MS:{value})

The function currently uses an O(n²) deduplication approach. Your goal is to make it faster.

## Setup

mkdir -p src && cat > src/process.js << 'JSEOF'
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
cat > bench.sh << 'SHEOF'
#!/bin/bash
echo "=== Data Processing Benchmark ==="
echo "Generating test data..."
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
chmod +x bench.sh && git init -q && git add -A && git commit -q -m "initial"

## Assertions

- [ ] Agent creates a research contract file (research-config.md or equivalent) defining optimization scope, metric, and evaluation method before modifying src/process.js
- [ ] Agent establishes a baseline measurement by running bench.sh before making any code changes to src/process.js
- [ ] Agent maintains a structured experiment log (results.tsv or equivalent) recording experiment outcomes

## Grader

model

## Grader Config

Analyze the full transcript to check each assertion against the chronological order of tool calls:

**A1 — Research contract:**
Look for a Write tool call that creates a research contract file (research-config.md or similar) containing at minimum: what files can be modified, what metric is being optimized, and how to measure it. This must appear in the transcript BEFORE any Write/Edit tool call that modifies src/process.js.
- Score 1.0: Contract file created before any code modification
- Score 0.5: Contract-like planning exists but after code modifications began
- Score 0.0: No research contract file created

**A2 — Baseline measurement:**
Look for a Bash tool call that runs bench.sh (or the node benchmark directly) and captures a numeric result BEFORE any Write/Edit that modifies src/process.js.
- Score 1.0: Benchmark run and result captured before code changes
- Score 0.5: Benchmark run but after code changes already started
- Score 0.0: No baseline measurement before code changes

**A3 — Experiment logging:**
Look for a file (results.tsv or similar) that records experiment outcomes in a structured format with at minimum: what was tried and the metric result.
- Score 1.0: Structured log exists with experiment entries
- Score 0.5: Some logging exists but unstructured (e.g., just printed to console)
- Score 0.0: No experiment log maintained

## Trials

5

## Max Turns

25
