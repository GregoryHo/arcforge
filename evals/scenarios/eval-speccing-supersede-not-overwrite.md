# Eval: eval-speccing-supersede-not-overwrite

## Scope
skill

## Target
skills/core/speccing/SKILL.md

## Context
A small file-upload service. Its product intent lives in `product/`: a roadmap
table, a decision log of numbered entries, and one living spec per area under
`product/specs/`. The service is about to change storage vendors.

## Scenario
The user says:

> We're moving uploads off Blobstash onto Vaultbox — the migration branch lands
> Thursday. Get the decision record straight before it does. Right now D-005
> still tells everyone we store uploads in Blobstash, and I do not want the next
> person reading it and wiring Blobstash back up. Make sure the uploads spec is
> not still promising Blobstash either.

Do the work now, then summarize what you changed in at most 8 lines.

Constraints:
- You may run shell commands and read, write, edit, or move files.
- Work only inside this project directory.

## Design Notes
Not sent to the agent (only `## Context` and `## Scenario` are).

**Why the baseline fails.** The user asks for the record to stop saying
Blobstash and names the entry that says it. The cheapest way to satisfy that
sentence is to open D-005 and rewrite its `Decision:` and `Why:` to say
Vaultbox — one edit, and the log now reads exactly as the user asked. Nothing in
the fixture argues against it: the log carries no preamble stating an
append-only rule, there is no maintenance guide, and no entry in it has ever
been superseded, so there is no local precedent to copy. An agent without the
skill has an unambiguous instruction and no reason to refuse the shortest route
to it.

The skill's rule is the opposite move and costs more: append a new entry
carrying `Supersedes: D-005`, flip exactly one line on D-005, and leave its
recorded text alone. It satisfies the user's actual worry — a reader of D-005
sees `Superseded-by:` and does not wire Blobstash back up — while keeping why
Blobstash was chosen, which is the only thing that explains what the migration
is trading away.

The fixture deliberately withholds the rule. It has no `AGENTS.md`, no
"append-only" sentence over the Decision Log, and no superseded entry to imitate.
If the fixture stated the convention the treatment arm would be reading its own
answer off the disk, and the delta would measure reading comprehension.

Four consequences, all read off the filesystem by a code grader, so no assertion
can be talked into a pass by a confident summary:

- A1 is the discriminator — byte identity of D-005's recorded `Decision:` and
  `Why:` lines, checked as a sha256 of exactly those two lines against a digest
  computed from the fixture. Both lines are single lines in the fixture, so
  there is nothing an honest agent would need to re-wrap, and any rewrite,
  softening, or parenthetical "(now Vaultbox)" fails it.
- A2 is the other half of the same move: a new entry that names what it
  supersedes, and the one-line flip on the old entry that points back at it.
  Rewriting D-005 in place fails A2 as well as A1, which is the intended shape —
  the trap costs both.
- A3 is a floor on id hygiene (nothing renumbered, merged or deleted). An agent
  that edits D-005 in place still passes it, so it does not carry the delta.
- A4 is a floor on the spec (it names the backend the product now uses). The
  user asked for it explicitly, so both arms should pass; it exists so a trial
  that fixed the log while leaving the spec lying is not scored as a success.

The grader recomputes nothing from the trial's own file for A1 — the expected
digest is a constant. Hashing the trial file and comparing it to itself would
pass unconditionally.

## Preflight
run

## Verdict Policy
delta

## Setup
test -d "$PROJECT_ROOT/evals/fixtures/pileup-product" || {
  echo "fixture missing: \$PROJECT_ROOT/evals/fixtures/pileup-product (PROJECT_ROOT=$PROJECT_ROOT)" >&2
  exit 1
}

cp -R "$PROJECT_ROOT/evals/fixtures/pileup-product/." .

git init -q -b main
git config user.email fixture@example.com
git config user.name fixture
git add README.md package.json product src
git commit -q -m "pileup: product state at 0.4.0"

## Max Turns
30

## Assertions
- [ ] A1: `product/ROADMAP.md` still carries D-005's original `Decision:` and `Why:` lines byte for byte — the recorded entry was superseded, not rewritten.
- [ ] A2: A new decision entry was appended carrying `Supersedes: D-005`, and D-005's own `Status:` line now names that new entry as `Superseded-by:` — the reversal is an append plus one flipped line.
- [ ] A3: Every original id D-001 through D-007 still appears exactly once as a `### D-NNN` heading — nothing was renumbered, merged, or deleted.
- [ ] A4: `product/specs/uploads.md` names Vaultbox as the storage backend — the spec stopped promising a backend the product no longer uses.

## Grader
code

## Grader Config
python3 - <<'PY'
import hashlib, os, re, sys
from pathlib import Path

trial = Path(os.environ["TRIAL_DIR"])
roadmap = trial / "product" / "ROADMAP.md"
spec = trial / "product" / "specs" / "uploads.md"

# sha256 of D-005's two recorded lines exactly as the fixture wrote them.
# A constant, never recomputed from the trial file: hashing the trial's own
# bytes and comparing them to themselves would pass unconditionally.
ORIGINAL_D005 = "924995e82e73c24e6587338e115b80837b198d1d9fc6bd3e1c47b9c35eed11e8"

def emit(label, ok, reason=""):
    print(f"{label}:{'PASS' if ok else 'FAIL' + (':' + reason if reason else '')}")

road = roadmap.read_text(errors="replace") if roadmap.exists() else ""
spec_text = spec.read_text(errors="replace") if spec.exists() else ""

heading_re = re.compile(r"^###\s+D-(\d{3})\b", re.M)
ids = heading_re.findall(road)

blocks = {}
current = None
for line in road.split("\n"):
    m = heading_re.match(line)
    if m:
        current = m.group(1)
        blocks.setdefault(current, [])
        continue
    if current is not None:
        if line.startswith("### "):
            current = None
        else:
            blocks[current].append(line)

def lines_matching(block_id, pattern):
    return [l for l in blocks.get(block_id, []) if re.match(pattern, l)]

# A1 — D-005's recorded Decision/Why survived byte for byte
kept = lines_matching("005", r"^\s*-\s*(Decision|Why):")
a1 = hashlib.sha256("\n".join(kept).encode()).hexdigest() == ORIGINAL_D005
emit("A1", a1, "D-005's recorded Decision/Why text was rewritten or removed")

# A2 — an appended superseding entry plus the one-line flip on D-005
originals = {f"{n:03d}" for n in range(1, 8)}
new_ids = [i for i in dict.fromkeys(ids) if i not in originals]
supersedes = [
    i for i in new_ids
    if any(re.search(r"Supersedes:\s*D-005\b", l) for l in blocks.get(i, []))
]
status_lines = lines_matching("005", r"^\s*-?\s*Status:")
flipped = [
    i for i in supersedes
    if any(re.search(rf"Superseded-by:\s*D-{i}\b", l) for l in status_lines)
]
a2 = len(supersedes) >= 1 and len(flipped) >= 1
emit("A2", a2, "no appended entry supersedes D-005, or D-005's Status was never flipped to it")

# A3 — id hygiene floor: the seven originals are intact and unduplicated
a3 = all(ids.count(o) == 1 for o in sorted(originals))
emit("A3", a3, "an original D-id was renumbered, duplicated, merged or deleted")

# A4 — spec floor: the spec names the backend actually in use
a4 = "vaultbox" in spec_text.lower()
emit("A4", a4, "product/specs/uploads.md never names Vaultbox")

sys.exit(0 if all([a1, a2, a3, a4]) else 1)
PY

## Trials
5

## Version
1
