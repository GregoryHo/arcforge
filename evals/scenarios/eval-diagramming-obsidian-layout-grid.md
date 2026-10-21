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

> I want an Excalidraw diagram of our platform's six core services for the team vault, but before you build anything, give me the coordinate plan to review: write it to `layout.json` at the top of this project folder — use the full absolute path, not a relative one — as a JSON array of elements, each `{"id", "type", "x", "y", "width", "height", "text"}` with `type` either `"box"` or `"label"`. Each service gets exactly one `"box"`: its `id` is the service's name as written below, and its `text` is three lines separated by `\n`: the service's name, then its two description lines exactly as given. Don't build, render or save a diagram yet. The six services are peers of equal weight: none of them calls another, there is no gateway or hub in front of them, and the diagram has no arrows. Put them side by side in one row:
>
> - `auth` — check tokens / new sessions
> - `billing` — meter usage / send bills
> - `search` — index docs / run queries
> - `notify` — queue alerts / email, push
> - `export` — make reports / write CSV
> - `audit` — log actions / keep history

## Preflight
run

## Verdict Policy
delta

## Design Notes
Not sent to the agent (only `## Context` and `## Scenario` reach it) — this
section is for whoever maintains or runs the scenario. The authority for every
choice below is the Version 2 design gate,
`docs/plans/v6.6/wp-d/design-gate.diagramming-layout-v2.md` (D-066 D2, #185).
What Version 2 did not change — a coordinate plan only, the absolute path, rows
that write into their staged copy do not score — keeps the reasons of the
Version 1 gate, `docs/plans/v6.5/wp-d/design-gate.diagramming-layout.md`.

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

**Version 1 never reached the contradiction.** Its preflight was a ceiling
BLOCK, `pass_rate: 1` (`docs/plans/v6.5/wp-d/preflight.eval-diagramming-obsidian-layout-grid-2.json`;
the per-row audit is `docs/plans/v6.5/wp-d/audit.d4.md`). All five audited rows
opened the old `layout-heuristics.md` and copied its 200 px column pitch, but
every row called the six workers `secondary` — the task had a `router` and an
`event-log` drawn as larger hubs — and took the 140 px width of
`plan_layout.py`'s size table. 140 on a 200 px grid is a 60 px gap. The old text
is only wrong at the Primary width of 180, and the Version 1 task never put the
workers there. That record stays in the ledger as it is.

**Version 2 moves the size class, not the grid.** The task is six peers of equal
weight in one row: no hub, no arrows, no width named, and each box carries its
name and two description lines. Three reasons point the baseline at Primary
without the prompt naming it: with nothing else on the diagram there is no
Primary for a Secondary to support (`painters-toolkit.md:208-209`); a symmetric
concept gets equal-sized peers and no invented hero (`SKILL.md:89-93`,
`painters-toolkit.md:216`); and three lines of 16 px text with 20 px padding are
100 px tall, inside Primary's 70–100 and over Secondary's 50–70
(`element-templates.md:27`, `:32`). The longest description line is 12
characters, about 115 px of text, so it fits a 180 px box with either padding —
the pull toward 180 comes from the size class, not from text forcing a box
wider. A baseline that calls the workers `primary` gets 180 from both default
sources (old `:20`, `plan_layout.py:46`); copying the 200 px pitch then gives
20 px and fails.

### The task shape

The task asks for a coordinate plan and nothing else. The skill's check, render
and verify steps all go through `uv run`, and `uv run` writes a `.venv` into
`references/` — inside the trial's staged copy — which makes the row
`trial_wrote_skill_files` and unscored. #182 changed where shapes go at the
moment `x` and `y` are decided; nothing after that moment reads this file.
There is no Obsidian in a trial and none is needed.

The prompt says nothing about width, spacing, a grid, 40, 180, 200 or 220. It
prescribes the schema — a `type` of `"box"` or `"label"`, one box per service
whose `id` is the service's name, and a `text` written as "three lines separated
by `\n`: the service's name, then its two description lines exactly as given" —
so the grader never guesses which shape is a worker's box or how many lines a
`text` was meant to have. Both arms read the same sentence, and it says nothing
about where a box goes. The prompt is fixed text and cannot carry the trial's
real path, so it says "at the top of this project folder" and asks for the full
absolute path: `SKILL.md` tells the agent to `cd "$BASE/references"`, and a
relative `layout.json` written after that lands in the staged copy.

### The assertion

**A1 is the only scored assertion**: each worker's box carries the three-line
`text`, the six workers sit in one row, and every adjacent pair is at least
40 px apart horizontally (`x₂ − (x₁ + width₁)`).

- 40 is the same-level minimum **both** versions of the reference state. It is
  not a number only the treatment has seen. "Column pitch equals 220" is
  deliberately not asserted: the old text never contains 220, so a baseline
  would fail that by construction rather than by behavior.
- **The `text` precondition is part of A1, not a second assertion.** The text is
  what pushes a box to Primary height; a row that drops it, gives a non-string,
  or folds the two description lines into one can keep a Secondary-sized box,
  space it 60 px on the old grid, and count toward a 3/3 ceiling BLOCK that
  would close #185. A1 therefore fails such a row, naming the worker and the
  cause: missing, not a string, the line count found, or the first line found.
  Only the line count, non-emptiness and the first line are checked; the two
  description lines are not compared word for word, since "email & push" for
  "email, push" says nothing about layout. One scored label keeps the row's pass
  equal to A1's pass, as in Version 1, where A1 already failed a plan that broke
  the prescribed schema.
- The baseline has six ways to pass without ever seeing the new text:
  1. 160 wide on the 200 px grid, exactly 40 (`≥ 40` passes). 160 is the bottom
     of Primary (`painters-toolkit.md:208`).
  2. `painters-toolkit.md:214`, "Primaries get 60-100px buffer between peers",
     present in both arms. It did not apply to Version 1's Secondary workers and
     applies directly here; it is the largest ceiling risk. Against it: all five
     Version 1 rows read `painters-toolkit.md` and none used its buffer.
  3. The spacing table's 40 px (old `:162`, `:231`) or the "minimum 40px" in
     old `:20` itself — noticing the contradiction. No Version 1 row mentioned
     it, but no Version 1 row was ever at 180.
  4. Treating the workers as Secondary again (110–140 wide, 60 px or more on the
     200 px grid).
  5. A font larger than 16 (the skill's free-text template uses 20,
     `element-templates.md:81`) pushes a 12-character line with 30 px padding to
     204 px, which a 200 px grid cannot hold; the agent then chooses its own
     gap, usually ≥ 40.
  6. Never opening `layout-heuristics.md`, though `SKILL.md:108-109` asks for it
     before Phase 1 and all five Version 1 rows opened it.

  It fails one way: copy the 200 px pitch at a width of 161 or more — 180 gives
  20, 175 gives 25, 170 gives 30. Running `python3 check_overlaps.py` on that
  suggests widening to 30 px, still under 40; the task builds nothing for it to
  check in any case.
- The treatment does not pass by construction either: 200 px wide on the 220 px
  grid is 20 px, 190 is 30. The assertion reads the coordinates, not which
  numbers the agent quoted.
- An agent that stacks the workers in a column (what `python3 plan_layout.py`
  does) fails A1 as "not in one row". That path is identical in both arms.
- A missing or unparsable `layout.json`, or one that does not follow the
  prescribed schema, is a FAIL, not a grade error: the file is what the agent
  was asked for.

Printed, never scored — the `-- audit:` lines: the six widths, the adjacent
gaps, the column pitch, each worker's `text` line count with its width's size
tier (≤ 140 Secondary, 160–200 Primary, otherwise other), whether a tool call
names `layout-heuristics.md` and by which path, whether any tool call reached
outside the trial tree, and whether `uv` was run. The size-tier line answers the
audit's first question — did the baseline reach Primary — without converting
widths by hand.

How the grader finds a worker: the schema is prescribed, so it does not guess.
The file is a JSON array; a worker is the one element with `"type": "box"` whose
`id` is exactly the worker's name. Labels are ignored by their declared `type`,
never by size or by name. A plan that does not follow the schema fails as
malformed, in both arms: a top level that is not an array, a worker with no box
or more than one, or a box whose `x`, `y`, `width`, `height` are not finite
numbers with width and height above 0. A worker whose `text` is not its name
plus two lines fails A1 with that cause, before the row and the gaps are
judged. If a row reads as a sound plan and still fails on its schema or its
`text`, report it as that; do not re-score by hand.

The grader reads `layout.json` and the transcript as data and runs nothing
(eval B-12). It runs as `python3 -I`, and the engine runs it from a fresh empty
directory (B-14); the file is read only when it is a regular file under 1 MiB.

### Running it

The baseline directory is **not in the repository**. Committing it would put a
15-file copy of a shipped skill under `evals/fixtures/`, where it would drift
from the skill it copies; the digest pins it instead. Build it outside the
repository, from the repository root, before the preflight:

```bash
BASE="${TMPDIR:-/tmp}/arcforge-d2-baseline/diagramming-obsidian"
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
preflight and the A/B. A main checkout whose `references/` holds `.venv` or
`__pycache__` lists them in `diff -rq` too; the digest skips both.

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

No `--also-stage` and no `--plugin-dir`; a row of this scenario carries no
`alsoStaged`. Budget (`docs/plans/v6.6/PLAN.md`): preflight 3 + A/B 10 = 13
sessions, run after D1. Do not edit `skills/` or `$BASE` while a run is going —
a trial's copy with another digest stops the run.

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
  whole measurement round, shared with D1), not a top-up.
- **Ceiling.** Preflight runs the old-reference arm. Three passes of three is a
  ceiling BLOCK; under D-066 Version 2 is the last design, so a BLOCK closes
  #185 as a finding — the current reference was never measured against the old
  one. Record it; do not re-tune the task or run the A/B.
- **A `text` FAIL is noise shared by both arms.** Both arms read the same prompt
  and the same `SKILL.md`, so a row that wrote `text` wrongly is not a sign of
  either reference; it lowers both pass rates and narrows the visible delta.
  The audit says per row whether a FAIL was the `text` or the spacing, and the
  result's decision records how many `text` FAILs each arm had, not read as
  discrimination.
- **A write into the project stops the run** (`trial_wrote_repo`). Nothing in the
  prompt asks for one; if it happens, record it as a finding.
- **Rows that never opened the reference** measured something else. The grader's
  `-- audit: layout-heuristics.md` line shows it per row; report those rows
  separately and do not relabel them.
- **Escape.** `../../skills/core/diagramming-obsidian/references/layout-heuristics.md`
  is the current file. A baseline row that read it is no longer the old-reference
  arm. The `-- audit: outside the trial tree` lines print every such tool call;
  check each baseline row.
- **Not a reading beyond the grid.** A1 measures the gap between Primary-sized
  boxes under two grids, not a full build, render and save, and not a layout
  with a hub such as a router.

## Setup
mkdir -p vault/Diagrams

## Assertions
- [ ] A1: `layout.json` at the top of the trial directory parses as a JSON array and holds exactly one `"type": "box"` element for each of the six workers (`id` `auth`, `billing`, `search`, `notify`, `export`, `audit`) with finite numeric `x`, `y` and positive `width`, `height`; each of those six boxes carries a string `text` that, after dropping one trailing newline and trimming each line, splits on `\n` into exactly three non-empty lines whose first line is the box's `id` (the service's name); the six share one row (their vertical extents overlap pairwise); and, ordered by `x`, every adjacent pair is at least 40 px apart (`x₂ − (x₁ + width₁) ≥ 40`).

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
TEXT_LINES = 3
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

# The schema is prescribed: an array of elements, each with a declared type. The
# grader reads the type and the id it was told to expect; it never guesses a
# worker's box from a shape's size or name.
if not isinstance(data, list):
    fail(f"layout.json is not a JSON array of elements (top level is {type(data).__name__})")
elements = [e for e in data if isinstance(e, dict)]
kinds = [e.get("type") if isinstance(e.get("type"), str) else None for e in elements]
print(
    f"-- audit: {len(data)} entries: "
    + ", ".join(f"{k or 'untyped'} {kinds.count(k)}" for k in sorted(set(kinds), key=str))
)


def box_of(e):
    x, y, w, h = (num(e.get(k)) for k in ("x", "y", "width", "height"))
    return {"x": x, "y": y, "w": w, "h": h}


def placed(s):
    return None not in (s["x"], s["y"], s["w"], s["h"]) and s["w"] > 0 and s["h"] > 0


def text_lines(v):
    """The box's text as lines: one trailing newline dropped, each line trimmed."""
    if v.endswith("\n"):
        v = v[:-1]
    return [line.strip() for line in v.split("\n")]


def text_problem(name, e):
    """Why a worker's text is not its name plus two description lines, or None."""
    if "text" not in e:
        return f"{name}: text is missing"
    v = e["text"]
    if not isinstance(v, str):
        return f"{name}: text is not a string ({type(v).__name__})"
    lines = text_lines(v)
    empty = sum(1 for line in lines if not line)
    if len(lines) != TEXT_LINES or empty:
        blank = f", {empty} empty" if empty else ""
        return f"{name}: text has {len(lines)} lines{blank}, expected {TEXT_LINES} non-empty"
    if lines[0] != name:
        return f"{name}: text's first line is {lines[0]!r}, expected {name!r}"
    return None


def size_tier(w):
    return "Secondary" if w <= 140 + EPS else "Primary" if 160 - EPS <= w <= 200 + EPS else "other"


boxes = [e for e, k in zip(elements, kinds) if k == "box"]

# ---- the six workers: exactly one box each ----
workers, texts, problems = {}, {}, []
for name in WORKERS:
    mine = [e for e in boxes if e.get("id") == name]
    if len(mine) != 1:
        problems.append(f'{name}: {len(mine)} elements with "type": "box" and that id, expected 1')
    elif not placed(box_of(mine[0])):
        problems.append(f"{name}: x, y, width, height are not all finite numbers with width and height above 0")
    else:
        workers[name] = box_of(mine[0])
        texts[name] = mine[0]
if problems:
    fail("malformed plan: " + "; ".join(problems))

# ---- the precondition: each worker's text is its name plus two description lines ----
# Scored inside A1 (a row that skips the text cannot keep a Secondary-sized box and still
# count toward the ceiling). Only the line count, non-emptiness and the first line are
# checked; the description wording is not compared.
text_problems = [p for p in (text_problem(n, texts[n]) for n in WORKERS) if p]

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


def line_count(e):
    v = e.get("text")
    return "missing" if "text" not in e else str(len(text_lines(v))) if isinstance(v, str) else "not a string"


print(
    "-- audit: text lines / size tier: "
    + ", ".join(f"{n} {line_count(texts[n])} / {size_tier(s['w'])}" for n, s in row)
)

if text_problems:
    reason = "text is not the name plus two description lines: " + "; ".join(text_problems)
    a1 = False
elif apart:
    reason = f"the six workers are not in one row: no vertical overlap between {', '.join(apart[:6])}"
    a1 = False
else:
    tight = [f"{a}->{b} {fmt(g)}px" for a, b, g in gaps if g < MIN_GAP - EPS]
    a1 = not tight
    reason = f"same-row workers closer than {MIN_GAP}px: {', '.join(tight)}"
emit("A1", a1, reason)

audit_transcript()
sys.exit(0 if a1 else 1)
PY

## Trials
5

## Version
2
