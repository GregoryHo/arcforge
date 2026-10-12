# Eval: eval-diagramming-obsidian-layout-grid

## Scope
skill

## Target
skills/core/diagramming-obsidian/SKILL.md

## Context
You are in a project folder. The team's Obsidian vault is at `./vault` in this
directory, with a `Diagrams` folder inside it.

## Scenario
The user says:

> I want an Excalidraw diagram of our ingest pipeline for the team vault, but before you build anything, give me the coordinate plan to review: write it to `layout.json` at the top of this project folder — use the full absolute path, not a relative one — as a list of `{id, label, x, y, width, height}` for every shape, plus `{id, type: "separator", y}` for any zone separator. Don't build, render or save a diagram yet. The pipeline: one `router` takes requests and fans out to six worker services of equal standing — `auth`, `billing`, `search`, `notify`, `export`, `audit` — and all six write to one `event-log`. Top zone: router. Middle zone: the six workers, side by side. Bottom zone: the event log.

## Preflight
run

## Verdict Policy
delta

## Design Notes
Not sent to the agent (only `## Context` and `## Scenario` reach it) — this
section is for whoever maintains or runs the scenario. The authority for every
choice below is the design gate,
`docs/plans/v6.5/wp-d/design-gate.diagramming-layout.md` (#185).

### What is measured

#182 (`1fed56d0`) changed one reference file of the skill,
`references/layout-heuristics.md`: the planning grid's column increment went
from 200 px to 220 px. The old text contradicted itself — it puts 180 px wide
Primary elements on a 200 px grid, which leaves 20 px between them, in the same
file whose spacing table says same-level shapes keep 40 px. The question is
whether that contradiction made an agent plan a layout that breaks the 40 px
rule, and whether the edit stops it.

`SKILL.md` did not change in a way this scenario touches, so this is **not** a
skill-versus-no-skill A/B. Both arms are injected with the same `SKILL.md`; what
differs is the staged directory beside it:

| Arm | `SKILL.md` text | staged `references/layout-heuristics.md` | directory digest |
|---|---|---|---|
| baseline | current (`51fe7cc9f5373b7e`) | as of `1fed56d0~1` (`53c7f088`), the commit before #182 | `0f3c574c1e448946` |
| treatment | current (`51fe7cc9f5373b7e`) | current | `42ec93e5d9d42cec` |

The text hashes are equal, so the arms are told apart by `skillFilesHash`, and
the baseline's digest is the pool condition and part of the preflight key.

### The task shape, and why it is not the full pipeline

The task asks for a coordinate plan and nothing else. The skill's check, render
and verify steps all go through `uv run`, and `uv run` writes a `.venv` into
`references/` — inside the trial's staged copy — which makes the row
`trial_wrote_skill_files` and unscored. A task that walks the full pipeline
therefore yields no scored rows in either arm. #182 changed where shapes go at
the moment `x` and `y` are decided; nothing after that moment reads this file.
There is no Obsidian in a trial and none is needed.

The prompt says nothing about spacing, a grid, 40, 200 or 220. Six workers "side
by side" in one zone is a requirement of the layout, not a hint; no arrows run
between them. The prompt is fixed text and cannot carry the trial's real path, so
it says "at the top of this project folder" and asks for the full absolute path:
`SKILL.md` tells the agent to `cd "$BASE/references"`, and a relative
`layout.json` written after that lands in the staged copy.

### The assertion

**A1 is the only scored assertion**: the six workers sit in one row and every
adjacent pair is at least 40 px apart horizontally (`x₂ − (x₁ + width₁)`).

- 40 is the same-level minimum **both** versions of the reference state. It is
  not a number only the treatment has seen. "Column pitch equals 220" is
  deliberately not asserted: the old text never contains 220, so a baseline
  would fail that by construction rather than by behavior.
- The baseline has five ways to pass without ever seeing the new text: notice the
  contradiction and use the table's 40 px; use the Arrow Corridor's 60 px or the
  60–100 px of `painters-toolkit.md`; pick a width under 180 (160 on a 200 px
  grid is exactly 40); treat the workers as Secondary (110–140 wide); or never
  open the file. It fails one way: copy the grid at 180 wide — x = 50, 250, 450,
  …, 20 px gaps. Running `python3 check_overlaps.py` on that suggests widening to
  30 px, still under 40.
- The treatment does not pass by construction either: 200 px wide on the 220 px
  grid is 20 px, 190 is 30. The assertion reads the coordinates, not which
  numbers the agent quoted.
- An agent that stacks the workers in a column (what `python3 plan_layout.py`
  does) fails A1 as "not in one row". That path is identical in both arms.
- A missing or unparsable `layout.json`, or a worker without finite numeric
  `x`/`y`/`width`/`height`, is a FAIL, not a grade error: the file is what the
  agent was asked for.

Printed, never scored:

- `-- C2:` separator clearance, every separator to its nearest shape ≥ 30 px. It
  is a floor that cannot discriminate — the old text asked for 200 px there,
  which is stricter than the new text, and the Zone Layout Template gives 30 px
  in both versions.
- `-- audit:` the six widths, the adjacent gaps, the column pitch, whether a tool
  call names `layout-heuristics.md` and by which path, whether any tool call
  reached outside the trial tree, and whether `uv` was run.

How the grader finds a worker: any object in the JSON with numeric `x`, `y`,
`width`, `height` is a shape; a worker is the shape whose `id` or `label`
carries the worker's name as a whole token (`auth`, `worker-auth`,
`Auth Service`). When several shapes carry one name, a box beats what is drawn
on or between boxes: a shape whose `type` is text or a connector, or whose name
also carries another pipeline node (`router-auth`), gives way when another
candidate remains. Among the rest the largest area wins — a box contains its own
text label, so a small text node never stands in for the box, whichever of the
two was given the bare `auth` as its `id` or `label`. An untyped connector the same rule cannot
see by name (`auth-output`) is seen by shape: well-formed numbers with no width
or no height make a line, and a line gives way too. A remaining candidate with a
missing or non-numeric coordinate fails the worker outright; the grader never
falls back to the label beside it. The audit line says which rule was used.

Known limit, the same in both arms: the plan is untyped JSON, so box, label and
connector are told apart by these rules and nothing else. A plan that gives a
worker's text label no `width`/`height` at all, beside a sound box, fails that
worker — the alternative lets a label stand in for a box whose own numbers are
broken. If a row reads as a sound plan and still scores 0 on this rule, widen
the rule, bump `## Version` and say so; do not re-score by hand. The file may be a bare list or a list
wrapped in an object.

The grader reads `layout.json` and the transcript as data and runs nothing
(eval B-12). It runs as `python3 -I`, and the engine runs it from a fresh empty
directory (B-14); the file is read only when it is a regular file under 1 MiB.

### Running it

The baseline directory is **not in the repository**. Committing it would put a
15-file copy of a shipped skill under `evals/fixtures/`, where it would drift
from the skill it copies; the digest pins it instead. Build it outside the
repository, from the repository root, before the preflight:

```bash
BASE="${TMPDIR:-/tmp}/arcforge-d4-baseline/diagramming-obsidian"
rm -rf "$BASE" && mkdir -p "$BASE"
git archive HEAD:skills/core/diagramming-obsidian | tar -x -C "$BASE"
git show 1fed56d0~1:skills/core/diagramming-obsidian/references/layout-heuristics.md \
  > "$BASE/references/layout-heuristics.md"

# exactly one line: references/layout-heuristics.md differs
diff -rq "$BASE" skills/core/diagramming-obsidian

# 0f3c574c1e448946, then 42ec93e5d9d42cec
node -e "const {digestSkillDir}=require('./scripts/lib/eval-skill-staging');for(const d of process.argv.slice(1))console.log(digestSkillDir(d))" \
  "$BASE" skills/core/diagramming-obsidian
```

If either digest differs, `skills/core/diagramming-obsidian/` has changed since
the gate: stop, and re-register both digests before spending a session. The
digest covers each file's path, executable bit and bytes, not where the
directory sits or its timestamps, so the directory can be rebuilt between the
preflight and the A/B.

Preflight and A/B take the same flags and the same ceiling — the ceiling and the
baseline's digest are both in the preflight key:

```bash
ARCFORGE_EVAL_TRIAL_TIMEOUT_MS=1800000 arcforge eval preflight eval-diagramming-obsidian-layout-grid \
  --model 'opus[1m]' --effort xhigh \
  --stage-skill-files --baseline-skill-file "$BASE/SKILL.md"

ARCFORGE_EVAL_TRIAL_TIMEOUT_MS=1800000 arcforge eval ab eval-diagramming-obsidian-layout-grid \
  --model 'opus[1m]' --effort xhigh \
  --skill-file skills/core/diagramming-obsidian/SKILL.md \
  --stage-skill-files --baseline-skill-file "$BASE/SKILL.md"
```

Budget (`docs/plans/v6.5/wp-d/budget.md`): preflight 3 + A/B 10 = 13 sessions.
Do not edit `skills/` or `$BASE` while a run is going — a trial's copy with
another digest stops the run.

`## Max Turns` is unset on purpose: the task needs no turn limit, and a declared
one would enter the preflight key. `## Environment` is not declared: the task
needs no tool and depends on no tool being absent.

### Residuals — how to read a run

- **A row that wrote into its staged copy does not score**
  (`trial_wrote_skill_files`, `infraError`). Two ways in: a relative write after
  the `cd "$BASE/references"` the skill asks for (`layout.json`, or
  `python3 plan_layout.py --output coords.json`), and a `uv run` that creates
  `.venv`. The copy is that trial's own, so the run goes on and only that row is
  lost. Lost rows are topped up: at most 2 runs of `--k 1` (one row per arm
  each), used when an arm ends the A/B with fewer than 5 scored rows. Still
  short after both: record `INSUFFICIENT_DATA` as the finding and stop. Report
  unscored rows per arm with what each wrote; the `cd` instruction is in the
  `SKILL.md` both arms share, so a lopsided count is reported as it is and not
  read as discrimination.
- **A preflight with such a row is BLOCK with `pass_rate: null`.** That is "not
  measured", not a ceiling. It spends the preflight-rerun allowance (2 for the
  whole measurement round), not a top-up.
- **Ceiling.** Preflight runs the old-reference arm. Three passes of three is a
  ceiling BLOCK and is itself the answer to #185: the old grid's contradiction
  did not make an agent plan a violating layout. Record it; do not re-tune the
  task until a number appears.
- **A write into the project stops the run** (`trial_wrote_repo`). Nothing in the
  prompt asks for one; if it happens, record it as a finding.
- **Rows that never opened the reference** measured something else. The grader's
  `-- audit: layout-heuristics.md` line shows it per row; report those rows
  separately and do not relabel them.
- **Escape.** `../../skills/core/diagramming-obsidian/references/layout-heuristics.md`
  is the current file. A baseline row that read it is no longer the old-reference
  arm. The `-- audit: outside the trial tree` lines print every such tool call;
  check each baseline row.

## Setup
mkdir -p vault/Diagrams

## Assertions
- [ ] A1: `layout.json` at the top of the trial directory parses as JSON and holds all six workers (`auth`, `billing`, `search`, `notify`, `export`, `audit`) with finite numeric `x`, `y` and positive `width`, `height`; the six share one row (their vertical extents overlap pairwise); and, ordered by `x`, every adjacent pair is at least 40 px apart (`x₂ − (x₁ + width₁) ≥ 40`).

## Grader
code

## Grader Config
python3 -I - <<'PY'
import json, math, os, re, stat, sys
from pathlib import Path

# Reads layout.json and the transcript as data; runs nothing (eval B-12). The engine runs
# the grader from a fresh empty cwd and passes the trial as the absolute TRIAL_DIR (B-14);
# `python3 -I` is belt-and-braces over that: no cwd on sys.path and PYTHON* ignored. The
# file is read only when regular and small, so a FIFO, device or symlink cannot hang the
# grader or stand in for the plan.
MAX_BYTES = 1 << 20
MIN_GAP = 40
MIN_SEPARATOR_CLEARANCE = 30
EPS = 1e-6
WORKERS = ("auth", "billing", "search", "notify", "export", "audit")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

trial = Path(os.environ["TRIAL_DIR"])
project_root = os.environ.get("PROJECT_ROOT", "")
tp = os.environ.get("TRANSCRIPT_PATH")


def regular_bytes(path):
    try:
        st = os.lstat(path)
        if not stat.S_ISREG(st.st_mode) or st.st_size > MAX_BYTES:
            return None
        with open(path, "rb") as f:
            return f.read(MAX_BYTES)
    except OSError:
        return None


def emit(label, ok, reason=""):
    print(f"{label}:{'PASS' if ok else 'FAIL' + (':' + reason if reason else '')}")


def num(v):
    """A finite JSON number, or None. A bool is not a coordinate."""
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    try:
        f = float(v)
    except OverflowError:
        return None
    return f if math.isfinite(f) else None


def fmt(v):
    return f"{v:g}"


def tokens(v):
    return re.findall(r"[a-z0-9]+", v.lower()) if isinstance(v, str) else []


def audit_transcript():
    """Never scored: what the row did around the plan, for the per-row audit."""
    raw = regular_bytes(tp) if tp else None
    txt = raw.decode("utf-8", errors="replace") if raw else ""
    blocks = [b for b in re.split(r"(?m)^(?=\[(?:Tool:|Assistant))", txt) if b.strip()]
    tools = [b for b in blocks if b.startswith("[Tool:")]
    if not tools:
        print("-- audit: no tool calls in the transcript")
        return

    def scanned(b):
        # A Write body is authored content, not a place the agent went.
        return b.split("\n", 1)[0] if b.startswith("[Tool: Write]") else b

    ref = [scanned(b) for b in tools if "layout-heuristics.md" in scanned(b)]
    if not ref:
        print("-- audit: layout-heuristics.md: no tool call names it (this row did not measure the reference)")
    for b in ref[:5]:
        where = "staged copy" if "arcforge-eval-skill-" in b else "path not shown as staged"
        print(f"-- audit: layout-heuristics.md: {where} <- {b.splitlines()[0][:140]}")

    outside = []
    user_space = r"(?:/Users/|/home/|/Volumes/)[^\s\"'`)\],;]*"
    patterns = (
        r"(?<![\w./-])skills/(?:core/|[a-z0-9-]+/references)",
        r"\.\./\.\.",
        r"(?<![\w])~/",
    )
    for b in tools:
        s = scanned(b)
        head = s.splitlines()[0][:100]
        hits = [m.group(0) for m in re.finditer(user_space, s)]
        if project_root:
            hits += [m.group(0) for m in re.finditer(re.escape(project_root) + r"[^\s\"'`)\],;]*", s)]
        outside += [f"{h} <- {head}" for h in hits if not h.startswith(str(trial))]
        outside += [f"{m.group(0)!r} <- {head}" for p in patterns for m in [re.search(p, s)] if m]
    outside = sorted(set(outside))
    if not outside:
        print("-- audit: outside the trial tree: none")
    for o in outside[:10]:
        print(f"-- audit: outside the trial tree: {o}")

    uv = [b.splitlines()[0][:140] for b in tools if b.startswith("[Tool: Bash]") and re.search(r"\buv\s+(?:run|sync|pip|venv|tool)\b", b)]
    print(f"-- audit: uv commands: {len(uv)}")
    for u in uv[:5]:
        print(f"-- audit: uv: {u}")
    wrote = [scanned(b).splitlines()[0][:140] for b in tools if "layout.json" in scanned(b)]
    for w in wrote[:5]:
        print(f"-- audit: layout.json named in: {w}")


def fail(reason):
    emit("A1", False, reason)
    print("-- C2: not evaluated")
    audit_transcript()
    sys.exit(1)


# ---- read the plan ----
raw = regular_bytes(trial / "layout.json")
if raw is None:
    fail("layout.json is missing at the top of the trial directory, or is not a regular file under 1 MiB")
try:
    data = json.loads(raw.decode("utf-8"))
except (ValueError, RecursionError) as err:
    fail(f"layout.json is not valid JSON ({type(err).__name__})")

# Every object in the file, however the list is wrapped. Iterative, so a deeply
# nested file cannot exhaust the stack.
objects, stack = [], [data]
while stack:
    node = stack.pop()
    if isinstance(node, dict):
        objects.append(node)
        stack.extend(node.values())
    elif isinstance(node, list):
        stack.extend(node)

shapes, separators = [], []
for o in objects:
    if isinstance(o.get("type"), str) and o["type"].lower() == "separator":
        y = num(o.get("y"))
        if y is not None:
            separators.append((str(o.get("id", "?")), y))
        continue
    x, y, w, h = (num(o.get(k)) for k in ("x", "y", "width", "height"))
    named = tokens(o.get("id")) + tokens(o.get("label"))
    shapes.append({"o": o, "x": x, "y": y, "w": w, "h": h, "named": named})
print(f"-- audit: {len(objects)} objects, {len(separators)} separators")


def placed(s):
    return None not in (s["x"], s["y"], s["w"], s["h"]) and s["w"] > 0 and s["h"] > 0


# ---- the six workers ----
NOT_A_BOX = {"text", "label", "arrow", "line", "connector", "edge"}
OTHER_NODES = {"router", "event", "log"}


def is_annotation(s, name):
    kind = s["o"].get("type")
    if isinstance(kind, str) and kind.lower() in NOT_A_BOX:
        return True
    # Well-formed numbers with no width or no height: a line, not a box.
    if None not in (s["x"], s["y"], s["w"], s["h"]) and (s["w"] <= 0 or s["h"] <= 0):
        return True
    return bool((OTHER_NODES | (set(WORKERS) - {name})) & set(s["named"]))


workers, problems = {}, []
for name in WORKERS:
    cands = [s for s in shapes if name in s["named"]]
    if not cands:
        problems.append(f"{name}: no shape with that id or label")
        continue
    # A box beats what is drawn on or between boxes: a text or connector type, and
    # a shape naming a second pipeline node (`router-auth`), give way when another
    # candidate remains; so does a line, a shape whose numbers are well formed with
    # no width or no height. Every candidate left must be placed — a malformed box
    # is a FAIL, never a reason to measure the label beside it. Then the largest
    # area: a box contains its own label, whatever id or label either was given.
    boxes = [s for s in cands if not is_annotation(s, name)] or cands
    if not all(placed(s) for s in boxes):
        problems.append(f"{name}: x, y, width, height are not all finite numbers with width and height above 0")
        continue
    pick = max(boxes, key=lambda s: s["w"] * s["h"])
    if len(cands) > 1:
        rule = "only box" if len(boxes) == 1 else "largest area"
        print(f"-- audit: {name}: {len(cands)} shapes carry the name, took {rule}")
    workers[name] = pick
if problems:
    fail("; ".join(problems))

# ---- one row ----
row = sorted(workers.items(), key=lambda kv: kv[1]["x"])
apart = [
    f"{a}/{b}"
    for i, (a, sa) in enumerate(row)
    for b, sb in row[i + 1 :]
    if min(sa["y"] + sa["h"], sb["y"] + sb["h"]) - max(sa["y"], sb["y"]) <= EPS
]
gaps = [(a, b, sb["x"] - (sa["x"] + sa["w"])) for (a, sa), (b, sb) in zip(row, row[1:])]
print("-- audit: order by x: " + ", ".join(n for n, _ in row))
print("-- audit: widths: " + ", ".join(fmt(s["w"]) for _, s in row))
print("-- audit: adjacent gaps: " + ", ".join(fmt(g) for _, _, g in gaps))
print("-- audit: column pitch: " + ", ".join(fmt(sb["x"] - sa["x"]) for (_, sa), (_, sb) in zip(row, row[1:])))

if apart:
    reason = f"the six workers are not in one row: no vertical overlap between {', '.join(apart[:6])}"
    a1 = False
else:
    tight = [f"{a}->{b} {fmt(g)}px" for a, b, g in gaps if g < MIN_GAP - EPS]
    a1 = not tight
    reason = f"same-row workers closer than {MIN_GAP}px: {', '.join(tight)}"
emit("A1", a1, reason)

# ---- C2: separator clearance, a floor that is printed and never scored ----
solid = [s for s in shapes if placed(s)]
if not separators:
    print("-- C2: no separators in the plan")
for sid, sy in separators:
    dists = []
    for s in solid:
        top, bottom = s["y"], s["y"] + s["h"]
        dists.append(sy - bottom if bottom <= sy else top - sy if top >= sy else -min(sy - top, bottom - sy))
    if not dists:
        print(f"-- C2: separator {sid} y={fmt(sy)}: no placed shapes to measure against")
        continue
    nearest = min(dists)
    verdict = "ok" if nearest >= MIN_SEPARATOR_CLEARANCE - EPS else "under"
    print(f"-- C2: separator {sid} y={fmt(sy)}: nearest shape {fmt(nearest)}px ({verdict}, floor {MIN_SEPARATOR_CLEARANCE})")

audit_transcript()
sys.exit(0 if a1 else 1)
PY

## Trials
5

## Version
1
