# Eval: research-outcome-quality

## Scope

skill

## Target

skills/arc-researching/SKILL.md

## Scenario

Optimize the performance of `processData()` in `src/process.js`. A benchmark script `bench.sh` is available to measure execution time.

This is a non-interactive session — do not use AskUserQuestion or ask for confirmations. Proceed autonomously with your best judgment.

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

- [ ] Final benchmark result is below 15ms (at least ~2x improvement from the ~35ms baseline)

## Grader

code

## Grader Config

RESULT=$(cd "$TRIAL_DIR" && bash bench.sh 2>/dev/null | sed -n 's/.*RESULT_MS://p' | tr -d '[:space:]')
if [ -z "$RESULT" ]; then
  echo "A1:FAIL:bench.sh produced no RESULT_MS output (code may be broken)"
elif [ "$RESULT" -lt 15 ] 2>/dev/null; then
  echo "A1:PASS"
else
  echo "A1:FAIL:Benchmark ${RESULT}ms — not below 15ms threshold (baseline ~35ms)"
fi

## Trials

5

## Max Turns

25
