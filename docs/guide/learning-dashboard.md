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
behavior.

Every action is written to an audit log, accepted or rejected, with the reason.
Do not route around the dashboard by editing state files by hand — that is the
one path where nothing checks the transition and nothing records it.

### The candidate commands in the CLI

The CLI has its own candidate commands. They work the project's own queue under
`.arcforge/learning/` — **not** the curator queue the dashboard reviews, which
is home-global. They are a scriptable project-scope path, not a second way to
work the dashboard's inbox: review what you see in the dashboard from the
dashboard.

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
| `learn review` | The queued candidates awaiting a decision |
| `learn inspect` | Read-only summary of one candidate: evidence, paths, next actions |
| `learn approve` / `learn reject` | Record your decision |
| `learn accept` | Approve and materialize in one step — never activates |
| `learn materialize` | Write the drafts without activating them |
| `learn activate` | Promote materialized drafts to active (project scope only) |
| `learn drafts` | What is materialized and waiting for activation |

The review/list commands take `--project` or `--global`; the
candidate-transition commands (`approve`, `reject`, `materialize`, `accept`,
`activate`) are **project-scope only**. Every one takes `--json` for scripting.

## Turning it off

```bash
arcforge learn disable --project
```

That stops new observations and analysis for the scope. Instincts you already
activated stay active — disabling learning stops it accumulating more, it does
not undo what you accepted. To retire an individual instinct, deactivate it from
the dashboard.

## What is stored, and where

All state stays on your own machine — arcforge has no telemetry and no server of
its own to report to. The one thing that leaves is diary enrichment, and it only
happens once you have turned learning on: it runs `claude` locally over a parsed
summary of the session, so that summary reaches the model exactly the way
anything you type in a session does. That run used to skip every permission
check; it no longer does. It gets two tools, `Read` and `Write`, and the diary
directory is added to the places it is allowed to work in. It is not sealed off,
though: it still starts in your project directory, and edits inside those places
are approved automatically, because a background run has nobody to ask. What it
no longer has is a blanket pass over your whole machine.

Turn learning off and the enrichment stops: diary drafts are still written from
your session record — the counts, the tools used, and the files you touched —
but their `TO BE ENRICHED` sections stay unfilled, which is what an un-enriched
draft is supposed to look like. The same opt-in decides whether your recent message text is stored in the
session record at all.

State sits in two places, split by scope:

- **Home-global** — under `~/.arcforge/`: diaries in `diaries/<project>/<date>/`,
  raw observations in `observations/<project>/`, activated global instincts in
  `instincts/<project>/`, and the global learning config and candidate queue in
  `learning/`.
- **Project-scoped** — under `.arcforge/learning/` inside the project itself:
  that scope's config, its candidate queue, and the instincts and patches
  materialized for it.

Materialization and activation additionally write into the project tree. A skill
candidate materializes as `skills/<name>/SKILL.md.draft` inside your project and
activation renames it to `SKILL.md`; command, agent, and eval candidates follow
the same draft-then-rename pattern in their own directories. So an accepted
candidate becomes a real file in your repository, which you review and commit
like any other change.

The commands above print the absolute path of anything they write, so you can
always read exactly what was recorded and where it went.
