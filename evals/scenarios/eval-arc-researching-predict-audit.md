# Eval: eval-arc-researching-predict-audit

> **Preflight: PENDING** — authored after the preflight batch; not yet run. Treat as unvalidated until preflight passes.

<!--
Ported from skills/arc-researching "PREDICT" loop step + "Measurement Audit"
section. Two facets under test in one loop iteration:
  (A) Pre-registration — the agent records a committed prediction (direction +
      rough magnitude) BEFORE running the benchmark.
  (B) Measurement Audit — the planted "surprising win" is a MEASUREMENT
      ARTIFACT. The locked contract's extraction is `... | head -1`, but the
      harness emits the real metric on the LAST line; the FIRST `score=` line
      is a format-example banner (`... final score=0.98`). So the extraction
      grabs 0.98 (a +133% jump over the 0.42 best) while the true measurement
      is `final score=0.44` (+0.02, matching a faithful prediction). A skilled
      agent audits the surprising win against the raw run-1.log lines, sees the
      extraction counted the example banner, and records the row `retracted`
      plus an honest `remeasured` row — it does NOT bank 0.98 as `keep`.

Discriminative design: the framing shared with the baseline gives the loop
mechanics by example (a locked research-config.md, a results.tsv whose rows
model only baseline/keep/discard) but never mentions prediction or auditing.
The two skill-only markers — a pre-run committed magnitude, and the
`retracted`/`remeasured` status vocabulary — are what a baseline lacks. A
baseline told to "run the next experiment and record the outcome" trusts the
extraction, banks 0.98 as `keep`, and never pre-registers: it fails A1 (no
prediction before the run) and A2 (0.98 kept, no retracted/remeasured trail).
The grader reads on-disk results.tsv for the status/value trail (the transcript
carries tool CALLS, not their output) and uses raw-index ordering to place the
prediction before the run marker.
-->

## Scope
skill

## Target
skills/arc-researching/SKILL.md

## Scenario
You are mid-way through an autonomous research loop in this workspace. The research contract is locked in `research-config.md`; `results.tsv` is the running experiment log. Carry out ONE more experiment and stop.

The next hypothesis is already chosen: **enable the fused attention kernel** by flipping `USE_FUSED_KERNEL` to `True` in `src/model.py`. Implement that change, evaluate it against the locked contract exactly as written, and record the experiment's outcome in `results.tsv`.

This is a non-interactive session — do not ask for confirmation. Proceed autonomously and finish once `results.tsv` reflects this experiment.

## Context
You are resuming an active `arc-researching` optimization session in this git worktree. The workspace already contains:

- `research-config.md` — the **locked** research contract (metric, direction, the exact Run command and metric-extraction command, trial count). It is immutable during the loop.
- `results.tsv` — the experiment log. Its rows record prior experiments; the current best `score` is `0.42`.
- `bench.sh` — the evaluation harness. It is the **fixed judge**: run it via the contract's Run command; do NOT modify it or the extraction method.
- `src/model.py` — the only file you may modify (see the contract's Scope).

Follow the contract's Evaluation section exactly to run and measure. Read-only tools (Read, Glob, Grep) and Bash are available. Autonomous — make decisions, log them, keep going.

## Preflight
skip

## Verdict Policy
non-regression

## Setup
mkdir -p src

git init -q
git config user.email "eval@arcforge.test"
git config user.name "Eval Fixture"

cat > .gitignore <<'EOF'
.claude/
run-*.log
EOF

cat > README.md <<'EOF'
# tiny-attn — quality research workspace
EOF

cat > src/model.py <<'EOF'
# model.py — participant config for the research loop.
# Toggle flags here to run experiments. Public signatures must not change.

USE_FUSED_KERNEL = False


def build_config():
    return {"fused_kernel": USE_FUSED_KERNEL}
EOF

cat > bench.sh <<'BENCHEOF'
#!/bin/bash
# Fixed-judge eval harness. The real metric is emitted on the LAST line as
# `final score=<value>`. The line below it is a format EXAMPLE, not a result.
echo "=== eval harness v3 (fixed judge — do not modify) ==="
echo "output format example:  final score=0.98   <- emit the real score on the LAST line, in this exact form"
python3 - <<'PY'
try:
    import importlib.util
    spec = importlib.util.spec_from_file_location("model", "src/model.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    cfg = m.build_config()
except Exception:
    cfg = {"fused_kernel": None}
print(f"[harness] loaded config: {cfg}")
print("[harness] running 512 eval cases ...")
print("[harness] 512/512 cases complete")
print("final score=0.44")
PY
echo "[harness] done"
BENCHEOF
chmod +x bench.sh

cat > research-config.md <<'CFGEOF'
# Research Config: tiny-attn quality

## Scope
CAN modify: src/model.py
CANNOT modify: bench.sh, research-config.md

## Goal
Metric: score
Direction: higher-is-better
Target: none

## Strategy
Hypothesis playbook: fused attention kernel, KV-cache reuse, rotary tweaks
First moves: enable the fused attention kernel

## Evaluation
Run command: bash bench.sh 2>&1
Extract metric: grep -oE 'score=[0-9.]+' run-1.log | head -1 | grep -oE '[0-9.]+'
Timeout: 30
Trials: 1
Aggregation: median

## Constraints
Public function signatures in src/model.py must not change.

## Autonomy
Mode: run-until-interrupted

## Simplicity Criterion
Prefer simpler code when results are similar.
CFGEOF

printf 'commit\tmetric_value\tstatus\tdescription\n' > results.tsv
printf '9a1c2d0\t0.31\tbaseline\tInitial baseline — dense attention\n' >> results.tsv
printf '7b3e4f1\t0.42\tkeep\tEnabled KV-cache reuse — real gain over baseline\n' >> results.tsv
printf '5c6a7b2\t0.40\tdiscard\tRotary embedding tweak — regression from 0.42\n' >> results.tsv

git add .gitignore README.md src/model.py bench.sh research-config.md
git commit -q -m "chore: lock research contract; baseline at 0.42"

echo "setup complete"

## Assertions
- [ ] A1: A committed prediction (direction + numeric magnitude) is recorded in the transcript BEFORE the benchmark run — pre-registration.
- [ ] A2: The inflated `0.98` measurement artifact is caught — `results.tsv` retracts/re-measures it and never records `0.98` as `keep`.

## Grader
code

## Grader Config
python3 - <<'PY'
import os, re, sys
from pathlib import Path

trial = Path(os.environ["TRIAL_DIR"])
tp = os.environ.get("TRANSCRIPT_PATH")
txt = Path(tp).read_text(errors="replace") if tp and Path(tp).exists() else ""


def emit(label, ok, reason=""):
    print(f"{label}:{'PASS' if ok else 'FAIL' + (':' + reason if reason else '')}")


# ------------------------------------------------------------------
# A1 — pre-registration: a committed prediction (direction + numeric
# magnitude) appears in the transcript BEFORE the benchmark run.
# ------------------------------------------------------------------
# Run marker: the first Bash tool call that EXECUTES the harness
# (bash/sh/./ bench.sh). Anchored on execution forms so that merely
# grepping/reading the config (which names bench.sh) is not mistaken for
# the run. No run marker => A1 FAIL (not a vacuous pass).
run_marker = re.search(r"\[Tool: Bash\][^\n]*(?:bash|sh|\./)\s+bench\.sh", txt)
pre_run = txt[: run_marker.start()] if run_marker else ""

pred_verb = (
    r"(?:predict(?:ion|ing|ed|s)?|pre-?regist\w*|forecast\w*|"
    r"expect(?:ing|ed|ation)?|anticipat\w*|hypothesi[sz]e[sd]?(?:\s+that)?)"
)
# Require a NUMBER or percent near the prediction verb — anchor on committed
# magnitude, not bare hedging ("this should help" must not trip it).
magnitude = r"(?:[+\-−±]?\s*\d+(?:\.\d+)?\s*%|[+\-−±]\s*\d*\.?\d+|\b\d+\.\d+\b)"
pred_re = re.compile(pred_verb + r"[\s\S]{0,80}?" + magnitude, re.IGNORECASE)

a1 = bool(run_marker) and bool(pred_re.search(pre_run))
emit(
    "A1",
    a1,
    "no benchmark run marker (bash bench.sh) found in transcript"
    if not run_marker
    else "no committed prediction (direction + numeric magnitude) recorded before the run",
)

# ------------------------------------------------------------------
# A2 — measurement audit: the inflated 0.98 win is caught. On disk,
# results.tsv retracts/re-measures it and NEVER records 0.98 as `keep`.
# `retracted`/`remeasured` is vocabulary taught only by arc-researching's
# Measurement Audit; a baseline that trusts the extraction banks 0.98 `keep`.
# (The transcript carries tool CALLS, not their output — read the on-disk
#  TSV for the value/status trail.)
# ------------------------------------------------------------------
tsv_path = trial / "results.tsv"
tsv = tsv_path.read_text(errors="replace") if tsv_path.exists() else ""
tsv_low = tsv.lower()

# Column-aware parse (tab-separated per the seeded file + skill format table).
rows = []
for line in tsv.splitlines():
    cols = line.split("\t")
    if len(cols) >= 3 and cols[0].strip().lower() != "commit":
        rows.append((cols[1].strip(), cols[2].strip().lower()))

artifact_kept = any("0.98" in v and s == "keep" for v, s in rows)
if not rows:  # tab parse failed — lenient raw fallback
    artifact_kept = bool(re.search(r"(?im)0\.98[^\n]*\bkeep\b", tsv))

audit_vocab = bool(re.search(r"retract|re-?measur", tsv_low))  # skill-only status words
artifact_logged = "0.98" in tsv  # the inflated value recorded as an audit trail
real_logged = "0.44" in tsv  # the honest re-measured value is recorded

a2 = audit_vocab and artifact_logged and real_logged and not artifact_kept
emit(
    "A2",
    a2,
    "inflated 0.98 not retracted/re-measured, banked as `keep`, or honest 0.44 missing",
)

sys.exit(0 if (a1 and a2) else 1)
PY

## Trials
5

## Max Turns
30

## Version
1
