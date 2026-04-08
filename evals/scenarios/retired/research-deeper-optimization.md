# Eval: research-deeper-optimization

## Scope

skill

## Target

skills/arc-researching/SKILL.md

## Scenario

Optimize the performance of `processData()` in `src/process.js`. A benchmark script `bench.sh` is available to measure execution time. The function processes sensor readings — deduplicates, sorts, computes percentile ranks, and groups by category.

The current implementation is slow (~400ms for the benchmark). Your goal is to make it as fast as possible.

This is a non-interactive session — do not use AskUserQuestion or ask for confirmations. Proceed autonomously with your best judgment.

## Context

You are in a project directory with:
- `src/process.js` — data processing function (dedup + sort + percentile + grouping)
- `bench.sh` — benchmark script that measures execution time (outputs RESULT_MS:{value})

The function has performance bottlenecks. Some are obvious from reading the code, others may require measuring and iterating to discover.

## Setup

mkdir -p src && cat > src/process.js << 'JSEOF'
function processData(items) {
  // Step 1: Remove duplicate readings
  const unique = [];
  for (const item of items) {
    const key = JSON.stringify(item);
    let found = false;
    for (const u of unique) {
      if (JSON.stringify(u) === key) { found = true; break; }
    }
    if (!found) unique.push(item);
  }

  // Step 2: Sort by value
  unique.sort((a, b) => a.value - b.value);

  // Step 3: Compute percentile rank for each reading
  const enriched = unique.map(item => ({
    ...item,
    percentile: Math.round(
      (unique.filter(other => other.value <= item.value).length / unique.length) * 100
    )
  }));

  // Step 4: Group by category
  const result = {};
  for (const item of enriched) {
    if (!result[item.category]) result[item.category] = [];
    result[item.category].push(item);
  }

  return result;
}

module.exports = { processData };
JSEOF
cat > bench.sh << 'SHEOF'
#!/bin/bash
echo "=== Data Processing Benchmark ==="
node -e "
const { processData } = require('./src/process.js');
const cats = ['sensor-A', 'sensor-B', 'sensor-C', 'sensor-D'];
const items = [];
for (let i = 0; i < 1000; i++) {
  items.push({
    id: Math.floor(Math.random() * 2000),
    value: Math.round(Math.random() * 1000 * 100) / 100,
    category: cats[Math.floor(Math.random() * 4)]
  });
}
for (let i = 0; i < 300; i++) items.push(items[Math.floor(Math.random() * 1000)]);
const start = Date.now();
for (let iter = 0; iter < 3; iter++) {
  processData(JSON.parse(JSON.stringify(items)));
}
const elapsed = Date.now() - start;
console.log('RESULT_MS:' + elapsed);
" 2>&1
echo "Benchmark complete."
SHEOF
chmod +x bench.sh && git init -q && git add -A && git commit -q -m "initial"

## Assertions

- [ ] Final benchmark is below 100ms (found the obvious dedup bottleneck)
- [ ] Final benchmark is below 15ms (also found the hidden percentile bottleneck)

## Grader

code

## Grader Config

RESULT=$(cd "$TRIAL_DIR" && bash bench.sh 2>/dev/null | sed -n 's/.*RESULT_MS://p' | tr -d '[:space:]')
if [ -z "$RESULT" ]; then
  echo "A1:FAIL:bench.sh produced no RESULT_MS output"
  echo "A2:FAIL:bench.sh produced no RESULT_MS output"
  exit 0
fi
if [ "$RESULT" -lt 100 ] 2>/dev/null; then echo "A1:PASS"; else echo "A1:FAIL:${RESULT}ms >= 100ms"; fi
if [ "$RESULT" -lt 15 ] 2>/dev/null; then echo "A2:PASS"; else echo "A2:FAIL:${RESULT}ms >= 15ms"; fi

## Trials

5

## Max Turns

30
