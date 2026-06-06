/**
 * eval-benchmark.js - Benchmark, metrics, and comparison reporting for the eval harness
 *
 * Provides token/duration accounting, per-trial raw benchmark generation,
 * benchmark summaries, and A/B result comparison.
 *
 * Dependency direction is one-way: this module imports orchestration helpers
 * (loadResults, listScenarios, parseScenario, inferClaimType, compactDate) from
 * ./eval. eval.js never imports from here — the cluster is a leaf consumed only
 * by cli.js and tests.
 *
 * Zero external dependencies — Node.js standard library only.
 */

const fs = require('node:fs');
const path = require('node:path');
const { ensureDir, getTimestamp } = require('./utils');
const stats = require('./eval-stats');
const graders = require('./eval-graders');
const {
  BENCHMARKS_DIR,
  loadResults,
  listScenarios,
  parseScenario,
  inferClaimType,
  compactDate,
} = require('./eval');

/**
 * Compute benchmark-level execution metrics from trial results.
 * @param {TrialResult[]} results - Trial results
 * @returns {{duration_ms: Object, input_tokens: Object, output_tokens: Object}}
 */
function metricsFromResults(results) {
  const summarize = (key) => {
    const values = results.map((r) => r[key]).filter((v) => typeof v === 'number');
    if (values.length === 0) return { count: 0, avg: null, min: null, max: null, total: null };
    const total = values.reduce((sum, v) => sum + v, 0);
    return {
      count: values.length,
      avg: stats.round2(total / values.length),
      min: Math.min(...values),
      max: Math.max(...values),
      total,
    };
  };

  return {
    duration_ms: summarize('duration_ms'),
    input_tokens: summarize('input_tokens'),
    output_tokens: summarize('output_tokens'),
  };
}

function metricCoverage(rows, key) {
  if (rows.length === 0) return null;
  const present = rows.filter((r) => typeof r[key] === 'number').length;
  return stats.round2(present / rows.length);
}

function assertionSummary(result) {
  const assertions = Array.isArray(result.assertions)
    ? result.assertions
    : Array.isArray(result.assertionScores)
      ? result.assertionScores
      : [];
  const passed = assertions.filter((a) => {
    if (typeof a === 'number') return a >= 1;
    if (typeof a === 'boolean') return a === true;
    return a && a.passed === true;
  }).length;
  return { assertion_count: assertions.length, assertion_passed_count: passed };
}

function totalTokensForResult(result) {
  if (typeof result.input_tokens !== 'number' || typeof result.output_tokens !== 'number')
    return null;
  return result.input_tokens + result.output_tokens;
}

function resultMetricValue(result, key) {
  if (key === 'total_tokens') return totalTokensForResult(result);
  return typeof result[key] === 'number' ? result[key] : null;
}

function averageResultMetric(results, key) {
  const values = results.map((r) => resultMetricValue(r, key)).filter((v) => typeof v === 'number');
  if (values.length === 0) return null;
  return stats.round2(values.reduce((sum, v) => sum + v, 0) / values.length);
}

function deltaVsBaseline(value, baselineAvg) {
  if (typeof value !== 'number' || typeof baselineAvg !== 'number') return null;
  return stats.round2(value - baselineAvg);
}

function benchmarkResultFilter(options = {}) {
  const filter = {};
  if (options.since) filter.since = options.since;
  if (options.model) filter.model = options.model;
  return filter;
}

function rawRowsForScenario(scenario, projectRoot, options = {}) {
  const isAb = scenario.scope === 'skill' || scenario.scope === 'workflow';
  const filterOpts = { version: scenario.version, ...benchmarkResultFilter(options) };
  const conditions = isAb
    ? [
        { evalName: `${scenario.name}-baseline`, condition: 'baseline' },
        { evalName: `${scenario.name}-treatment`, condition: 'treatment' },
        { evalName: scenario.name, condition: 'results' },
      ]
    : [{ evalName: scenario.name, condition: 'results' }];
  const conditionResults = conditions.map(({ evalName, condition }) => ({
    condition,
    results: loadResults(evalName, projectRoot, filterOpts),
  }));
  const baselineResults = conditionResults.find((c) => c.condition === 'baseline')?.results || [];
  const baseline = {
    score: averageResultMetric(baselineResults, 'score'),
    duration_ms: averageResultMetric(baselineResults, 'duration_ms'),
    input_tokens: averageResultMetric(baselineResults, 'input_tokens'),
    output_tokens: averageResultMetric(baselineResults, 'output_tokens'),
    total_tokens: averageResultMetric(baselineResults, 'total_tokens'),
  };
  const rows = [];

  for (const { condition, results } of conditionResults) {
    for (const result of results) {
      const { assertion_count, assertion_passed_count } = assertionSummary(result);
      const durationMs = resultMetricValue(result, 'duration_ms');
      const inputTokens = resultMetricValue(result, 'input_tokens');
      const outputTokens = resultMetricValue(result, 'output_tokens');
      const totalTokens = resultMetricValue(result, 'total_tokens');
      rows.push({
        scenario: scenario.name,
        condition,
        scope: scenario.scope,
        claim_type: inferClaimType(scenario),
        grader: result.grader || scenario.grader,
        version: result.version || scenario.version || '1',
        run_id: result.runId || compactDate(result.timestamp),
        timestamp: result.timestamp,
        trial: result.trial,
        k: result.k,
        model: result.model || null,
        passed: result.passed,
        score: result.score,
        duration_ms: durationMs,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        cost_proxy_tokens: totalTokens,
        baseline_score_avg: baseline.score,
        baseline_duration_ms_avg: baseline.duration_ms,
        baseline_input_tokens_avg: baseline.input_tokens,
        baseline_output_tokens_avg: baseline.output_tokens,
        baseline_total_tokens_avg: baseline.total_tokens,
        score_delta_vs_baseline_avg: deltaVsBaseline(
          resultMetricValue(result, 'score'),
          baseline.score,
        ),
        duration_ms_delta_vs_baseline_avg: deltaVsBaseline(durationMs, baseline.duration_ms),
        input_tokens_delta_vs_baseline_avg: deltaVsBaseline(inputTokens, baseline.input_tokens),
        output_tokens_delta_vs_baseline_avg: deltaVsBaseline(outputTokens, baseline.output_tokens),
        total_tokens_delta_vs_baseline_avg: deltaVsBaseline(totalTokens, baseline.total_tokens),
        infra_error: result.infraError || null,
        grade_error: result.gradeError || null,
        transcript_path: result.transcript_path || result.transcriptPath || null,
        artifact_summary: result.artifactSummary || null,
        action_count: Array.isArray(result.actions) ? result.actions.length : null,
        assertion_count,
        assertion_passed_count,
      });
    }
  }

  return rows;
}

/**
 * Generate per-trial raw benchmark rows for dashboards.
 * Omits assistant output/transcript bodies; use transcript_path for drilldown.
 * @param {string} projectRoot - Project root directory
 * @param {string} [generated] - Timestamp to use for deterministic paired snapshots
 * @returns {Object} Dashboard-oriented raw benchmark data
 */
function generateRawBenchmarkData(projectRoot, generated = getTimestamp(), options = {}) {
  const resultFilter = benchmarkResultFilter(options);
  const rows = [];
  for (const file of listScenarios(projectRoot)) {
    const scenario = parseScenario(file);
    rows.push(...rawRowsForScenario(scenario, projectRoot, resultFilter));
  }

  rows.sort((a, b) => {
    const scenarioCmp = a.scenario.localeCompare(b.scenario);
    if (scenarioCmp) return scenarioCmp;
    const runCmp = String(a.run_id || '').localeCompare(String(b.run_id || ''));
    if (runCmp) return runCmp;
    const conditionCmp = a.condition.localeCompare(b.condition);
    if (conditionCmp) return conditionCmp;
    return (a.trial || 0) - (b.trial || 0);
  });

  return {
    schema_version: 1,
    generated,
    row_semantics:
      'one row per scenario condition trial; transcript/output bodies are intentionally omitted',
    ...(Object.keys(resultFilter).length > 0 ? { result_filter: resultFilter } : {}),
    data_quality: {
      total_rows: rows.length,
      metric_coverage: {
        duration_ms: metricCoverage(rows, 'duration_ms'),
        input_tokens: metricCoverage(rows, 'input_tokens'),
        output_tokens: metricCoverage(rows, 'output_tokens'),
        total_tokens: metricCoverage(rows, 'total_tokens'),
      },
    },
    rows,
  };
}

function writeRawBenchmarkData(projectRoot, rawData) {
  const rawPath = path.join(projectRoot, BENCHMARKS_DIR, 'raw');
  ensureDir(rawPath);
  const json = `${JSON.stringify(rawData, null, 2)}\n`;
  fs.writeFileSync(path.join(rawPath, 'latest.json'), json);
  const dateStr = rawData.generated.split('T')[0];
  fs.writeFileSync(path.join(rawPath, `${dateStr}.json`), json);
}

/**
 * Compute A/B comparison fields for benchmark snapshots when both conditions exist.
 * @param {EvalScenario} scenario - Parsed scenario
 * @param {string} projectRoot - Project root directory
 * @param {Object} filterOpts - loadResults filters
 * @returns {Object|null}
 */
function comparisonFromAbResults(scenario, projectRoot, filterOpts) {
  const baseline = loadResults(`${scenario.name}-baseline`, projectRoot, filterOpts);
  const treatment = loadResults(`${scenario.name}-treatment`, projectRoot, filterOpts);
  if (baseline.length === 0 || treatment.length === 0) return null;

  const bStats = stats.statsFromResults(baseline);
  const tStats = stats.statsFromResults(treatment);
  const delta = stats.computeDelta(baseline, treatment);
  const deltaCi = stats.ciForDelta(baseline, treatment);
  const verdict = stats.verdictFromAbPolicy(baseline, treatment, scenario.verdictPolicy);
  const metricDeltas = stats.computeMetricDeltas(baseline, treatment);
  const roundMetric = (value) => (typeof value === 'number' ? stats.round2(value) : null);
  return {
    baseline: bStats,
    treatment: tStats,
    delta: stats.round2(delta),
    delta_ci: deltaCi,
    verdict,
    ...(scenario.verdictPolicy ? { verdict_policy: scenario.verdictPolicy } : {}),
    metrics: {
      duration_ms: {
        baseline_avg: roundMetric(metricDeltas.baselineMeans.duration_ms),
        treatment_avg: roundMetric(metricDeltas.treatmentMeans.duration_ms),
        delta: roundMetric(metricDeltas.durationDelta),
        regression: metricDeltas.durationRegression,
      },
      input_tokens: {
        baseline_avg: roundMetric(metricDeltas.baselineMeans.input_tokens),
        treatment_avg: roundMetric(metricDeltas.treatmentMeans.input_tokens),
        delta: roundMetric(metricDeltas.inputTokensDelta),
        regression: metricDeltas.inputTokensRegression,
      },
      output_tokens: {
        baseline_avg: roundMetric(metricDeltas.baselineMeans.output_tokens),
        treatment_avg: roundMetric(metricDeltas.treatmentMeans.output_tokens),
        delta: roundMetric(metricDeltas.outputTokensDelta),
        regression: metricDeltas.outputTokensRegression,
      },
    },
  };
}

/**
 * Generate a benchmark summary from results
 * @param {string} projectRoot - Project root directory
 * @param {Object} [options] - Result filters for benchmark generation
 * @param {string} [options.since] - Only include result rows at or after this ISO timestamp
 * @param {string} [options.model] - Only include result rows for this model
 * @returns {Object} Benchmark data
 */
function generateBenchmark(projectRoot, options = {}) {
  const scenarioFiles = listScenarios(projectRoot);
  const benchmarks = {};
  const resultFilter = benchmarkResultFilter(options);

  for (const file of scenarioFiles) {
    const scenario = parseScenario(file);
    // For A/B scopes (skill/workflow), prefer treatment results from A/B runs.
    // Fall back to plain name for single-condition runs (eval run, not eval ab).
    const isAb = scenario.scope === 'skill' || scenario.scope === 'workflow';
    const filterOpts = { version: scenario.version, ...resultFilter };
    let results = isAb ? loadResults(`${scenario.name}-treatment`, projectRoot, filterOpts) : [];
    if (results.length === 0) {
      results = loadResults(scenario.name, projectRoot, filterOpts);
    }

    if (results.length === 0) continue;

    const s = stats.statsFromResults(results);
    const warning = stats.confidenceWarning(results);

    // Group by model for per-model breakdown
    const modelGroups = {};
    for (const r of results) {
      if (!r.model) continue;
      if (!modelGroups[r.model]) modelGroups[r.model] = [];
      modelGroups[r.model].push(r);
    }
    const byModel = {};
    for (const [m, modelResults] of Object.entries(modelGroups)) {
      const ms = stats.statsFromResults(modelResults);
      byModel[m] = {
        trials: ms.count,
        pass_rate: ms.passRate,
        avg_score: ms.avg,
        last_run: modelResults[modelResults.length - 1].timestamp,
      };
    }

    const claimType = inferClaimType(scenario);
    const metrics = metricsFromResults(results);
    const comparison = isAb ? comparisonFromAbResults(scenario, projectRoot, filterOpts) : null;
    benchmarks[scenario.name] = {
      scope: scenario.scope,
      claim_type: claimType,
      grader: scenario.grader,
      trials: s.count,
      pass_rate: s.passRate,
      avg_score: s.avg,
      stddev: s.stddev,
      ci95: s.ci95,
      pass_at_k: stats.passAtK(results),
      pass_all_k: stats.passAllK(results),
      last_run: results[results.length - 1].timestamp,
      metrics,
      ...(comparison ? { compared: comparison } : {}),
      ...(warning ? { warning } : {}),
      ...(Object.keys(byModel).length > 0 ? { by_model: byModel } : {}),
    };
  }

  const benchmark = {
    generated: getTimestamp(),
    ...(Object.keys(resultFilter).length > 0 ? { result_filter: resultFilter } : {}),
    by_claim_type: Object.entries(benchmarks).reduce((acc, [_name, data]) => {
      const type = data.claim_type || 'infra';
      acc[type] = acc[type] || { scenarios: 0, trials: 0 };
      acc[type].scenarios += 1;
      acc[type].trials += data.trials || 0;
      return acc;
    }, {}),
    evals: benchmarks,
  };

  const rawData = generateRawBenchmarkData(projectRoot, benchmark.generated, resultFilter);
  writeRawBenchmarkData(projectRoot, rawData);

  const benchmarkPath = path.join(projectRoot, BENCHMARKS_DIR);
  ensureDir(benchmarkPath);
  const json = `${JSON.stringify(benchmark, null, 2)}\n`;
  fs.writeFileSync(path.join(benchmarkPath, 'latest.json'), json);

  // Write timestamped snapshot for history (same-day runs overwrite)
  const dateStr = benchmark.generated.split('T')[0];
  fs.writeFileSync(path.join(benchmarkPath, `${dateStr}.json`), json);

  return benchmark;
}

/**
 * Compare baseline vs treatment results, routing by grader type.
 * Code-graded scenarios get fast programmatic delta.
 * Model/human-graded scenarios also get eval-analyzer agent analysis.
 * @param {EvalScenario} scenario - Eval scenario
 * @param {TrialResult[]} baseline - Baseline results
 * @param {TrialResult[]} treatment - Treatment results
 * @param {string} projectRoot - Project root directory
 * @returns {{ delta: number, verdict: string, baseline: Object, treatment: Object, modelAnalysis?: Object }}
 */
function compareResults(scenario, baseline, treatment, projectRoot) {
  const bStats = stats.statsFromResults(baseline);
  const tStats = stats.statsFromResults(treatment);
  const delta = stats.computeDelta(baseline, treatment);
  const deltaCi = stats.ciForDelta(baseline, treatment);
  const baselineWarning = stats.baselineVarianceWarning(baseline, {
    avg: bStats.avg,
    stddev: bStats.stddev,
  });
  const result = {
    delta,
    deltaCi,
    verdict: stats.verdictFromAbPolicy(baseline, treatment, scenario.verdictPolicy),
    baseline: bStats,
    treatment: tStats,
    ...(scenario.verdictPolicy ? { verdictPolicy: scenario.verdictPolicy } : {}),
    ...(baselineWarning ? { baselineWarning } : {}),
  };

  if (scenario.grader !== 'code') {
    const metrics = {
      baseline: bStats,
      treatment: tStats,
      delta,
      deltaCi,
      verdict: result.verdict,
      ...(baselineWarning ? { baselineWarning } : {}),
    };
    const modelAnalysis = graders.compareWithModel(
      scenario,
      baseline,
      treatment,
      projectRoot,
      metrics,
    );
    if (modelAnalysis) result.modelAnalysis = modelAnalysis;
  }

  return result;
}

module.exports = {
  metricsFromResults,
  metricCoverage,
  assertionSummary,
  totalTokensForResult,
  resultMetricValue,
  averageResultMetric,
  deltaVsBaseline,
  benchmarkResultFilter,
  rawRowsForScenario,
  generateRawBenchmarkData,
  writeRawBenchmarkData,
  comparisonFromAbResults,
  generateBenchmark,
  compareResults,
};
