# obsidian — spec

> Status: shipped v6.4.0 · [ROADMAP](../ROADMAP.md)
> Living document — keep in sync with the shipped behavior; record the *why* of any
> change in the ROADMAP Decision Log.

## Purpose

Two skills make an Obsidian vault a first-class workbench. `maintaining-obsidian`
is the vault interface — filing sources in, answering questions from the vault
instead of from general knowledge, auditing vault health, bootstrapping a new
vault. `diagramming-obsidian` builds Excalidraw diagrams in that vault for
concepts better shown than described. The product stance across both: the skill
owns the *mechanism*, each vault declares its own *domain*, and every claim of
work carries provenance a reader can check.

## Scope

- **In scope:** the vault-contract model; the registry contract; query and
  provenance guarantees; the audit stance; the diagram quality bar and verified
  save.
- **Out of scope:** per-mode mechanics and tool routing (the skills' own
  `references/`); the registry file format (engine-owned, reached via the
  [cli](cli.md)); which notes belong in arcforge's own wiki
  (`.claude/rules/obsidian-wiki.md`).

## Behavior

### The vault contract
- **B-1 Domain-agnostic mechanism, vault-declared domain.** Different vaults
  serve different domains, so the skill hardcodes none: each vault declares its
  types, thresholds, taxonomy, and language policy in its own contract files
  (`AGENTS.md` + `SCHEMA.md`), and **the vault contract wins wherever it
  overlaps the skill**. A missing contract blocks the modes that mutate the
  vault — without declared types the skill would be inventing a schema — while
  reading continues with a warning.
- **B-2 The registry is engine state.** The list of vaults the toolkit may
  write to is read and changed only through `arcforge obsidian` commands —
  the engine holds a lock, writes atomically, and applies
  first-registered-becomes-default. Hand-editing the registry file, or writing
  vault content outside any registered vault, is out of contract; reading a
  vault the user names is never gated on registration.

### Answering and filing
- **B-3 Query answers from the vault only — framing included.** Insights,
  comparisons, and commentary come from notes too; where the vault is thin the
  skill names the gap rather than smuggling in general knowledge, and the
  named gap feeds the audit's growth pass. Key claims cite their source notes.
- **B-4 Sources keep provenance where the vault adopts raw sources.** In a
  vault whose `AGENTS.md` declares `raw_source: adopted`, ingesting an
  external source is two writes: the immutable original, then the typed note
  carrying `source_url` and a `sha256` of what was captured — so what the
  source said and what was understood from it never conflate, and audits can
  detect source drift by hash. A vault that declares otherwise — the
  project-tracker preset's `raw_source: not-adopted` — gets the typed note
  alone, because under B-1 its contract decides (D-034). Contradictions with
  existing notes are surfaced to the user, never silently overwritten.
- **B-5 Audit reports; it barely writes.** Of the three audit passes only link
  resolution modifies notes — lint and growth report and propose. The full
  `index.md` rebuild is a write step of that link pass (LINK mode), its
  procedure defined in the skill's audit reference; LINT never writes, the
  index included (D-028). A lint
  finding is a hypothesis to verify against the file, not a fact; entity notes
  are never fabricated without source backing; thresholds come from the
  vault's schema, and where it declares none the observation is reported
  instead of a number invented. Every audit writes a typed report into the
  vault. The lint script treats a `[[wikilink]]` inside inline code or a fenced
  block as an example, not a link; an inline code span closes only on a
  backtick run of its own length before the next blank line or fence opener,
  so a fence that opens later in the note never closes it, and the fence's
  contents are not read as links. A heading, a blockquote or list item, or a
  quoted blank line does not end a span's search (#210, D-049).
- **B-6 Every operation leaves a log line.** Each ingest, query, audit, or
  bootstrap appends to the vault's `log.md` and reports the artifacts it
  produced by path — an operation that cannot run says which mode, what
  stopped it, and what unblocks it.

### Diagrams
- **B-7 A diagram argues, not displays.** Structure carries the claim: with
  every label stripped, a good diagram still communicates the concept's shape.
  A grid of boxes is a failed diagram no labelling can repair — the skill
  redesigns rather than annotates.
- **B-8 The toolchain is self-contained and the save is verified.** The
  render/validate helpers ship inside the skill's own directory (a pinned
  Python toolchain — no arcforge engine coupling). Validation renders a PNG
  and *reads it* each iteration, because composition defects are invisible in
  JSON; every save to the vault is checked by a verifier, and a diagram
  without a verified save is a claim, not a deliverable. On the `ea.create()`
  save path the drawing is a compressed-json block, and the verifier checks
  its format markers only; parsing the JSON, re-rendering the canvas and
  comparing its size happen only on the manual-fallback path, which saves
  uncompressed JSON. A helper that cannot do its job — a missing file, input
  that is not JSON or not an Excalidraw scene, a renderer dependency that is
  not installed — exits non-zero with one line on stderr naming what failed —
  `VERIFY FAILED:` from the save verifier, `ERROR:` from the other helpers, a
  missing renderer dependency's line ending in the command that installs it —
  never a Python traceback (a user interrupt aside), so the agent reading it
  can act on the cause. A helper validates its input before it checks for an optional
  dependency, so a broken diagram is reported as broken, not as a missing
  renderer (#228, D-049).
- **B-9 The pair composes by invocation.** Diagram work inside a vault
  operation is handed to `/diagramming-obsidian` — after user approval, and
  only by prose invocation, per [skill-system](skill-system.md) B-5.
- **B-10 A failed verify is read before it is acted on.** When the save
  verifier exits non-zero, `diagramming-obsidian` has the agent read the one
  line printed before acting. A missing dependency is setup, not corruption,
  so the agent installs it and verifies again rather than regenerating the
  diagram. A missing `uv` produces no helper line at all, because the verifier
  never starts and the shell's own `command not found` takes its place, so
  the skill names that case itself: install `uv` first. Only format corruption
  or a render mismatch sends the agent back to the canonical template, never
  to the file it just wrote (#228). The sentence reached `main` after `v6.3.0`
  (#267) without harness evidence, and ships in 6.4.0 on its text alone: the
  round's design gate found it not measurable on the current engine and
  recorded it as a finding at 0 sessions (D-055, D-057).

**Residual — most of this section has no harness evidence.** Three items rest
on eval scenarios, and only in part: B-3 on
`eval-maintaining-obsidian-vault-only-answer`; B-5 on
`eval-maintaining-obsidian-audit-runs-lint-script` (the lint pass) and
`eval-maintaining-obsidian-link-rebuilds-index` (the index rebuild), both
without A/B evidence: the lint pass needs an engine change to be measured, and
the index rebuild's baseline rebuilds it unprompted across two designs, so that
scenario is kept as corpus coverage rather than as an A/B (D-045, D-054); B-8's
failure path — not claiming a
save that was never verified — on
`eval-diagramming-obsidian-unverified-save-claim`. B-1, B-4, B-6, B-7 and B-9
rest on the skills' text alone. B-2 is engine behavior, covered by the
registry and `arcforge obsidian` tests rather than an eval. No harness run has
saved into a live Obsidian vault, so the `ea.create()` path B-8 verifies is
unexercised; its four Python helpers have subprocess contract tests
(`tests/skills/test_<script>.py`), which prove the scripts' own behavior, not
the skill's use of them.

## Data / domain model

Two contracts meet here, and only one is arcforge's. The vault registry — one
entry per vault plus a default — is engine state owned by
`scripts/lib/obsidian-registry.js`, which locks it and writes atomically (B-2).
The note schema is the vault's own: each vault declares its types, frontmatter
fields, taxonomy, and thresholds in its `AGENTS.md` + `SCHEMA.md`, and that
declaration wins wherever it overlaps the skill (B-1). The only fields arcforge
itself insists on are the ingest provenance pair, `source_url` and `sha256`, and
it insists on them only where the vault's `AGENTS.md` sets the contract key
`raw_source` to `adopted` (B-4).

## Decisions

The vault-contract model (mechanism/domain split, contract-wins) and the
verified-save bar predate this log; rationale inline above. Registry mechanics
live behind the CLI per [cli](cli.md) B-8.

- **D-028** — the `index.md` rebuild is a write step of LINK mode (B-5).
- **D-045** — that rebuild ships without harness evidence: its scenario's
  baseline is at ceiling (B-5).
- **D-034** — the provenance pair applies where the vault adopts raw
  sources (B-4).
- **D-049** — 6.3.0 schedules both B-5 scenarios for redesign, and carries
  the lint script's code-span fix and the diagram helpers' `ERROR:` lines
  (B-5, B-8).
- **D-054** — neither B-5 scenario was A/B-measured in 6.3.0, and
  link-rebuilds-index is retired as an A/B scenario, so D-028's rebuild still
  has no harness evidence (B-5).
- **D-055** — the verify-exit sentence that #267 put on `main` ships in 6.4.0,
  measured only if a scenario can make the arms differ (B-10).
- **D-057** — it cannot: an injected `SKILL.md` cannot reach the verifier,
  no trial's `PATH` or `HOME` can be overridden, and there is no A/B between
  two skill texts, so the sentence is a finding at 0 sessions (B-10).
