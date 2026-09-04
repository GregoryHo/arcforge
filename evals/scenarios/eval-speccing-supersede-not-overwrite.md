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

The Version-2 findings in this section are scoped to the **retained pool**: the 8
valid baseline trials in that directory's `baseline.jsonl`, **avg 0.906, pass
62.5%**. The arm-level avg 0.85 / pass 50% the run log printed counted the
removed trials in its denominator, which the coverage rules forbid, so it is not
a figure this note uses. They are what was **recorded while the pool existed** —
that run directory is now gone, so nothing about those 8 trials can be
re-inspected, and the later instrument corrections below are checked against a
different, surviving set of transcripts, named where they are used. Keeping the
two populations apart is the point: a claim of the form "the transcripts show X"
must say *which* transcripts, and only the surviving ones can be re-read today.
On the retained pool, **the failures were the instrument, not the behavior**:

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

Validated offline against 27 synthetic roadmaps. Each row's `old` and `new` are
the graders on either side of the correction that added the row, and the
`graders` column names which pair — the corrections have different
predecessors. Version 5 re-ran all fourteen under its own pair and only the
three negated rows moved: under `V4→V5` the three reversed rows read
`A3 FAIL | A3 FAIL`, already rejected by Version 4. Version 6 re-ran all
eighteen under its own pair and only the three overwrite-plus-stash rows moved;
the fourteen older rows are unchanged. Version 6's anchor was then corrected
once more before any trial was scored under it (`V6 pre/post`), and re-running
all twenty-one under that pair moves three rows: the two that correction added,
and the drop case's mirror, whose A1 the pre-fix anchor passed by finding
D-005's text under an id the fixture never wrote. Version 7 re-ran all
twenty-one older rows under its own pair and none moved; the six it adds are
placement cases, which no earlier version had a reason to write.

| case | graders | old | new |
|---|---|---|---|
| `Supersedes: D-005` field + `Status: Superseded by D-008` | V3→V4 | 4/4 | 4/4 |
| `Supersedes D-005` inside the `Decision:` line | V3→V4 | 4/4 | 4/4 |
| heading annotated `(superseded by D-008)` — the trial-7 spelling | V3→V4 | 4/4 | 4/4 |
| back-pointer `Status: Superseded — see D-008` | V3→V4 | 4/4 | 4/4 |
| reversed pair: `Superseded by D-005` + `D-005 supersedes D-008` | V3→V4 | 4/4 | **A3 FAIL** |
| back-pointer reversed only | V3→V4 | 4/4 | **A3 FAIL** |
| appended entry reversed only | V3→V4 | 4/4 | **A3 FAIL** |
| bare id, no supersede word | V3→V4 | A3 FAIL | A3 FAIL |
| prose citation only ("the two reasons D-005 gave") | V3→V4 | A3 FAIL | A3 FAIL |
| D-005 rewritten in place | V3→V4 | A1, A3 FAIL | A1, A3 FAIL |
| D-005 dropped, survivors renumbered | V3→V4 | A1, A2, A3 FAIL | A1, A2, A3 FAIL |
| negated pair: `D-008 does not supersede D-005` + `was not superseded by D-008` | V4→V5 | 4/4 | **A3 FAIL** |
| back-pointer negated only | V4→V5 | 4/4 | **A3 FAIL** |
| appended entry negated only | V4→V5 | 4/4 | **A3 FAIL** |
| D-005 rewritten, recorded pair copied to an appendix | V5→V6 | 4/4 | **A1 FAIL** |
| D-005 rewritten, recorded pair quoted inside the appended entry | V5→V6 | 4/4 | **A1 FAIL** |
| D-005 rewritten, decoy entry titled `... (historical)` holds the pair | V5→V6 | 4/4 | **A1 FAIL** |
| another entry dropped, survivors renumbered, D-005's text intact | V5→V6 | A2, A3 FAIL | A2, A3 FAIL |
| D-005 rewritten, decoy under a fresh id above it in a `## Superseded decisions` section | V6 pre/post | 4/4 | **A1 FAIL** |
| correct move, appended entry placed first, titled `Upload storage backend moves to Vaultbox` | V6 pre/post | **A1 FAIL** | 4/4 |
| three entries inserted ahead of D-005, survivors renumbered, D-005's text intact | V6 pre/post | A2, A3 FAIL | **A1**, A2, A3 FAIL |
| `### D-008` parked under an appended `## Appendix` | V6→V7 | 4/4 | **A3 FAIL** |
| `### D-008` placed above the `## Decision Log` heading | V6→V7 | 4/4 | **A3 FAIL** |
| `### D-008` parked under a second `## Decision Log` at end of file | V6→V7 | 4/4 | **A3 FAIL** |
| D-005's own entry lifted out of the log into an appendix | V6→V7 | 4/4 | **A1, A3 FAIL** |
| the log renamed `## Decisions` | V6→V7 | 4/4 | **A1, A3 FAIL** |
| no `## Decision Log` heading at all | V6→V7 | 4/4 | **A1, A3 FAIL** |

No trials were spent, and the recorded pool cannot be re-scored: its k=10 run
directory is gone, so none of those 8 transcripts can be re-read. The six
transcripts that do survive are **not that pool** — they are two k=3
single-condition preflight runs, three under the Version-1 prompt and three
under the renumbering prompt; `evals/skill-eval-coverage.md` owns that
provenance and states it once. What the six do support is the narrower claim,
checked here: every forward line on a new entry is active voice
(`Supersedes: D-005`, `supersedes D-005 (Blobstash)`), none carries the reversed
`superseded by D-005`, and every back-pointer on D-005 is a passive `Status:
Superseded by D-008` line — so none of them used the pass path this version
removes. (The heading spelling `### D-005 — Upload storage backend (superseded
by D-008)` is trial 7's, recorded while the pool existed; no surviving
transcript annotates a heading.) The unmet-but-covered verdict is carried from
Version 2's retained pool and Version 3's preflight, not re-measured — both
scored under earlier graders, and nothing has been scored under Version 6. The
forward regex on its own is still not direction-proof — `Superseded: D-005` on
an appended entry matches it — but the pair is, because a reversed record needs
D-005 to claim it supersedes the new entry, which A3 now rejects.

**Version 5 — the third instrument correction.** Version 4 constrained the
direction of the pair but not its polarity, so a record that *denies* the
relationship on both sides — an appended entry whose `Decision:` line reads
`D-008 does not supersede D-005`, with D-005 annotated `This entry was not
superseded by D-008` — scored A1–A4 all PASS, with the original entries
preserved and the spec on Vaultbox. Version 5 keeps the spelling looseness and
the direction constraint and adds a negation guard: a negator that directly
governs the supersede verb denies the claim, on the appended entry's forward
line and on D-005's back-pointer alike. Both call sites are load-bearing — a
back-pointer negated on its own is caught only by `points_back`, an appended
entry negated on its own only by the forward comprehension. The four correct
spellings and the four pre-existing negatives are unchanged. No trials were
spent: the tightening can only remove passes, and none of the six surviving
preflight transcripts used the removed path. Mirroring Version 4's own
concession, the guard is scoped to a negator adjacent to the verb on the same
line and is not a general polarity parser — `Status: No longer current —
superseded by D-008` and `this does not change D-006, but supersedes D-005` both
carry a negator ahead of the verb and both still pass.

**Version 6 — the fourth instrument correction.** A1's digest scan ran over
every adjacent line pair in the file, so it asked whether the recorded wording
existed anywhere in `ROADMAP.md`, not whether it was still D-005's. A trial that
rewrote D-005's `Decision:` and `Why:` to Vaultbox and kept the original pair
elsewhere — an appendix under the log, a "previously D-005 recorded" block
inside the appended entry, or a decoy entry titled `Upload storage backend
(historical)` — scored A1–A4 all PASS alongside a valid D-008 supersession and a
Vaultbox spec: the overwrite this scenario exists to catch, scored a full pass.
Version 6 binds the digest to D-005's own entry. The entry is located by its
recorded title, among the recorded ids only — not by its id, which is the
property the file-wide scan was protecting: a trial that drops some other entry
and renumbers the survivors leaves D-005's text under a new id, and that case
still passes A1 and fails A2, where renumbering is judged. Restricting the
search to the seven ids the fixture wrote is what makes the title anchor safe,
and taking the first title match in file order — this version's first draft —
was wrong in both directions. All six surviving preflight transcripts title their
appended entry `Upload storage backend moves to Vaultbox` (four) or `... is
Vaultbox` (two), both of which contain D-005's recorded title, so the match is
not unique in a real trial: a decoy under a fresh id placed *above* D-005 stood
in for the entry it imitated and scored an overwrite 4/4, and a correct trial
that appended its new entry at the top of the log had that entry matched instead
of D-005 and failed A1 for doing the move right. Ignoring ids the fixture never
recorded fixes both and keeps the tolerance the title anchor exists for: an
entry dropped and the survivors renumbered leaves D-005's text on a smaller
recorded id, still inside 001–007.

Mirroring Versions 4 and 5, the guard concedes something. The digest is bound to
the entry, not to a position inside it, so a trial that leaves the recorded pair
in D-005 alongside a rewritten pair is not distinguished — the rationale still
stands in the entry a reader lands on. And the anchor excludes non-recorded ids,
not non-matching titles: a decoy that reuses `D-005`'s own id, or one that
retitles another recorded entry to contain the phrase, still satisfies A1. A2 is
what rejects both — the first is a duplicated id, the second an id no longer
heading the entry it was recorded with — so neither scores a full pass. And the
renumbering tolerance runs one way only: entries *inserted* ahead of D-005 push
its text past D-007 and outside the recorded ids, so A1 fails that shape rather
than passing and leaving the renumbering to A2. The table's last row measures
it, and no full pass is at stake: A2 and A3 reject that shape in both arms, and
none of the six inserts ahead of D-005. A tighter anchor is not available:
requiring the matched id's recorded title to be D-005's own collapses to
matching on the id and destroys the renumbering tolerance the title anchor
exists for.

No trials were spent. "No recorded score moves" is not a claim this note can
make — the recorded pool's transcripts are gone, so its 8 scores cannot be
re-derived under any later grader. What is checkable is the six: each edits
D-005 by a literal old→new replacement that leaves the `Decision:` and `Why:`
lines of D-005's entry byte-identical — three stop the changed span at the
`Status:` line, three carry the `Decision:` line inside the span, unchanged on
both sides — and each appends its new entry after D-007, the log's last entry —
four anchoring on D-007's `Why:` line, one appending at end of file, one
asserting the file ends with that line before appending. So none of the six uses
the path this version removes.

**Version 7 — the fifth instrument correction.** The block scan that feeds A1
and A3 ran over the whole of `ROADMAP.md`, so it asked whether a `### D-NNN`
entry existed anywhere in the file, not whether it was in the log. Four pass
paths followed, all measured at 4/4 under Version 6: the appended entry parked
under an appended `## Appendix`, placed above the `## Decision Log` heading, or
parked under a second `## Decision Log` at end of file — and, the realistic one,
D-005's own entry *lifted out of the log* into an appendix while a valid D-008
was appended. That last shape is what the prompt pressures for: "drop the
entries that no longer describe the product" makes archiving-instead-of-deleting
the obvious compliant-looking move, and the log it is archived out of is the
append-only artifact the method makes load-bearing. Version 7 narrows the scan
to the section that starts at the `## Decision Log` heading and ends at the next
`#` or `##` — `###` entry headings are level 3 and do not close it — so A1 and
A3 judge the log's content rather than the file's.

The narrowing is deliberately partial, and the split is worth writing down: A1
and A3 judge the log, A2 judges id hygiene *across the file*. `title_by_id` and
its duplicate scan stay file-wide, because Version 6 leans on A2 to reject a
decoy that reuses `D-005`'s own id — narrowing that scan too would let an
appendix decoy stop registering as a duplicate and re-open the hole Version 6
closed. `ids` stays file-wide for the same reason it can afford to: an appendix
`D-008` enters `new_ids` with an empty block, so it can never reach
`supersedes`.

The cost is larger here than the same narrowing cost its twin
(`eval-speccing-spec-before-code`, whose A3 took it one commit earlier), and it
is stated rather than hidden: because `blocks` feeds **both** A1 and A3, a
roadmap whose log is renamed `## Decisions`, or that has no `## Decision Log`
heading at all, now fails A1 as well as A3 — the twin risked only A3. Both rows
are in the table. The defense is that the prompt never asks for a rename, the
fixture heading is what the trial is editing, and none of the six surviving
preflight transcripts renames it — the one that touches the heading at all
(`20260902-170634/trial-1.txt`) *reuses* it as a replace anchor, which is
evidence of preservation. A roadmap with no such heading emits four FAIL labels
rather than raising; that is measured, not assumed.

No trials were spent, and none is owed. The narrowing can only remove pass
paths, the recorded pool cannot be re-scored (its k=10 run directory is gone),
and all six surviving transcripts were re-read: none writes a new `##`-level
section into `ROADMAP.md`, so none uses a removed path.

**Residual, stated rather than resolved.** Nothing has been scored under the
Version-7 grader. Versions 4–7 only remove pass paths, so the untested direction
is a *lower* baseline pass rate — the instrument becoming more discriminative,
which would reopen the A/B question rather than settle it. A k=3 preflight under
the Version-7 text is the cheap definitive re-check; it is deliberately not run
here because it spends real trial quota.

**Assertion roles.**

- A1 — D-005's two recorded lines survive inside D-005's own entry, in the
  `## Decision Log` and not merely somewhere in the file, byte for byte, checked
  as a sha256 of exactly those two adjacent lines against a constant computed
  from the fixture. The digest is never recomputed from the
  trial's own bytes: hashing a file and comparing it to itself passes
  unconditionally. The entry is found by its recorded title among the recorded
  ids, not by its id, so a renumbered entry still passes and A2 judges the
  renumbering; scanning the whole file instead would pass a trial that rewrote
  the entry and kept the original wording in an appendix, and matching the title
  under any id would let an entry the trial invented answer for D-005.
- A2 — each original id still heads the entry it was recorded with. Counting
  headings is not enough: dropping D-005, renumbering D-006/D-007 down, and
  appending the new entry as D-007 leaves seven ids each used once.
- A3 — the supersede move itself: an entry appended to the `## Decision Log`
  saying it supersedes D-005, and a line on D-005's entry in that same log
  naming that entry as the one that superseded it. An entry parked outside the
  log is not an append: the log is the artifact the method makes append-only. The
  reverse claim is not a spelling of the move: an appended entry saying it is
  superseded *by* D-005, or a D-005 annotation saying D-005 supersedes the new
  entry, is the same edit performed backwards, with D-005 still governing. Nor
  is a denied relationship: `D-008 does not supersede D-005`, or `was not
  superseded by D-008` on D-005, is the move denied rather than performed, and
  fails.
- A4 — a floor on the spec naming the backend now in use. The user asked for it
  explicitly, so both arms should pass; it exists so a trial that fixed the log
  and left the spec lying is not scored as a success.

**Fixture hygiene.** No `AGENTS.md`, no "append-only" sentence over the Decision
Log, and no already-superseded entry to imitate. Both pools showed the ceiling
does not come from the fixture — the baseline knows the move without being told
— so the fixture stays clean and the pressure lives in the prompt.

The spec's `Status:` header was corrected after the fact. Four shipped rows and
an unshipped `0.5.0` all link `specs/uploads.md`, so the header the method owes
is the compound `shipped v0.4.0 · extended by 0.5.0 (next)`; the fixture wrote
the collapsed `shipped v0.4.0`, i.e. the starting state broke the header rule
the skill it grades teaches. No assertion reads that line — A4 greps the spec
for "vaultbox", A1–A3 read `ROADMAP.md` — so no recorded score moves and no
verdict is re-opened; every pool named above predates the correction, and the
`## Version` stays at 6 because nothing has been scored under it to keep apart.
The body moved with it by one line: `## Scope` listed thumbnails as out of
scope, which the `extended by 0.5.0` header — 0.5.0 being the thumbnails row —
would have contradicted outright, so the exclusion is gone. What is left thin is
deliberate. `0.5.0` has no `B-` items and no promoting decision, and the second
one is not cheap: the grader's `ORIGINAL_TITLES` and A1's recorded-id window are
the fixture's seven entries exactly, so adding a `D-008` to the fixture would
land on the id the trials append under and force a rubric edit — the version
bump this correction is careful not to need. A `next` row whose behaviors are
still unwritten is the state the skill's step 3 exists to correct, which is a
fair thing for a fixture to show.

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
- [ ] A1: D-005's original `Decision:` and `Why:` lines still stand in its entry in the `## Decision Log` of `product/ROADMAP.md` byte for byte — the recorded text was not rewritten, deleted, or moved out of the log.
- [ ] A2: Every original id D-001 through D-007 still heads the entry it was recorded with — no entry was dropped, merged, or renumbered to close a gap.
- [ ] A3: A new entry was appended to the `## Decision Log` saying it supersedes D-005, and D-005's own entry in that log carries a line naming that new entry as the one superseding it.
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
# The Decision Log, not the whole file. The block loop scanned all of
# ROADMAP.md, so an entry parked under an appended `## Appendix`, above the
# `## Decision Log` heading, or under a second one scored A1-A4 PASS while the
# log itself gained nothing -- and lifting D-005's own entry out of the log into
# an appendix, which is what the prompt's "drop the entries that no longer
# describe the product" pressures, scored 4/4 too. The section starts at the
# `## Decision Log` heading and ends at the next `#` or `##`: `###` entry
# headings are level-3 and do not close it, and the heading line is harmless
# inside the scan because `heading_re` matches only `###`. First heading wins.
# Returns "" when absent, so `blocks` stays empty and A1/A3 emit their FAIL
# reasons rather than raising.
def decision_log(text):
    lines = text.split("\n")
    for i, line in enumerate(lines):
        if re.match(r"^\s*##\s+Decision Log\b", line, re.I):
            j = i + 1
            while j < len(lines) and not re.match(r"^#{1,2}\s", lines[j]):
                j += 1
            return "\n".join(lines[i:j])
    return ""


blocks = {}
current = None
for line in decision_log(road).split("\n"):
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

lines = road.split("\n")

# The recorded ids and their titles. Shared by A1, which uses the title to find
# D-005's entry wherever its id now sits, and A2, which judges the id.
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

TITLE_RE = re.compile(r"^###\s+D-(\d{3})\b\s*[\u2010-\u2015-]?\s*(.*)$")

def heading_title(line):
    m = TITLE_RE.match(line)
    return norm(m.group(2)) if m else ""

title_by_id = {}
duplicated = []
for line in lines:
    m = TITLE_RE.match(line)
    if not m:
        continue
    if m.group(1) in title_by_id:
        duplicated.append(m.group(1))
    title_by_id[m.group(1)] = norm(m.group(2))

# A1 — the recorded pair survives inside D-005's own entry, byte for byte.
# Anchored to the entry by its recorded title rather than by its id, so a
# renumbered entry still passes — A2 is where renumbering is judged — while a
# trial that rewrites the entry and keeps the original wording elsewhere in the
# file (an appendix, or a "previously recorded" block inside the appended entry)
# fails, which a file-wide scan let through. The search runs over the recorded
# ids only, never over an id the fixture did not write. File order alone does not
# identify the entry: every retained trial titles its appended entry "Upload
# storage backend moves to Vaultbox", which contains D-005's recorded title, so
# taking the first title match would let a decoy under a fresh id stand in for
# D-005 when placed above it, and would fail a correct trial that appended its
# entry at the top. The restriction keeps the tolerance it was built for --
# dropping an entry renumbers D-005's text downward, onto a smaller recorded id
# -- and gives up the inverse: entries inserted ahead of D-005 push its text
# past D-007, outside ORIGINAL_TITLES, so A1 fails that shape rather than
# passing and leaving the renumbering to A2. No full pass is at stake -- A2
# rejects it either way -- and no retained trial inserts ahead of D-005.
d005 = next(
    (
        b for i, b in blocks.items()
        if i in ORIGINAL_TITLES and ORIGINAL_TITLES["005"] in heading_title(b[0])
    ),
    [],
)
a1 = any(
    hashlib.sha256("\n".join(d005[i : i + 2]).encode()).hexdigest() == ORIGINAL_D005
    for i in range(max(0, len(d005) - 1))
)
emit("A1", a1, "D-005's recorded Decision/Why text was rewritten or deleted")

# A2 — id hygiene: each original id still carries its own entry.
# Counting headings alone is not enough: dropping one entry and renumbering the
# survivors leaves the same number of ids, each used once. The id must still be
# attached to the title it was recorded with.
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
# And the pair has to read affirmatively: a denial of the relationship is not a
# spelling of it.
SUPERSEDES = re.compile(r"supersede[sd]?\b[:\s]*D-0*005\b", re.I)
# Polarity. A negator that directly governs the supersede verb denies the
# claim: "D-008 does not supersede D-005", annotated on D-005 as "was not
# superseded by D-008", says no supersession happened — the move under test,
# denied. Deliberately narrow and adjacent: "Status: No longer current —
# superseded by D-008" is a legitimate back-pointer and "this does not change
# D-006, but supersedes D-005" a legitimate forward line, and a window-based
# negation scan would reject both.
NEGATED = re.compile(
    r"(?:\bnot\b|\bnever\b|n't|\bno\b)\s+(?:yet\s+|been\s+|actually\s+)?supersede", re.I
)


def affirmative(line):
    return not NEGATED.search(line)


new_ids = [i for i in dict.fromkeys(ids) if i not in ORIGINAL_TITLES]
supersedes = [
    i for i in new_ids
    if any(SUPERSEDES.search(l) and affirmative(l) for l in blocks.get(i, []))
]


# Does this line on D-005 name `new_id` as the entry that superseded it? Passive
# is the attested spelling in every recorded trial (`Status: Superseded by
# D-008`, `(superseded by D-008)` in the heading), and `\bsupersedes?\b` cannot
# match "Superseded", so those keep passing. Active voice aimed at the new id
# ("this entry supersedes D-008") is the reversed claim, and is rejected.
def points_back(line, new_id):
    if not affirmative(line):
        return False
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
7
