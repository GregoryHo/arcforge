# Hooks

arcforge ships six hooks and wires them into Claude Code across six session
events. They load automatically when the plugin is installed — there is nothing
to configure, and nothing to add to your `settings.json`.

Hooks run around the events of a session: it starts, you send a message, a tool
is about to run, a tool just ran, the context is about to be compacted, the
session stops. What follows is what each one actually does to your session.

## What runs, and when

| Event | Registration | What you notice |
|-------|--------------|-----------------|
| SessionStart | `inject-context` | A short summary of what carried over — activated instincts, pending actions, recent sessions |
| SessionStart | `session-start` | Nothing; it creates this session's record in the background |
| UserPromptSubmit | `user-message-counter` | Nothing; it counts your messages |
| PreToolUse | `secrets-guard` | A warning if an edit or a commit looks like it contains a credential |
| PreToolUse | `observe-pre` | Nothing, unless you have enabled learning |
| PostToolUse | `compact-suggester` | A suggestion to `/compact` once the session gets long |
| PostToolUse | `observe-post` | Nothing, unless you have enabled learning |
| PreCompact | `pre-compact` | Nothing; it saves what would otherwise be lost to compaction |
| Stop | `session-end` | Nothing; it finalizes the session record |

Nine registrations, six hooks: session tracking accounts for three of them
(`inject-context`, `session-start`, `session-end`) and observation for two
(`observe-pre`, `observe-post`).

## The ones you will actually see

### `secrets-guard` — a warning, never a block

Before an `Edit` or `Write` lands, and before a `git commit` runs, this hook
scans the content for credential shapes: AWS access keys, private-key headers,
Slack and GitHub tokens, and hardcoded assignments like `api_key = "…"`.

On a hit you get a warning that names the *category* of finding. It never echoes
the matched string, so the warning itself cannot leak the secret, and it never
denies the tool call — you stay in control of what happens next.

Lines and paths that look like tests, examples, or fixtures are exempt, so the
usual false positives stay quiet.

### `compact-suggester` — a nudge when the session gets long

Counting tool calls, it suggests `/compact` at 50 and then every 25 after that.
The wording adapts to what you have been doing: during a heavy writing stretch it
stays out of the way, and in a read-heavy stretch it speaks up sooner, because
that is when compacting costs you least.

It is a suggestion. Nothing compacts unless you say so.

### `inject-context` — what carries into a new session

At the start of a session — and again after a compaction rebuilds the context —
this hook injects a short summary: which instincts are active, whether anything
is waiting for your review, and where the previous session left off.

If you have never enabled learning, there are no instincts and this is close to
silent.

## The quiet ones

`user-message-counter`, `session-start`, and `session-end` maintain the record of
the session itself: how long it ran, how much happened in it. Every session gets
one, as a JSON file under `~/.arcforge/sessions/`. That record is what the
learning loop reads later, and what a diary is built from.

Once a session passes the diary threshold — ten of your messages, or fifty tool
calls — `session-end` also writes a diary draft under `~/.arcforge/diaries/`.
The draft is built from the session record above — the counts, the tools used,
and the files the session touched — and its interpretive sections are left as
`TO BE ENRICHED` stubs.

Three further things happen at that same threshold, and **only if you have
turned learning on**: your ten most recent messages (truncated) are stored in
the session record, a short background run is started to fill the draft's stubs
in, and — once a few drafts have accumulated — a note appears at your next
session start offering to reflect over them. With learning off, none of the
three does, so a draft you open will still have its stubs. That is the intended
state, not a failure: nothing warns you about it and nothing keeps offering to
process it.

`pre-compact` runs just before compaction and captures what is about to be
dropped, so the part of a long session worth keeping survives the boundary.

The two `observe` registrations record tool calls for pattern detection — again
only with learning on. With learning disabled, the default, each checks one
file, finds no configuration, and exits before doing any work. The session
record, its counts, and the diary draft are continuity, and they run either
way. To see where learning stands:

```bash
arcforge learn status
```

See the [learning guide](learning-dashboard.md) for what happens after you do.

## How hooks behave when something goes wrong

Every arcforge hook is **fail-open**. If one throws — a corrupt state file, a
full disk, a permissions problem — it exits quietly and your session continues
exactly as it would have. A hook can decline to do its own job; it can never
take the session down with it.

This is why you will not see hook stack traces. Internal diagnostics go to
stderr, where Claude Code discards them, and only deliberate user-facing messages
(the credential warning, the compact suggestion, the session summary) reach you.

## Blocking versus advisory

Of the events arcforge registers on, only `PreToolUse` is able to stop a tool
call. Everything else is advisory by construction: `PostToolUse` fires after the
work is done, and `SessionStart`, `PreCompact`, and `Stop` are not decision
points at all.

**No arcforge hook denies anything.** `secrets-guard` is the only one that could,
and it is deliberately warn-only. The toolkit's position is that a false positive
should cost you a sentence to read, not a blocked edit.

## Blocking the session, and how arcforge avoids it

A synchronous hook runs on the critical path — the tool waits for it. The two
observation registrations are marked async precisely so their disk writes never
join that path, and the session-start record is built asynchronously for the same
reason. What is left on the synchronous path is small and bounded: a scan of the
text you were about to write, a counter increment, a context injection at the
start.

In practice hooks are not what makes a session feel slow. If one ever is, the
first thing to check is whether learning is enabled, since that is what turns the
observers from a single existence check into real work.

## Turning things off

There is no per-hook switch, because the hooks that could accumulate anything
about you are already gated behind learning being enabled:

```bash
arcforge learn disable --project
```

That stops observation and analysis for the project. To remove the hooks
entirely, uninstall the plugin — they load and unload with it.
