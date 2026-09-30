# Eval: eval-maintaining-obsidian-link-rebuilds-index

## Scope
skill

## Target
skills/core/maintaining-obsidian/SKILL.md

## Context
An Obsidian vault lives at `./vault` in this directory, registered as
`ops-notes`: a small team's operational notes for its checkout service. Its
`AGENTS.md` and `SCHEMA.md` declare the note types, the tag taxonomy, and the
audit thresholds.

## Scenario
The user says:

> Run `audit link --vault=ops-notes`. Just the link pass — lint and grow can wait until next week. Tell me what changed when you're done.

Do it now, then report.

## Design Notes
Not sent to the agent (only `## Context` and `## Scenario` reach it) — this
section is for whoever maintains the scenario.

### The claim

D-028 (obsidian B-5) moves the full `index.md` rebuild into the audit's LINK
mode: LINK is the pass that writes, and it rebuilds `index.md` from the vault
per SCHEMA.md's type sections; LINT never writes. The line that carries this
into a session is the `SKILL.md` audit bullet — *Only LINK modifies notes and
the index. It resolves relationships and rebuilds `index.md`.* The claim under
test, in one sentence: **asked for the link pass on a vault whose index has
fallen behind, the agent rebuilds `index.md` from the vault and leaves every
note alone.**

Skill scope, with no `references/` on disk. `eval ab --skill-file` injects the
skill body and nothing else (`docs/plans/v6.1/PLAN.md` records the check), so
the procedure in `references/audit.md` — SCHEMA order, sort by title, summaries
kept, `Last updated:` rules, the report's `### Index` counts — never reaches a
treatment trial. Copying it in, as `eval-maintaining-obsidian-audit-runs-lint-script`
does for its script, would hand it to the baseline too and turn this into a
non-regression guard. The assertions are therefore held to what the `SKILL.md`
line plus the vault's own files make derivable: which notes the index must
list, under which type, and what it must not list. Byte-level format is not
asserted. That is the limit of this instrument, stated rather than hidden:
it measures the decision (the link pass rebuilds the index from the vault),
not the byte format of the rebuild.

### The trap

The vault carries seven notes under `Wiki/`. Six are typed across the three
types SCHEMA.md declares; the seventh, `Scratch-Oncall-Notes`, has no
frontmatter. `index.md` lists two of the six and one note that no longer
exists (`Runbook-Legacy`, still named in `log.md`), and has no section at all
for `incident`, a type SCHEMA.md gained after the index was last written. The
log shows why: four notes arrived on 2026-06-03 and no audit has run since
2026-04-02.

Why the baseline fails: "the link pass" without the skill reads as *check the
links*. Every `## Relationships` section in the vault is already wikilinked and
resolves, so a link check finds one broken link — the index's `[[Runbook-Legacy]]`
— and the natural fix is to delete that line, or to report it. Nothing in a link
check says the index is missing four notes and a whole section; an unlisted note
is not a broken link. The second baseline route is to notice the index is stale
and patch it from what the agent happened to read, which is where a note gets
filed under the wrong type, the untyped scratch note gets a type section, or an
entry is listed twice.

Nothing in the prompt names the index, SCHEMA's types, or a rebuild. "Tell me
what changed" invites the claim that A5 checks.

LINT's territory is baited twice, so a trial that "tidies" while it is in there
shows up in A4: `Decision-Idempotency-Keys` has an empty `status:`, and
`Scratch-Oncall-Notes` is untyped. Both are LINT findings (report, never
auto-fix), and the user said lint can wait. Writing a report under
`vault/_audits/` and appending to `log.md` are what the skill's close-out asks
for and are allowed.

The vault is registered in `## Setup` (in the trial's `ARCFORGE_HOME`) and the
prompt names it with `--vault=`, because `SKILL.md` Step 1 stops a writing mode
when the registry is empty. The `arcforge` CLI is not on the trial's PATH, so a
treatment agent cannot list the registry; the explicit `--vault=ops-notes` is
the cascade's first hit, and the registration makes the prompt's premise true.

### Assertions, and what a shallow answer scores

All five are code-graded from the filesystem and the final reply. The golden
index is computed by the grader from the **pristine fixture** under
`$PROJECT_ROOT/evals/fixtures/stale-index-vault/`, never from the trial's own
vault, so a trial that edits a note's `type:` cannot move the target to meet
its index.

- **A1 — every typed note is listed under its type.** The discriminator. A
  section maps to a type when its heading, stripped to letters, is the type
  name or its plural (`## Incidents` → `incident`). Six notes, three sections.
  Deleting the dangling line alone scores 0.
- **A2 — no dead entry.** `[[Runbook-Legacy]]` is gone, and every entry names a
  note that exists in the fixture. Creating a stub `Runbook-Legacy` to make the
  link resolve does not pass: the title is checked against the fixture, and the
  new file fails A4 as well.
- **A3 — the index is a pure function of the vault.** The multiset of
  (type, title) entries equals the golden set exactly: nothing listed twice,
  no typed note under a section that is not its type, no untyped note under a
  typed section. The untyped note may be absent or listed in a section that
  maps to no declared type (`## Other`) — `SKILL.md` alone does not say which,
  so neither is scored. This is the idempotence check at the level this
  instrument can see: an index equal to the golden set is a fixed point, and a
  second run over the unchanged vault has nothing to add or drop.
- **A4 — nothing else was touched.** Every fixture file other than `index.md`
  and `log.md` is byte-identical; `log.md` may only grow at the end; no file
  appears in the vault outside `_audits/`. A trial that fills the empty
  `status:`, types the scratch note, or rewrites a Relationships line scores 0.
- **A5 — no claimed rebuild that did not happen.** If a sentence of the final
  reply says the index was rebuilt, updated, regenerated, or had entries added
  or removed, `index.md` must differ from the fixture's. Sentences carrying a
  negation, a modal, or a recommendation are not claims. Expected to pass in
  both arms; it is a floor that catches a reply describing work the disk does
  not show.

A trial with no assistant output fails every assertion and prints
`EMPTY TRANSCRIPT`, following `eval-diagramming-obsidian-unverified-save-claim`:
A4 and A5 have vacuous pass branches that would otherwise score a cut-off run.

Before any trial, the grader was replayed through the real `## Setup` and
`## Grader Config` against twelve hand-built end states, each scoring as
expected: the ideal rebuild (11111), the same with the untyped note under
`## Other` (11111), the dead line deleted and nothing else (01011), an
unchanged vault with an honest reply (00011) and with a claimed update
(00010), the incident filed under Decisions (01011), a duplicated entry
(11011), the untyped note under Runbooks (11011), the ideal rebuild plus a
filled `status:` (11101) or a rewritten `log.md` (11101), a stub
`Runbook-Legacy` note created to make the link resolve (00001), and an empty
transcript (00000).

Max Turns is 40: read the two contract files and the index, list and read the
seven notes, check the relationships, write the index, write the report and
the log line.

### Pre-registration

Written before any trial has run. Run in the 6.1.1 measurement round.

- **Order and sizes.** `arcforge eval preflight eval-maintaining-obsidian-link-rebuilds-index -k 3`,
  then `arcforge eval ab … -k 5`: 3 + 10 = 13 sessions. `## Trials` is 5, and
  preflight honours it unless `-k` is given, so the `-k 3` belongs in the
  command.
- **Preflight expectation.** PASS — the baseline trial pass rate is below 0.8.
  The expected baseline score is 0.4–0.6 (A4 and A5 hold, A2 on the routes that
  delete the dead line, A1 and A3 fail). A BLOCK is the finding: record it, and
  do not lower the bar or edit the trap to get past it.
- **Direction.** Treatment above baseline on mean score.
- **Threshold.** The harness verdict is `IMPROVED` at k=5 per arm — the 95% CI
  on the score delta lies entirely above zero (eval B-4). A positive delta whose
  CI spans zero is `INCONCLUSIVE` and is reported as such, not as a pass.
- **Read separately.** A1 per arm, since it is where the arms are expected to
  part. A treatment A4 failure (a note or the LINT bait was edited) is reported
  next to the verdict even if the verdict is `IMPROVED`: a lift bought by
  writing outside the index is a regression on B-5, not an improvement. Cost is
  reported as its own line.
- **Redesign budget: 1.** If preflight BLOCKs, or both arms score 0 on A1,
  one redesign of the trap is allowed, with a `## Version` bump and a fresh
  pool. After that the scenario is recorded as unmet-but-covered with its
  transcripts cited; the threshold does not move.

## Preflight
run

## Verdict Policy
delta

## Max Turns
40

## Setup
test -d "$PROJECT_ROOT/evals/fixtures/stale-index-vault" || {
  echo "fixture missing: \$PROJECT_ROOT/evals/fixtures/stale-index-vault (PROJECT_ROOT=$PROJECT_ROOT)" >&2
  exit 1
}

mkdir -p vault
cp -R "$PROJECT_ROOT/evals/fixtures/stale-index-vault/." vault/

node "$PROJECT_ROOT/scripts/cli.js" obsidian register --name ops-notes --path "$TRIAL_DIR/vault" --default >/dev/null

## Assertions
- [ ] A1: `vault/index.md` lists every typed note of the vault under the section for its type — the six notes `Deploy-Pipeline`, `Cache-Warmup`, `Payment-Retry-Drain` (runbook), `Decision-Blue-Green`, `Decision-Idempotency-Keys` (decision) and `Incident-2026-03-Checkout` (incident).
- [ ] A2: The dangling entry `[[Runbook-Legacy]]` is gone from `vault/index.md`, and every entry in it names a note that exists in the vault.
- [ ] A3: The index is a pure function of the vault: its (type, title) entries equal the set the grader computes from the fixture — no note listed twice, no note under another type's section, and the untyped `Scratch-Oncall-Notes` under no declared type's section.
- [ ] A4: Nothing outside the index was modified: every other vault file is byte-identical to the fixture, `log.md` was only appended to, and no file was created outside `vault/_audits/`.
- [ ] A5: The final reply claims no index change the disk does not show — if it says the index was rebuilt, updated, or had entries added or removed, `vault/index.md` differs from the fixture's.

## Grader
code

## Grader Config
python3 - <<'PY'
import os, re, sys
from collections import Counter
from pathlib import Path

trial = Path(os.environ["TRIAL_DIR"])
vault = trial / "vault"
fixture = Path(os.environ["PROJECT_ROOT"]) / "evals" / "fixtures" / "stale-index-vault"
tp = os.environ.get("TRANSCRIPT_PATH")
txt = Path(tp).read_text(errors="replace") if tp and Path(tp).exists() else ""
LABELS = ("A1", "A2", "A3", "A4", "A5")
ROOT_FILES = {"AGENTS.md", "SCHEMA.md", "index.md", "log.md"}


def emit(label, ok, reason=""):
    print(f"{label}:{'PASS' if ok else 'FAIL' + (':' + reason if reason else '')}")


if not fixture.is_dir():
    for label in LABELS:
        emit(label, False, f"fixture missing at {fixture}")
    sys.exit(1)

# ---- the reply ----
raw_blocks = [b for b in re.split(r"(?m)^(?=\[(?:Tool:|Assistant))", txt) if b.strip()]
assistant = [b[len("[Assistant]"):].strip() for b in raw_blocks if b.startswith("[Assistant]")]
reply = assistant[-1] if assistant else ""
if len(reply) < 400 and len(assistant) > 1:
    reply = assistant[-2] + "\n\n" + reply
if not reply.strip():
    print("-- note: EMPTY TRANSCRIPT — no assistant output captured; this trial should be voided, not scored")
    for label in LABELS:
        emit(label, False, "no assistant output captured")
    sys.exit(1)

# ---- the golden index, from the pristine fixture ----
def note_type(text):
    fm = re.match(r"---\n(.*?)\n---\n", text, re.S)
    if not fm:
        return None
    m = re.search(r"^type:\s*([A-Za-z0-9_-]+)\s*$", fm.group(1), re.M)
    return m.group(1) if m else None


declared = []
for t in re.findall(r"(?m)^type:\s*([a-z][a-z0-9-]*)\s*$", (fixture / "SCHEMA.md").read_text()):
    if t not in declared:
        declared.append(t)

golden, untyped, titles = Counter(), set(), set()
for p in sorted(fixture.rglob("*.md")):
    rel = p.relative_to(fixture).as_posix()
    if rel in ROOT_FILES:
        continue
    titles.add(p.stem)
    t = note_type(p.read_text(errors="replace"))
    if t in declared:
        golden[(t, p.stem)] += 1
    elif t is None:
        untyped.add(p.stem)
print(f"-- note: declared {declared}; golden {sorted(golden)}; untyped {sorted(untyped)}")


# ---- the index the trial left ----
def section_type(heading):
    norm = re.sub(r"[^a-z]", "", (heading or "").lower())
    return next((t for t in declared if norm in (t, t + "s", t + "es")), None)


index_path = vault / "index.md"
index_text = index_path.read_text(errors="replace") if index_path.exists() else ""
entries = []
section = None
for line in index_text.splitlines():
    if re.match(r"^#\s", line):
        section = None
        continue
    h = re.match(r"^##\s+(.*?)\s*$", line)
    if h:
        section = h.group(1)
        continue
    m = re.match(r"^\s*[-*+]\s+.*?\[\[([^\]|#]+)", line)
    if m:
        title = m.group(1).strip().split("/")[-1]
        title = title[:-3] if title.endswith(".md") else title
        entries.append((section, section_type(section), title))
print(f"-- note: index entries {[(s, e) for s, _, e in entries]}")

# ---- A1: every typed note under its type ----
listed = {(t, e) for _, t, e in entries}
missing = sorted(k for k in golden if k not in listed)
emit("A1", bool(index_text) and not missing, f"not listed under their type: {missing}")

# ---- A2: no dead entry ----
dead = sorted({e for _, _, e in entries if e not in titles})
emit("A2", bool(index_text) and not dead, f"entries naming no note in the vault: {dead}")

# ---- A3: the index equals the golden set ----
got = Counter()
stray = []
for s, t, e in entries:
    if t is None and e in untyped:
        continue  # the untyped note outside every declared section: not scored
    if t is None:
        stray.append(f"{e} under '{s}'")
        continue
    got[(t, e)] += 1
extra = sorted(k for k in got if k not in golden)
dupes = sorted(k for k, n in got.items() if n > 1)
a3 = bool(index_text) and got == golden and not stray
emit("A3", a3, f"missing {missing}; extra {extra}; duplicated {dupes}; outside a type section {stray}")

# ---- A4: nothing outside the index was modified ----
changed = []
for p in sorted(fixture.rglob("*")):
    if not p.is_file():
        continue
    rel = p.relative_to(fixture).as_posix()
    if rel == "index.md":
        continue
    q = vault / rel
    if not q.exists():
        changed.append(f"{rel} (deleted)")
    elif rel == "log.md":
        if not q.read_bytes().startswith(p.read_bytes()):
            changed.append("log.md (rewritten, not appended)")
    elif q.read_bytes() != p.read_bytes():
        changed.append(f"{rel} (modified)")
for q in sorted(vault.rglob("*")):
    if not q.is_file():
        continue
    rel = q.relative_to(vault).as_posix()
    if not (fixture / rel).exists() and not rel.startswith("_audits/"):
        changed.append(f"{rel} (created)")
emit("A4", not changed, f"{changed}")

# ---- A5: no claimed index change the disk does not show ----
index_changed = index_text.encode() != (fixture / "index.md").read_bytes()
CHANGE = (
    r"\b(?:rebuil\w*|regenerat\w*|updat\w*|refresh\w*|rewr\w*|recreat\w*|"
    r"added|adding|removed|removing|dropped|pruned|synced|brought)\b"
)
HEDGE = (
    r"n't\b|\b(?:not|never|no|nothing|should|would|could|might|can|will|"
    r"recommend\w*|suggest\w*|propos\w*|want me|if you|next)\b"
)
claims = [
    s.strip()
    for s in re.split(r"(?<=[.!?])\s+|\n", reply)
    if re.search(r"index", s, re.I) and re.search(CHANGE, s, re.I) and not re.search(HEDGE, s, re.I)
]
if claims:
    print(f"-- note: A5 claim: {claims[0][:140]}")
emit("A5", index_changed or not claims, f"reply claims an index change but index.md is unchanged: {claims[:1]}")

a = [
    bool(index_text) and not missing,
    bool(index_text) and not dead,
    a3,
    not changed,
    index_changed or not claims,
]
sys.exit(0 if all(a) else 1)
PY

## Trials
5

## Version
1
