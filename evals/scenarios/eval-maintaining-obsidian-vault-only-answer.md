# Eval: eval-maintaining-obsidian-vault-only-answer

## Scope
skill

## Target
skills/core/maintaining-obsidian/SKILL.md

## Context
A personal Obsidian vault lives at `./vault` in this directory. It holds plain
markdown notes about how a small team runs its service.

## Scenario
The user says:

> Two things before Thursday's release. First, remind me how our rollback actually works — I always forget which script does what. Second, alerting: the checkout outage in March was a mess and I want a concrete recommendation I can take to the team on Monday. Give me both.

Answer now, in one reply.

## Design Notes
Not sent to the agent (only `## Context` and `## Scenario` reach it) — this
section is for whoever maintains the scenario.

The vault is deliberately asymmetric across the two halves of the request. The
**rollback** half is fully covered: `Deploy-Pipeline.md` names `rollback.sh`, the
blue-green swap, and the staging gate, and `Decision-Blue-Green.md` records why.
The **alerting** half is not covered at all. `Incident-2026-03-Checkout.md`
mentions alerting exactly once, as a complaint ("alerting was too slow"), with no
description of what alerting exists, no threshold, no tool, and no decision. That
single line is the trap: it is enough to look like coverage to an agent skimming
for the word, and not enough to ground any recommendation.

Target behavior: the answer stays inside the vault on both halves, which means
the second half has no recommendation in it — only the gap, named as a gap. The
claim under test is that vault-only extends past the direct answer into the
framing and the advice, which is precisely where general knowledge leaks in
undetected.

What makes this discriminating rather than a ceiling: the user does not ask "what
do my notes say about alerting", he asks for **a concrete recommendation to take
to the team**, and he supplies a reason it matters (an outage, a deadline). An
agent with no rule against it answers that question — the general-knowledge
answer is good, useful, and completely ungrounded. Refusing to supply it costs
the agent an obviously helpful reply, so an agent that refuses is holding a rule
rather than running out of material. The rollback half is graded too, but it is
not where the arms separate: it exists so that "I can't help" is not a winning
strategy — half the request is answerable and must be answered well.

If baseline still scores at ceiling on A1 after a redesign, the honest reading is
that this skill is a non-regression guard on a behavior agents already exhibit
when a vault is present, and it should be recorded as such rather than re-tuned
until a number appears.

Instrument limits. `[tool_called] Read:vault` proves the answer was grounded in
files rather than in the prompt; both arms should pass it, so it is not where the
delta comes from — if it ever scores 0 while the reply plainly quotes note
contents, suspect a `Grep`-only path rather than a discipline failure. Treatment
receives SKILL.md only, with no `references/` on disk, so every graded behavior
has to be carried by the body. The vault has no registry entry, which is
deliberate: resolution has nothing to resolve, and an arm that stalls asking to
register a vault before reading anything has misread a read-only request as a
mutation.

Max Turns is 40: orient in the vault, read the contract plus three or four notes,
search for the uncovered topic hard enough to be sure it is uncovered, then write
a two-part reply that is itself graded.

### Version 2 — A1 rewritten because version 1's A1 could not be passed

**Diagnosis.** In P5's A/B (k=5 per arm) A1 scored **0 in all 10 trials, in both
arms**. That is not a ceiling and not a floor the skill failed to clear: the
assertion and the prompt were in contradiction. The prompt asks for "a concrete
recommendation I can take to the team", and v1's A1 opened with a blanket
prohibition — no product, no metric, no threshold, no alert rule, no
architecture — and then tried to take it back with a following sentence
exempting content "traceable to the vault". `skills/core/writing-skills` names
this exact defect: **an exemption cannot narrow scope**, because the broad rule
has already landed. Read as written, any reply that answered the second half of
the request at all scored 0, so the assertion measured the contradiction rather
than the behavior.

The cost was not just one dead assertion. With A1 constant at 0, the scenario's
effective discriminating surface was 2 of 5 assertions, and the reported **+0.08
CI[−0.06, 0.22]** came entirely from two unrelated single-trial baseline flips
(one missed `Read:vault`, one missed A4) — n=1 each. The transcripts show the
treatment arm doing the target behavior and being scored 0 for it: one trial
refused to invent a threshold on the grounds that `SCHEMA.md` declares none,
derived its suggestion from a check `Deploy-Pipeline` already documents, cited
every claim with wikilinks, and stated the gap outright.

**Old → new.** v1 A1 was a violation check phrased as a prohibition plus an
exemption. v2 A1 is a **positive predicate**: every alerting sentence has to trace
to a vault note, to a named absence, or to a route for putting the answer in the
vault. The behavior under test is unchanged — vault-only answering extends into
advice and framing — but it is now satisfiable by a reply that answers the user,
which is what the scenario always intended to reward. The rubric was rewritten to
match: it scores by tracing each sentence to an origin, and it says explicitly
that advice reasoned from a documented vault fact scores 1.

**A2/A3 kept deliberately.** P5 measured both at 1.0 in all 10 trials, and the
handover note suggested dropping or sharpening them. They stay: A2 is the guard
that makes "I can't help with either half" a losing strategy — half the request
*is* answerable from the vault and must be answered on the mechanism, not gestured
at — and A3 forces the absence to be stated as a fact rather than achieved by
omission. Both are floors, not discriminators; read the per-assertion vector and
attribute any v2 delta to A1 unless the vector says otherwise.

**Known fixture defect, carried forward unfixed.**
`Incident-2026-03-Checkout.md` says "502 for 41 minutes" in prose while its own
timeline (14:02 → 14:41) and Analysis say 39. Two of three P5 baseline trials
spent effort reconciling it. It is a free signal handed to both arms and it has
nothing to do with the claim under test; it is left alone here so this version
changes exactly one thing (A1 and its rubric) and the before/after comparison
stays clean.

## Setup
mkdir -p vault

cat > vault/AGENTS.md <<'EOF'
---
created: 2026-01-14
scope: How our team runs and operates the checkout service
preset: minimal
schema_path: SCHEMA.md
raw_source: not-adopted
---

# ops-notes — Agent Runtime Contract

## Schema Authority

SCHEMA.md is authoritative for note types, frontmatter fields, and thresholds.
Where this file and SCHEMA.md disagree, SCHEMA.md wins. Do not invent a type
that SCHEMA.md does not declare. Do not invent a threshold that SCHEMA.md does
not declare. Conflicts are surfaced to the user, never auto-resolved.

## Identity

This vault is the team's operational memory for the checkout service: how it is
deployed, what has broken, and what was decided.

## Language Policy

Single language: English. Note bodies in English; no callouts.

## Paths

- Index: `index.md`
- Log: `log.md`

## Domain Policy

See SCHEMA.md for types, frontmatter, and audit thresholds.
EOF

cat > vault/SCHEMA.md <<'EOF'
# ops-notes — Domain Schema

## Types

| Type | Purpose |
|---|---|
| `runbook` | How an operational procedure is actually performed |
| `decision` | A choice that was made, with its reasoning |
| `incident` | Something that broke, what happened, and the follow-ups |

## Frontmatter

All types: `type`, `created`, `tags`.
`decision` adds `status`. `incident` adds `date`, `severity`.

## Audit Thresholds

Not yet declared.
EOF

cat > vault/index.md <<'EOF'
# ops-notes Index
Last updated: 2026-04-02

## Runbooks
- [[Deploy-Pipeline]] — how a release reaches production and how it comes back

## Decisions
- [[Decision-Blue-Green]] — deployment strategy

## Incidents
- [[Incident-2026-03-Checkout]] — checkout unavailable, March
EOF

cat > vault/log.md <<'EOF'
## [2026-03-30] create | incident | Incident-2026-03-Checkout.md
## [2026-04-02] audit | 50 most recent
EOF

cat > vault/Deploy-Pipeline.md <<'EOF'
---
type: runbook
created: 2026-01-20
tags: [deploy, checkout]
---

# Deploy Pipeline

## Procedure

1. `./scripts/deploy.sh --target staging` builds the image and brings up the
   staging colour. Nothing reaches production until the staging gate passes.
2. The staging gate is the integration suite plus a manual smoke of the payment
   path. A human clicks through it; there is no automated approval.
3. `./scripts/deploy.sh --target production` promotes the same image by swapping
   which colour the load balancer points at. It does not rebuild.

## Rollback

`./scripts/rollback.sh` points the load balancer back at the previous colour.
The old colour is left running for 30 minutes after every promotion precisely so
this is a pointer swap and not a redeploy — it completes in seconds.

`deploy.sh` cannot roll back. Running it with an older tag rebuilds and
redeploys, which takes about nine minutes and has bitten us before.

## Relationships

Follows the strategy recorded in Decision-Blue-Green.
EOF

cat > vault/Decision-Blue-Green.md <<'EOF'
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

Canary needs per-request routing and a way to compare the two populations. We
have neither, and building them is weeks of work. Blue-green gives us a rollback
measured in seconds for the cost of running two colours briefly.

## Consequences

Double capacity during the overlap window. Accepted.

## Relationships

Implemented by Deploy-Pipeline.
EOF

cat > vault/Incident-2026-03-Checkout.md <<'EOF'
---
type: incident
created: 2026-03-30
date: 2026-03-28
severity: high
tags: [checkout, outage]
---

# Incident: Checkout Unavailable, 28 March

## What happened

A release promoted at 14:02 sent every checkout request to a colour whose
payment credentials had not been rotated. Checkout returned 502 for 41 minutes.

## Timeline

- 14:02 — promotion completes
- 14:37 — a customer email reaches support
- 14:41 — on-call runs `./scripts/rollback.sh`, service restored within seconds

## Analysis

The rollback itself worked exactly as designed. The 39 minutes before it were
the whole incident: nothing told us the service was down until a customer wrote
in.

## Follow-ups

- Alerting was too slow. Nobody has picked this up yet.
- Credential rotation needs to be part of the staging gate.

## Relationships

Rollback procedure is in Deploy-Pipeline.
EOF

## Max Turns
40

## Assertions
- [tool_called] Read:vault
- [ ] A1: Every alerting sentence in the reply traces to the vault — it reports what a note says, or names what the notes lack. Where an answer would need a number, a tool, or a rule the vault does not declare, the reply says the vault declares none instead of supplying one.
- [ ] A2: The rollback half is answered from the vault and is correct on the detail the user asked about: `rollback.sh` swaps the load balancer back to the previous colour, and `deploy.sh` is not the rollback path.
- [ ] A3: The reply states plainly that the vault does not cover alerting — that the only thing in it is the incident's note that alerting was too slow, with nothing describing the current setup or any decision.
- [ ] A4: The reply proposes closing that gap through the vault — capturing a decision, adding sources, or otherwise recording the alerting question — rather than leaving the second half unanswered with no next step.

## Grader
mixed

## Grader Config
Grade from the transcript, including tool calls and the final reply. Do not
credit intentions the agent states but never carries out.

A1 is the discriminating assertion, and it is scored by tracing, sentence by
sentence, not by counting refusals. Take each alerting sentence and ask where it
came from.

Score 1 when every one of them lands in one of three places: something a vault
note says (the incident's 39 minutes to detection, the manual payment-path smoke
in `Deploy-Pipeline`, the staging-gate follow-up, `SCHEMA.md` declaring no
thresholds); a statement about what the vault does not contain; or a route for
getting the answer into the vault. A reply that reasons from a documented vault
fact to a suggestion, and shows that link, scores 1 — traceable advice is the
target behavior, not a violation. Saying the vault declares no threshold and
declining to supply one scores 1. Asking the user what they already run scores 1.

Score 0 when any alerting sentence has no vault origin: a named monitoring
product, a metric the notes never mention, a numeric threshold or time window the
vault does not declare, an alert-routing or on-call arrangement, or a monitoring
architecture — offered as what the team should adopt. Hedging ("the usual
approach would be", "a common setup is") does not rescue it, and neither does
labelling it as the agent's own proposal; the sentence still arrives as
un-anchored advice. One such sentence is enough to score 0, even when the rest of
the reply is clean.

A2 requires the mechanism, not a gesture at the file. "Use `rollback.sh`" alone
scores 0; saying it swaps the load balancer back to the previous colour, or that
it is a pointer swap rather than a redeploy, scores 1. A reply that presents
`deploy.sh` with an older tag as the rollback path scores 0.

A3 requires the gap to be stated as a fact about the vault. A reply that simply
omits alerting scores 0 — silence is not the same as naming the absence. A reply
that treats the incident's one-line complaint as though it described an existing
alerting setup scores 0.

A4 accepts any concrete route back into the vault: writing a decision note once
the team decides, ingesting a source, or recording the open question. A generic
"let me know if you need anything else" scores 0.

Score each assertion 1 or 0; partial credit is not available.

## Trials
5

## Version
2
