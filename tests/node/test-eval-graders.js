#!/usr/bin/env node
/**
 * Tests for eval-graders.js — behavioral assertions, grading, and mixed grading
 */

const assert = require('node:assert');
const {
  parseBehavioralAssertion,
  classifyAssertions,
  gradeBehavioralAssertion,
  gradeAllBehavioral,
  gradeWithMixed,
} = require('../../scripts/lib/eval-graders');

console.log('Testing eval-graders.js (behavioral assertions & mixed grading)...\n');

// ============================================================
// Feature 1: Behavioral Assertion Parser (fr-ba-001)
// ============================================================

console.log('  parseBehavioralAssertion...');

// fr-ba-001-ac1: tool_called
{
  const result = parseBehavioralAssertion('[tool_called] Skill:arc-verifying');
  assert.strictEqual(result.operator, 'tool_called');
  assert.strictEqual(result.name, 'Skill');
  assert.strictEqual(result.pattern, 'arc-verifying');
  console.log('    ✓ [tool_called] Skill:arc-verifying parsed correctly');
}

// fr-ba-001-ac5: tool_not_called
{
  const result = parseBehavioralAssertion('[tool_not_called] Bash:git push');
  assert.strictEqual(result.operator, 'tool_not_called');
  assert.strictEqual(result.name, 'Bash');
  assert.strictEqual(result.pattern, 'git push');
  console.log('    ✓ [tool_not_called] Bash:git push parsed correctly');
}

// fr-ba-001-ac2: tool_before
{
  const result = parseBehavioralAssertion(
    '[tool_before] Skill:arc-verifying < Skill:arc-finishing-epic',
  );
  assert.strictEqual(result.operator, 'tool_before');
  assert.deepStrictEqual(result.a, { name: 'Skill', pattern: 'arc-verifying' });
  assert.deepStrictEqual(result.b, { name: 'Skill', pattern: 'arc-finishing-epic' });
  console.log('    ✓ [tool_before] with two tool refs parsed correctly');
}

// fr-ba-001-ac3: tool_count
{
  const result = parseBehavioralAssertion('[tool_count] Bash:npm test >= 2');
  assert.strictEqual(result.operator, 'tool_count');
  assert.strictEqual(result.name, 'Bash');
  assert.strictEqual(result.pattern, 'npm test');
  assert.strictEqual(result.min, 2);
  console.log('    ✓ [tool_count] Bash:npm test >= 2 parsed correctly');
}

// fr-ba-001-ac6: tool_adjacent
{
  const result = parseBehavioralAssertion(
    '[tool_adjacent] Skill:arc-verifying ~ Skill:arc-finishing-epic',
  );
  assert.strictEqual(result.operator, 'tool_adjacent');
  assert.deepStrictEqual(result.a, { name: 'Skill', pattern: 'arc-verifying' });
  assert.deepStrictEqual(result.b, { name: 'Skill', pattern: 'arc-finishing-epic' });
  console.log('    ✓ [tool_adjacent] with two tool refs parsed correctly');
}

// fr-ba-001-ac4: text assertion returns null
{
  const result = parseBehavioralAssertion('[ ] Agent mentions verification');
  assert.strictEqual(result, null);
  console.log('    ✓ "[ ] text assertion" returns null (not behavioral)');
}

// Edge: plain text (no brackets) returns null
{
  const result = parseBehavioralAssertion('Agent mentions verification');
  assert.strictEqual(result, null);
  console.log('    ✓ Plain text returns null');
}

console.log('  classifyAssertions...');

// Classify a mixed list
{
  const assertions = [
    '[tool_called] Skill:arc-verifying',
    '[ ] Agent mentions verification',
    '[tool_count] Bash:npm test >= 2',
    '[ ] Output includes summary',
  ];
  const { behavioral, text } = classifyAssertions(assertions);
  assert.strictEqual(behavioral.length, 2);
  assert.strictEqual(text.length, 2);
  assert.strictEqual(behavioral[0].originalIndex, 0);
  assert.strictEqual(behavioral[0].parsed.operator, 'tool_called');
  assert.strictEqual(behavioral[1].originalIndex, 2);
  assert.strictEqual(text[0].originalIndex, 1);
  assert.strictEqual(text[0].assertion, '[ ] Agent mentions verification');
  assert.strictEqual(text[1].originalIndex, 3);
  console.log('    ✓ Mixed assertions classified correctly with original indices');
}

// All behavioral
{
  const assertions = ['[tool_called] Bash:npm test', '[tool_not_called] Bash:git push'];
  const { behavioral, text } = classifyAssertions(assertions);
  assert.strictEqual(behavioral.length, 2);
  assert.strictEqual(text.length, 0);
  console.log('    ✓ All-behavioral list classified correctly');
}

// All text
{
  const assertions = ['[ ] Agent mentions verification', '[ ] Output includes summary'];
  const { behavioral, text } = classifyAssertions(assertions);
  assert.strictEqual(behavioral.length, 0);
  assert.strictEqual(text.length, 2);
  console.log('    ✓ All-text list classified correctly');
}

// ============================================================
// Feature 2: Behavioral Assertion Grader (fr-ba-002)
// ============================================================

console.log('  gradeBehavioralAssertion...');

// Sample action log for testing
const actions = [
  { type: 'tool', name: 'Skill', args: 'arc-verifying', index: 0 },
  { type: 'text', content: 'Running verification...', index: 1 },
  { type: 'tool', name: 'Bash', args: '$ npm test', index: 2 },
  { type: 'tool', name: 'Bash', args: '$ npm test', index: 3 },
  { type: 'text', content: 'Tests passed', index: 4 },
  { type: 'tool', name: 'Skill', args: 'arc-finishing-epic', index: 5 },
];

// fr-ba-002-ac1: tool_called — match found
{
  const parsed = parseBehavioralAssertion('[tool_called] Skill:arc-verifying');
  const score = gradeBehavioralAssertion(parsed, actions);
  assert.strictEqual(score, 1);
  console.log('    ✓ tool_called: 1 when match found');
}

// fr-ba-002-ac1: tool_called — no match
{
  const parsed = parseBehavioralAssertion('[tool_called] Skill:arc-brainstorming');
  const score = gradeBehavioralAssertion(parsed, actions);
  assert.strictEqual(score, 0);
  console.log('    ✓ tool_called: 0 when no match');
}

// fr-ba-002-ac2: tool_not_called — no match (passes)
{
  const parsed = parseBehavioralAssertion('[tool_not_called] Bash:git push');
  const score = gradeBehavioralAssertion(parsed, actions);
  assert.strictEqual(score, 1);
  console.log('    ✓ tool_not_called: 1 when no match');
}

// fr-ba-002-ac2: tool_not_called — match found (fails)
{
  const parsed = parseBehavioralAssertion('[tool_not_called] Bash:npm test');
  const score = gradeBehavioralAssertion(parsed, actions);
  assert.strictEqual(score, 0);
  console.log('    ✓ tool_not_called: 0 when match found');
}

// fr-ba-002-ac3: tool_before — A before B
{
  const parsed = parseBehavioralAssertion(
    '[tool_before] Skill:arc-verifying < Skill:arc-finishing-epic',
  );
  const score = gradeBehavioralAssertion(parsed, actions);
  assert.strictEqual(score, 1);
  console.log('    ✓ tool_before: 1 when A appears before B');
}

// fr-ba-002-ac3: tool_before — A after B (fails)
{
  const parsed = parseBehavioralAssertion(
    '[tool_before] Skill:arc-finishing-epic < Skill:arc-verifying',
  );
  const score = gradeBehavioralAssertion(parsed, actions);
  assert.strictEqual(score, 0);
  console.log('    ✓ tool_before: 0 when A appears after B');
}

// fr-ba-002-ac3: tool_before — A missing (fails)
{
  const parsed = parseBehavioralAssertion(
    '[tool_before] Skill:arc-brainstorming < Skill:arc-finishing-epic',
  );
  const score = gradeBehavioralAssertion(parsed, actions);
  assert.strictEqual(score, 0);
  console.log('    ✓ tool_before: 0 when A is missing');
}

// fr-ba-002-ac3: tool_before — B missing (fails)
{
  const parsed = parseBehavioralAssertion(
    '[tool_before] Skill:arc-verifying < Skill:arc-brainstorming',
  );
  const score = gradeBehavioralAssertion(parsed, actions);
  assert.strictEqual(score, 0);
  console.log('    ✓ tool_before: 0 when B is missing');
}

// fr-ba-002-ac4: tool_count — count >= min
{
  const parsed = parseBehavioralAssertion('[tool_count] Bash:npm test >= 2');
  const score = gradeBehavioralAssertion(parsed, actions);
  assert.strictEqual(score, 1);
  console.log('    ✓ tool_count: 1 when count >= min');
}

// fr-ba-002-ac4: tool_count — count < min
{
  const parsed = parseBehavioralAssertion('[tool_count] Bash:npm test >= 5');
  const score = gradeBehavioralAssertion(parsed, actions);
  assert.strictEqual(score, 0);
  console.log('    ✓ tool_count: 0 when count < min');
}

// fr-ba-002-ac5: tool_adjacent — A and B adjacent (only text between)
{
  const parsed = parseBehavioralAssertion('[tool_adjacent] Skill:arc-verifying ~ Bash:npm test');
  const score = gradeBehavioralAssertion(parsed, actions);
  assert.strictEqual(score, 1);
  console.log('    ✓ tool_adjacent: 1 when no tool actions between A and B');
}

// fr-ba-002-ac5: tool_adjacent — tool action between A and B
{
  const parsed = parseBehavioralAssertion(
    '[tool_adjacent] Skill:arc-verifying ~ Skill:arc-finishing-epic',
  );
  const score = gradeBehavioralAssertion(parsed, actions);
  assert.strictEqual(score, 0);
  console.log('    ✓ tool_adjacent: 0 when tool actions appear between A and B');
}

// fr-ba-002-ac5: tool_adjacent — A missing
{
  const parsed = parseBehavioralAssertion(
    '[tool_adjacent] Skill:arc-brainstorming ~ Bash:npm test',
  );
  const score = gradeBehavioralAssertion(parsed, actions);
  assert.strictEqual(score, 0);
  console.log('    ✓ tool_adjacent: 0 when A is missing');
}

// ============================================================
// Feature 2b: gradeAllBehavioral convenience function
// ============================================================

console.log('  gradeAllBehavioral...');

{
  const assertions = [
    '[tool_called] Skill:arc-verifying',
    '[tool_not_called] Bash:git push',
    '[tool_count] Bash:npm test >= 5',
  ];
  const parsed = assertions.map((a) => parseBehavioralAssertion(a));
  const scores = gradeAllBehavioral(parsed, actions);
  assert.deepStrictEqual(scores, [1, 1, 0]);
  console.log('    ✓ Batch grading returns correct score array');
}

// ============================================================
// Feature 3: Mixed Grader (fr-mg-001)
// ============================================================

console.log('  gradeWithMixed...');

// fr-mg-001-ac6: 0 text assertions → pure code grading (behavioral only)
{
  const result = { output: '', trial: 1 };
  const scenario = {
    assertions: ['[tool_called] Skill:arc-verifying', '[tool_not_called] Bash:git push'],
    grader: 'mixed',
  };
  const graded = gradeWithMixed(result, scenario, '/tmp', actions);
  // Both behavioral assertions pass → score 1.0
  assert.strictEqual(graded.score, 1.0);
  assert.strictEqual(graded.passed, true);
  assert.deepStrictEqual(graded.assertionScores, [1, 1]);
  console.log('    ✓ 0 text assertions → pure behavioral grading');
}

// fr-mg-001-ac2: Behavioral scores are binary (0 or 1)
{
  const result = { output: '', trial: 1 };
  const scenario = {
    assertions: ['[tool_called] Skill:arc-verifying', '[tool_count] Bash:npm test >= 5'],
    grader: 'mixed',
  };
  const graded = gradeWithMixed(result, scenario, '/tmp', actions);
  assert.deepStrictEqual(graded.assertionScores, [1, 0]);
  assert.strictEqual(graded.score, 0.5);
  assert.strictEqual(graded.passed, false); // 0.5 < 0.8
  console.log('    ✓ Behavioral scores are binary 0 or 1');
}

// fr-mg-001-ac4: Combined score = pass_count / total. Passes if >= 0.8
{
  const result = { output: '', trial: 1 };
  const scenario = {
    assertions: [
      '[tool_called] Skill:arc-verifying',
      '[tool_not_called] Bash:git push',
      '[tool_called] Skill:arc-brainstorming', // fails
      '[tool_called] Bash:npm test',
      '[tool_before] Skill:arc-verifying < Skill:arc-finishing-epic',
    ],
    grader: 'mixed',
  };
  const graded = gradeWithMixed(result, scenario, '/tmp', actions);
  // 4 pass, 1 fail → 4/5 = 0.8 → passes
  assert.strictEqual(graded.score, 0.8);
  assert.strictEqual(graded.passed, true);
  console.log('    ✓ Combined score = pass_count / total, passes at >= 0.8');
}

// fr-mg-001-ac7: Per-assertion scores preserved
{
  const result = { output: '', trial: 1 };
  const scenario = {
    assertions: ['[tool_called] Skill:arc-verifying', '[tool_called] Skill:arc-brainstorming'],
    grader: 'mixed',
  };
  const graded = gradeWithMixed(result, scenario, '/tmp', actions);
  assert.ok(Array.isArray(graded.assertionScores));
  assert.strictEqual(graded.assertionScores.length, 2);
  assert.strictEqual(graded.assertionScores[0], 1);
  assert.strictEqual(graded.assertionScores[1], 0);
  console.log('    ✓ Per-assertion scores preserved in result');
}

console.log('\n✅ All eval-graders behavioral/mixed tests passed');
