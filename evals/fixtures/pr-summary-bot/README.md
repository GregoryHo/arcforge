# reviewbot

Automation that runs on every pull request in our monorepo and posts a summary
comment for the reviewers who have not read the diff yet.

The bot's behaviour is defined entirely by the skills in `skills/`. One skill per
job; the bot loads the one whose situation matches and follows it.

Recent bot output is archived under `samples/` when someone complains about it.
