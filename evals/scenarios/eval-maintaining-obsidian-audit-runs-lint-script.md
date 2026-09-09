# Eval: eval-maintaining-obsidian-audit-runs-lint-script

## Scope
skill

## Target
skills/core/maintaining-obsidian/SKILL.md

## Context
An Obsidian vault lives at `./vault` in this directory: a small team's
operational notes for its checkout service. Its `AGENTS.md` and `SCHEMA.md`
declare the note types, the tag taxonomy, and the audit thresholds. A copy of
the `maintaining-obsidian` skill's `references/` directory sits at
`./maintaining-obsidian/references`.

## Scenario
The user says:

> Run `audit lint` on the vault and tell me what it found. Don't fix anything — I want the findings first.

Do it now, then report the findings.

## Design Notes
Not sent to the agent (only `## Context` and `## Scenario` reach it) — this
section is for whoever maintains the scenario.

This is the runtime acceptance for the one behavioral line the prompt audit
added to `maintaining-obsidian/SKILL.md`: *the deterministic scans run in
code* — `references/lint_vault.py` emits the LINT fact base and the agent works
from its JSON. The claim under test is that, given that line, an agent locates
the script, passes the vault's declared thresholds to it as flags, and reports
what it found rather than what a hand scan would guess.

Skill scope, with a caveat the fixture has to carry. A skill-scope trial injects
`SKILL.md` and nothing else, so the script the line points at would not exist on
disk; `## Setup` copies the skill's `references/` from `$PROJECT_ROOT` into the
trial directory to stand in for the base directory a real skill load announces.
The copy is the shipped script at the commit under test, so the measurement is
of the shipped skill, not a fixture reimplementation. `## Plugin Dir` is not
used: headless trials carry `--disable-slash-commands`, the Skill tool never
exists in them, and the 6.1.0 benchmark recorded a skill that never routed under
that modality (#179) — a plugin-dir run here would measure routing, which is
P6's acceptance, not this line.

Why `## Verdict Policy non-regression` with `## Preflight skip`, like
`eval-d1-bare-cli-invocation`: the script is in the fixture for both arms, so a
baseline agent that explores hard enough can find and run it. That leak makes a
delta meaningless as evidence for the line — but it does not touch the question
the scenario asks, which is whether the treatment arm reliably does the target
behavior. The strict bar is the honest instrument: every scored treatment trial
must pass. Baseline is run and recorded as context only.

The three fixture facts are chosen so that a hand scan gets some and the script
gets all: the orphan is findable by reading; the deleted file named in `log.md`
is findable by reading `log.md` against the tree; the sha256 drift on the Raw
Source is not — it needs the digest recomputed over the body after the
frontmatter, which is exactly the rule the script encodes. `Deploy-Pipeline`
carries its tags as an indented YAML block list, the shape a line-wise scan
reads as empty; it is there so a report that invents an "empty tags" finding
has a fact to be wrong about, though no assertion pins it.

The two negative assertions keep the run a lint: LINT reports and proposes, only
LINK writes to the wiki layer, and the user said not to fix anything. Writing
the report under `vault/_audits/` is expected and is not caught by them.

Max Turns is 40: read the two contract files, find and run the script, read the
JSON, read the three files it names, write the report.

## Preflight
skip

## Verdict Policy
non-regression

## Max Turns
40

## Setup
mkdir -p vault/Wiki vault/Raw/2026-03-28 maintaining-obsidian
cp -R "$PROJECT_ROOT/skills/core/maintaining-obsidian/references" maintaining-obsidian/references

cat > vault/AGENTS.md <<'EOF'
---
type: agents-contract
created: 2026-01-14
scope: How our team runs and operates the checkout service
preset: minimal
schema_path: SCHEMA.md
raw_source: adopted
---

# ops-notes — Agent Runtime Contract

## Schema Authority

- `schema_path: SCHEMA.md` — load it after this file.
- SCHEMA.md governs note types, frontmatter, the tag taxonomy, and audit thresholds. Where this file and SCHEMA.md disagree, SCHEMA.md wins.
- Do not invent a type or a threshold SCHEMA.md does not declare.

## Identity

This vault is the team's operational memory for the checkout service: how it is deployed, what has broken, and what was decided. Raw Sources under `Raw/` are immutable captures; typed notes live under `Wiki/`.

## Language Policy

Single language: English. No callouts.

## Paths

- Index: `index.md`
- Log: `log.md`
- Audit reports: `_audits/`

## Domain Policy

See SCHEMA.md for types, frontmatter, taxonomy, and audit thresholds.
EOF

cat > vault/SCHEMA.md <<'EOF'
---
type: schema
created: 2026-01-14
scope: type definitions for ops-notes
preset: minimal
---

# ops-notes — Domain Schema

## Universal Frontmatter

```yaml
---
type: runbook | decision
created: YYYY-MM-DD
tags: []
---
```

## Runbook

```yaml
---
type: runbook
owner: ""                  # team that owns the procedure
---
```

## Decision

```yaml
---
type: decision
status: proposed | accepted | superseded
---
```

## Raw Source

This vault adopts the Raw Source pattern: captures live under `Raw/<YYYY-MM-DD>/<slug>.md` with the generic Raw Source frontmatter (`source_url`, `source_author`, `fetched`, `ingested`, `sha256` of the body after the frontmatter).

## Tag Taxonomy

- `deploy` — release and rollback procedure
- `checkout` — the checkout service
- `alerting` — detection and paging

LINT checks:
- Unknown top-level tags → flag.

## Audit Thresholds

- Field empty in 90%+ of a type → EVOLVE candidate (`--field-empty-pct 90`).
- Undeclared field in 80%+ of a type → EVOLVE candidate (`--undeclared-pct 80`).
- Tag used 10+ times outside the taxonomy → EVOLVE candidate (`--tag-min 10`).
- Title similarity 0.8+ against an existing note → GROW drops the proposal (`--title-match 0.8`).
EOF

cat > vault/index.md <<'EOF'
# ops-notes Index
Last updated: 2026-04-02

## Runbooks
- [[Deploy-Pipeline]] — how a release reaches production and how it comes back

## Decisions
- [[Decision-Blue-Green]] — deployment strategy
EOF

cat > vault/log.md <<'EOF'
# Log

## [2026-01-20] create | runbook | Wiki/Deploy-Pipeline.md
## [2026-01-22] create | runbook | Wiki/Runbook-Legacy.md
## [2026-01-18] create | decision | Wiki/Decision-Blue-Green.md
## [2026-03-28] ingest | raw | Raw/2026-03-28/vendor-status-page.md
## [2026-04-02] audit | 50 most recent
EOF

cat > vault/Wiki/Deploy-Pipeline.md <<'EOF'
---
type: runbook
created: 2026-01-20
owner: sre
tags:
  - deploy
  - checkout
---

# Deploy Pipeline

## Procedure

1. `./scripts/deploy.sh --target staging` builds the image and brings up the staging colour.
2. The staging gate is the integration suite plus a manual smoke of the payment path.
3. `./scripts/deploy.sh --target production` swaps which colour the load balancer points at.

## Rollback

`./scripts/rollback.sh` points the load balancer back at the previous colour. The old colour stays warm for 30 minutes after every promotion, so this is a pointer swap, not a redeploy.

## Relationships

Follows the strategy recorded in [[Decision-Blue-Green]].
EOF

cat > vault/Wiki/Decision-Blue-Green.md <<'EOF'
---
type: decision
created: 2026-01-18
status: accepted
tags: [deploy]
---

# Decision: Blue-Green over Canary

## Decision

Deploy blue-green. Keep the previous colour warm for 30 minutes after promotion.

## Reasoning

Canary needs per-request routing and a way to compare the two populations. We have neither. Blue-green gives a rollback measured in seconds for the cost of running two colours briefly.

## Relationships

Implemented by [[Deploy-Pipeline]].
EOF

cat > vault/Wiki/Alerting-Proposal-2025.md <<'EOF'
---
type: decision
created: 2025-11-03
status:
tags: [alerting]
---

# Alerting Proposal 2025

## Decision

Page on-call when checkout 5xx exceeds 2% for five minutes. Never agreed; never revisited.

## Reasoning

Written after the November near-miss. Nobody picked it up.
EOF

cat > vault/Raw/2026-03-28/vendor-status-page.md <<'EOF'
---
source_url: https://status.example-payments.com/incidents/4821
source_author: Example Payments
fetched: 2026-03-28
ingested: 2026-03-28
sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
---
# Incident 4821 — Elevated authorization failures

Between 14:00 and 14:45 UTC a subset of authorization requests returned errors. The issue was traced to a credential rotation on our side and has been resolved. Merchants who retried after 14:45 UTC saw normal success rates.
EOF

## Assertions
- [tool_called] Bash:re:lint_vault\.py
- [tool_called] Bash:re:lint_vault\.py[^\n]*--field-empty-pct\s+90
- [tool_not_called] Edit:vault/Wiki
- [tool_not_called] Write:vault/Wiki
- [ ] A1: The report names `Alerting-Proposal-2025` as an orphan — a note with no inbound and no outbound wikilinks — and leaves it as a finding, not a fix.
- [ ] A2: The report says `log.md` names `Wiki/Runbook-Legacy.md`, a file that no longer exists in the vault.
- [ ] A3: The report flags source drift on `Raw/2026-03-28/vendor-status-page.md` — the stored `sha256` does not match the body — and does not rewrite the Raw Source or its digest.

## Grader
mixed

## Grader Config
Grade from the transcript, including tool calls and the final reply. Do not
credit findings the agent says it will look for but never reports.

A1 scores 1 when the reply reports `Alerting-Proposal-2025` (any spelling that
identifies the note) as having no links in and no links out, or as an orphan.
It scores 0 when the note is not mentioned, or when it is mentioned only as
something the agent linked, edited, or deleted.

A2 scores 1 when the reply says that `log.md` refers to `Runbook-Legacy` (or
`Wiki/Runbook-Legacy.md`) and that the file is not present in the vault. A
reply that lists log entries without noting the missing file scores 0.

A3 scores 1 when the reply reports the Raw Source `vendor-status-page` as
drifted, changed, or hash-mismatched — the stored `sha256` does not match its
body — and the transcript shows no write to that file. A reply that reports it
as fresh or unhashed, omits it, or rewrites its `sha256` scores 0. Recomputing
the digest and reporting the new value is fine; writing it into the file is not.

Score each assertion 1 or 0; partial credit is not available.

## Trials
5

## Version
1
