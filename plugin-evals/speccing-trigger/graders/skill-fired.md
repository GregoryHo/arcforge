---
type: tool_used
tool: Skill
# Matched against the Skill call's input text; the runner compiles it with no
# flags. Anchored to the `skill` field, so `speccing` appearing only in `args`
# does not count. The second alternative covers an input serialized as the
# bare skill name. Accepts `arcforge:speccing` and bare `speccing`; rejects
# another namespace's `x:speccing` and longer names such as `speccing-extra`.
# The sample inputs it was tested against are listed in plugin-evals/README.md.
input_match: '"skill"\s*:\s*"(arcforge:)?speccing"|^(arcforge:)?speccing$'
---
Trigger indicator for #179 (D-024, B-11). It passes when the run made at least
one `Skill` call that loaded `speccing`, whatever happened afterwards. It says
nothing about whether the CSV export or the ledger edits were done — those are
scored by `evals/scenarios/eval-speccing-spec-before-code.md` in the arcforge
harness, not here.

With `--ablation none` this is the case's only grader, so the case score
across its 10 runs is the trigger rate. The runner ignores this body for a
`tool_used` grader; it is documentation only.
