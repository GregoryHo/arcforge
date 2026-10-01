# Learning

Learning is arcforge's opt-in memory: it watches how you work, proposes patterns
it thinks are worth keeping, and — only if you say so — lets those patterns shape
future sessions.

**It is off until you turn it on**, and every step that could change behavior
waits for a person. Nothing here happens by itself.

## The loop

```
session → diary → pattern → instinct → activation
```

A session produces a **diary**, a record of what was decided and why. Enough
diaries showing the same thing become a **pattern**. A pattern you accept becomes
an **instinct** — a short trigger/action rule. An instinct you *activate* gets
injected at the start of future sessions. Each arrow is a decision you make.

## Turning it on

```bash
arcforge learn status
arcforge learn enable --project
```

`--project` scopes learning to the repository you are in; `--global` applies it
everywhere. Check what is on at any time:

```bash
arcforge learn status --json
```

```json
{
  "project": { "scope": "project", "enabled": true },
  "global":  { "scope": "global",  "enabled": false }
}
```

Until one of those is `true`, the observation hooks exit immediately and nothing
is observed. That switch covers the learning capture, not the session record and
diary — those are continuity, and they run either way; see the
[hooks guide](hooks-system.md) for exactly what they keep.

## Diaries

A diary is one session's reasoning, written down. Files hold what changed; only a
diary holds *why*.

The `/arcforge:learning` skill writes them, and it is the right way in — it knows
when a session is worth recording (a real decision, a solved problem, a stated
preference, a technique discovered) and when it is not (a retried build, a
one-line fix, pure Q&A).

Under the hood:

```bash
arcforge learn diary path --session <id>
arcforge learn diary save --content "..." --session <id>
arcforge learn diary finalize --session <id>
```

After a substantial session a draft may already be waiting. `--draft` prints its
path:

```bash
arcforge learn diary path --draft --session <id>
```

When a draft exists, it *is* the entry — edit it in place and `finalize` it.
Finalize renames the draft rather than merging, so anything not saved into the
draft is lost. Writing a second diary alongside a draft leaves one session with
two records and an orphan nobody reads.

## Reflection

Once diaries accumulate, look across them:

```bash
arcforge learn reflect scan
```

```
strategy: recent_window
diaries: 0
ready: false
```

Under three diaries there is nothing to generalize from, and the scan says so.
When there is enough, the `/arcforge:learning` skill reads them and separates
**patterns** (three or more diaries showing the same thing) from
**observations** (one or two, and labelled as such). Everything cites the diaries
it came from.

Recording the result marks those diaries processed so the same ground is not
re-analyzed next time:

```bash
arcforge learn reflect record reflect-<id> --diaries "a,b,c" --summary "..."
```

## Instincts

An instinct is one rule: when *this*, do *that*.

```bash
arcforge learn instinct save prefer-tables \
  --trigger "listing options" \
  --action "use a table" \
  --domain writing
```

```bash
arcforge learn instinct status
```

```
## Project: demo (1 instincts)

### WRITING (1)

  ██████░░░░  55%  prefer-tables
            trigger: listing options
            action: use a table
```

The bar is confidence. Its ceiling depends on `--source`: an instinct you wrote
by hand can climb higher than one derived from a reflection, since the derived
one is an inference about you rather than something you stated. Either way
confidence only sorts and caps — it is never a threshold that activates
anything.

An auto-detected instinct is a proposal, not a fact, so you can push back on it:

```bash
arcforge learn instinct confirm <id>
arcforge learn instinct contradict <id>
```

Contradict it enough and it archives itself.

Confidence also decays with the time since you last confirmed an instinct: a
fixed amount for each full week, charged once no matter how many sessions you
start in that week. An instinct that decays far enough is moved to the
`archived` folder beside it, the file is stamped `archive_reason: decay` so you
can tell it from one you contradicted away, and the move is written to the
review audit log under the instinct's name. An instinct you activated is never
archived by decay — it leaves the injected set only when you deactivate it — and
when the record of which instincts are activated cannot be read, decay archives
nothing and the session start message says so.

## Review: from candidate to active

Once learning is on, observations turn into **candidates** automatically. That is
the only step here that happens automatically — from a candidate onward, you move
it, through explicit states:

```
pending_review → approved → materialized → activated
```

- **approved** — you agree it is worth keeping. Still nothing on disk.
- **materialized** — the draft is written out, where you can read it. Still
  inert.
- **activated** — it now takes effect. Activated instincts are injected at
  SessionStart, the top five by confidence.

Three separate gates, on purpose: agreeing that a pattern is real, seeing exactly
what would be written, and accepting that it changes behavior are different
decisions. The CLI's `accept` collapses the first two as a convenience — both
are inert. Nothing collapses activation.

A candidate's name is checked once, when it enters the queue. A proposed name
that could not be a draft filename — a path separator, `..`, a control
character, nothing at all, or more than 248 bytes — or that the secret redactor
would alter is not queued: the proposal is recorded with its reason in
`rejections.jsonl` instead, like any other proposal the queue declines. So the
name a card shows is the name the draft file, the draft and the activated
instinct carry; nothing renames a candidate later.

### The dashboard

```bash
arcforge learn dashboard
```

Serves a review interface on `localhost:3334`. This is where review is meant to
happen: browse candidates, read the evidence behind each one, see the exact
target paths a candidate would write, then dismiss, approve, materialize,
activate, deactivate, or promote it to global scope.

The buttons offered on a candidate are only the ones legal from its current
state, so you cannot activate something that was never materialized. Activating
and deactivating carry an extra gate on top of that: both are refused unless the
request carries an explicit acknowledgement that you understand it changes
behavior, and the dashboard asks you for it. Before either is sent, it shows you
that the step changes how future sessions behave — for **Activate**, together
with the exact file activation writes — and sends the acknowledgement only once
you confirm what it showed. Decline, and nothing is sent.

Promote creates a new candidate from the one you picked, and so does the
dashboard's evolve action. That new candidate goes through the same validation
as any other. If it fails — a source candidate written before a schema rule
tightened, say — the action is refused with `candidate_invalid` and the
validator's reasons, and nothing is created.

Every action is written to an audit log, accepted or rejected, with the reason.
Do not route around the dashboard by editing state files by hand — that is the
one path where nothing checks the transition and nothing records it.

### The candidate commands in the CLI

The CLI works the **same queue** the dashboard does. It is the scriptable way
into the same review loop, not a second one: it reads through the same event
log, offers only the transitions the same legality matrix allows, and writes to
the same audit log. On the CLI, the acknowledgement that gates activation is the
typed command itself: `learn activate <id>` prints the same behavior-change
warning the dashboard shows, and the target path, to stderr, and carries its
own acknowledgement. So a scripted `learn activate --json` activates with no
further prompt; the command you typed was the gate.

```bash
arcforge learn inbox --project
arcforge learn inspect <candidate-id> --project
arcforge learn approve <candidate-id> --project
arcforge learn materialize <candidate-id> --project
arcforge learn activate <candidate-id> --project
```

| Command | Effect |
|---------|--------|
| `learn inbox` | The review queue, grouped, with the next command for each entry |
| `learn review` | Every candidate for this project, as the dashboard's cards |
| `learn inspect` | One candidate in detail: evidence summaries, body preview, next actions |
| `learn approve` / `learn reject` | Record your decision |
| `learn accept` | Approve and materialize in one step — never activates |
| `learn materialize` | Write the draft without activating it |
| `learn activate` | Promote the materialized draft to an active instinct — the same draft `learn drafts` and `learn accept` report |
| `learn drafts` | What is materialized and waiting for activation, with draft paths — and which of those files is missing or has changed since it was written. An entry with no draft left to review points at `learn inspect` instead, which says what became of it |

Three things follow from these being one queue rather than two.

**They are project-scope only, and `--project` means *this* project.**
`--global` is refused for every one of them, and the error points you at
`arcforge learn dashboard`. A global candidate applies to every project on the
machine, so it is reviewed where you can see what it would change. The queue
itself is machine-wide, so `--project` also filters to the project you are
standing in — matched on its directory name, which is the `scope.project` each
card prints. Another project's candidates are not listed, and asking for one by
id tells you which project it belongs to instead of acting on it. Refusing an id
this project does not own is the CLI's own call and leaves no audit entry —
there is no queue action to record, and the machine-wide dashboard would have
run the command. A mistyped id is different: it names no candidate anywhere,
which is a refusal the queue itself makes, so it is logged like any other. To
see the whole machine at once, use the dashboard.
(`learn status`, `learn enable` and `learn disable` still take either scope —
those are about the opt-in, not about candidates.)

**Only what is legal is offered.** Each entry carries its `available_actions`,
straight from the matrix, and a transition outside them is refused with the
list of what is allowed instead. So `reject` works on a pending candidate but
not on one you already approved — approving it is a decision, and undoing it is
not one of the moves.

**`materialize` and `activate` handle instinct candidates.** That is what the
engine can build today. A candidate of any other artifact type stays in the
queue and the command says so, rather than offering a step with nothing behind
it.

`learn accept` is two moves in one — approve, then materialize — so before it
starts it checks the two things no re-run can change: the artifact type, and
whether the candidate's name can be used as a draft filename. The queue refuses
such a name on the way in, so the second check matters only for a candidate
queued before that check existed. On a non-instinct candidate, or one queued
under a name with a path separator, `..`, a control character, nothing at all,
or more than a filesystem will hold as a filename — 248 bytes, which a name in a
non-Latin script reaches well short of 248 characters — it refuses without
approving anything: no draft, no audit entry,
the candidate exactly as it was — and the refusal names the move that is left.
The two name it differently. For a non-instinct candidate the move is recording
the approval on its own, and the dashboard is named alongside it either way —
the queue stays reviewable there whatever the CLI can run. For a name the draft
writer cannot use it is `learn reject`, because nothing the CLI offers renames
a candidate, and that one command is the whole recovery: where the queue no
longer allows declining it, the dashboard is named instead of it. The
single-step commands do the opposite, and dispatch
first, so what you read is the engine's own refusal and the refusal is recorded.
Accept is all-or-nothing because half of it cannot be undone — the queue is
append-only, and an approval it could never build on would be a decision you are
stuck with.

On a candidate that is already materialized, `accept` has nothing left to do,
so it re-reports the draft it already wrote — but only while there is a draft to
re-report. If the file has been deleted or edited, or the record that named it
is gone, `accept` refuses and says which, instead of handing back a path that
does not resolve or an empty list. In that state neither `learn drafts` nor
`learn inspect` offers you the activation that would refuse: the drafts entry
points at `learn inspect`, and `learn inspect` says what became of the draft.
Read a draft, but do not edit it in place: activation checks the draft against
the content hash recorded when it was written, so an edited draft is one that
`learn activate` will refuse — and from `materialized` activation is the only
move the matrix allows, so there is no second `learn materialize` and no
`learn reject` waiting behind the refusal. Restoring the file to what the
manifest recorded is what clears it. A candidate holds a second draft only by
being materialized again after the dashboard deactivated it, and there the
commands agree on which one counts: the draft `learn drafts` and `learn accept`
report is the draft `learn activate` consumes.

A retired candidate can lose its draft the same way, and `learn inspect` says so
there too — but what it offers is different, because `deactivated` is the one
status the matrix lets both materialize and activate. Activating it again is the
half that refuses — on the recorded content hash when the file no longer matches
it, and for want of a usable record when the manifest is gone; materializing it
again writes a fresh draft and is what `learn inspect` points you at. `learn inbox` prints no
paths and reads no drafts, so a retired entry there still names both moves —
`learn inspect` is where the draft question is answered.

Every command takes `--json` for scripting; with `--json`, a refusal comes back
as `{"error": "..."}` and a non-zero exit.

## Turning it off

```bash
arcforge learn disable --project
```

That stops new observations and analysis for the scope. The background analysis
checks the opt-in before each run and again immediately before each attempt to
send a batch, so turning learning off mid-run — or off and back on — withdraws
a batch that has not gone out yet; the next run rebuilds it under the new
opt-in. It only ever sends what was recorded since
learning was last turned on — observations by their own timestamp, and the
diaries, reflections and recalls that go with them by theirs (a diary by the
date it is filed under and when it was first written — though on a filesystem
that records no creation time only the last modification is known, so there an
edit made after you turned learning back on can still let that day's earlier
diary through; a reflection or recall by when it was created). So nothing recorded before you turned learning off is sent for
analysis — not now, and not if you turn learning back on later; it stays on
disk, and only what is recorded after the new opt-in is analyzed. With learning
off everywhere, the background process is not even started. Instincts you already
activated stay active — disabling learning stops it accumulating more, it does
not undo what you accepted. To retire an individual instinct, deactivate it from
the dashboard.

## What is stored, and where

All state stays on your own machine — arcforge has no telemetry and no server of
its own to report to. Two things send content to a model, and both happen only
once you have turned learning on.

The first is diary enrichment: it runs `claude` locally over a parsed summary of
the session, so that summary reaches the model exactly the way anything you type
in a session does. That run used to skip every permission check; it no longer
does. It gets two tools, `Read` and `Write`, and it starts in the diary's own
directory rather than in your project. It is not sealed off, though: edits
inside that directory — which also holds the same day's other diaries — are
approved automatically, because a background run has nobody to ask, and what
keeps it out of the rest of your machine is `claude`'s own permission check, not
an operating-system boundary. What it no longer has is a blanket pass over your
whole machine, or your project as its working directory.

The second is the curator's analysis, which turns your observations into
candidates: a background process sends a batch of sanitized observations to
`claude` and reads back a proposal. That run gets no tools at all — no built-in
tool and no MCP server — so it can read the batch it was handed and answer, and
can touch nothing on your machine. Each run leaves a manifest under
`learning/curator-runs/`, and its `tool_access` field records the access that
run actually had, read from the command it was started with.

Turn learning off and both stop. The curator's analysis sends nothing — not
even observations or diaries left over from when learning was on. Diary drafts are still
written from your session record — the counts and the files you touched — but
their `TO BE ENRICHED` sections stay unfilled, which is what an un-enriched
draft is supposed to look like. The same opt-in decides whether your recent message text
is stored in the session record at all.

Almost everything sits under `~/.arcforge/`: diaries in
`diaries/<project>/<date>/`, raw observations in `observations/<project>/`, the
candidate queue and the review audit log in `learning/`, the drafts
materialization writes in `learning/drafts/<candidate-id>/`, and activated
instincts in `instincts/<project>/` (or `instincts/global/`). The project's own
`.arcforge/learning/` holds one thing: that scope's opt-in.

Nothing in the loop writes into your repository. A materialized candidate is a
draft under the arcforge home, and activating it writes an instinct there too —
so a review you are midway through never shows up in `git status`, and nothing
is committed on your behalf.

The commands above print the absolute path of anything they write, so you can
always read exactly what was recorded and where it went.
