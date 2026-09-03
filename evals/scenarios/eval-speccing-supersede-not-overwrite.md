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
> Thursday. Get the decision record straight before it does: D-005 still tells
> everyone we store uploads in Blobstash, and I do not want the next person
> reading it and wiring Blobstash back up.
>
> While you are in there, tidy the log up. It has grown a lot of history nobody
> reads — drop the entries that no longer describe the product we ship, and
> renumber what is left so it runs D-001 upward with no gaps. Same for the
> uploads spec: it should not still be promising Blobstash.

Do the work now, then summarize what you changed in at most 8 lines.

Constraints:
- You may run shell commands and read, write, edit, or move files.
- Work only inside this project directory.

## Design Notes
Not sent to the agent (only `## Context` and `## Scenario` are).

**Why the baseline fails.** The user asks for two things. The first — stop the
log saying Blobstash — is what the method is for. The second is a tidy-up that
the method forbids: dropping entries that no longer describe the product, and
renumbering the survivors so the ids run without gaps. Both are stated as one
request by someone who owns the repo, and the entry most obviously "no longer
describing the product we ship" is D-005 itself, the one being reversed. An
agent without the skill has an explicit instruction, a plausible reason, and
nothing telling it that ids are load-bearing.

They are: a dropped entry takes its rationale with it, and a renumbered id
silently repoints every citation of it — the spec's `## Decisions` list, older
entries, commit messages, PR bodies. The skill's rule is that ids are never
renumbered and never reused, and that reversal is an append plus one flipped
line. The right answer here is to do the first half, refuse the second, and say
why in a sentence.

**Measurement history: Version 1, Version 2, and why the grader changed at
Version 3.**

*Version 1* put no pressure on the log's structure; it asked only for the record
to stop saying Blobstash. Across 8 baseline trials the baseline **did the
supersede move correctly on its own** — its first planning line was "Plan:
supersede D-005 rather than rewrite it, add D-008 for Vaultbox", and D-005's
recorded text survived in every trial. The only assertion it failed was the
spelling of the flipped status line: it wrote `Status: Superseded by D-008 on
2026-09-03.` where the grader demanded `Superseded-by: D-008`. That is
conformance to a token the fixture never states, so the Version-1 delta would
have measured spelling.

*Version 2* moved the pressure into the prompt — drop the entries that no longer
describe the product, renumber the survivors — and relaxed the status-line
spelling. It was run at k=10
(`evals/results/eval-speccing-supersede-not-overwrite/20260902-171249/`) and the
run hit a session limit part way through: the whole treatment arm is void and its
`treatment.jsonl` is deleted, and two baseline trials went with it. What was
removed, and why, is recorded once — in `evals/skill-eval-coverage.md`, which
owns the pool's provenance — and is not re-told here.

Everything below is scoped to the **retained pool**: the 8 valid baseline trials
in that directory's `baseline.jsonl`, **avg 0.906, pass 62.5%**. The arm-level
avg 0.85 / pass 50% the run log printed counted the removed trials in its
denominator, which the coverage rules forbid, so it is not a figure this note
uses. On the retained pool, **the failures were the instrument, not the
behavior**:

- Trials 1 and 4 failed A3 while doing the move correctly. They wrote
  `supersedes D-005` inside the new entry's `Decision:` or `Status:` line;
  the grader demanded the literal field `Supersedes: D-005`.
- Trial 7 failed A2 while doing the move correctly. It annotated the heading
  (`### D-005 — Upload storage backend (superseded by D-008)`); the grader
  compared headings for equality.
- All eight refused the renumbering trap, in their own words: *"Renumbering would
  break the spec's D-references and make 'D-005' mean different things in old
  commits versus the log, which is the exact confusion you want to avoid."*

*Version 3* is that grader, fixed: A2 checks containment rather than equality,
and A3 accepts any wording that puts "supersede" next to the id — a field, a
clause inside the `Decision:` line, a heading annotation — rather than one
literal token. The claim, the
prompt, the fixture and the four assertions are unchanged — this is an
instrument correction, not a third design. The `## Version` bump exists to keep
the old-grader pool out of any future one, per the pooling rule in
`evals/skill-eval-coverage.md`.

**What that predicts, pre-registered.** Re-scoring the retained Version-2
baseline pool under the corrected grader flips trials 1, 4 and 7 to 1.0 and
changes nothing else, i.e. **8/8**. Preflight is therefore expected to BLOCK on
a baseline ceiling. That is the finding, not a failure of the fixture: **an agent
that can see a decision log already knows the ADR discipline, and the skill
teaches it nothing it was going to get wrong.** The scenario ships as corpus
coverage (unmet-but-covered) with these transcripts cited, and no A/B is run
against an instrument that has nothing left to discriminate.

**Version 4 — the second instrument correction.** Version 3's A3 took the
supersession phrase in either direction, and that was a false-pass path rather
than looseness: a trial that appends D-008 with `Status: Superseded by D-005`
and annotates D-005 with `This entry supersedes D-008` scored A1–A4 all PASS —
a full pass for the move performed backwards, D-005 left governing. Version 4
keeps the spelling looseness and constrains the direction. The appended entry
must say it *supersedes* D-005 (the `by` reading is gone), and D-005's
back-pointer must name the new entry as the one that superseded it — passive
`Status: Superseded by D-008`, a heading annotation, or `Status: Superseded —
see D-008` — not as an entry D-005 supersedes.

Validated offline against 11 synthetic roadmaps, old grader against new:

| case | old | new |
|---|---|---|
| `Supersedes: D-005` field + `Status: Superseded by D-008` | 4/4 | 4/4 |
| `Supersedes D-005` inside the `Decision:` line | 4/4 | 4/4 |
| heading annotated `(superseded by D-008)` — the trial-7 spelling | 4/4 | 4/4 |
| back-pointer `Status: Superseded — see D-008` | 4/4 | 4/4 |
| reversed pair: `Superseded by D-005` + `D-005 supersedes D-008` | 4/4 | **A3 FAIL** |
| back-pointer reversed only | 4/4 | **A3 FAIL** |
| appended entry reversed only | 4/4 | **A3 FAIL** |
| bare id, no supersede word | A3 FAIL | A3 FAIL |
| prose citation only ("the two reasons D-005 gave") | A3 FAIL | A3 FAIL |
| D-005 rewritten in place | A1, A3 FAIL | A1, A3 FAIL |
| D-005 dropped, survivors renumbered | A1, A2, A3 FAIL | A1, A2, A3 FAIL |

No trials were spent, and the recorded pools are not re-scored: `evals/results/`
is gitignored and only the transcripts survive. What those transcripts do
support is the narrower claim, checked here: every forward line on a new entry
in the six retained transcripts is active voice (`Supersedes: D-005`,
`supersedes D-005 (Blobstash)`) and every back-pointer on D-005 is passive
(`Status: Superseded by D-008`, `### D-005 — Upload storage backend (superseded
by D-008)`), so none of them used the pass path this version removes. The
unmet-but-covered verdict is carried from Version 2's retained pool and Version
3's preflight, not re-measured. The forward regex on its own is still not
direction-proof — `Superseded: D-005` on an appended entry matches it — but the
pair is, because a reversed record needs D-005 to claim it supersedes the new
entry, which A3 now rejects.

**Assertion roles.**

- A1 — D-005's two recorded lines survive somewhere in the file, byte for byte,
  checked as a sha256 of exactly those two adjacent lines against a constant
  computed from the fixture. The digest is never recomputed from the trial's own
  bytes: hashing a file and comparing it to itself passes unconditionally.
- A2 — each original id still heads the entry it was recorded with. Counting
  headings is not enough: dropping D-005, renumbering D-006/D-007 down, and
  appending the new entry as D-007 leaves seven ids each used once.
- A3 — the supersede move itself: an appended entry saying it supersedes D-005,
  and a line on D-005 naming that entry as the one that superseded it. The
  reverse claim is not a spelling of the move: an appended entry saying it is
  superseded *by* D-005, or a D-005 annotation saying D-005 supersedes the new
  entry, is the same edit performed backwards, with D-005 still governing.
- A4 — a floor on the spec naming the backend now in use. The user asked for it
  explicitly, so both arms should pass; it exists so a trial that fixed the log
  and left the spec lying is not scored as a success.

**Fixture hygiene.** No `AGENTS.md`, no "append-only" sentence over the Decision
Log, and no already-superseded entry to imitate. Both pools showed the ceiling
does not come from the fixture — the baseline knows the move without being told
— so the fixture stays clean and the pressure lives in the prompt.

**Redesign budget spent (1 of 1) at Version 2.** No further redesign is
attempted; chasing a new trap after seeing the numbers is what the
pre-registration exists to prevent.


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
- [ ] A1: D-005's original `Decision:` and `Why:` lines still stand in `product/ROADMAP.md` byte for byte — the recorded text was not rewritten or deleted.
- [ ] A2: Every original id D-001 through D-007 still heads the entry it was recorded with — no entry was dropped, merged, or renumbered to close a gap.
- [ ] A3: A new entry was appended saying it supersedes D-005, and D-005's own entry carries a line naming that new entry as the one superseding it.
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

# sha256 of D-005's two recorded lines exactly as the fixture wrote them,
# joined by a newline. A constant: recomputing it from the trial file would
# compare the file to itself and pass unconditionally.
ORIGINAL_D005 = "924995e82e73c24e6587338e115b80837b198d1d9fc6bd3e1c47b9c35eed11e8"

def emit(label, ok, reason=""):
    print(f"{label}:{'PASS' if ok else 'FAIL' + (':' + reason if reason else '')}")

road = roadmap.read_text(errors="replace") if roadmap.exists() else ""
spec_text = spec.read_text(errors="replace") if spec.exists() else ""

heading_re = re.compile(r"^###\s+D-(\d{3})\b", re.M)
ids = heading_re.findall(road)

# An entry's lines, heading included: a back-pointer written into the heading
# ("D-005 - Upload storage backend (superseded by D-008)") says the same thing
# as one written into the Status line, and neither is the behavior under test.
blocks = {}
current = None
for line in road.split("\n"):
    m = heading_re.match(line)
    if m:
        current = m.group(1)
        blocks.setdefault(current, [line])
        continue
    if current is not None:
        if line.startswith("### "):
            current = None
        else:
            blocks[current].append(line)

# A1 — the recorded pair survives somewhere in the file, byte for byte.
# Scanned as adjacent line pairs rather than looked up under D-005, so a
# renumbered entry still passes: A2 is where renumbering is judged.
lines = road.split("\n")
a1 = any(
    hashlib.sha256("\n".join(lines[i : i + 2]).encode()).hexdigest() == ORIGINAL_D005
    for i in range(max(0, len(lines) - 1))
)
emit("A1", a1, "D-005's recorded Decision/Why text was rewritten or deleted")

# A2 — id hygiene: each original id still carries its own entry.
# Counting headings alone is not enough: dropping one entry and renumbering the
# survivors leaves the same number of ids, each used once. The id must still be
# attached to the title it was recorded with.
ORIGINAL_TITLES = {
    "001": "files are opaque blobs",
    "002": "a link addresses an upload by random id",
    "003": "share links expire by default",
    "004": "quota is per account, not per link",
    "005": "upload storage backend",
    "006": "uploads stream, never buffer",
    "007": "no client-side encryption",
}

def norm(s):
    return re.sub(r"\s+", " ", re.sub(r"[\u2010-\u2015]", "-", s)).strip().lower()

title_by_id = {}
duplicated = []
for line in lines:
    m = re.match(r"^###\s+D-(\d{3})\b\s*[\u2010-\u2015-]?\s*(.*)$", line)
    if not m:
        continue
    if m.group(1) in title_by_id:
        duplicated.append(m.group(1))
    title_by_id[m.group(1)] = norm(m.group(2))

# Containment, not equality: annotating a heading ("... (superseded by D-008)")
# is not renumbering, and the assertion is about which entry an id still heads.
moved = [
    i for i, title in sorted(ORIGINAL_TITLES.items())
    if title not in title_by_id.get(i, "")
]
a2 = not moved and not duplicated
emit(
    "A2",
    a2,
    "ids dropped, renumbered or duplicated: "
    + ",".join("D-" + i for i in sorted(set(moved + duplicated))),
)

# A3 — the supersede move: an appended entry that says so, and a line on D-005
# pointing back at it. Spelling is deliberately loose — the fixture pins no
# token, so `Supersedes: D-005`, `supersedes D-005` inside the Decision line,
# and `Superseded by D-008` in a heading all count. Two constraints hold the
# pair together. The word has to sit next to the id: D-005 is cited in prose
# that does not supersede it ("the two reasons D-005 gave"), and a bare-id match
# would score that a pass. And the pair has to read forwards: an appended entry
# saying it is superseded *by* D-005, annotated on D-005 as an entry D-005
# supersedes, states the relationship backwards and leaves D-005 governing —
# the move under test, inverted, so it fails rather than scoring a full pass.
SUPERSEDES = re.compile(r"supersede[sd]?\b[:\s]*D-0*005\b", re.I)
new_ids = [i for i in dict.fromkeys(ids) if i not in ORIGINAL_TITLES]
supersedes = [i for i in new_ids if any(SUPERSEDES.search(l) for l in blocks.get(i, []))]


# Does this line on D-005 name `new_id` as the entry that superseded it? Passive
# is the attested spelling in every recorded trial (`Status: Superseded by
# D-008`, `(superseded by D-008)` in the heading), and `\bsupersedes?\b` cannot
# match "Superseded", so those keep passing. Active voice aimed at the new id
# ("this entry supersedes D-008") is the reversed claim, and is rejected.
def points_back(line, new_id):
    if not re.search(rf"\bD-0*{new_id}\b", line):
        return False
    if not re.search(r"supersede", line, re.I):
        return False
    return not re.search(rf"\bsupersedes?\b[:\s]*D-0*{new_id}\b", line, re.I)


a3 = any(
    any(points_back(l, int(i)) for l in blocks.get("005", []))
    for i in supersedes
)
emit("A3", a3, "no appended entry supersedes D-005, or D-005 never points at one")

# A4 — spec floor: the spec names the backend actually in use
a4 = "vaultbox" in spec_text.lower()
emit("A4", a4, "product/specs/uploads.md never names Vaultbox")

sys.exit(0 if all([a1, a2, a3, a4]) else 1)
PY

## Trials
5

## Version
4
