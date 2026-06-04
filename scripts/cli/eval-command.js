/**
 * eval-command.js - Handler for the `eval` CLI command.
 */

const fs = require('node:fs');
const path = require('node:path');
const { output } = require('./shared');

async function runEvalCommand(args, { projectRoot, asJson }) {
  const eval_ = require('../lib/eval');
  const benchmark_ = require('../lib/eval-benchmark');
  const { generateRunId } = require('../lib/utils');
  const subcommand = args.positional[0];
  const model = args.options.model;
  const runId = generateRunId();
  const parseK = (scenario, isAb = false) =>
    args.options.k ? parseInt(args.options.k, 10) : eval_.defaultK(scenario || {}, isAb);
  const formatStatus = (g) => {
    if (g.gradeError) {
      return `GRADE ERROR (${g.errorType || 'unknown'}${g.error ? `: ${g.error}` : ''})`;
    }
    if (g.infraError) {
      return `INFRA ERROR (${g.errorType || 'unknown'}${g.error ? `: ${g.error}` : ''})`;
    }
    const base = g.passed ? `PASS (${g.score})` : `FAIL (${g.score})`;
    if (!g.passed && g.assertionScores) {
      const tags = g.assertionScores.map((s, i) => `A${i + 1}:${s === 1 ? '✓' : '✗'}`);
      return `${base} [${tags.join(' ')}]`;
    }
    return base;
  };

  const requireScenario = (name, cmd) => {
    if (!name) {
      console.error(`Error: eval ${cmd} requires a scenario name`);
      process.exit(1);
    }
    const scenario = eval_.findScenario(name, projectRoot);
    if (!scenario) {
      console.error(`Error: scenario "${name}" not found`);
      process.exit(1);
    }
    return scenario;
  };

  const printAbSummary = (label, opts) => {
    const { baseline, treatment, delta, deltaCi, verdict, verdictPolicy } = opts;
    const bStats = opts.bStats ?? eval_.statsFromResults(baseline);
    const tStats = opts.tStats ?? eval_.statsFromResults(treatment);
    const showCI = bStats.count >= 5 && tStats.count >= 5;
    const fmtStats = (s) => {
      const base = `${s.count} trials, avg ${s.avg.toFixed(2)}`;
      const ci = showCI ? ` [${s.ci95.lower}, ${s.ci95.upper}]` : '';
      return `${base}${ci}, pass ${(s.passRate * 100).toFixed(0)}%`;
    };
    console.log(`${label}Baseline:  ${fmtStats(bStats)}`);
    console.log(`${label}Treatment: ${fmtStats(tStats)}`);
    const ciStr = deltaCi && showCI ? ` CI[${deltaCi.lower}, ${deltaCi.upper}]` : '';
    console.log(`${label}Delta:     ${delta > 0 ? '+' : ''}${delta.toFixed(2)}${ciStr}`);
    if (verdictPolicy) console.log(`${label}Policy:    ${verdictPolicy}`);
    console.log(`${label}Verdict:   ${verdict}`);
    const remediation = eval_.verdictMessage(verdict);
    if (remediation) console.log(`${label}Remediation: ${remediation}`);
    const warning = eval_.confidenceWarning(baseline) || eval_.confidenceWarning(treatment);
    if (warning) console.log(`${label}${warning}`);

    // Token and duration deltas (fr-gr-002)
    const metricDeltas = eval_.computeMetricDeltas(baseline, treatment);
    const fmtMetricDelta = (name, delta, bMean, tMean, regression) => {
      if (delta === null) return null;
      const sign = delta > 0 ? '+' : '';
      const bStr = bMean !== null ? bMean.toFixed(0) : 'n/a';
      const tStr = tMean !== null ? tMean.toFixed(0) : 'n/a';
      const flag = regression ? ' [!] COST REGRESSION' : '';
      return `${label}${name}: ${sign}${delta.toFixed(0)} (baseline: ${bStr}, treatment: ${tStr})${flag}`;
    };
    const durationLine = fmtMetricDelta(
      'Duration (ms)',
      metricDeltas.durationDelta,
      metricDeltas.baselineMeans.duration_ms,
      metricDeltas.treatmentMeans.duration_ms,
      metricDeltas.durationRegression,
    );
    const inputLine = fmtMetricDelta(
      'Input tokens',
      metricDeltas.inputTokensDelta,
      metricDeltas.baselineMeans.input_tokens,
      metricDeltas.treatmentMeans.input_tokens,
      metricDeltas.inputTokensRegression,
    );
    const outputLine = fmtMetricDelta(
      'Output tokens',
      metricDeltas.outputTokensDelta,
      metricDeltas.baselineMeans.output_tokens,
      metricDeltas.treatmentMeans.output_tokens,
      metricDeltas.outputTokensRegression,
    );
    if (durationLine) console.log(durationLine);
    if (inputLine) console.log(inputLine);
    if (outputLine) console.log(outputLine);
  };

  if (subcommand === 'list') {
    const scenarios = eval_.listScenarios(projectRoot);
    if (scenarios.length === 0) {
      console.log('No scenarios found in evals/scenarios/');
    } else {
      for (const file of scenarios) {
        const s = eval_.parseScenario(file);
        const isAb = s.scope === 'skill' || s.scope === 'workflow';
        const resultsName = isAb ? `${s.name}-treatment` : s.name;
        let results = eval_.loadResults(resultsName, projectRoot, { version: s.version });
        if (results.length === 0 && isAb) {
          results = eval_.loadResults(s.name, projectRoot, { version: s.version });
        }
        const verdict = results.length > 0 ? eval_.getVerdict(results) : 'NO RUNS';
        const claimType = eval_.inferClaimType(s);
        console.log(`  ${s.name} (${s.scope}, ${s.grader}, ${claimType}) — ${verdict}`);
      }
    }
  } else if (subcommand === 'run') {
    const scenario = requireScenario(args.positional[1], 'run');
    const k = parseK(scenario, false);
    const isolated = !args.flags['no-isolate'];
    const pluginDir = args.options['plugin-dir'];
    const maxTurns = args.options['max-turns']
      ? parseInt(args.options['max-turns'], 10)
      : undefined;
    const modelLabel = model ? ` [model: ${model}]` : '';
    console.log(`Running ${scenario.name} (k=${k})${modelLabel}...`);

    let rl;
    try {
      if (scenario.grader === 'human') {
        const readline = require('node:readline');
        rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      }

      for (let t = 1; t <= k; t++) {
        process.stdout.write(`  Trial ${t}/${k}: `);
        const result = eval_.runTrial(scenario, t, k, {
          projectRoot,
          model,
          runId,
          isolated,
          pluginDir,
          maxTurns,
        });
        let graded = eval_.gradeTrialResult(result, scenario, projectRoot, result.actions);

        if (graded.grader === 'human-pending') {
          console.log('HUMAN REVIEW');
          console.log('\n--- Trial Output ---');
          const outputText = result.output || result.error || '(no output)';
          console.log(outputText.split('\n').slice(0, 200).join('\n'));
          console.log('--- End Output ---\n');
          graded = await eval_.gradeWithHuman(graded, rl);
        }

        const versioned = scenario.version ? { ...graded, version: scenario.version } : graded;
        eval_.appendResult(versioned, projectRoot);
        console.log(formatStatus(graded));
      }
    } finally {
      if (rl) rl.close();
    }

    const results = eval_
      .loadResults(scenario.name, projectRoot, {
        version: scenario.version,
        since: args.options.since,
      })
      .slice(-k);
    const verdictOpts = scenario.grader === 'model' ? { useCi: true } : {};
    console.log(`Verdict: ${eval_.getVerdict(results, verdictOpts)}`);
  } else if (subcommand === 'preflight') {
    const scenarioName = args.positional[1];
    if (!scenarioName) {
      console.error('Error: eval preflight requires a scenario name');
      process.exit(1);
    }
    const { runPreflight } = require('../lib/eval-preflight');
    const model = args.options.model;

    // Resolve scenario for trial execution
    const scenario = eval_.findScenario(scenarioName, projectRoot);
    if (!scenario) {
      console.error(`Error: scenario "${scenarioName}" not found`);
      process.exit(1);
    }

    console.log(`Running preflight for "${scenarioName}"...`);
    const runId = generateRunId();

    const stubRunTrial = (t, totalK) =>
      eval_.runTrial(scenario, t, totalK, {
        projectRoot,
        model,
        runId,
        isolated: true,
      });
    const stubGrade = (result, _t) => {
      try {
        return eval_.gradeTrialResult(result, scenario, projectRoot, result.actions);
      } finally {
        eval_.cleanupTrialDir(result.trialDir);
      }
    };

    const outcome = runPreflight(scenarioName, projectRoot, {
      runTrial: stubRunTrial,
      gradeResult: stubGrade,
      model,
    });

    console.log(`Verdict: ${outcome.verdict}`);
    console.log(`Reason:  ${outcome.reason}`);
    console.log(`Hash:    ${outcome.scenario_hash}`);
    if (outcome.verdict === 'BLOCK') {
      process.exit(1);
    }
  } else if (subcommand === 'lint') {
    const scenarioName = args.positional[1];
    if (!scenarioName) {
      console.error('Error: eval lint requires a scenario name');
      process.exit(1);
    }
    const { lintScenario, formatDiagnostics } = require('../lib/eval-lint');
    const { resolveScenarioFile } = require('../lib/eval-preflight');

    // Resolve by parsed `# Eval:` name (matching arc eval run/ab/preflight),
    // not by literal filename — otherwise renamed scenarios that still pass
    // `arc eval run` would falsely fail `arc eval lint` with "file not found".
    const scenarioFile = resolveScenarioFile(scenarioName, projectRoot);
    if (!scenarioFile) {
      console.error(`Error: scenario "${scenarioName}" not found in evals/scenarios/`);
      process.exit(1);
    }

    const diagnostics = lintScenario(scenarioFile);
    if (diagnostics.length === 0) {
      console.log(`${scenarioName}: ok`);
    } else {
      for (const line of formatDiagnostics(diagnostics)) {
        console.error(line);
      }
      process.exit(1);
    }
  } else if (subcommand === 'audit') {
    const { runAudit } = require('../lib/eval-audit');
    const topN = args.options.top ? parseInt(args.options.top, 10) : 10;

    const result = runAudit(projectRoot);
    console.log(`Eval Audit — ${result.trialCount} graded trials\n`);

    if (result.promotionCandidates.length === 0 && result.retirementCandidates.length === 0) {
      console.log('No candidates found. Run more evals with model grading to accumulate data.');
    } else {
      const promo = result.promotionCandidates.slice(0, topN);
      if (promo.length > 0) {
        console.log('## Promotion Candidates (frequent + failing claims)');
        for (const c of promo) {
          console.log(
            `  [${c.hash}] freq=${c.frequency} fail_rate=${(c.failure_rate * 100).toFixed(0)}% score=${c.score.toFixed(1)}`,
          );
          console.log(`    "${c.text}"`);
          console.log(`    scenarios: ${c.scenarios.join(', ')}`);
        }
        console.log('');
      }

      const retire = result.retirementCandidates.slice(0, topN);
      if (retire.length > 0) {
        console.log('## Retirement Candidates (repeatedly weak assertions)');
        for (const c of retire) {
          console.log(
            `  ${c.assertion_id} [${c.hash}] freq=${c.frequency} across ${c.scenario_count} scenario(s)`,
          );
          console.log(`    scenarios: ${c.scenarios.join(', ')}`);
        }
      }
    }
  } else if (subcommand === 'ab') {
    const scenario = requireScenario(args.positional[1], 'ab');
    const model = args.options.model;

    // Preflight gate: require a PASS preflight for this (scenario, model)
    // before running A/B eval. Gate is keyed by both — a PASS produced
    // under one model does NOT unblock A/B runs on another model.
    // Non-regression/non-interference scenarios may explicitly opt out
    // with `## Preflight\nskip`; all existing scenarios continue to gate
    // by default.
    const { checkPreflightGate, shouldSkipPreflightGate } = require('../lib/eval-preflight');
    if (shouldSkipPreflightGate(scenario)) {
      console.log(`Preflight: skipped by scenario policy (${scenario.name})`);
    } else {
      const gateError = checkPreflightGate(scenario.name, projectRoot, { model });
      if (gateError) {
        console.error(`Error: ${gateError}`);
        process.exit(1);
      }
    }

    const k = parseK(scenario, true);
    const interleave = !!args.flags.interleave;
    const pluginDir = args.options['plugin-dir'];
    const maxTurns = args.options['max-turns']
      ? parseInt(args.options['max-turns'], 10)
      : undefined;
    const onTrialComplete = (label, t, graded) => {
      console.log(`  [${label}] Trial ${t}/${k}: ${formatStatus(graded)}`);
    };

    let result;
    if (scenario.scope === 'workflow') {
      console.log(
        `A/B eval (workflow): ${scenario.name} (k=${k})${interleave ? ' [interleaved]' : ''}`,
      );
      console.log('Baseline: isolated (no plugins/MCP) | Treatment: full toolkit\n');
      result = eval_.runWorkflowEval(scenario, k, {
        projectRoot,
        interleave,
        onTrialComplete,
        model,
        runId,
        pluginDir,
        maxTurns,
      });
    } else {
      const skillFile = args.options['skill-file'] || scenario.target;
      if (!skillFile) {
        console.error(
          'Error: eval ab for skill scope requires --skill-file <path> or ## Target in scenario',
        );
        process.exit(1);
      }
      const resolvedSkillFile = path.resolve(projectRoot, skillFile);
      if (!fs.existsSync(resolvedSkillFile)) {
        console.error(`Error: skill file not found: ${skillFile}`);
        process.exit(1);
      }
      const skillInstruction = fs.readFileSync(resolvedSkillFile, 'utf8');
      console.log(
        `A/B eval (skill): ${scenario.name} (k=${k})${interleave ? ' [interleaved]' : ''}`,
      );
      console.log(`Skill: ${skillFile}\n`);
      result = eval_.runSkillEval(scenario, k, {
        projectRoot,
        skillInstruction,
        interleave,
        onTrialComplete,
        model,
        runId,
        pluginDir,
        maxTurns,
      });
    }

    printAbSummary('\n', {
      baseline: result.baseline,
      treatment: result.treatment,
      delta: result.delta,
      deltaCi: eval_.ciForDelta(result.baseline, result.treatment),
      verdict: eval_.verdictFromAbPolicy(result.baseline, result.treatment, scenario.verdictPolicy),
      verdictPolicy: scenario.verdictPolicy,
    });

    // fr-gr-005: blind-comparator auto-trigger
    const { runBlindAutoTrigger } = require('../lib/eval-blind-autotrigger');
    const skillFile = args.options['skill-file'] || scenario.target;
    const skillName = skillFile ? path.basename(skillFile, '.md') : undefined;
    const blindResult = runBlindAutoTrigger(
      scenario,
      result.baseline,
      result.treatment,
      projectRoot,
      {
        runId,
        skillName,
      },
    );
    if (!blindResult.skipped) {
      const pr = blindResult.preferenceRate;
      const total = pr.total;
      console.log('\nBlind preference signal (supplementary — not a verdict):');
      console.log(`  treatment: ${pr.treatment}/${total}`);
      console.log(`  baseline:  ${pr.baseline}/${total}`);
      console.log(`  tie:       ${pr.tie}/${total}`);
      if (pr.errors > 0) {
        console.log(
          `  errors:    ${pr.errors}/${total} (comparator failures, not folded into ties)`,
        );
      }
    } else if (blindResult.skipNote) {
      console.log(`\n${blindResult.skipNote}`);
    }
  } else if (subcommand === 'compare') {
    const name = args.positional[1];
    if (!name) {
      console.error('Error: eval compare requires a scenario name');
      process.exit(1);
    }

    const scenario = eval_.findScenario(name, projectRoot);
    const filterOpts = {
      version: scenario?.version,
      since: args.options.since,
      ...(model ? { model } : {}),
    };
    const baseline = eval_.loadResults(`${name}-baseline`, projectRoot, filterOpts);
    const treatment = eval_.loadResults(`${name}-treatment`, projectRoot, filterOpts);

    if (baseline.length === 0 || treatment.length === 0) {
      console.error('Error: need both baseline and treatment results. Run: arc eval ab <name>');
      process.exit(1);
    }

    console.log(`A/B Comparison: ${name}`);
    if (scenario && scenario.grader !== 'code') {
      console.log('(Using eval-analyzer agent for qualitative analysis...)\n');
    }
    const comparison = benchmark_.compareResults(
      scenario || { grader: 'code' },
      baseline,
      treatment,
      projectRoot,
    );
    printAbSummary('  ', {
      baseline,
      treatment,
      delta: comparison.delta,
      deltaCi: comparison.deltaCi,
      verdict: comparison.verdict,
      verdictPolicy: comparison.verdictPolicy,
      bStats: comparison.baseline,
      tStats: comparison.treatment,
    });
    if (comparison.baselineWarning) console.log(`  ${comparison.baselineWarning}`);
    if (comparison.modelAnalysis) {
      console.log(`\n  Analysis: ${comparison.modelAnalysis.analysis || ''}`);
      if (comparison.modelAnalysis.delta_explanation) {
        console.log(`  Delta Explanation: ${comparison.modelAnalysis.delta_explanation}`);
      }
      if (
        comparison.modelAnalysis.weak_assertions_patterns &&
        comparison.modelAnalysis.weak_assertions_patterns.length > 0
      ) {
        console.log(
          `  Weak Assertions: ${comparison.modelAnalysis.weak_assertions_patterns.join('; ')}`,
        );
      }
      if (
        comparison.modelAnalysis.variance_notes &&
        comparison.modelAnalysis.variance_notes.length > 0
      ) {
        console.log(`  Variance Notes: ${comparison.modelAnalysis.variance_notes.join('; ')}`);
      }
    }
  } else if (subcommand === 'report') {
    const benchmark = benchmark_.generateBenchmark(projectRoot, {
      since: args.options.since,
    });
    const name = args.positional[1];

    const pickModelData = (data) => (model && data.by_model?.[model] ? data.by_model[model] : data);

    if (name && benchmark.evals[name]) {
      const data = benchmark.evals[name];
      const display = pickModelData(data);
      if (asJson) {
        output(display === data ? data : { ...display, claim_type: data.claim_type }, true);
      } else {
        console.log(`Claim type: ${data.claim_type || 'infra'}`);
        console.log(
          'Note: SHIP in non-regression, self-improvement-smoke, or infra only supports that claim type; it is not evidence of discriminative lift.',
        );
        output(display, false);
      }
    } else if (Object.keys(benchmark.evals).length === 0) {
      console.log('No eval results yet. Run: arc eval run <scenario>');
    } else if (asJson) {
      output(benchmark, true);
    } else {
      console.log(
        'Note: SHIP outside discriminative-lift only supports that claim type; do not cite it as value lift.',
      );
      const claimOrder = [
        'discriminative-lift',
        'non-regression',
        'self-improvement-smoke',
        'infra',
      ];
      for (const claimType of claimOrder) {
        const entries = Object.entries(benchmark.evals).filter(
          ([_evalName, data]) => (data.claim_type || 'infra') === claimType,
        );
        if (entries.length === 0) continue;
        console.log(`\n${claimType}:`);
        for (const [evalName, data] of entries) {
          const displayData = pickModelData(data);
          let verdict;
          if (data.grader === 'model' && displayData.trials >= 5) {
            const scenarioFile = eval_.findScenario(evalName, projectRoot);
            const results = eval_.loadResults(evalName, projectRoot, {
              version: scenarioFile?.version,
              ...(model ? { model } : {}),
            });
            verdict =
              results.length >= 5
                ? eval_.verdictFromCI(results)
                : eval_.verdictFromRate(displayData.pass_rate);
          } else {
            verdict = eval_.verdictFromRate(displayData.pass_rate);
          }
          console.log(
            `  ${evalName}: ${(displayData.pass_rate * 100).toFixed(0)}% (${displayData.trials} trials) — ${verdict}`,
          );
          if (!model && data.by_model) {
            const parts = Object.entries(data.by_model).map(
              ([m, ms]) => `${m}: ${(ms.pass_rate * 100).toFixed(0)}% (${ms.trials})`,
            );
            console.log(`    ${parts.join(' | ')}`);
          }
        }
      }
    }
  } else if (subcommand === 'history') {
    const benchmarkPath = path.join(projectRoot, eval_.BENCHMARKS_DIR);
    if (!fs.existsSync(benchmarkPath)) {
      console.log('No benchmarks yet. Run: arc eval report');
    } else {
      const snapshots = fs
        .readdirSync(benchmarkPath)
        .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .sort();
      if (snapshots.length === 0) {
        console.log('No history snapshots yet. Run: arc eval report');
      } else {
        for (const file of snapshots) {
          const data = JSON.parse(fs.readFileSync(path.join(benchmarkPath, file), 'utf8'));
          const evalCount = Object.keys(data.evals).length;
          console.log(`  ${file.replace('.json', '')} — ${evalCount} evals`);
        }
      }
    }
  } else if (subcommand === 'dashboard') {
    const { startServer } = require('../../skills/arc-evaluating/dashboard/eval-dashboard');
    const port = args.options.port ? parseInt(args.options.port, 10) : 3333;
    startServer(projectRoot, { port });
  } else {
    console.error(
      'Usage: arc eval [list|run|preflight|lint|ab|compare|report|history|audit|dashboard]',
    );
    process.exit(1);
  }
}

module.exports = { runEvalCommand };
