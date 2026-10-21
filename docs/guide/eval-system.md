# Evals

An eval answers one question: **does this change what the agent does?**

Agents are stochastic — the same prompt produces different work each time. You
cannot run something once, like the result, and conclude the change caused it.
So an eval runs the same task many times under two conditions and compares the
distributions.

```
Same task
  ├─ baseline   (without the change)  → scores
  └─ treatment  (with the change)     → scores

  delta = treatment − baseline
```

If the delta is indistinguishable from zero, the change did not move behavior —
however good the writing looks.

## The workflow

```bash
arcforge eval list                    # what scenarios exist, and their status
arcforge eval lint <name>             # is the scenario file well-formed?
arcforge eval preflight <name>        # is the scenario capable of discriminating?
arcforge eval ab <name> --skill-file <path>   # run both arms
arcforge eval compare <name>          # read the verdict
arcforge eval report                  # write a benchmark snapshot
```

Each step gates the next, and the gating is real: `eval ab` refuses to run
without a passing preflight on record.

## Step 1 — `lint`

```bash
arcforge eval lint eval-tdd-test-first-gate
```

Structural only: required sections present, assertions shaped correctly, and a
name the result store can file. A scenario name may not end in `-baseline`,
`-treatment` or `-preflight`: those suffixes name the conditions a scenario's
results are stored under, so `release-preflight` would be filed as the preflight
of a scenario called `release`. `lint` reports such a name, and `run`, `ab` and
`preflight` refuse it before any trial starts. It says
nothing about whether the scenario is any good. Output is `<name>: ok` or a list
of file-and-line diagnostics.

## Step 2 — `preflight`

This is the step people skip and regret. Preflight runs the **baseline alone**,
three trials, and measures how often it passes with no change applied at all.

- Baseline passes **less than 80%** of the time → `PASS`. There is room for the
  change to show an effect.
- Baseline passes **80% or more** → `BLOCK`. The scenario has a ceiling: the
  agent already does the right thing unaided, so a good change and a useless one
  will produce the same numbers.

A BLOCK is a verdict about your *scenario*, not your change. Make the task
harder, or find the failure mode you were actually worried about.

Preflight runs its baseline the way the A/B will run it: contained, with the
same turn budget. Give `preflight` the `--max-turns`,
`--plugin-dir` and `--effort` you will give `ab`. There `--plugin-dir` only sets the
budget; nothing is loaded into the baseline. Like `ab`,
`preflight` takes `--plugin-dir` for a `workflow` scenario only. A `workflow`
scenario's `## Plugin Dir` counts on its own. With a plugin dir and no other limit, the
budget is 10 turns.

For an A/B between two skill texts, give `preflight` the same
`--baseline-skill-file`, and `--stage-skill-files` if `ab` will get it. Preflight
then runs the baseline that A/B will run, injected with that text and given its
staged files. Without `--baseline-skill-file` the baseline is injected with
nothing, so `--stage-skill-files` on its own changes nothing in preflight:
nothing is staged, and its rows record no staging.

Preflight results are cached per scenario **and per model**, keyed on the
scenario's content, and per turn budget, plugin dir, `--effort`, per-trial
ceiling (`ARCFORGE_EVAL_TRIAL_TIMEOUT_MS`), baseline text and the baseline's staged files. Edit the scenario, switch models, or
change the budget, plugin dir, effort, ceiling, baseline text or a staged baseline file, and you need a fresh one:
baseline competence is not transferable between conditions, and a PASS earned under one
does not unblock A/B runs under another. When `ab` finds no record for its own
conditions, it stops. It names the conditions it needed and any it found
instead, and gives the exact `preflight` command to run.

Each preflight trial also leaves a result row, in `preflight.jsonl` under that
run's directory in `evals/results/`, beside its transcripts
(`preflight-trial-<n>.txt`). A row carries what an A/B row carries: the score,
the grader's evidence, tokens, duration, and the conditions the trial ran under.
So a preflight can be audited trial by trial, not only from its verdict.
`preflight` is a condition of its own: `eval run`, `compare`, `report` and the
dashboard's comparison never read these rows into a baseline or treatment pool,
and the dashboard lists such a run under the `preflight` condition. The record
that unlocks `ab` is still the one under `evals/preflight/`.

That record and every preflight row carry the same `scenario_hash`, the hash
the record is filed under, and an A/B row carries it too. So you can check that
a comparison ran on the scenario text its preflight cleared by reading the two,
rather than inferring it from the gate having let the run through. The record
also notes the `node_version` it ran on and the `repo_commit` of the checkout.
Those two are notes, not keys: upgrading Node.js or committing does not
invalidate a preflight.
Rerunning a preflight under the same key replaces the record, but not the
old one: it moves to `evals/preflight/history/`, named after its own
timestamp, and the gate never reads it.

A scenario that measures "this must not get worse" rather than "this must
improve" opts out by declaring `skip`:

```markdown
## Preflight
skip
```

## Step 3 — `ab`

```bash
arcforge eval ab eval-tdd-test-first-gate --skill-file path/to/SKILL.md
```

Runs both arms and stores every trial. Useful flags:

| Flag | Effect |
|------|--------|
| `--k` | Trials per arm. Defaults to 5, or 10 when a model grades |
| `--model` | Which model to run trials on |
| `--effort` | Reasoning effort for the trial sessions, passed through to `claude --effort` (also on `run` and `preflight`) |
| `--interleave` | Alternate the arms instead of running each in a block, so drift over the run hits both equally |
| `--max-turns` | Turn budget per trial, overriding the scenario |
| `--skill-file` | Skill-scope only: inject this skill body into the treatment prompt. Falls back to the scenario's `## Target` |
| `--baseline-skill-file` | Skill-scope only: inject the baseline with this file's text instead of nothing. See [Comparing two skill texts](#comparing-two-skill-texts) |
| `--stage-skill-files` | Skill-scope only: also give the injected arm the skill's files. See [Staging a skill's files](#staging-a-skills-files) |
| `--plugin-dir` | `workflow` scope only: load this plugin into the treatment arm. Refused for any other scope |

Each trial's `claude -p` session is capped at 900 s; a trial killed at the cap is
an infra error and never scores. Set `ARCFORGE_EVAL_TRIAL_TIMEOUT_MS=<milliseconds>`
to move that ceiling for one run — for a treatment whose pipeline builds or
renders and runs past the cap on a loaded machine. Anything that is not a
positive integer is refused before the run starts, ahead of any fixture
`## Setup`. Every result row records the ceiling its trial ran under as
`trialTimeoutMs`, so a pool that mixes ceilings can be told apart; report the
value whenever a run moved it.

A trial the provider refused — a session-limit or quota message in place of the
agent's turn — is recorded as an infra error (`provider_refusal`) and never
scores either. Without that, the fixture's own files would pass some assertions
and an exhausted quota would read as a regression. A refusal is recognised two
ways: the session reported zero output tokens and called no tool, or its last
message was written by Claude Code rather than the model (a limit that landed
after the agent had already worked). In the second case the row records
`refusalAfterActions`, the number of tool calls the agent made before it was cut
off, and the error message says so.

Each trial's raw `claude -p` stream-json output is kept beside its transcript,
in `raw/<condition>-trial-<n>.jsonl` under the run's directory in
`evals/results/`. The transcript holds only what grading reads; the raw file
holds everything, for when you need to see what the session actually received.
A session that wrote nothing to stdout, such as one that never started, leaves
no raw file; its error output is in the transcript instead.

A trial whose session never started — no `claude` to run, or an environment the
system refuses to pass on — is an infra error too (`trial_spawn_failed`). It
never scores, and its fixture directory is removed.

Every trial runs in a fresh fixture directory under `.eval-trials/`, with
arcforge's own state redirected into it. By default the session is also
isolated. Plugins and MCP servers are stripped, `CLAUDE.md` files and rules are
excluded, the output style is pinned to the default and hooks are disabled. Your
user settings file (`~/.claude/settings.json`) is not read at all, so nothing
set there reaches the trial: not your hooks, output style, `model` or effort
level, `env`, permissions, or an `apiKeyHelper`. Credentials stored in your
keychain still work. A `--plugin-dir` trial is contained the same way,
`CLAUDE.md` excludes included, except that it loads the plugin under test and
leaves hooks on so the plugin's own hooks run.

Your shell's environment does not reach a contained trial either. Its `PATH` is
rebuilt: first `.eval-trials/.bin`, which holds links to `claude`, to the `node`
running arcforge, to the `npm` and `npx` beside that `node`, and to the
`python3` your own `PATH` resolves (none when it resolves none), then
`/usr/bin:/bin:/usr/sbin:/sbin`. `git` and the shell utilities are expected in
those system directories; they are not linked. The session itself is started from that
`claude` link by its full path, so nothing a scenario adds to the `PATH` can run
in its place. A tool you installed anywhere else (Homebrew,
`~/.local/bin`, a version manager) is not found, even when it shares a
directory with `claude`, unless the scenario declares it (see
[Declaring a trial's environment](#declaring-a-trials-environment)). Only these
variables are forwarded. A name ending in `*` is a family: every variable that
starts that way is forwarded, so a provider's role, token-file or
container-credential variable needs no entry of its own.

| Group | Variables |
|-------|-----------|
| You and your terminal | `HOME`, `USER`, `LOGNAME`, `SHELL`, `TERM`, `LANG`, `LC_*`, `TZ`, `TMPDIR`, `XDG_CONFIG_HOME` |
| Claude Code's credentials and provider | `CLAUDE_CONFIG_DIR`, `CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_CODE_USE_*`, `ANTHROPIC_*` |
| Cloud provider credentials | `AWS_*`, `AZURE_*`, `GOOGLE_*`, `GCLOUD_*`, `CLOUDSDK_*`, `CLOUD_ML_REGION` |
| Network | every variable ending in `_PROXY` or `_proxy` (`HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY` and their lowercase forms), `SSL_CERT_*`, `NODE_EXTRA_CA_CERTS`, `CURL_CA_BUNDLE`, `REQUESTS_CA_BUNDLE`, `NODE_TLS_REJECT_UNAUTHORIZED` |

These are dropped even though a family would match them, or so that none ever
does:

| Dropped | Why |
|---------|-----|
| `ANTHROPIC_MODEL` | the row records `--model`, not your variable |
| `ANTHROPIC_DEFAULT_*_MODEL` (`ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`), `ANTHROPIC_SMALL_FAST_MODEL` | they remap what `--model sonnet` resolves to while the row still records `sonnet` |
| `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_SSE_PORT`, `CLAUDE_CODE_SESSION_ID` | they belong to the Claude Code session you started the eval from |

No other `CLAUDE_CODE_*` variable is forwarded either.

Everything else is dropped. A model picked through `ANTHROPIC_MODEL`, or an
alias remapped through `ANTHROPIC_DEFAULT_*_MODEL`, does not reach the trial:
pass `--model` so the row records it. `## Setup` runs in this
same environment, plus `PROJECT_ROOT` and `TRIAL_DIR`, so a fixture is built
with the tools the trial will find. `HOME` is kept because that is where `claude` finds your login,
which has one side effect: Claude Code loads the functions and aliases of your
shell startup file (`~/.zshrc` or `~/.bashrc`) into the commands the agent runs,
so a function or alias defined there is still visible to a trial.

Both kinds of contained trial, isolated and `--plugin-dir`, run with permission
prompts skipped (`--dangerously-skip-permissions`) inside their trial
directory. A trial runs unattended, so nobody is there to answer a prompt.
Since your settings file is not read, no permission mode of yours applies
either, and without the flag the agent would be denied every command, write
and edit. What contains the trial instead is the write check described below
and arcforge's redirected state. This holds for `eval run`, `eval preflight` and
both arms of `eval ab`. A `--no-isolate` trial with no plugin dir is not
contained: it reads your settings file, runs under your own permission mode and
keeps your shell's environment, `PATH` included.

In a comparison, both arms run `claude` with the same flags apart from the
injection itself. They share the settings sources, the turn budget, the
permission mode (neither arm stops for permission prompts) and `--model` /
`--effort`. Their settings files differ only in that
the baseline switches every hook off: it loads no plugin, so that costs it
nothing. Every result row records the `model` and `effort` it ran with, the flag
value when one was given. Otherwise it says `default` for a contained trial,
meaning Claude Code's own default since your settings are not read. It says
`user-settings` for a trial that reads your settings file, such as `eval run
--no-isolate`. A `workflow` A/B with no
plugin directory is the exception. Its treatment runs on your full configuration,
so it refuses to start unless you pass both `--model` and `--effort`. Both
`eval ab` and `eval preflight` check this before anything else, so a missing flag
is reported before any preflight lookup or trial.

Isolation is not a sandbox. The agent runs with your filesystem permissions.
Isolated and `--plugin-dir` trials are told to stay inside their directory, but
nothing enforces it. So the runner checks afterwards: it snapshots the project
and the plugin directory before each trial and compares after. That includes
the baseline of a plugin-dir comparison and its preflight, which load no plugin
but could still edit it before the treatment loads it. The plugin directory is
walked on its own even when it sits inside the project as a separate checkout.

A trial that added, changed or removed anything the check covers, a change to a
file's permissions included, is recorded as
an infra error (`trial_wrote_repo`) naming the paths, and never scores. The
run then stops before the next trial starts, because every later trial would
run against the changed files. That applies to `eval run`, `eval ab` and
`eval preflight`. The command prints which trial wrote where and exits
non-zero. Rows already recorded stay on disk. The runner does not undo the
change: inspect the paths with `git status`, reset the repository (and the
plugin directory) yourself, then rerun. An edit you make to the same project
while a trial runs looks identical, so a long run is best left alone.

For the same reason, one project runs one live eval at a time. A second run's
own records, such as the one `eval preflight` writes under `evals/preflight/`,
would look like the first run's trial writing to the repository and stop it.
So `eval run`, `eval preflight` and `eval ab` take a lock,
`.eval-trials/run.lock`, just before their first trial and remove it when they
end, whatever the outcome. `eval report` takes the same lock for the moment it
runs, because the benchmark files it writes under `evals/benchmarks/` would
stop a live run the same way. While the lock is held, a second one of the four
exits non-zero at once, before any Setup, session or benchmark write, and
names the run in its way:

```text
Error: Another eval is running in this checkout: `arcforge eval preflight my-scenario` (PID 41873, started 2026-10-12T08:14:03.512Z) holds /path/to/project/.eval-trials/run.lock. One checkout runs one live eval at a time; wait for it to finish, or use a second checkout. If PID 41873 is not an eval, remove that file and rerun.
```

Nothing waits or retries: rerun once the first run is done, or run the second
eval from another checkout of the project (a git worktree counts, since each
has its own `.eval-trials/`). The lock never expires by age, because a run can
take hours. A run that was killed leaves its lock behind, and the next run
takes it over once the process it names no longer exists. Two cases are left
to you. One is a lock whose PID now belongs to some unrelated process: the
refusal names the file, and deleting it clears it. The other is a run killed
with its trial still running, which can leave the trial's `claude` process
alive: the lock is reclaimed on the holder's death, not the trial's, so check
`ps` for a leftover `claude` process before starting the next run. Two rarer
refusals say the same thing in other words: a lock file that names no process,
and a leftover `.eval-trials/run.lock.reclaim` from a run that died while
taking over a dead lock. Each message names the file to remove. The remaining
subcommands (`list`,
`lint`, `compare`, `history`, `audit`, `dashboard`) write nothing the check
covers, never take the lock, and run alongside a live eval.

The check has blind spots. Any folder named `.git`, `node_modules` or
`.eval-trials` is skipped at any depth. So are the project's own
`evals/results/` and any nested repository other than the plugin directory. A
write into any of these goes unnoticed. The check also stops at 50,000 files per
directory. Past that it fails closed. The runner prints one line saying the
repository is too large for the write check and how many files it saw, and every
trial is recorded as an infra error (`repo_check_skipped`, with
`repoCheck: "skipped"` on the row) that never scores. Run evals from a smaller
project root.

`--skill-file` injects a skill body into the treatment prompt — that measures a
**skill**. `--plugin-dir` loads a real plugin instead — that measures a
**workflow**, the whole environment. They answer different questions; using
`--skill-file` when you meant to test the environment quietly turns a workflow
eval into a skill eval.

The two never mix, and `--plugin-dir` belongs to `workflow` scope. On a
`skill` (or `agent`) scenario, `eval ab --plugin-dir` is refused, and so is
`preflight --plugin-dir`. A comparison with the plugin loaded measures a
workflow, so write it as a `workflow` scenario with `## Plugin Dir`. Whether a
single skill triggers from its description is `claude plugin eval`'s question,
not this harness's. No run ever injects a skill body while also loading the
plugin.

### Staging a skill's files

By default the treatment gets the text of the skill file and nothing else. A
skill that tells the agent to run a script from its own folder then has a
script the agent cannot find. `--stage-skill-files` gives the injected arm the
files as well:

```bash
arcforge eval ab <name> --skill-file path/to/SKILL.md --stage-skill-files
```

`eval ab` copies the directory the skill file sits in to a temporary directory
outside the trial tree, leaving out any `.git`, `node_modules`, `.venv` and
`__pycache__` folder. The injection then opens with the line a host puts in
front of a loaded skill, `Base directory for this skill:` followed by the
copy's path. The trial's instruction to stay inside its own directory names
that path as its one exception. A skill directory that is itself a symlink
(`linked-skill -> real-skill`) is staged as the directory it points to.

Each trial gets a copy of its own, made when the trial starts and removed when
it ends, and when the command exits early. No trial is given a copy another
trial has used. A run that is killed (Ctrl-C, `kill`) cannot remove the copy of
the trial that was running. The copy is named
`arcforge-eval-skill-<PID>-<random>` under the system temp directory, and the
next command that stages skill files removes every such directory whose
process is gone. Until then it stays where it is, so that name is what to look
for after a killed run.

A symlink in the directory is copied as a link, so its target has to be inside
the directory too. `eval ab` and `eval preflight` refuse to stage a directory
holding a link whose target is an absolute path, resolves outside the
directory, or does not resolve, and name the link. Through such a link an arm
would reach files the write check does not watch and the digest does not cover.
The target is checked again in the copy. A link that stays inside only by naming
the directory itself (`../my-skill/run.sh` from a subfolder of `my-skill`) is
refused, and so is a link into a folder staging leaves out, since neither
resolves inside the copy.

The files belong to the injection. The baseline is injected with nothing, so it
gets no copy and no line, and cannot list one from inside its trial directory.
Do not put the same files into the trial with `## Setup` instead: both arms run
the same Setup, so the baseline would see them too.

A trial's copy is watched for writes while the trial runs, the same way the
project is. A trial that writes into its copy is recorded as an infra error
(`trial_wrote_skill_files`) naming what it wrote, and never scores. The run
goes on: the copy was that trial's alone, and the next trial starts from a
fresh one. A skill whose script writes into its own folder trips this check on
every trial, so its arm ends the run with no row to score.

A write into the project is different. It is recorded as `trial_wrote_repo` and
stops the run, since every later trial would run against the changed files.
That holds for a trial that wrote into its copy as well.

The write check compares each file's modification time, size and permissions,
not its content. So when a trial ends its copy is also digested again and
compared with the digest taken when it was staged. A trial that left its copy
with other content is recorded as `trial_wrote_skill_files` too, naming the
copy. Neither check sees a write that stays inside a `.git`
or `node_modules` folder in the copy: the write check skips both names and the
digest leaves them out. A script that only installs into `node_modules` there
goes unnoticed. A write into `.venv` or `__pycache__` is caught by the write
check.

Before the first trial each arm's directory is staged once and that copy
removed. A directory that cannot be staged is refused there, before any trial
has run, and the digest taken there is the one every row of the arm records. If
the skill directory is edited while the run is going, the next trial's copy has
another digest and the run stops with an error naming the directory.

Staging is a run condition. A run with the flag records `stageSkillFiles: true`
on every row of both arms and forms a pool of its own. A run without it records
nothing and pools with earlier rows. Each injected arm's row also records
`skillTextHash`, a hash of the skill text it was given, and `skillFilesHash`, a
digest of the directory staged for it. Those two identify what the arm was
given; they do not pool.

The digest covers every file and symlink in the copy, dotfiles included, in
sorted order of path: each one's path, whether its owner may execute it, and
its bytes. A symlink is not followed; its target path stands for it. Empty
directories and timestamps are left out, and so are the folders staging leaves
out. Two directories with the same files give the same digest wherever they
sit. A directory holding anything else, such as a named pipe or a socket, is
refused before anything is copied, and the refusal names the entry.

The limit is the same as for the trial directory. Nothing but the write check
and the advice in the prompt keeps an arm away from a directory it was not
given.

Each injected arm gets one staged directory, the one its skill file sits in:
`--skill-file` for the treatment and, in a two-text A/B, `--baseline-skill-file`
for the baseline (next section). An arm that needs a second skill's files is
not supported yet.

### Comparing two skill texts

A skill A/B normally asks whether the skill beats no skill. To ask whether one
wording beats another, give the baseline a text of its own:

```bash
arcforge eval ab <name> --skill-file path/to/SKILL.md --baseline-skill-file path/to/old/SKILL.md
```

The baseline is injected with the `--baseline-skill-file` text where it would
otherwise get none, so the arms differ in which text each was given. Use it when
an edit fixes something the old wording caused: an agent with no skill at all
was never misled by the old wording, so it cannot show the fix. An empty file
is refused, by `eval ab` and by `eval preflight`: an empty text is no text.

With `--stage-skill-files`, each arm gets a staged directory and a
base-directory line of its own. The baseline's copy is taken from the directory
its file sits in, so keep the old text in a directory that holds the old files.

Every row records `skillTextHash`, a hash of the text its arm was injected
with. The baseline's text is a run condition: both arms' rows record its hash
as `baselineSkillHash`. A two-text run's rows form a pool of their own per
baseline text, and are never combined with a run whose baseline was given no
text. A run without the flag records nothing and pools as before.

When the baseline's files are staged, what they contain is a run condition
too. Both arms' rows record the digest of the baseline's staged directory as
`baselineSkillFilesHash`, so two runs that give the baseline one text over
different `references/` or scripts form two pools.

Preflight has to measure the same baseline. Run `eval preflight` with the same
`--baseline-skill-file`, and with `--stage-skill-files` if the A/B stages. Its
record is keyed on the baseline text's hash, and on the digest of that
baseline's staged directory when it is staged, so `eval ab` is refused until a
preflight exists for that exact baseline. A preflight of the no-skill baseline
does not unlock a two-text A/B, and editing a script in the baseline's
directory after its preflight means running preflight again. The record carries
both as `baseline_skill_hash` and `baseline_skill_files_hash`.

The treatment's text hash and staged digest are recorded but do not pool. When
both arms are given one text and differ only in their staged files, the text
hashes are equal and `skillFilesHash` is what tells the arms apart.

To run one condition on its own, without a comparison:

```bash
arcforge eval run <name> --k 5
```

`eval run` takes `--k`, `--model`, `--effort`, `--max-turns` and `--plugin-dir`
like `ab`, plus `--no-isolate`. What that flag readmits depends on the scenario.

- **No `## Plugin Dir` (and no `--plugin-dir`):** the whole surrounding
  configuration comes back. That means your installed plugins, MCP servers,
  `CLAUDE.md` files and rules, and your user settings file with its hooks,
  output style, model and effort level.
- **With `## Plugin Dir`:** only that plugin comes back. The trial runs as a
  `--plugin-dir` trial: the named plugin loads with its hooks, every other
  installed plugin stays disabled, MCP servers stay stripped and your user
  settings file is still not read. `CLAUDE.md` files and rules stay excluded.

Either way the trial runs in its own fixture directory with arcforge's state
redirected, so your real learning state stays out of it.

`eval run` has no second arm, so its verdict is about the condition alone, not a
change. It is judged over the last k **scored** trials — an infra or grade error
is recorded and printed but never counted, and never shortens the pool:

| Verdict | Meaning |
|---------|---------|
| `SHIP` | Every scored trial passed |
| `NEEDS WORK` | At least 60% passed |
| `BLOCKED` | Fewer than 60% passed, or nothing was scored |

For a `model`-graded scenario with at least five scored trials, `SHIP` instead
means the 95% confidence interval on the mean score sits at or above 0.8, which
tolerates the grader's noise. `eval list`, `eval report` and the dashboard show
the same vocabulary over the same scored pool (`eval list` always applies the
pass-rate rule).

## Step 4 — read the verdict

```bash
arcforge eval compare eval-tdd-test-first-gate
```

| Verdict | Meaning |
|---------|---------|
| `IMPROVED` | The 95% confidence interval on the delta sits entirely above zero |
| `REGRESSED` | It sits entirely below zero |
| `INCONCLUSIVE` | It straddles zero — this is a real answer, not a failure to get one |
| `INSUFFICIENT_DATA` | Fewer than 5 trials in an arm; no defensible verdict exists yet |
| `PASS` | `non-regression` policy only (below): every scored treatment trial passed |

`INCONCLUSIVE` at k=5 usually means the effect is smaller than the noise. Raising
k narrows the interval; it does not manufacture an effect that is not there.

A scenario declaring `## Verdict Policy non-regression` is judged differently:
there is no delta to interpret, and it passes only when **every** treatment trial
that produced a score passes and at least one did — `PASS`, otherwise
`REGRESSED`, never `INSUFFICIENT_DATA`. `eval ab`, `eval compare` and the
dashboard's A/B view all apply it. That is the right policy for "this must keep
working", the wrong one for "this should help". This `PASS` is an A/B verdict,
not the preflight `PASS` from step 2.

For a scenario whose grader is not `code`, `eval compare` also spawns an analyzer
session that explains the delta in prose. The analyzer never decides the verdict,
so `arcforge eval compare <name> --no-analyzer` prints the same verdict without
spawning it — use it when you only need the reading again.

When every assertion in a scenario is model-graded, `eval ab` also runs a
**blind comparator** on each baseline/treatment pair and prints a preference
count (treatment / baseline / tie / errors). It is a supplementary signal, never
a verdict. The two outputs are shuffled into A and B, and condition labels and the
skill name are redacted; with `--baseline-skill-file`, the names of both skills are. The comparator writes a rubric of weighted criteria
derived from the task and scores each output from 0 to 1 per criterion. The
harness then does the arithmetic: each output's total is its weighted mean
score, and one output wins only when its total beats the other's by more than
0.1. Anything closer is a tie. A malformed rubric or score counts as an error,
not a tie.

## Scenario format

A scenario is one markdown file in `evals/scenarios/`. Sections the parser reads:

| Section | Purpose |
|---------|---------|
| `## Scope` | `skill`, `agent`, or `workflow` |
| `## Target` | What is under test |
| `## Context` | Situation description — **sent to the agent** |
| `## Scenario` | The task itself — **sent to the agent** |
| `## Setup` | Shell that builds the fixture repository before each trial |
| `## Environment` | Changes to the trial's `PATH` and cache directories, applied to every arm and to Setup — see [Declaring a trial's environment](#declaring-a-trials-environment) |
| `## Assertions` | What counts as success |
| `## Grader` | `code` (your own script), `model` (a model reads the transcript), or `mixed` (both) |
| `## Grader Config` | The grader command for `code`, guidance for `model`, or a note on why neither is needed |
| `## Trials` | Trials per arm, overriding the default |
| `## Max Turns` | Turn budget per trial |
| `## Preflight` | `skip` to opt out of the discriminability gate |
| `## Verdict Policy` | `non-regression` to judge pass/fail instead of delta |
| `## Claim Type` | What a pass is evidence of: `discriminative-lift`, `non-regression`, `self-improvement-smoke`, or `infra`. Inferred from the name and target when absent. `eval list` shows it and `eval report` groups by it |
| `## Plugin Dir` | The one plugin to load in the treatment of a `workflow` A/B, or under `eval run --no-isolate`. Every other installed plugin stays disabled. `${PROJECT_ROOT}` expands to the project root |
| `## Version` | Result-pooling generation — see below |

Only `## Context` and `## Scenario` reach the agent. Everything else is
machinery, which means you can write freely in the other sections — including a
`## Design Notes` section the parser ignores entirely — without leaking your
intent into the trial and teaching the agent the answer.

`## Context`, `## Grader Config`, and `## Assertions` are required.

## Declaring a trial's environment

A contained trial starts from the rebuilt environment described under
[Step 3](#step-3--ab): a `PATH` of `claude`, `node`, `npm`, `npx`, `python3` and
the system directories. A scenario that needs something else says so in `## Environment`,
one declaration per line:

```
## Environment
# arcforge is the tool under test
PATH+=${PROJECT_ROOT}/bin
PATH^=${TRIAL_DIR}/fakebin
PATH-=/usr/sbin
UV_CACHE_DIR=${TRIAL_DIR}/.cache/uv
```

| Declaration | Effect |
|-------------|--------|
| `PATH+=<dir>` | Append `<dir>` to the trial's `PATH` |
| `PATH^=<dir>` | Prepend `<dir>`, so what it holds shadows everything after it for the agent, its hooks and Setup. The session's own `claude` is not looked up on the `PATH` |
| `PATH-=<dir>` | Remove `<dir>`; a directory that is not on the `PATH` is ignored |
| `<VAR>=<dir>` | Point a cache variable at a directory inside the trial |

Declarations apply in the order written. Blank lines and lines starting with
`#` are ignored. A `## Environment` heading inside a code fence is example text,
not a section: neither `eval lint` nor the trial reads it. The rules, which
`eval lint` checks and a trial refuses to start without:

- **`<dir>` is one absolute directory.** It starts with `/`, `${PROJECT_ROOT}`
  or `${TRIAL_DIR}`. Those two placeholders are the only expansion, and only at
  the start: no `$HOME`, no `~`, no other variable. No whitespace, no `:` (one
  directory per line), no `..` segment and no control character anywhere in the
  line. A literal absolute path such as
  `/opt/homebrew/bin` is allowed, and ties the scenario to hosts that have it.
- **`PATH` is changed, never replaced.** `PATH=<dir>` is an error, and so is
  removing `.eval-trials/.bin`, whether written with `${PROJECT_ROOT}` or as
  its full path, so `claude` and `node` always resolve.
- **`<VAR>` is one of** `XDG_CACHE_HOME`, `XDG_DATA_HOME`, `XDG_BIN_HOME`,
  `UV_CACHE_DIR`, `UV_TOOL_DIR`, `UV_TOOL_BIN_DIR`, `UV_PYTHON_INSTALL_DIR`,
  `UV_INSTALL_DIR`, `PLAYWRIGHT_BROWSERS_PATH`, `PIP_CACHE_DIR` or
  `NPM_CONFIG_CACHE`, **and its value starts with `${TRIAL_DIR}/`**. That is
  what keeps an install the agent performs inside the trial: the next trial
  starts without it, and your own caches are untouched. Each may be declared
  once. No other variable can be declared, `HOME` included.

`${TRIAL_DIR}` is each trial's own directory, so `PATH^=${TRIAL_DIR}/fakebin`
names a different directory in every trial; have `## Setup` fill it. Under
`--no-isolate` with no plugin dir the same declarations are applied on top of
your own environment.

Both arms of a comparison and their Setup get the identical declarations: the
arms still differ only by the injection. Every result row records them as
written in its `environment` field (`[]` when the scenario declares none). They
are not a pooling condition, so bump `## Version` when you add or change the
section: the trials before the edit ran somewhere else.

## Assertions

Two kinds, and they can be mixed in one scenario.

**Behavioral** assertions are graded deterministically against the log of what
the agent actually did:

```markdown
## Assertions
- [tool_called] Bash:npm test
- [tool_not_called] Write:src/index.js
- [tool_before] Read < Edit
- [tool_count] Bash:git >= 2
- [tool_adjacent] Read ~ Edit
```

The part after the tool name matches the call's arguments as a **substring**. For
anything a substring cannot express — a command whose parts are separated by
other arguments — prefix the pattern with `re:` to make it a regular expression:

```markdown
- [tool_called] Bash:re:\bgit\b.*\bmerge\b
```

The `re:` marker is opt-in on purpose: patterns like `Write:/test/` are already
meaningful as substrings, so a regex is never inferred from punctuation.

What a call's arguments contain depends on the tool. `Bash` is the command,
`Read` the path, `Write` the path and the content, and `Agent` (or `Task`) the
whole input as one line of JSON, so a pattern can match anything in a
subagent's prompt. `Edit` is the path and the replaced and replacing text (each
cut at 300 characters), and `Glob` and `Grep` the pattern (`Grep` adds the path
it searched). Any other tool keeps the first 200 characters of its JSON input.
A tool call that failed is followed in the transcript by a
`[Result: <tool>] error` line — `Bash` adds its exit code when the result text
opens with `Exit code N`, as in `[Result: Bash] error (exit 1)` — but never by
what the tool returned, so a
pattern cannot match a file's or a command's output. Successful results are not
recorded, and a result line is never an action an assertion counts. Every result
row notes the transcript shape it was graded against as `transcript_format`
(`2` for the shape described here; a row without the field predates it). It is
not a pooling condition, but a pool that straddles the change matched its
assertions against different text.

**Text** assertions are graded by a model reading the transcript, and carry an
id:

```markdown
- [ ] A1: The agent names the root cause before proposing a fix
```

Prefer behavioral assertions. They cost nothing, never drift, and cannot be
argued with. Reach for a text assertion only when the claim is genuinely about
what was said rather than what was done.

A trial is a pass or a fail, never partial credit, and how the assertion scores
collapse into that verdict depends on the grader. A `mixed` scenario — behavioral
assertions plus a model reading the transcript — passes at **0.8 or above**. A
`code` grader, which runs your own script and reads its per-assertion labels, and
a `model` grader both require **every** assertion to land.

The model grader reads its method from a prompt that ships with arcforge, as do
the analyzer behind `eval compare` and the blind comparator described under
step 4. They load from the installed plugin, whichever project you run in. If one
is missing or empty, the command stops with an error that names the file rather
than grading without it.

A "floor" assertion (a minimum the agent must always meet, such as "the tests
still pass") is not a separate type, and it gets no extra weight:

- **Behavioral and `mixed` scenarios:** a floor is one assertion among the
  others, one equal share of the score. Missing it costs that share, and the
  trial still passes if the score stays at or above 0.8.
- **`code` graders:** the score is the share of `A<N>:` labels your script
  prints as `PASS`. A floor checked outside those labels adds nothing to the
  score. If it makes the script exit non-zero, though, the trial fails whatever
  its labels say.

An assertion that no run can satisfy is worse than no assertion — it scores zero
in both arms and buries the signal you were looking for. When an assertion fails
in every trial of both conditions, suspect the assertion before the agent.

## Versions and result pooling

`## Version` decides which stored results count.

Results are recorded with the version they ran under — infra-error rows
included, so a benchmark's error count covers the same pool as its scores — and
every read filters to the scenario's current version. Bump it and the old rows stop counting — the pool
starts empty and refills from the next run.

That is exactly what you want when you change the task, the fixture, or an
assertion, because results from before the edit answered a different question.
It is exactly what you do not want for a cosmetic edit, which would throw away
good data for nothing. Bump when the scenario's meaning changed; leave it alone
when only its prose did.

A pool is narrower than a version. Every row also records the conditions it ran
under: `model`, `effort`, the per-trial ceiling (`trialTimeoutMs`), the turn
budget (`maxTurns`), whether a plugin was loaded (`pluginDir`), the isolation
mode (`isolation`: `isolated`, `plugin-dir`, or `toolkit` for `--no-isolate`),
whether the run staged skill files (`stageSkillFiles`, recorded only when it did),
the text its baseline was given (`baselineSkillHash`, recorded only when it was given one), and
the files staged for that baseline (`baselineSkillFilesHash`, recorded only when some were). Rows under
different conditions answered different questions, so no reader combines them.
`eval run`, `list`, `compare`, `report` and the dashboard judge the newest
condition's pool. Each other pool is listed beside it with its row count and
conditions, as a "Not combined" line in the terminal, `other_pools` in the
benchmark, and `otherPools` in the dashboard. Rows written before these
fields existed form a pool of their own, shown as "unrecorded".

Three more fields are on every row as a record and are not conditions: no reader
pools, pairs or filters by them. `scenario_hash` is the hash of the scenario
file as the run parsed it, taken once per run, the same value a preflight
record is filed under. `node_version` is the Node.js the engine ran on.
`repo_commit` is the commit the checkout was on when the run started, read once
per run, and `null` when the project is not a git repository or git is not
installed; it names the commit, not whether the working tree was clean. Rows
from before 6.5.0 lack all three and stay in the pools they were in; a Node.js
upgrade or a new commit starts no new pool.

Only a pool with at least one scored trial can be the measurement. A pool where
every trial is an infra or grade error, such as quota refusals after switching
models, is an instrument failure. It is never judged or paired. The previous
scored pool stays current, and the failed pool is listed separately as
"Instrument failure, not a measurement" (`instrumentFailure: true` in the JSON).
When the run you just finished produced no scored trial, `eval run` says the
verdict it prints belongs to the earlier scored pool, not to this run. `eval
list` and the dashboard's scenario tables print the failed pool under the
scenario's verdict, and show `NO SCORED RUNS` when nothing was ever scored.

An A/B comparison (`compare`, the benchmark's `compared` entry, the dashboard's
A/B view) pairs its arms rather than taking each arm's newest pool on its own.
It uses the newest pair of pools, one per arm, that ran under the same model,
effort, ceiling, turn budget, isolation mode, staging, baseline text and baseline files. The one allowed difference is
the treatment itself: an isolated baseline against a treatment that loads a
plugin dir or the full toolkit. When the newest runs of the two arms don't match, the
older matching pair is judged and the rest are listed as "Not combined". When
the arms share no conditions at all, the comparison is refused and every pool
is listed; rerun `eval ab` so both arms run under the same conditions. When an
arm has rows but no scored trial, `compare` and the dashboard's A/B view refuse
instead, even if the other arm has no rows, and the refusal names that arm's
instrument failure; the benchmark's `compared` entry does the same when both
arms have rows, and has no `compared` entry otherwise. The dashboard's A/B view
shows a refusal with the reason and the pool lines, and never draws a
comparison in its place.

## Benchmarks

```bash
arcforge eval report
```

Aggregates everything on record into a snapshot: per-scenario trial counts, pass
rates, average scores, 95% confidence intervals, and A/B comparisons where both
arms exist. Snapshots are written under `evals/benchmarks/` as `latest.json` plus
a date-stamped copy, so history is kept rather than overwritten. Each report
takes the first of `YYYY-MM-DD.json`, `YYYY-MM-DD-2.json`, `-3`, ... that is not
yet used for its date, so no report overwrites another's copy, even when two run
at once. `latest.json` holds the most recent report.

A per-trial export goes to `evals/benchmarks/raw/` the same way, under the same
file name as its aggregate. Each raw row
carries its run conditions (`model`, `effort`, `trialTimeoutMs`, `maxTurns`,
`pluginDir`, `isolation`, `stageSkillFiles`, `baselineSkillHash`,
`baselineSkillFilesHash`), what its own arm was given (`skillTextHash`,
`skillFilesHash`), and its `scenario_hash`, `node_version` and `repo_commit`,
each `null` when the row recorded none. Its baseline-relative fields (`baseline_score_avg`,
`score_delta_vs_baseline_avg` and the rest) are computed against the baseline
pool that ran under the same model, effort, ceiling, turn budget, staging,
baseline text and baseline files. That
average leaves out the pool's infra and grade errors, which stay in the export
as rows of their own. A row with no such baseline gets `null` there.

```bash
arcforge eval report --since 2026-08-01
arcforge eval history
```

`--since` bounds the aggregate to recent rows. Use it after fixing a grader or
hardening a behavior, when older rows from the same version would otherwise hold
a scenario red for a problem you already fixed — and say so when you report the
number, because a bounded snapshot and a full-history one are not the same
measurement.

`history` lists every date-stamped snapshot, oldest first by the time it was
generated. A copy you keep by hand counts too, as long as its name is the date,
a `-` and any suffix (`2026-10-01-v6.1.1.json`). A file named that way whose
`generated` is not an ISO timestamp with a zone, or that has no `evals`, stops
`history` with an error naming it.

A snapshot is a summary, not a definition. It may name scenarios that were later
retired; those entries are history, not active tests.

## Reviewing the corpus

```bash
arcforge eval audit --top 10
arcforge eval dashboard --port 3333
```

`audit` reads grading history and surfaces scenarios worth promoting or retiring.
`dashboard` serves a live view at `localhost:3333` for browsing runs, arms, and
per-trial detail.

## Where this goes wrong

The failures worth knowing in advance, in the order they happen:

1. **The scenario is not discriminative.** Baseline already succeeds, so delta is
   zero regardless. This is what preflight is for; skipping it is how you get a
   confident wrong answer.
2. **The question changed between arms.** If the two conditions differ in more
   than the one thing you are testing, the delta belongs to the difference you
   forgot about.
3. **k is too small.** Five trials per arm is the floor for a verdict, not a
   target. Below it there is no verdict — the tool says so rather than guessing.
4. **The eval is testing code, not behavior.** If the question is "does this
   function work", write a unit test. Evals measure what a model does, and are a
   slow, expensive, noisy way to learn something `assert` would have told you.

The `/arcforge:evaluating` skill walks a scenario through these checks.
