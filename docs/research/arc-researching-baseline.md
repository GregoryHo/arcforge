# arc-researching Baseline Behavior

RED phase — documenting agent behavior with CURRENT SKILL.md (no Strategy, no Trials in loop, no external research in Stuck Protocol).

## Scenario A: No Strategy Section

**Prompt:** Agent given an esbuild-migration research contract, asked to generate first 3 hypotheses after baseline (22.4s).

**Agent's verbatim hypotheses:**
1. Replace webpack with esbuild entirely — "esbuild is known to be orders of magnitude faster"
2. Use esbuild-loader as drop-in replacement for babel-loader — "preserves all webpack plugin behavior while getting esbuild's speed"
3. Remove unnecessary plugins and disable source maps — "common culprits include source map generation, CSS extraction plugins, bundle analysis plugins"

**Failure mode:** Agent generated domain-informed hypotheses from **its own training knowledge**, not from any skill guidance. The research-config.md template has no Strategy section — no hypothesis playbook, no research sources, no first moves. The agent happened to know about webpack/esbuild, so it performed well here. But for an unfamiliar domain (e.g., optimizing a niche build tool, a custom algorithm, or a domain the agent has less training data on), it would have no playbook to fall back on.

**Verdict:** PARTIAL PASS — good output but not skill-guided. The skill gets zero credit for the quality of these hypotheses.

## Scenario B: No Trials in Main Loop

**Prompt:** Agent given a stochastic LLM-graded metric (skill_compliance_score). Single trial: 0.72 vs baseline 0.68. Asked to keep or discard.

**Agent's verbatim decision:**
> "You should **not keep this experiment yet**. The correct action is: Run the experiment 2 more times (for a total of 3 runs) to get a median value."

Agent found the "If results are suspicious" section (lines 224-228):
> "If non-deterministic: run each experiment 3 times and use the median"

Agent also cited the Common Rationalizations table to argue against keeping marginal improvements from single trials.

**Failure mode:** The agent found the right answer but had to **dig for it in a footnote**. The guidance lives in "Red Flags > If results are suspicious" — not in the main loop, not in the contract template, not in the decision rules. The main loop says:
```
5. RUN           — execute command
6. EXTRACT       — grep for metric
7. DECIDE        — improved? keep.
```
This implies single-trial evaluation. The multi-trial guidance is a fallback, not first-class.

**Verdict:** PARTIAL PASS — agent found the footnote and gave the correct answer. But the skill's architecture is wrong: stochastic handling should be in the contract (Trials field) and the loop (run N times), not in a "suspicious results" section.

## Scenario C: No External Research in Stuck Protocol

**Prompt:** Agent stuck after 4 consecutive failures in "reduce work" direction. Asked for exact next steps per the skill.

**Agent's verbatim next steps (quoting the skill):**
1. "Stop that line of investigation entirely"
2. "Read all results so far and identify untried approaches"
3. "Choose a fundamentally different direction"
4. "If all major directions exhausted, try combinations of previously successful changes"

**Idea generation (verbatim from skill):**
1. "Re-read the target files for angles you missed on first read"
2. "Try combining two previously successful changes" (noted: not applicable, all discarded)
3. "Try the opposite of your last 3 failed approaches"
4. "Try removing code instead of adding it"

**Failure mode:** Agent followed the skill's Stuck Protocol **exactly** — and it has no external research step. No WebSearch, no documentation lookup, no checking reference implementations, no reading the Strategy section's research sources (because there is no Strategy section). The agent is stuck in a **closed information loop**: re-read the same files, try the opposite, try removing code. It cannot learn anything new.

**Verdict:** CLEAR FAILURE — the skill actively prevents the agent from using its most powerful tool (external research) when stuck.
