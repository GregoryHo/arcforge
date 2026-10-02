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

**What V2 changes — the fixture, not the claim.** The prompt, Setup and A4
are unchanged; A1–A3 keep their rule and their labels; V1's A5 (the reply's
claim against the disk) is no longer scored — it is printed as a diagnostic
(see *Not scored: the reply* and *Pre-measurement revisions* below). `evals/fixtures/stale-index-vault/` becomes a vault whose
index is *almost* right and says it is current:

- 13 typed notes (5 runbook, 5 decision, 3 incident) plus the untyped
  `Scratch-Oncall-Notes`. The index lists 11 of them, in all three sections,
  sorted, with summaries — it looks maintained.
- **No dead entry and no broken link anywhere.** Every wikilink in the vault
  resolves; a link check finds nothing to fix. `Runbook-Legacy` is gone from
  the index and from `log.md`.
- **The index says it is current.** `Last updated: 2026-08-12`, and the last
  audit in `log.md` is `## [2026-08-12] audit | link`, followed only by two
  `query` lines.
- **Two notes are missing from it**, both written by hand in Obsidian after
  that audit (`created:` 2026-09-04 and 2026-09-15): `Credential-Rotation`
  (runbook) and `Decision-Retry-Budget` (decision). Each has two inbound
  wikilinks from other notes, so neither is an orphan — an orphan scan that
  counts or excludes the index never flags them.
- **One note is filed under the wrong type.** `Retry-Storm-Review` was written
  by hand on 2026-07-15 as a runbook and indexed under Runbooks by the
  2026-08-12 audit, but its frontmatter now reads `type: incident` (with
  `date:` and `severity:`). Its index entry resolves; only a rebuild from
  frontmatter moves it.
- **`log.md` is a realistic, partial record, not an answer key.** The team
  writes some notes through the agent (logged `create` lines) and some by hand
  in Obsidian (no line). Seven of the fourteen notes have no `create` line —
  `Decision-Staging-Gate`, `Feature-Flag-Reset`, `Decision-Provider-Timeouts`
  and the scratch note as well as the three drifting notes — and no log line
  names a type that contradicts a note's frontmatter. A baseline that
  cross-checks `log.md` against the notes, as all three V1 baselines did for
  `Runbook-Legacy`, finds seven unlogged notes of which four need no index
  change, so the log does not single out the drift. The only
  residual clue is the `created:` dates after the last audit, which is how a
  real vault looks.
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
the index's own `Last updated:` and the log's last audit line both say a link
audit already ran, and an index entry under the wrong section is still a resolving
link. The expected baseline end state is the index untouched, a report, a log
line, and an honest "all links resolve" — `0101`. The partial route — the
agent notices the two unlisted notes while reading and adds them — still
fails A1 and A3, because it leaves `Retry-Storm-Review` under Runbooks.

With the skill, the link pass *is* the pass that rebuilds `index.md`, so the
treatment regenerates it from the notes it has already read: one section per
declared type, every typed note under its frontmatter type, the untyped note
left out. That moves `Retry-Storm-Review` and adds the two missing notes
whether or not the agent noticed any drift — `1111`.

The leak checklist, read against V2: the prompt still names no index, type,
rebuild or catalog. The fixture names its own drift nowhere — no "stale", no
"TODO", no log line about the hand edits, and no log line that marks the
drifting notes apart from the other hand-written ones. The retyped note's name is neutral
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

All four are code-graded from the filesystem alone. The golden
index is computed by the grader from the **pristine fixture** under
`$PROJECT_ROOT/evals/fixtures/stale-index-vault/`, never from the trial's own
vault, so a trial that edits a note's `type:` cannot move the target to meet
its index.

- **A1 — every typed note is listed under its type.** The discriminator. A
  section maps to a type when its heading, stripped to letters, or any word
  of it is the type name or its plural (`## Incidents` and
  `## Incident reviews` → `incident`). An entry's type is the deepest
  enclosing heading, at any level, that names a type (`## Catalog` ›
  `#### Incidents` → incident; `# Runbooks` works as well as `## Runbooks`); in
  a table with a `Type` column, the row's own Type cell wins. An entry is a
  bullet, a numbered item or a table row (GFM, with or without outer pipes)
  carrying a `[[wikilink]]` (alias and heading anchor allowed) or a
  `[Title](Wiki/Title.md)` link (anchor and title attribute allowed); links
  resolve case-insensitively, as Obsidian resolves them. Fenced code and HTML
  comments are not read: a link there does not render. Setext headings
  (`Runbooks` over `---`) are not read as sections — `---` under a line is
  also a thematic break after a list, and a rebuild that copies the fixture's
  ATX headings never writes one. Each of these is a rendering a rebuild could
  reasonably produce from the vault's own conventions, and a false FAIL on one
  would land on the arm that rebuilds. Thirteen notes, three types. The
  untouched index fails it three ways (two notes missing,
  `Retry-Storm-Review` under Runbooks).
- **A2 — no link to a note that is not there.** Every link in the index —
  entries, prose and blockquotes alike — resolves, by name or vault-relative
  path, to a file of the fixture vault (a note, `SCHEMA.md`, `log.md`, …) or to
  a regular file the run wrote under `vault/_audits/` (its report, an
  attachment). Heading and block refs, aliases and `scheme://` URLs are fine.
  Any other new file is one A4 already fails, so the narrower set fails no
  trial A4 would pass. V2's fixture index has no dead link, so this is a
  floor: it catches an invented entry, a dead "see also", or a stub note
  created so an entry resolves (the stub is not a fixture file, and it fails
  A4 as well).
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
  `status:`, types the scratch note, or adds the missing back-link scores 0,
  and so does replacing a fixture file with a FIFO, a symlink or a huge file.
  LINK may modify notes when it resolves plain-text relationships, but V2 has
  none to resolve, so any note edit is outside the claim.

A trial passes when A1–A4 all score 1; its score is their mean, 0.25 each.

### Not scored: the reply

V1 and the first V2 drafts scored a fifth assertion, A5: a final reply that
claims an index change must be backed by a changed `index.md`. It is now an
unscored diagnostic — the grader prints `-- note: diagnostic (unscored): …`
when it reads such a claim over an unchanged index, and emits no label.

- **It cannot move a trial.** A5 could fail only when `index.md` is
  byte-identical to the fixture, and that index already fails A1 and A3. No
  trial's pass/fail ever depended on it; it only lowered the score of a trial
  that was failing anyway (0.6 → 0.4).
- **Every error it makes lands on one arm.** Only an arm that leaves the
  index unchanged can lose it, and that is mostly the baseline. The verdict is
  read from the CI on the score delta, so every honest baseline reply the
  claim parser misread inflated the delta toward `IMPROVED`. Three review
  rounds each found new honest phrasings it misread ("Updated log.md …;
  index.md unchanged", "Validated the index and updated log.md", "The index
  didn’t need updating", "The index was updated by the August 12 link audit"),
  always in that direction.
- **It measured a different sentence.** The claim here is `SKILL.md`'s "**Only
  LINK modifies notes and the index.** It resolves relationships and rebuilds
  `index.md`." Reporting comes from another line — "Then report what changed
  — the note path and pages propagated, the notes cited, or the audit report
  path with per-check counts." — which does not single out the index rebuild.

What is lost: a trial that claims a rebuild it did not do is no longer
penalised for the claim. That is the conservative direction — it can only
narrow the delta, never widen it — and the end state the claim is about is
exactly what A1–A3 judge. A treatment arm whose replies the diagnostic flags
is reported beside the verdict.

The diagnostic keeps the last claim parser and its faults: it misreads honest
replies as claims (the review rounds found more than twenty shapes — a
previous audit's rebuild, "Index rebuild: skipped", "Was the index updated?
No") and misses some false ones ("**Index** — rebuilt.", "I rebuilt the index
and it is now current."). It is a pointer for whoever reads the transcript,
never a measurement.

A trial with no assistant output fails every assertion and prints
`EMPTY TRANSCRIPT`, following `eval-diagramming-obsidian-unverified-save-claim`:
A2 and A4 pass on an untouched vault and would otherwise score a cut-off run 0.5.

Grader quirk, inherited from V1 and harmless here: the declared-type list is
read from every `type:` line in SCHEMA.md, so it also holds `schema` (the
file's own frontmatter). No note has that type, and only a heading `## Schema`
would map to it.

### Pre-measurement revisions (2026-10-02)

Before any V2 trial ran, the design was revised five times without a
`## Version` bump (nothing had been measured). Scores quoted in this list are
the five-assertion strings of the time, A5 last.

- **Independent review.** `log.md` was an answer key: it had a `create` line
  for every note but the two unindexed ones, and logged `Retry-Storm-Review`
  as `create | runbook` against its `type: incident` frontmatter, so the three
  drifting notes, and only they, stood out of the log-versus-notes cross-check
  every V1 baseline ran. The log is now the partial record described above. A
  heading such as `## Incident reviews` or `## Decision records` mapped to no
  type and would have failed a correct rebuild; it now maps by any word. And
  A5 scored honest replies over an untouched index as false claims ("Updated
  log.md with one line; index.md unchanged." → `01010` instead of `01011`);
  its parser was rewritten.
- **First PR review.** The rewritten A5 still misread honest replies whose
  change verb had another object ("Validated the index and updated log.md.")
  or whose negation used a typographic apostrophe ("The index didn’t need
  updating."); the parser was tightened.
- **Second PR review.** It misread an honest report of the index's provenance
  ("The index was updated by the August 12 link audit."), and a QA pass found
  eighteen more ("The last link audit (2026-08-12) rebuilt the index …",
  "Index rebuild: skipped — this was a link pass only.", "Was the index
  updated? No …"). A5 was taken out of the score (*Not scored: the reply*,
  above) rather than patched a third time. The same QA pass found valid
  rebuild layouts the entry parser read as empty — type sections as `###`
  under a `## Catalog`, numbered lists, a table, `[Title](Wiki/Title.md)`
  links — each scoring a correct rebuild `0101`; the parser now reads them.
- **Second QA review.** The grader imported Python modules the trial planted
  (D-043): the engine runs a code grader with the trial directory as its cwd,
  `python3 -` puts the cwd on `sys.path`, and a `pathlib.py` at the trial root
  forged `1111` over an untouched index. The grader now runs as
  `python3 -I -` (the engine-wide exposure is issue #250), and reads trial files only when they are regular files under
  1 MiB, so a FIFO `index.md` cannot hang it into the harness's 30 s kill (a
  silence the harness would count as a FAIL). Six more right-index layouts were
  read as wrong (a flat table with a `Type` column, `#` and `####` type
  sections, tables without outer pipes, `#anchor` links, lowercase
  wikilinks); A1 now reads them. A dead link in prose or a blockquote passed
  A2; A2 now checks every link in the index.

- **Third QA review.** The stricter A2 failed a correct rebuild that linked
  the audit report it had just written (`[[_audits/audit-2026-10-02-link]]`)
  or an external `…/README.md` URL; A2 now resolves against the run's
  `_audits/` files and skips URLs. An entry hidden in an HTML comment no
  longer counts, a link with a title attribute does, and the grader writes
  UTF-8 under any locale (a non-ASCII index crashed it under ISO-8859-1).

The grader was then replayed through the real `## Setup` and `## Grader
Config` against 314 cases over the V2 fixture, each scoring as expected and
none emitting an `A5` label; only the `1111` cases exit 0:

- **Index untouched, any reply → `0101`** (61). 37 honest replies: every
  phrasing the three reviews found, the provenance passives ("The index was
  updated by the August 12 link audit", "The index was rebuilt during the
  previous audit"), object-after-verb and passive forms, "left the index as
  is", "No index changes were needed", header quotes with curly quotes and
  non-breaking hyphens, a change table, an offer to add the two notes. 21
  false rebuild claims, and V1's three full transcripts. The diagnostic
  prints for 18 of the claims and all three transcripts; it misses the three
  documented shapes ("Updated the log and the index.", a claim sharing a
  clause with "untouched", a claim without the word "index") and still
  misreads the two provenance passives — which no longer costs a point.
- **Ideal rebuild, any reply → `1111`** (62): the same 58 replies, an honest
  rebuild report, and V1's three transcripts; the diagnostic never prints over
  a changed index.
- **QA's reply battery, untouched → `0101` and ideal rebuild → `1111`**
  (73 replies × 2): 49 honest replies, the 18 A5 misreadings among them, and
  24 false claims, the A5 misses among them; and the second QA pass's 12
  further replies × 2, label-injection attempts (`A1:PASS` lines in the reply)
  among them. No reply moves a score.
- **Layouts:** an ideal rebuild with type sections as `###` under `## Catalog`
  (1111), as a numbered list (1111), as tables (1111), or with
  `[Title](Wiki/Title.md)` links (1111); the untouched index restyled to `###`
  sections (0101); and the ideal rebuild plus a `## Recently added` section
  repeating the two new notes (1101) — a second listing outside a type section
  is what A3's pure-function rule forbids, in both arms.
- **The second QA pass's layout matrix** (14 layouts × right / missing note /
  dead entry / wrong section, run through the engine): right `1111`, missing
  `0101`, dead `1001`, wrong section `0101` in every layout. Its hand attacks: a
  dead link in prose or a blockquote `1011`; a fenced block repeating an entry
  `1111` (not a link); `## Recently added` `1101`; the scratch note under
  `## Other` `1111` and under Runbooks `1101`; `## Runbook incidents` `0101`
  (it names runbook first); `## Runbooks` › `#### Incidents` `1111` (the
  deepest typed heading).
- **Hostile files** (run through the engine): planted `pathlib.py`,
  `subprocess.py`, `os.py`, `re.py`, `stat.py`, `time.py`,
  `sitecustomize.py`, `usercustomize.py` and a `.pth` with a `pyvenv.cfg`,
  over an untouched index: `0101`, none executed. `index.md` as a FIFO or a
  symlink to `/dev/zero`: `0001`; a note replaced by a FIFO, or a 20 GB sparse
  file in the vault: `0100`; each graded in under 0.1 s.
- **Links that are not notes** (the ideal rebuild plus one line): the audit
  report by path, by bare name and as an md link, `[[SCHEMA]]` / `[the
  log](log.md)` / `[[AGENTS.md|agents]]`, an attachment under `_audits/`,
  heading and block refs and `[[#Runbooks]]`, an alias in prose, external `.md`
  URLs — `1111` each; a dead "see also", a mistyped audit link — `1011`; a
  dead entry — `1001`. The third QA pass's 22 cases score as it lists, with an
  HTML-comment entry now `0101` and a title-attribute link now `1111`; setext
  headings stay `0101` (not read, above). The non-ASCII index grades `1111`
  under `C` and `en_US.ISO8859-1`.
- **End states:** the ideal rebuild plus an `_audits/` report and an appended
  log line (1111), with the untyped note under `## Other` (1111), with
  `## Incident reviews` (1111) or `## Decision records` (1111); the two missing
  notes added with `Retry-Storm-Review` left under Runbooks (0101); the retype
  fixed with the missing notes still absent (0101); `Retry-Storm-Review` under
  both sections (1101); a duplicate entry in its own section (1101) and in
  another type's section (1101); the untyped note under Runbooks (1101); the
  ideal rebuild plus a filled `status:` (1110), a rewritten `log.md` (1110) or
  an added back-link in `Deploy-Pipeline` (1110); a stub `Runbook-Legacy` note
  with an index entry (1000); a dead `Runbook-Legacy` entry with no note
  (1001); and an empty transcript (0000).

Max Turns stays 40: V1's baselines finished in 5–8 tool calls, reading every
note in one `cat`; V2 has twice the notes and the same number of reads.

### Pre-registration

Written before any V2 trial has run. V1's pool (run `20260930-110032`) is
not pooled with V2's: V2 is a different fixture and a fresh pool.

- **Order and sizes.** 3 + 10 = 13 sessions, on the last round's conditions
  (isolated, no `--plugin-dir`, the same `--max-turns` in both commands):

  ```bash
  arcforge eval preflight eval-maintaining-obsidian-link-rebuilds-index \
    --model 'opus[1m]' --effort xhigh --max-turns 40
  # only on PASS:
  arcforge eval ab eval-maintaining-obsidian-link-rebuilds-index \
    --skill-file skills/core/maintaining-obsidian/SKILL.md \
    --k 5 --model 'opus[1m]' --effort xhigh --max-turns 40
  ```

  Preflight always runs 3 baseline trials and takes no `--k`; the A/B's
  `--k 5` matches `## Trials`. Spell the flag `--k`: the CLI reads a
  single-dash `-k 5` as a bare flag and a stray positional, which the A/B
  ignores.
- **Preflight expectation.** PASS — the baseline trial pass rate is below 0.8.
  The expected baseline end state is `0101` (score 0.5, trial FAIL); a
  baseline that rebuilds from frontmatter unprompted, as V1's did when the
  drift was glaring, passes. A trial passes when A1–A4 all score 1. Dropping
  A5 from the score changed no trial's pass/fail (it could fail only where A1
  already failed), so the preflight's pass rate, its 0.8 threshold and the
  2/3 rule below read exactly as they did with five assertions; only the
  per-assertion weight moved, from 0.2 to 0.25.
- **A preflight PASS is not automatically an A/B.** At k=3 the harness
  BLOCKs only on 3/3 baseline passes, so a baseline that rebuilds about half
  the time gets through preflight about seven times in eight and then leaves
  the k=5 delta's CI spanning zero. Read the preflight's per-trial results:
  0/3 or 1/3 baseline passes → run the A/B; **2/3 → do not spend the A/B**,
  record a near-ceiling finding, and treat it as the BLOCK branch below (it
  uses the one V3 allowance). A trial with no assistant output is graded
  `0000` and the harness counts it as a baseline FAIL; read the rule as a
  count of passes among the trials that produced output — 0 or 1 → the A/B,
  2 or more → no A/B — and report the empty trial beside the count. A preflight
  the harness BLOCKs because a trial errored (`infraError` / `gradeError`)
  measured nothing: it is not this Version's one preflight and does not use
  the V3 allowance, its sessions still count toward the round's cap, and it
  is rerun only after the cause is fixed.
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

## Grader
code

## Grader Config
python3 -I - <<'PY'
import os, re, stat, sys
from collections import Counter
from pathlib import Path

# Reads files and the transcript only; runs nothing (eval B-12, D-043). `python3 -I` keeps
# the trial directory (the cwd) off sys.path, so a planted pathlib.py or sitecustomize.py
# is never imported. Trial files are read only when regular and small, so a FIFO, device,
# symlink or sparse file can neither hang the grader nor stand in for a note.
MAX_BYTES = 1 << 20
sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # any locale: notes print as UTF-8


def regular_bytes(path):
    try:
        st = os.lstat(path)
        if not stat.S_ISREG(st.st_mode) or st.st_size > MAX_BYTES:
            return None
        with open(path, "rb") as f:
            return f.read(MAX_BYTES)
    except OSError:
        return None


trial = Path(os.environ["TRIAL_DIR"])
vault = trial / "vault"
fixture = Path(os.environ["PROJECT_ROOT"]) / "evals" / "fixtures" / "stale-index-vault"
tp = os.environ.get("TRANSCRIPT_PATH")
txt = Path(tp).read_text(errors="replace") if tp and Path(tp).exists() else ""
LABELS = ("A1", "A2", "A3", "A4")
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
    words = [re.sub(r"[^a-z]", "", (heading or "").lower())]
    words += re.findall(r"[a-z]+", (heading or "").lower())
    return next((t for w in words for t in declared if w in (t, t + "s", t + "es")), None)


CANON = {t.casefold(): t for t in titles}
# A link is a [[wikilink]] (alias, heading anchor and folder dropped) or a markdown link
# to a .md file (anchor dropped). Obsidian resolves both case-insensitively.
LINK = re.compile(
    r"\[\[([^\]|#]+)[^\]]*\]\]"
    r"|\[[^\]]*\]\(<?([^)#>\s]+?\.md)(?:#[^)>\s]*)?>?(?:\s+[\"'(][^)]*)?\)"
)
TABLE_SEP = re.compile(r"^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$")


def link_target(m):
    target = (m.group(1) or m.group(2)).strip().split("/")[-1]
    target = target[:-3] if target.lower().endswith(".md") else target
    return CANON.get(target.casefold(), target)


def cells(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


index_raw = regular_bytes(vault / "index.md")
index_text = index_raw.decode("utf-8", "replace") if index_raw is not None else ""
# HTML comments are hidden in Obsidian's reading view: blank them, keeping line numbers.
lines = re.sub(r"<!--.*?-->", lambda c: "\n" * c.group(0).count("\n"), index_text, flags=re.S)
lines = lines.splitlines()
# Drop fenced code: a link inside a code block is not rendered as a link.
live, fenced = [], False
for line in lines:
    if re.match(r"^\s*(```|~~~)", line):
        fenced = not fenced
        live.append("")
        continue
    live.append("" if fenced else line)

# An entry is a bullet, a numbered item or a table row (GFM, with or without outer pipes)
# carrying a link. Its type is the deepest enclosing heading, at any level, that names a
# declared type (`## Catalog` > `#### Incidents`); in a table with a Type column, the row's
# own Type cell wins.
entries = []
heads = {}
in_table, table_type_col = False, None
for i, line in enumerate(live):
    h = re.match(r"^(#{1,6})\s+(.*?)\s*#*\s*$", line)
    if h:
        level = len(h.group(1))
        heads = {k: v for k, v in heads.items() if k < level}
        heads[level] = h.group(2)
        in_table = False
        continue
    if "|" in line and i + 1 < len(live) and TABLE_SEP.match(live[i + 1]):
        names = [c.lower() for c in cells(line)]
        in_table = True
        table_type_col = next((j for j, c in enumerate(names) if c in ("type", "kind")), None)
        continue
    if in_table and TABLE_SEP.match(line):
        continue
    if in_table and "|" not in line:
        in_table = False
    is_item = re.match(r"^\s*(?:[-*+]|\d+[.)])\s", line)
    if not (is_item or in_table):
        continue
    m = LINK.search(line)
    if not m:
        continue
    title = link_target(m)
    typed = [heads[k] for k in sorted(heads, reverse=True) if section_type(heads[k])]
    section = typed[0] if typed else (heads[max(heads)] if heads else None)
    t = section_type(section)
    if in_table and table_type_col is not None:
        row = cells(line)
        if table_type_col < len(row):
            section = row[table_type_col]
            t = section_type(section)
    entries.append((section, t, title))
print(f"-- note: index entries {[(s, e) for s, _, e in entries]}")
# Every link in the index (entries, prose, blockquotes), for A2. A link resolves to a file of
# the fixture vault (a note, SCHEMA.md, log.md, …) or to a regular file this run wrote under
# vault/_audits/ (its report, an attachment), by name or by vault-relative path; a
# `scheme://` URL is not a vault link. Any other new file is one A4 already fails, so this
# set fails no trial A4 passes, and a stub note made so an entry resolves stays dead.
resolvable = set()


def add_resolvable(base, q):
    rel = q.relative_to(base).as_posix().casefold()
    resolvable.update({q.name.casefold(), q.stem.casefold(), rel, re.sub(r"\.md$", "", rel)})


for q in fixture.rglob("*"):
    if q.is_file():
        add_resolvable(fixture, q)
for root, dirs, names in os.walk(vault / "_audits"):
    for n in names:
        if regular_bytes(Path(root, n)) is not None:
            add_resolvable(vault, Path(root, n))
dead_links = set()
for line in live:
    for m in LINK.finditer(line):
        raw = (m.group(1) or m.group(2)).strip()
        if "://" in raw:
            continue
        if link_target(m).casefold() in resolvable or raw.casefold().lstrip("./") in resolvable:
            continue
        dead_links.add(raw)

# ---- A1: every typed note under its type ----
listed = {(t, e) for _, t, e in entries}
missing = sorted(k for k in golden if k not in listed)
emit("A1", bool(index_text) and not missing, f"not listed under their type: {missing}")

# ---- A2: no dead link: every entry, and every other link in the index, resolves ----
dead = sorted(dead_links)
emit("A2", bool(index_text) and not dead, f"links resolving to no fixture file or _audits/ file: {dead}")

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
    got_bytes = regular_bytes(q)
    if not os.path.lexists(q):
        changed.append(f"{rel} (deleted)")
    elif got_bytes is None:
        changed.append(f"{rel} (replaced by a non-regular or oversized file)")
    elif rel == "log.md":
        if not got_bytes.startswith(p.read_bytes()):
            changed.append("log.md (rewritten, not appended)")
    elif got_bytes != p.read_bytes():
        changed.append(f"{rel} (modified)")
for root, dirs, names in os.walk(vault):
    for q in sorted(Path(root, n) for n in names):
        rel = q.relative_to(vault).as_posix()
        if not (fixture / rel).exists() and not rel.startswith("_audits/"):
            changed.append(f"{rel} (created)")
emit("A4", not changed, f"{changed}")

# ---- diagnostic, NOT scored: a claimed index change the disk does not show ----
# Printed for the reader, never emitted as a label. It can only fire when index.md is
# unchanged, where A1 already fails, so as a score it moved no trial's pass/fail and only
# docked the arm that leaves the index alone; regex misreadings of honest replies made
# that docking a bias toward IMPROVED. The parser below still misreads some honest replies
# and misses some false ones: the note is a pointer for a reader, never a score. See Design Notes.
index_changed = index_text.encode() != (fixture / "index.md").read_bytes()
# A claim makes the index the object of a change verb: "rebuilt the index",
# "index.md was updated", "added X to the index". Proximity alone is not a claim:
# in "validated the index and updated log.md" the verb's object is log.md. So only
# determiners may stand between verb and index, only auxiliaries between index and a
# passive verb, and only the moved items' names between an add/move verb and "to the
# index". Quoting the index's own "Last updated:" header is not a claim, and a clause
# that says the index was left as it was is not one. Typographic apostrophes and
# hyphens are folded to ASCII first, so "didn’t" hedges as "didn't" does.
QUOTE = r"\blast[- ]updat\w*|\bupdated:?\s+(?:on\s+)?\d{4}-\d{2}-\d{2}"
VERB = r"(?:rebuil\w*|regenerat\w*|updat\w*|refresh\w*|rewr\w*|recreat\w*|synced|syncing)"
MOVE = r"(?:add(?:ed|ing)|remov(?:ed|ing)|dropp(?:ed|ing)|prun(?:ed|ing)|mov(?:ed|ing))"
DET = r"(?:the|a|an|its|this|that|vault'?s?|ops-notes'?s?|whole|entire|full|stale|old|main)"
AUX = r"(?:was|were|is|are|has|have|had|been|being|got|gets|now|also|fully|just)"
ITEM = r"(?!(?:about|noting|regarding|on|of|for|that|which|log|report|line|lines)\b)[\w`\[\].'-]+"
CLAIM = (
    rf"\b{VERB}\W+(?:{DET}\W+){{0,3}}`?index\b"
    rf"|\bindex(?:\.md)?\W{{0,4}}(?:{AUX}\W+){{0,4}}{VERB}\b"
    rf"|\b{MOVE}\W+(?:{ITEM}\W+){{0,6}}?(?:to|from|in|into|under)\s+"
    r"(?:(?:the\s+)?[\w-]+\s+section\s+(?:of|in)\s+)?(?:the\s+)?`?index\b"
    r"|\bre-?index(?:ed|ing)\b"
)
HEDGE = (
    r"n't\b|\b(?:not|never|no|nothing|none|should|would|could|might|can|will|"
    r"recommend\w*|suggest\w*|propos\w*|want me|if you|next|unchanged|untouched|intact|"
    r"left|leave|leaving|kept|as[- ]is|as it (?:was|is|stands)|already|current|"
    r"up[- ]to[- ]date|still)\b"
)
reply_a5 = reply.translate(str.maketrans("’‘ʼ′‐‑‒", "''''---"))
claims = [
    s.strip()
    for s in re.split(r"(?<=[.!?])[*_`)\]]*\s+|;\s*|\s[—–]\s|\n", reply_a5)
    if re.search(CLAIM, re.sub(QUOTE, " ", s, flags=re.I), re.I) and not re.search(HEDGE, s, re.I)
]
if claims and not index_changed:
    print(f"-- note: diagnostic (unscored): reply claims an index change but index.md is unchanged: {claims[0][:140]}")

a = [
    bool(index_text) and not missing,
    bool(index_text) and not dead,
    a3,
    not changed,
]
sys.exit(0 if all(a) else 1)
PY

## Trials
5

## Version
2
