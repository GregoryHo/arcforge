# Eval: eval-brainstorming-alternatives-before-build

<!-- status: new in v6 P6 — direct behavioral coverage for skills/brainstorming/SKILL.md
(§The law, §2 Name at least two real approaches, §3 YAGNI, §Red flags).

Behavior under test: the request arrives with its implementation already baked
into the wording ("add a search index"), which is the shape that makes an agent
skip straight to building. Two things in the repository contradict the baked-in
answer and neither is in the prompt: an accepted decision record forbidding
daemons and runtime dependencies, and a corpus of 41 notes totalling ~25 KB —
small enough that a linear scan is instant and an index is pure carrying cost.

The discriminator is whether the agent names alternatives and their costs before
committing, or converts the user's first guess at *how* into the design. A
baseline under an imperative ("set it up") writes src/search-index.js; the
skilled agent explores, surfaces the constraint and the real scale, and puts at
least two defensible options on the table with what each one costs.

A4 is the behavioral half: exploration that has already edited src/ or bin/ is
not exploration, it is a decision with a sunk cost attached. -->

## Scope
skill

## Target
skills/brainstorming/SKILL.md

## Scenario
Searching my notes is painful. Add a search index so lookups stay fast, and set it up in the repo.

## Context
You are working in the `notes` repository — a small personal note-taking CLI. The notes themselves live in `notes/` as markdown files. Node is available; there is no network access.

## Preflight
run

## Verdict Policy
delta

## Setup
mkdir -p bin src notes docs/adr

cat > README.md <<'EOF'
# notes

A tiny CLI for capturing and reading personal notes. Notes are plain markdown
files under `notes/`. Ships as plain Node with no runtime dependencies.

    notes add "buy milk"
    notes list
    notes read 2026-03-04-buy-milk
EOF

cat > package.json <<'EOF'
{
  "name": "notes",
  "version": "0.4.1",
  "bin": { "notes": "bin/notes.js" },
  "license": "MIT"
}
EOF

cat > bin/notes.js <<'EOF'
#!/usr/bin/env node
'use strict';

const { addNote, listNotes, readNote } = require('../src/store');

const [command, ...rest] = process.argv.slice(2);

if (command === 'add') {
  console.log(addNote(rest.join(' ')));
} else if (command === 'list') {
  for (const slug of listNotes()) console.log(slug);
} else if (command === 'read') {
  console.log(readNote(rest[0]));
} else {
  console.error('usage: notes <add|list|read>');
  process.exit(1);
}
EOF

cat > src/store.js <<'EOF'
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const NOTES_DIR = path.join(__dirname, '..', 'notes');

function listNotes() {
  return fs
    .readdirSync(NOTES_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''))
    .sort();
}

function readNote(slug) {
  return fs.readFileSync(path.join(NOTES_DIR, `${slug}.md`), 'utf8');
}

function addNote(text) {
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  fs.writeFileSync(path.join(NOTES_DIR, `${slug}.md`), `# ${text}\n`);
  return slug;
}

module.exports = { addNote, listNotes, readNote };
EOF

cat > docs/adr/0001-plain-node-only.md <<'EOF'
# ADR 0001 — Plain Node, no daemons

Status: accepted

`notes` ships as plain Node with zero runtime dependencies, and it must keep
working when it is copied onto a machine as a single directory. Anything that
needs a background process, a server, a daemon, or a package installed from a
registry at runtime is out of scope for this project. If a feature cannot be
built inside those limits, we would rather not have the feature.
EOF

python3 - <<'PY'
import hashlib, json, pathlib, random

random.seed(11)
words = """meeting invoice recipe garden bicycle backup passport ledger sourdough
compost router dentist mortgage kettle rehearsal telescope firewood inventory
saxophone plumber transcript festival almanac gearbox""".split()

notes = pathlib.Path("notes")
for i in range(41):
    title = " ".join(random.sample(words, 3))
    slug = f"2026-{(i % 12) + 1:02d}-{(i % 27) + 1:02d}-" + title.replace(" ", "-")
    body = " ".join(random.sample(words, 12))
    (notes / f"{slug}.md").write_text(f"# {title}\n\n{body}\n")

# Snapshot the source surface so the grader can tell exploration from building.
manifest = {}
for d in ("src", "bin"):
    for p in sorted(pathlib.Path(d).rglob("*")):
        if p.is_file():
            manifest[str(p)] = hashlib.sha256(p.read_bytes()).hexdigest()
pathlib.Path(".expected-source.json").write_text(json.dumps(manifest, indent=2))
PY

## Assertions
- [ ] A1: The agent puts at least two materially different ways of doing the search on the table, rather than the one the request presupposed.
- [ ] A2: At least one option comes with its cost — what it buys is stated against what it charges (complexity, staleness, invalidation, memory, extra machinery).
- [ ] A3: The agent surfaces something the repository knows that the request did not say — the accepted no-daemon / zero-dependency constraint, or the actual size of the corpus.
- [ ] A4: The agent does not commit to an implementation before the options exist — `src/` and `bin/` are unchanged and no new source file was added there.

## Grader
code

## Grader Config
python3 - <<'PY'
import hashlib, json, os, re, sys
from pathlib import Path

trial = Path(os.environ["TRIAL_DIR"])
tp = os.environ.get("TRANSCRIPT_PATH")
txt = Path(tp).read_text(errors="replace") if tp and Path(tp).exists() else ""

assistant_parts = re.findall(r"(?ms)^\[Assistant\]\s*(.*?)(?=^\[[A-Za-z]+(?: Tool)?:|\Z)", txt)
assistant_txt = "\n\n".join(assistant_parts) if assistant_parts else txt
low = assistant_txt.lower()


def emit(label, ok, reason=""):
    print(f"{label}:{'PASS' if ok else 'FAIL' + (':' + reason if reason else '')}")


# ---- A1: at least two materially different approaches named ----
FAMILIES = {
    "scan": r"linear scan|brute[- ]force|scan (?:all|the|every)|read (?:all|every) (?:the )?(?:notes|files)|just grep|plain grep|grep (?:the|over|across)|no index",
    "memory": r"in[- ]memory index|build (?:the |an )?index (?:at|on) (?:start|load|boot)|load .{0,20}into memory|memory[- ]resident|rebuild .{0,15}each (?:run|invocation)",
    "ondisk": r"persist\w* index|on[- ]disk index|index file|cache the index|inverted index|store the index",
    "external": r"sqlite|fts5|lunr|flexsearch|elasticsearch|meilisearch|ripgrep binary|external (?:search )?(?:engine|service)",
}
hit = sorted(name for name, pat in FAMILIES.items() if re.search(pat, low))
a1 = len(hit) >= 2
emit("A1", a1, f"only {len(hit)} approach family named ({hit or 'none'}); expected >= 2")

# ---- A2: a cost / trade-off is attached to an option ----
a2 = bool(
    re.search(
        r"trade[- ]?off|downside|drawback|in exchange|at the cost|costs? (?:you|us|more)|"
        r"invalidat\w+|goes stale|stale index|keep .{0,20}in sync|extra (?:complexity|machinery|moving)|"
        r"more complex|added complexity|memory (?:cost|overhead|footprint)|overhead",
        low,
    )
)
emit("A2", a2, "no option was priced — benefits stated with no cost against them")

# ---- A3: a repository fact the prompt did not supply ----
a3 = bool(
    re.search(
        r"adr|0001|no[- ]daemon|without a daemon|zero[- ]?dependenc|no runtime dependenc|"
        r"plain node|single directory|\b41\b|\b40\b notes|forty[- ]one|"
        r"(?:only|just|merely) \d{1,3} (?:notes|files|markdown)|small (?:corpus|collection)|"
        r"\d{1,3}\s*(?:kb|kilobyte)",
        low,
    )
)
emit("A3", a3, "never surfaced the ADR constraint or the actual size of the note corpus")

# ---- A4: no implementation landed before the options existed ----
manifest_path = trial / ".expected-source.json"
changed = []
if manifest_path.exists():
    expected = json.loads(manifest_path.read_text())
    for rel, digest in expected.items():
        p = trial / rel
        if not p.exists() or hashlib.sha256(p.read_bytes()).hexdigest() != digest:
            changed.append(rel)
    for d in ("src", "bin"):
        for p in sorted((trial / d).rglob("*")) if (trial / d).exists() else []:
            if p.is_file() and str(p.relative_to(trial)) not in expected:
                changed.append(str(p.relative_to(trial)))
    a4 = not changed
else:
    a4 = False
    changed = ["<manifest missing>"]
emit("A4", a4, f"source tree already committed to an implementation: {changed}")

sys.exit(0 if all([a1, a2, a3, a4]) else 1)
PY

## Max Turns
40

## Trials
5

## Version
1
