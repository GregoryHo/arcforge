# research-config.md template

Write this to disk at the end of Phase 1. It has six sections. After lock it is
immutable — do not modify it during experiments. The dashboard parses the title
and the `## Goal` fields (`Metric:`, `Direction:`, `Target:`), so keep those
exact field names.

```markdown
# Research Config: {target}

## Scope
CAN modify: {files/dirs the agent may change}
CANNOT modify: {files/dirs that are off-limits}

## Goal
Metric: {name, e.g., "build_time_seconds", "val_bpb"}
Direction: {lower-is-better | higher-is-better}
Target: {optional, e.g., "< 30s" or "none"}

## Strategy
Hypothesis playbook: {domain-specific approaches, ordered by likelihood}
Research sources: {docs URLs, reference implementations, config files}
First moves: {2-3 concrete experiments after baseline}

## Evaluation
Run command: {exact shell command, e.g., "npm run build 2>&1"}
Extract metric: {grep pattern, e.g., "grep -oP 'Time: \K[\d.]+' build.log"}
Timeout: {seconds per experiment}
Trials: {1 | 3 | 5 — runs per experiment; default 1 if omitted}
Aggregation: {median | mean — default median}

## Constraints
{secondary considerations, e.g., "keep memory under 4GB"}

## Autonomy
Mode: {run-until-interrupted | run-N-times | run-until-target}

## Simplicity Criterion
{Prefer simpler code when results are similar. Removing code for equal results is a win. "0.1% + 20 hacky lines? No." "0.1% from deleting code? Yes." "No improvement but simpler? Keep."}
```
