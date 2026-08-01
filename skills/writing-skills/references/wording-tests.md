# Wording Tests and Pressure Scenarios

Two measurement protocols, cheapest first, and how to read a number that came back wrong.
Open this when you have a baseline failure in hand and are choosing the words that counter
it, when a run produced a result you did not expect, or when you are about to claim a
skill works.

- **Micro-test** — authoring-time inner loop. Does this phrasing bind behavior at all?
- **Pressure scenario** — does the agent still comply when it wants not to?

Neither is the ship gate. Where A/B eval tooling exists, that decides shipping; these two
are the floor when it does not.

## Micro-test protocol

One fresh-context sample per run: a raw API call, or a single-shot subagent. The system
prompt is the realistic context the guidance will live in — the whole skill or template,
never the guidance quoted in isolation. The user message is a task that tempts the failure.

1. **Run the no-guidance control first, always.** Same task, guidance removed. If the
   control does not exhibit the failure, stop and write nothing. Guidance against a
   failure that does not occur adds tokens and risk and buys nothing. This step is not
   optional and not skippable because the failure "obviously" happens.
2. **5+ reps per variant.** Behavior is distributional; a single sample lies in both
   directions.
3. **Read every flagged match by hand.** Score programmatically if you like, but template
   echoes and quoted counter-examples masquerade as hits. An automated count alone
   overstates both failure and success.
4. **Treat variance as a signal.** When guidance binds, the reps converge on one shape.
   Five different interpretations across five reps means the wording did not bind —
   tighten the form before adding words. Adding words to noisy guidance produces longer
   noisy guidance.

Between variants change one thing. Two edits at once and a shift in the distribution
tells you nothing about which edit moved it.

## Evidence from the wording tests

Three results worth not re-deriving:

| Finding | Evidence |
|---|---|
| A prohibition backfires on a shaping failure | Head-to-head on dispatch-prompt guidance ("make the prompt self-contained" incentive): the prohibition arm produced clearly more of the unwanted content than the positive-recipe arm — the two distributions separated fully — and trended worse than the no-guidance control. |
| One nuance clause degrades a winning recipe | Appending a single "unless it matters" clause to the winning recipe took it from consistent to noisy across reps. |
| An exemption clause does not narrow scope | "This limit does not apply to code blocks" still suppressed code blocks: the agent had already absorbed the broad limit, and the carve-back arrived too late to un-land it. |

The mechanism behind all three: a prohibition names the unwanted behavior, and under a
competing incentive the agent treats that name as a boundary to argue with ("this case is
different because..."). A recipe never mentions the unwanted behavior — it specifies the
wanted shape, so there is nothing to argue against.

Do not take any of this on faith for your own case; micro-test it. But never reach for a
prohibition by default on a shaping problem.

## Pressure scenarios

A micro-test asks whether the wording binds. A pressure scenario asks whether it survives
an agent that wants to violate it. Use them for guidance with a compliance cost — time,
rework, deleted work. Skip them for pure reference material, which has no rule to break.

**Combine three or more pressures.** Agents resist one and fold under several.

| Pressure | Example |
|---|---|
| Time | deploy window closing, emergency, deadline tonight |
| Sunk cost | hours of work that "would be wasted" |
| Authority | a senior engineer or manager says skip it |
| Exhaustion | end of day, already tired, wants to stop |
| Social | looking dogmatic, seeming inflexible |
| Pragmatic | "being pragmatic, not dogmatic" |

Four elements make a scenario bite:

1. **Concrete options.** Force an A/B/C choice; open-ended prompts get open-ended hedging.
2. **Real constraints.** Specific times, named consequences, actual file paths — not "a
   project".
3. **Act, do not advise.** Ask "what do you do?", never "what should one do?".
4. **No easy out.** Close the escape hatch of deferring the decision to a human without
   choosing.

Frame the run so the agent believes it is real work rather than a quiz, and give it the
skill under test the same way a session would.

## Reading the results

Capture the agent's rationalizations verbatim. "The agent was wrong" is not a finding;
"I already manually tested it" is — it names the exact sentence the next revision has to
counter. Every verbatim excuse is either a row in a rationalization table or evidence that
the form is wrong for this failure type.

Compliance is not the only success signal. A skill is holding when the agent picks the
right option, cites the section that made it, and names the temptation it resisted. It is
not holding when the agent invents a hybrid, argues the rule is wrong for this case, or
asks permission while making the case for the violation.

When the agent read the guidance and still went the other way, ask it directly how the
text should have been written to make the right choice unambiguous. Three answers, three
different repairs: "it was clear, I ignored it" means the form is too soft; "it should
have said X" is usually worth taking verbatim; "I did not see that section" is a placement
problem, not a wording one.

## Diagnosing a bad number

A score is a claim about two things at once: the text, and the instrument that measured it.
Decide which one you are fixing before you edit either. A rewrite aimed at a broken
measurement ships words with no evidence behind them and hides the real defect.

Rule out the instrument first — it is cheaper than a rewrite and it is wrong more often
than the text is.

| Symptom | Instrument defect to rule out |
|---|---|
| The guided arm scores *worse* than the control on a rule it visibly followed | The matcher is spelling-sensitive. Substring matches on commands break across equivalent spellings — an inserted path flag, a different working directory, an extra option — so the score records which arm typed the command a particular way, not which arm complied |
| Every rep stops at the same ceiling | The run limit, not the discipline. When the rubric grades a closing summary and reps end mid-action, it is scoring a report the run cut off |
| One assertion scores zero in every rep of *both* arms | Unsatisfiable by construction. Confirm the action it names can occur at all in the harness you are running before treating it as a failure the text must fix |
| One rep scored zero with no work in its transcript | An infrastructure or grader error wearing a score. It belongs in the log, not in the statistics |

Two habits that keep the diagnosis honest:

- **Replay a fixed matcher over the stored logs of both arms** before spending reps on a
  rerun. If the correction changes old verdicts, you have attributed the movement to the
  matcher; if the number still moves after the rerun, the remainder is the text.
- **Read the transcripts of the reps at the edges**, not just the scores. The top and
  bottom rep tell you whether the number describes the behavior you meant to measure.

When the guided arm sits at the maximum with no spread, the scenario is spent: it can
still detect a regression and can no longer detect an improvement. Say that out loud
before citing it as evidence for the next edit.
