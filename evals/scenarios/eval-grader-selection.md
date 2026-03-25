# Eval: eval-grader-selection

## Scope
skill

## Target
skills/arc-evaluating/SKILL.md

## Scenario
Here is a skill that teaches AI agents to follow a specific code review methodology:

```markdown
# Code Review Skill

When reviewing code, follow these steps:
1. Read the diff completely before commenting
2. Categorize issues: bug, style, performance, security
3. Prioritize: only flag issues with confidence > 80%
4. For each issue, suggest a concrete fix
5. Never nitpick formatting if a linter is configured
```

A teammate drafted the following eval to test whether that skill changes agent behavior:

````markdown
# Draft Eval

## Scenario
Review this diff from a repository that already runs Biome in CI.

The reviewed agent must return a JSON object with this shape:

```json
{
  "summary": "short overview",
  "findings": [
    {
      "title": "short label",
      "category": "bug | style | performance | security",
      "line": 1,
      "fix": "specific proposed code change"
    }
  ]
}
```

```diff
diff --git a/src/auth.js b/src/auth.js
index 1111111..2222222 100644
--- a/src/auth.js
+++ b/src/auth.js
@@ -1,11 +1,15 @@
-export async function login(db, email, password) {
-  const rows = await db.query(
-    `SELECT id, password_hash FROM users WHERE email = '${email}'`
-  );
-  return verifyPassword(password, rows[0]?.password_hash);
+export async function login(db, email, password) {
+    const normalizedEmail = email.trim().toLowerCase();
+    const rows = await db.query(
+      `SELECT id, password_hash FROM users WHERE email = '${normalizedEmail}'`
+    );
+    return verifyPassword(password, rows[0]?.password_hash);
+}
```

## Assertions
- [ ] Output is valid JSON with a top-level `findings` array
- [ ] Every finding has `title`, `category`, `line`, and `fix`
- [ ] Output includes a finding for the SQL injection regression
- [ ] The SQL injection finding is categorized appropriately as `security`
- [ ] The suggested fix for the SQL injection is concrete and actually addresses the regression
- [ ] No finding is about indentation, quote style, or formatting because Biome is configured

## Grader
code

## Grader Config
```bash
python3 - <<'PY'
import json
import re
import sys

data = json.load(sys.stdin)
findings = data.get("findings", [])
assert isinstance(findings, list) and findings
assert all(all(k in f for k in ("title", "category", "line", "fix")) for f in findings)
text = " ".join(
    f"{f.get('title', '')} {f.get('fix', '')} {f.get('category', '')}".lower()
    for f in findings
)
assert "security" in text
assert re.search(r"sql|injection|parameter", text)
assert not re.search(r"indent|format|quote|whitespace", text)
PY
```
````

A teammate argues this draft should stay code-graded because the reviewed agent returns structured JSON.

Audit the draft and repair only the grading design so it better measures whether the skill changes review behavior.

You must preserve all of the following from the draft:
- The same code diff
- The same JSON output contract
- At least one deterministic assertion and at least one judgment-based assertion
- The Biome / "do not nitpick formatting" trap

You may edit only:
- `## Assertions`
- `## Grader`
- `## Grader Config`

You may recommend more than one grading path if needed, but you may not:
- Replace the task with a different diff
- Remove the JSON output requirement
- Turn the task into a pure free-form code review
- Rewrite the `## Scenario` section

Return ONLY this JSON object:

```json
{
  "diagnosis": "1-2 sentences",
  "revised_assertions": [
    "short assertion"
  ],
  "revised_grader_section": "replacement markdown for ## Grader and ## Grader Config",
  "why_more_discriminative": "1-2 sentences"
}
```

Rules:
- Keep `revised_assertions` to 3-5 items
- Keep `revised_grader_section` under 10 lines
- Keep the same diff and JSON contract by referencing them briefly instead of pasting them again
- Keep at least one deterministic check about JSON structure / required fields
- Keep at least one check about the SQL injection/security fix
- Keep the formatting trap explicit in either `revised_assertions` or `revised_grader_section`

## Context
**Eval type: comprehension** — Respond using only the information provided here. No file system access is needed.

## Assertions
- [ ] Agent diagnoses that the draft is flawed because it treats semantic review quality as string-matchable code checks just because the output is structured JSON
- [ ] Agent preserves the same diff, JSON review contract, and formatting trap while repairing only the grading design, rather than changing the underlying task
- [ ] Agent proposes a defensible grader strategy that keeps deterministic structure checks verifiable while moving semantic/security/fix-quality evaluation out of regex-style proxy checks

## Grader
model

## Grader Config
Score on a normalized 0.0-1.0 scale:
- `1.0`: Agent clearly explains why schema-valid JSON does not make semantic review quality code-verifiable, preserves the same task/diff/JSON contract, keeps the Biome formatting trap, and rewrites the grading design so deterministic checks remain verifiable while security-category/fix-quality checks are no longer handled by regex-style proxy logic.
- `0.75`: Agent identifies the proxy-check problem and improves the grader strategy substantially, but some revised assertions or grading details remain vague.
- `0.5`: Agent notices that the draft is weak, but mostly responds by tweaking regexes or tightening wording without fixing the underlying mismatch between verifiable structure and semantic judgment.
- `0.25`: Agent makes only superficial grader changes, drops important preserved constraints, or gives a repair that is too vague to implement.
- `0.0`: Agent accepts the code-grader draft as-is, doubles down on proxy string matching for semantic review quality, or changes the task so the original grading problem disappears.

## Trials
10

## Version
4
