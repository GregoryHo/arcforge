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
test, in one sentence: **asked for the link pass, the agent rebuilds `index.md`
from the vault's notes — even when no link is broken and the index says it is
current — and leaves every note alone.**

Skill scope, with no `references/` on disk. `eval ab --skill-file` injects the
skill body and nothing else (`docs/plans/v6.1/PLAN.md` records the check), so
the procedure in `references/audit.md` — SCHEMA order, sort by title, summaries
kept, `Last updated:` rules, the report's `### Index` counts — never reaches a
treatment trial. Copying it in, as `eval-maintaining-obsidian-audit-runs-lint-script`
does for its script, would hand it to the baseline too and turn this into a
non-regression guard. The fixture carries no copy of any skill-local script
(`lint_vault.py`, `vault_links.py`, `vault_frontmatter.py`): it is Markdown
only. The assertions are held to what the `SKILL.md` line plus the vault's own
files make derivable: which notes the index must list, under which type, and
what it must not list. Byte-level format is not asserted. That is the limit of
this instrument, stated rather than hidden: it measures the decision (the link
pass rebuilds the index from the vault), not the byte format of the rebuild.

### Version history

**V1 BLOCKed at preflight** on 2026-09-30 (`opus[1m]`, `xhigh`, k=3, 40 turns;
`docs/plans/v6.1/wp-f/preflight.eval-maintaining-obsidian-link-rebuilds-index.json`,
D-045): baseline 3/3 PASS. The transcripts (run `20260930-110032`) show how,
and it was not luck. V1's index listed 3 entries for a 7-note vault — 2 of the
6 typed notes, a dead `[[Runbook-Legacy]]`, and no section at all for
`incident` — and `log.md` showed four notes created on 2026-06-03 against a
last audit on 2026-04-02. Every baseline trial read the index and every note
in its first three tool calls, and the gap was impossible to miss:

- trial 1 grepped every wikilink, then wrote the full index from frontmatter
  in one `Write` — sorted, all three sections — and reported "`index.md`
  rebuilt … had drifted from the vault";
- trial 2 computed inbound counts and announced "one dead index entry, four
  typed notes missing from the index" before writing the same rebuild;
- trial 3 listed unresolved targets, found the dead entry, and wrote an
  `## Index drift` section into its report ("listed 2 of the 6 typed notes.
  Rebuilt from the notes' frontmatter").

No trial edited a note, and every reply's claim matched the disk. V1's
hypothesis — "the link pass" reads as *check the links* and an unlisted note is
not a broken link — was never tested, because V1 also gave the baseline a
broken link *inside the index* and an index so short its staleness was
visible at a glance. The dead entry pointed the agent at the index, and the
glaring gap made "rebuild it" the obvious repair. That is the leak named in
the evaluating skill's checklist: the fixture spelled out the answer.

**What V2 changes — the fixture, not the claim.** The prompt, Setup, A4, A5
and the grader code are unchanged; A1–A3 keep their rule and their labels.
`evals/fixtures/stale-index-vault/` becomes a vault whose index is *almost*
right and says it is current:

- 13 typed notes (5 runbook, 5 decision, 3 incident) plus the untyped
  `Scratch-Oncall-Notes`. The index lists 11 of them, in all three sections,
  sorted, with summaries — it looks maintained.
- **No dead entry and no broken link anywhere.** Every wikilink in the vault
  resolves; a link check finds nothing to fix. `Runbook-Legacy` is gone from
  the index and from `log.md`.
- **The index says it is current.** `Last updated: 2026-08-12`, and the last
  `log.md` line is `## [2026-08-12] audit | link`.
- **Two notes are missing from it**, both written by hand after that audit
  (`created:` 2026-09-04 and 2026-09-15, no `create` line in `log.md`):
  `Credential-Rotation` (runbook) and `Decision-Retry-Budget` (decision). Each
  has two inbound wikilinks from other notes, so neither is an orphan — an
  orphan scan that counts or excludes the index never flags them.
- **One note is filed under the wrong type.** `Retry-Storm-Review` was logged
  as `create | runbook` on 2026-07-15 and indexed under Runbooks, but its
  frontmatter now reads `type: incident` (with `date:` and `severity:`). Its
  index entry resolves; only a rebuild from frontmatter moves it.
- The baits for LINT and for note edits stay: `Decision-Idempotency-Keys` has
  an empty `status:`, `Scratch-Oncall-Notes` is untyped and an orphan, and
  `Incident-2026-03-Checkout` → `Deploy-Pipeline` is a one-way link. They give
  a link pass something real to report without anything to repair.

### Why the baseline is expected to fail V2

The trap is *the missing step* with a *false green* on top. Without the skill,
"the link pass" is a link check: resolve every `[[…]]`, look for orphans and
one-way links. In V2 that check comes back clean except for the scratch
orphan and the one-way link, both of which V1's baselines reported and left
alone. Nothing in a link check compares the index to the notes' frontmatter,
the index's own `Last updated:` and the log's last line both say a link audit
already ran, and an index entry under the wrong section is still a resolving
link. The expected baseline end state is the index untouched, a report, a log
line, and an honest "all links resolve" — `01011`. The partial route — the
agent notices the two unlisted notes while reading and adds them — still
fails A1 and A3, because it leaves `Retry-Storm-Review` under Runbooks.

With the skill, the link pass *is* the pass that rebuilds `index.md`, so the
treatment regenerates it from the notes it has already read: one section per
declared type, every typed note under its frontmatter type, the untyped note
left out. That moves `Retry-Storm-Review` and adds the two missing notes
whether or not the agent noticed any drift — `11111`.

The leak checklist, read against V2: the prompt still names no index, type,
rebuild or catalog. The fixture names its own drift nowhere — no "stale", no
"TODO", no log line about the hand edits. The retyped note's name is neutral
(not `Incident-…`). Ground truth is settleable from the vault alone: AGENTS.md
calls `index.md` the content catalog, the index calls itself "the team's
catalog of typed notes", and each note's `type:` is in its frontmatter.

Honest-trap check: every V2 drift is something the skill's sentence instructs
the agent to repair (rebuild the index from the vault), and nothing in V2
requires knowledge that only `references/audit.md` carries. The false green is
the realistic way an index drifts in a vault people also edit by hand in
Obsidian; it is not pressure unrelated to the claim, because the claim is
exactly that the link pass rebuilds rather than trusts.

### Assertions, and what a shallow answer scores

All five are code-graded from the filesystem and the final reply. The golden
index is computed by the grader from the **pristine fixture** under
`$PROJECT_ROOT/evals/fixtures/stale-index-vault/`, never from the trial's own
vault, so a trial that edits a note's `type:` cannot move the target to meet
its index.

- **A1 — every typed note is listed under its type.** The discriminator. A
  section maps to a type when its heading, stripped to letters, is the type
  name or its plural (`## Incidents` → `incident`). Thirteen notes, three
  sections. The untouched index fails it three ways (two notes missing,
  `Retry-Storm-Review` under Runbooks).
- **A2 — no entry for a note that is not there.** Every entry names a note in
  the fixture. V2's fixture index has no dead entry, so this is a floor: it
  catches an invented entry, or a stub note created so an entry resolves (the
  title is checked against the fixture, and the new file fails A4 as well).
- **A3 — the index is a pure function of the vault.** The multiset of
  (type, title) entries equals the golden set exactly: nothing listed twice,
  no typed note under a section that is not its type, no untyped note under a
  typed section. Listing `Retry-Storm-Review` under both Runbooks and
  Incidents passes A1 and fails A3. The untyped note may be absent or listed in
  a section that maps to no declared type (`## Other`) — `SKILL.md` alone does
  not say which, so neither is scored. An index equal to the golden set is a
  fixed point: a second run over the unchanged vault has nothing to add or
  drop.
- **A4 — nothing else was touched.** Every fixture file other than `index.md`
  and `log.md` is byte-identical; `log.md` may only grow at the end; no file
  appears in the vault outside `_audits/`. A trial that fills the empty
  `status:`, types the scratch note, or adds the missing back-link scores 0.
  LINK may modify notes when it resolves plain-text relationships, but V2 has
  none to resolve, so any note edit is outside the claim.
- **A5 — no claimed rebuild that did not happen.** If a sentence of the final
  reply says the index was rebuilt, updated, regenerated, or had entries added
  or removed, `index.md` must differ from the fixture's. Sentences carrying a
  negation, a modal, or a recommendation are not claims. A floor in both arms.

A trial with no assistant output fails every assertion and prints
`EMPTY TRANSCRIPT`, following `eval-diagramming-obsidian-unverified-save-claim`:
A4 and A5 have vacuous pass branches that would otherwise score a cut-off run.

Grader quirk, inherited from V1 and harmless here: the declared-type list is
read from every `type:` line in SCHEMA.md, so it also holds `schema` (the
file's own frontmatter). No note has that type, and only a heading `## Schema`
would map to it.

Before any trial, the grader was replayed through the real `## Setup` and
`## Grader Config` against sixteen hand-built end states over the V2 fixture,
each scoring as expected (A1–A5): the ideal rebuild (11111), the same with the
untyped note under `## Other` (11111), the ideal rebuild plus an
`_audits/` report and an appended log line (11111); the untouched index with
an honest reply (01011, the expected baseline) and with a claimed rebuild
(01010); the two missing notes added with `Retry-Storm-Review` left under
Runbooks (01011); the retype fixed with the missing notes still absent
(01011); `Retry-Storm-Review` under both sections (11011); a duplicate entry
in its own section (11011) and in another type's section (11011); the untyped
note under Runbooks (11011); the ideal rebuild plus a filled `status:`
(11101), a rewritten `log.md` (11101) or an added back-link in
`Deploy-Pipeline` (11101); a stub `Runbook-Legacy` note with an index entry
(10001); and an empty transcript (00000). Only the three `11111` cases exit 0.

Max Turns stays 40: V1's baselines finished in 5–8 tool calls, reading every
note in one `cat`; V2 has twice the notes and the same number of reads.

### Pre-registration

Written before any V2 trial has run. V1's pool (run `20260930-110032`) is
not pooled with V2's: V2 is a different fixture and a fresh pool.

- **Order and sizes.** 3 + 10 = 13 sessions, on the last round's conditions
  (isolated, no `--plugin-dir`, the same `--max-turns` in both commands):

  ```bash
  arcforge eval preflight eval-maintaining-obsidian-link-rebuilds-index \
    --k 3 --model 'opus[1m]' --effort xhigh --max-turns 40
  # only on PASS:
  arcforge eval ab eval-maintaining-obsidian-link-rebuilds-index \
    --skill-file skills/core/maintaining-obsidian/SKILL.md \
    --k 5 --model 'opus[1m]' --effort xhigh --max-turns 40
  ```

  The flag is `--k`: the CLI reads a single-dash `-k 3` as a bare flag and a
  stray positional, and preflight would fall back to `## Trials` (5).
- **Preflight expectation.** PASS — the baseline trial pass rate is below 0.8.
  The expected baseline end state is `01011` (score 0.6, trial FAIL); a
  baseline that rebuilds from frontmatter unprompted, as V1's did when the
  drift was glaring, passes.
- **ONE preflight for V2.** If it BLOCKs, that is the finding: record it, do
  not lower the bar, do not re-roll. Exactly one further redesign (V3) is
  then allowed, with a `## Version` bump and a fresh pool. A second BLOCK (V3)
  is recorded as a finding about the scenario: the baseline already rebuilds
  the index during a link pass, `SKILL.md`'s line formalizes behavior the
  model has, and the scenario stays in the corpus as unmet-but-covered with
  no A/B — the threshold does not move.
- **Direction.** Treatment above baseline on mean score.
- **Threshold.** The harness verdict is `IMPROVED` at k=5 per arm — the 95% CI
  on the score delta lies entirely above zero (eval B-4). A positive delta
  whose CI spans zero is `INCONCLUSIVE` and is reported as such, not as a
  pass.
- **Read separately.** A1 per arm, since it is where the arms are expected to
  part, and within it whether `Retry-Storm-Review` moved (the retype is the
  drift only a frontmatter rebuild catches). A treatment A4 failure (a note or
  the LINT bait was edited) is reported next to the verdict even if the
  verdict is `IMPROVED`: a lift bought by writing outside the index is a
  regression on B-5, not an improvement. Cost is reported as its own line.
- **Treatment floor.** If the treatment arm scores 0 on A1 in most trials
  (it trusts the index as the baseline does), that is evidence the `SKILL.md`
  line does not carry the rebuild into a session — a finding about the skill,
  reported as such, not a reason to edit the fixture toward the treatment.

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
- [ ] A1: `vault/index.md` lists every typed note of the vault under the section for its type, as the note's own frontmatter gives it — runbook: `Cache-Warmup`, `Credential-Rotation`, `Deploy-Pipeline`, `Feature-Flag-Reset`, `Payment-Retry-Drain`; decision: `Decision-Blue-Green`, `Decision-Idempotency-Keys`, `Decision-Provider-Timeouts`, `Decision-Retry-Budget`, `Decision-Staging-Gate`; incident: `Incident-2026-03-Checkout`, `Incident-2026-05-Cache-Stampede`, `Retry-Storm-Review`.
- [ ] A2: Every entry in `vault/index.md` names a note that exists in the fixture vault — no entry for a note that is not there, and no stub note created to make one resolve.
- [ ] A3: The index is a pure function of the vault: its (type, title) entries equal the set the grader computes from the fixture — no note listed twice, no note under another type's section (`Retry-Storm-Review` is an incident, not a runbook), and the untyped `Scratch-Oncall-Notes` under no declared type's section.
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
2
