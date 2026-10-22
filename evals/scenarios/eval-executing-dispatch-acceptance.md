# Eval: eval-executing-dispatch-acceptance

## Scope
skill

## Target
skills/core/executing/SKILL.md

## Context
You are in the `edge-api` project folder. It is a git repository with a task list at `TASKS.md`.

## Scenario
Work through `TASKS.md` from top to bottom and finish every task. Run it unattended — I'm stepping away, so don't ask me which mode to use or wait for my answers; just do what each task says.

## Preflight
run

## Verdict Policy
delta

## Design Notes
Not sent to the agent (only `## Context` and `## Scenario` reach it) — this
section is for whoever maintains or runs the scenario. The authority for every
choice below is the design gate,
`docs/plans/v6.6/wp-d/design-gate.executing-dispatching-v2.md` (D-066 D1,
#184). Where this section and the gate differ, the gate is right and this
section is the bug.

### What is measured

The handoff sentence in `skills/core/executing/SKILL.md` (Unattended):
"Handing individual tasks to subagents is a dispatch problem — the
`dispatching` skill covers fan-out, isolation, and acceptance." The rule it
points at is `dispatching` Step 3: the card carries the acceptance criteria
verbatim — "Paste the text, never a file path to the text."

Under D-066 the claim is what the two skills do together. Both arms are
injected with the same `executing` text; only the treatment also gets
`dispatching`, staged and named in one listing line (B-22). The reading is
"the handoff sentence plus a reachable `dispatching` body" against "the handoff
sentence, body absent" — not two skills against none, and not the plugin's
routing.

| Arm | Injected | Staged |
|---|---|---|
| baseline | `executing` (text hash `17fa36f1535cb446`) + its base-directory line | a copy of `skills/core/executing` (digest `1ef6e3967679cf2b`) |
| treatment | the same, plus one line naming `dispatching` | the same copy, plus a copy of `skills/core/dispatching` (digest `9479e63210fdc2be`) |

The text hashes are equal, so `skillTextHash` does not tell the arms apart.
Every row of the A/B, both arms, records `alsoStaged: true` and the same
`alsoStagedFilesHash` (B-22; the gate's engine fact 4): the arms are told apart
by the row's arm, not by a field. The preflight runs the baseline without
`--also-stage`, so a preflight row carries no `alsoStaged`.

### The task shape

`## Setup` builds `edge-api`: a git repository with an identity and one commit,
a dependency-free `node:http` server with `/login` and `/search`,
`specs/limiter.md` and `TASKS.md` in `executing`'s own format. T2 alone says to
hand the work to a subagent and names `specs/limiter.md`; the three acceptance
criteria exist only in that spec. T1 and T3 touch `src/server.js`, T2 only
`src/limiter.js`, so T2 is the independent piece (`dispatching` Step 1), and
the list is one the agent really has to finish.

The prompt fixes the mode — a trial has one user message, and `executing` asks
for the mode first — and says nothing about subagents, criteria, pasting, paths
or `dispatching`. Each criterion has one detail a common paraphrase drops:
"exactly 10 … the 11th", "rounded up", "never `ip` alone".

`## Environment` puts the repository's `bin/` first on the trial's `PATH`:
`dispatching` Step 2 runs `arcforge worktree add`, and a trial's `PATH` has no
`arcforge` unless the scenario declares it (B-18). It is prepended (`^=`), not
appended, so an `arcforge` in a system directory cannot shadow this checkout's;
`bin/` holds only `arcforge`, so prepending shadows none of the trial's shims. Without it the treatment would meet
`command not found` before the writer dispatch and the baseline would not,
and the run would measure whether the CLI exists. `ARCFORGE_HOME` is under the
trial, so the worktree lands in the trial tree. Failed calls are already in the
format-2 transcript as `[Result: Bash] error (exit N)`, so no wrapper is
declared.

### The assertion

**A1 is the only scored assertion**: the first Agent/Task call the grader
identifies as T2's writer carries all three criteria in its `prompt`, compared
after normalisation (lowercase, `-` to a space, backticks dropped, whitespace
collapsed, a trailing period dropped on both sides).

The writer is found in one pass over the Agent/Task blocks in transcript order,
each block classed on the spot by the gate's seven steps: `unreadable` (the
JSON does not parse); no mention of `limiter` or `rate limit` → `other`; an
acceptance-type `description` (the gate's whole-word list, excepted only by the
whole words `implement` or `build`) → `acceptance`; a block after a write of
`src/limiter.js` (`Write`/`Edit` of a path ending in it, or a `Bash` command
whose `>`/`>>` redirect or `tee` target is a path ending in `limiter.js`) →
`after-write`; a `description` that
mentions the limiter, or a `prompt` sentence that mentions it and carries no
ownership or negation marker (matched as whole words or phrases) → `writer`; otherwise `ownership-mention`.
Nothing mentions the limiter → FAIL `T2 not dispatched`; mentions but no
`writer` → FAIL `no T2 writer dispatch identified`. Blocks after the writer are
classed and printed, never scored.

Why the writer is identified and not "any block with the three criteria", why
one ordered pass, why `implement`/`build` are the only exemptions and which
false FAILs that accepts: the gate's 「grader」 section. Where two loopholes
compete the rule leans to FAIL; a false PASS would close #184 on a wrong
reading.

Printed, never scored — the `-- audit:` lines: whether `specs/limiter.md` was
opened; staged `SKILL.md` reads (the `dispatching` floor indicator); the
Agent/Task count; one `limiter dispatch` line per limiter block (position,
class, where the limiter was mentioned, criteria 0–3, the scored block, the
first 80 characters of the `description`, whether the `prompt` names
`specs/limiter.md`); that a block cannot be told top-level from a subagent's;
model-tier fields; failed `arcforge` calls with their exit code; and tool calls
outside the trial tree.

The staged-`SKILL.md` line counts only `Read` and `Bash` calls — a card that
passes `<copy>/SKILL.md` to a subagent did not open it — and cannot name which
copy it read: both staged copies are `<tmp>/arcforge-eval-skill-<pid>-<random>/`,
and the transcript does not carry the injection that says which is which. A
copy is marked as `dispatching`'s only when a `references/` path under the same
copy was also read, since `executing`'s copy holds `SKILL.md` alone. Otherwise
the line says "copy not identified"; read the row's raw stream for the
base-directory lines.

The grader reads the saved format-2 transcript, never `raw/`, as data; it runs
nothing. It runs as `python3 -I` from a fresh empty directory (B-14), and the
transcript is read only when it is a regular file under 32 MiB.

**When the grader gives no verdict.** The grader prints an out-of-range `A0`
label, which the engine records as a grade error, when `TRANSCRIPT_PATH` is
unset, missing, empty or not a regular file under 32 MiB. A grade error is not
a FAIL: the row has no verdict.

### Running it

Both arms take `--stage-skill-files`; the baseline
`--baseline-skill-file skills/core/executing/SKILL.md`; the treatment
`--skill-file skills/core/executing/SKILL.md --also-stage skills/core/dispatching`.
The ceiling is 1800 s for the preflight and the A/B alike — it is in the
preflight key — because the treatment builds a worktree and dispatches an
acceptance agent, and a killed trial never scores.

```bash
ARCFORGE_EVAL_TRIAL_TIMEOUT_MS=1800000 arcforge eval preflight eval-executing-dispatch-acceptance \
  --model 'opus[1m]' --effort xhigh \
  --stage-skill-files --baseline-skill-file skills/core/executing/SKILL.md

ARCFORGE_EVAL_TRIAL_TIMEOUT_MS=1800000 arcforge eval ab eval-executing-dispatch-acceptance \
  --model 'opus[1m]' --effort xhigh \
  --skill-file skills/core/executing/SKILL.md \
  --stage-skill-files --baseline-skill-file skills/core/executing/SKILL.md \
  --also-stage skills/core/dispatching
```

Before the preflight, recompute the two digests and the text hash at the
measurement commit; if any differs from the table above, stop and re-register
before spending a session. `alsoStagedFilesHash` is not a pool condition, so
this is the only check that `dispatching` did not change.

```bash
node -e "const {digestSkillDir}=require('./scripts/lib/eval-skill-staging');for(const d of process.argv.slice(1))console.log(digestSkillDir(d))" \
  skills/core/executing skills/core/dispatching
```

`## Max Turns` is unset on purpose: subagents and the acceptance agent spend
turns, and a declared limit enters the preflight key. Budget, outcomes and their
handling of #184: the gate's 「執行計畫」 and 「判定」.

### Residuals

The gate's 「殘餘風險」 is the list: the listing line is not the host's, a
subagent's calls are not marked, the rows the writer rule still misclasses
(each visible in `-- audit: limiter dispatch`), a re-dispatched writer after a
failed acceptance, and `arcforge worktree add` failing in the trial. One more
belongs to the grader's write rule: it sees `Write`, `Edit` and Bash `>`/`>>`/`tee`
targets, not writes by other means (`sed -i`, `node -e` with `writeFileSync`,
`cp`/`mv`), so a row that implemented T2 itself that way and then dispatched an
acceptance agent with the criteria can be scored on that dispatch. The main
agent normally writes with `Write`/`Edit`, which are caught. Report
those rows per arm as the gate says; do not relabel or re-score.

## Setup
git init -q -b main
git config user.email eval@example.com
git config user.name "Eval Fixture"
mkdir -p src specs test
cat > package.json <<'EOF'
{
  "name": "edge-api",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "node src/server.js",
    "test": "node --test"
  }
}
EOF
cat > src/server.js <<'EOF'
const http = require('node:http');

const routes = {
  '/login': (req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  },
  '/search': (req, res) => {
    const { searchParams } = new URL(req.url, 'http://localhost');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ query: searchParams.get('q') || '', results: [] }));
  },
};

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const handler = routes[pathname];
  if (!handler) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }
  handler(req, res);
});

if (require.main === module) {
  server.listen(Number(process.env.PORT) || 3000);
}

module.exports = { server };
EOF
cat > specs/limiter.md <<'EOF'
# Rate limiter

Each client gets a limited number of requests. A client that goes over its
limit is refused with `429 Too Many Requests` until it may try again.

## Acceptance criteria

1. A burst of exactly 10 requests within 1000 ms is allowed; the 11th gets 429.
2. `Retry-After` is rounded up to whole seconds.
3. The counter key is `${ip}:${route}`, never `ip` alone.
EOF
cat > TASKS.md <<'EOF'
# Tasks: edge-api

> arcforge task list v1 — status markers: `[ ]` pending, `[~]` in-progress,
> `[x]` done, `[!]` blocked. Every task has a stable id (`T1`, `T2`, …) that is
> never renumbered or reused. An indented `verify:` line is the command that
> proves the task done; a `note:` line explains a block. Edit markers in place —
> this file is the only state.

- [ ] T1 — Add a `GET /health` route to `src/server.js` that returns 200 with body `ok`
  - verify: `npm test`
- [ ] T2 — Implement the limiter in `src/limiter.js` per `specs/limiter.md` — hand this one to a subagent
  - verify: `npm test`
- [ ] T3 — Log each request's method and path to stdout in `src/server.js`
  - verify: `npm test`
EOF
git add -A && git commit -qm "fixture"

## Environment
# arcforge is what dispatching's Step 2 runs to make a worktree; the trial PATH has no arcforge otherwise (eval B-18), and it is prepended so a host arcforge cannot shadow this checkout's
PATH^=${PROJECT_ROOT}/bin

## Assertions
- [ ] A1: The first Agent/Task call identified as T2's writer — in one pass over the Agent/Task blocks in transcript order, the first block that mentions the limiter (`limiter` or `rate limit`), whose `description` is not acceptance-type (the whole words `implement` and `build` excepted), that comes before any write of `src/limiter.js` (a `Write`/`Edit` of a path ending in it, or a Bash `>`/`>>`/`tee` target ending in `limiter.js`), and whose `description` mentions the limiter or whose `prompt` has a sentence mentioning it with no ownership or negation marker (whole words or phrases) — carries all three acceptance criteria of `specs/limiter.md` in its `prompt`, word for word after normalisation (lowercase, `-` as a space, no backticks, whitespace collapsed, no trailing period). No limiter mention in any block fails as `T2 not dispatched`; mentions with no writer fail as `no T2 writer dispatch identified`.

## Grader
code

## Grader Config
python3 -I - <<'PY'
import json, os, re, stat, sys
from pathlib import Path

# Reads the saved format-2 transcript as data, never raw/, and runs nothing (eval B-12). The
# engine runs the grader from a fresh empty cwd (B-14); `python3 -I` keeps cwd off sys.path
# and ignores PYTHON*. The transcript is read only when regular and under the cap, so a FIFO,
# device or symlink cannot hang the grader or stand in for it.
# The rule is the design gate's, docs/plans/v6.6/wp-d/design-gate.executing-dispatching-v2.md.
MAX_BYTES = 32 << 20
CRITERIA = (
    "A burst of exactly 10 requests within 1000 ms is allowed; the 11th gets 429.",
    "`Retry-After` is rounded up to whole seconds.",
    "The counter key is `${ip}:${route}`, never `ip` alone.",
)
ACCEPTANCE_WORDS = (
    "review", "reviewer", "verify", "verification", "validate", "validation", "accept",
    "acceptance", "check", "checks", "audit", "inspect", "examine", "test", "tests", "testing",
    "qa", "assess", "confirm", "evaluate", "judge", "compliance", "suite",
)
EXEMPT_WORDS = ("implement", "build")
MARKERS = (
    "do not", "don't", "never", "must not", "avoid", "leave", "out of scope", "owns",
    "owned by", "belongs to", "another agent", "other agent", "in parallel",
)
NOT_TOP_LEVEL = (
    "cannot be determined: format 2 does not mark a subagent's calls, so a block carrying the "
    "criteria could in principle come from a subagent"
)
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


# ---- normalisation, shared by identification and comparison ----
def lowered(s):
    """Lowercase, `-` as a space, backticks dropped; whitespace kept (sentences split on lines)."""
    return s.lower().replace("-", " ").replace("`", "")


def norm(s):
    return re.sub(r"\s+", " ", lowered(s)).strip()


def for_criteria(s):
    """Normalised, then a trailing period dropped: applied to both sides of the comparison."""
    s = norm(s)
    return s[:-1].rstrip() if s.endswith(".") else s


CRITERIA_N = [for_criteria(c) for c in CRITERIA]


def mentions_limiter(s):
    n = norm(s)
    return "limiter" in n or "rate limit" in n


def has_word(n, words):
    return re.search(r"\b(?:" + "|".join(re.escape(w) for w in words) + r")\b", n) is not None


def acceptance_type(description):
    n = norm(description)
    return has_word(n, ACCEPTANCE_WORDS) and not has_word(n, EXEMPT_WORDS)


def sentences(prompt):
    # `;`, `:` and line breaks always split; `.`, `!`, `?` only before whitespace or the end,
    # so `src/limiter.js is owned by T2` stays one sentence. Split before collapsing whitespace.
    parts = re.split(r"[;:\n]|[.!?](?=\s|$)", lowered(prompt))
    return [p for p in (re.sub(r"\s+", " ", p).strip() for p in parts) if p]


def ownership(sentence):
    # Whole words or phrases: `whenever` is not `never`, `downstream` is not `owns`.
    return has_word(sentence, MARKERS)


# A redirect (`>`, `>>`) or `tee` (`-a` allowed) whose target is a path ending in limiter.js.
BASH_WRITE_RE = re.compile(
    r"(?:>>?|\btee(?:\s+-a)?)\s*[\"']?[^\s\"';|&<>]*limiter\.js(?![\w.])"
)


def writes_limiter(block):
    """A write of src/limiter.js the main transcript shows (step 4)."""
    head = block.split("\n", 1)[0]
    if head.startswith("[Tool: Write] "):
        return head[len("[Tool: Write] "):].strip().endswith("src/limiter.js")
    if head.startswith("[Tool: Edit] "):
        target = head[len("[Tool: Edit] "):].split(' (replace "', 1)[0]
        return target.strip().endswith("src/limiter.js")
    if block.startswith("[Tool: Bash]"):
        return BASH_WRITE_RE.search(block) is not None
    return False


AGENT_RE = re.compile(r"\[Tool: (?:Agent|Task)\] ")


def classify(rest, written):
    """One Agent/Task block, classed on the spot (steps 1-6)."""
    try:
        call = json.loads(rest)
    except (ValueError, RecursionError):
        call = None
    if not isinstance(call, dict):
        return {"cls": "unreadable"}
    description = call.get("description") if isinstance(call.get("description"), str) else ""
    prompt = call.get("prompt") if isinstance(call.get("prompt"), str) else ""
    in_desc, in_prompt = mentions_limiter(description), mentions_limiter(prompt)
    rec = {"description": description, "prompt": prompt, "call": call}
    rec["where"] = "both" if in_desc and in_prompt else "description" if in_desc else "prompt"
    if not (in_desc or in_prompt):
        rec["cls"] = "other"
    elif acceptance_type(description):
        rec["cls"] = "acceptance"
    elif written:
        rec["cls"] = "after-write"
    elif in_desc or any(mentions_limiter(s) and not ownership(s) for s in sentences(prompt)):
        rec["cls"] = "writer"
    else:
        rec["cls"] = "ownership-mention"
    return rec


def criteria_present(prompt):
    p = for_criteria(prompt)
    return [i + 1 for i, c in enumerate(CRITERIA_N) if c in p]


# ---- read the transcript ----
raw = regular_bytes(tp) if tp else None
if not raw:
    # Not a FAIL: an out-of-range label is a grade error (eval-grader-code.js), so the row
    # has no verdict.
    print("A0:FAIL:no transcript to read; this trial has no verdict")
    sys.exit(3)
blocks = [b for b in raw.decode("utf-8", errors="replace").split("\n\n") if b.strip()]

records, written = [], False
for b in blocks:
    m = AGENT_RE.match(b)
    if m:
        rec = classify(b[m.end():], written)
        rec["pos"] = len(records) + 1
        records.append(rec)
    elif writes_limiter(b):
        written = True

limiter = [r for r in records if r["cls"] not in ("other", "unreadable")]
writer = next((r for r in records if r["cls"] == "writer"), None)

# ---- step 7: score ----
if not limiter:
    a1, reason = False, "T2 not dispatched"
elif writer is None:
    a1, reason = False, "no T2 writer dispatch identified"
else:
    present = criteria_present(writer["prompt"])
    missing = [str(i) for i in (1, 2, 3) if i not in present]
    a1 = not missing
    reason = (
        f"the T2 writer dispatch (Agent/Task call #{writer['pos']}) lacks acceptance criteria "
        f"{', '.join(missing)} verbatim"
    )
emit("A1", a1, reason)

# ---- printed, never scored ----
tools = [b for b in blocks if b.startswith("[Tool:")]


def scanned(b):
    # A Write body is authored content, not a place the agent went.
    return b.split("\n", 1)[0] if b.startswith("[Tool: Write]") else b


spec = [
    b.splitlines()[0][:140]
    for b in tools
    if (b.startswith("[Tool: Read]") or b.startswith("[Tool: Bash]")) and "specs/limiter.md" in b
]
print(f"-- audit: specs/limiter.md opened: {'yes' if spec else 'no (no Read or Bash names it)'}")
for s in spec[:3]:
    print(f"-- audit: specs/limiter.md opened: <- {s}")

staged_re = re.compile(r"[^\s\"'`]*arcforge-eval-skill-[^/\s\"'`]+(?:/[^\s\"'`]*)?")
opened = [b for b in tools if b.startswith("[Tool: Read]") or b.startswith("[Tool: Bash]")]
named = [(m.group(0), b) for b in opened for m in staged_re.finditer(b)]
copy_of = lambda p: re.match(r"(.*arcforge-eval-skill-[^/]+)", p).group(1)  # noqa: E731
with_refs = {copy_of(p) for p, _ in named if "/references/" in p}
skill_reads = [(p, b) for p, b in named if p == copy_of(p) + "/SKILL.md"]
if not skill_reads:
    print("-- audit: dispatching/SKILL.md opened: no Read or Bash call names a staged SKILL.md")
for p, b in skill_reads[:5]:
    which = "dispatching's (references/ named under it)" if copy_of(p) in with_refs else "copy not identified"
    print(f"-- audit: dispatching/SKILL.md opened: staged SKILL.md, {which}: {p} <- {b.splitlines()[0][:100]}")

print(f"-- audit: agent calls: {len(records)}")
for r in records:
    if r["cls"] == "unreadable":
        print(f"-- audit: limiter dispatch: #{r['pos']} unreadable | the JSON did not parse")
        continue
    if r["cls"] == "other":
        continue
    scored = " [scored]" if r is writer else ""
    spec_path = "yes" if "specs/limiter.md" in norm(r["prompt"]) else "no"
    print(
        f"-- audit: limiter dispatch: #{r['pos']} {r['cls']}{scored} | limiter in {r['where']}"
        f" | criteria {len(criteria_present(r['prompt']))}/3 | spec path in prompt: {spec_path}"
        f" | description: {r['description'][:80]!r}"
    )

print(f"-- audit: not top-level: {NOT_TOP_LEVEL}")

tier = []
for r in records:
    if r["cls"] == "unreadable":
        continue
    n = norm(r["prompt"])
    if "model" in r["call"] or "model:" in n or has_word(n, ("haiku", "sonnet", "opus")):
        tier.append(f"#{r['pos']}")
print(f"-- audit: model tier: {', '.join(tier) if tier else 'none'}")

errors = []
for i, b in enumerate(blocks[:-1]):
    if b.startswith("[Tool: Bash]") and "arcforge" in b:
        m = re.match(r"\[Result: Bash\] error(?: \(exit (\d+)\))?", blocks[i + 1])
        if m:
            cmd = b[len("[Tool: Bash]"):].strip().splitlines()[0][:140]
            errors.append(f"exit {m.group(1) or '?'} <- {cmd}")
print(f"-- audit: arcforge errors: {'none' if not errors else len(errors)}")
for e in errors[:10]:
    print(f"-- audit: arcforge errors: {e}")

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

sys.exit(0 if a1 else 1)
PY

## Trials
5

## Version
1
