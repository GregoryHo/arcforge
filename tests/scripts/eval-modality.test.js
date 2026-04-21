/**
 * Tests for eval-modality.js — getScenarioGradingMode helper (fr-gr-005).
 *
 * Covers all-model, all-code, and mixed scenarios.
 */

const { getScenarioGradingMode } = require('../../scripts/lib/eval-modality');

function makeScenario(grader) {
  return {
    name: 'test-scenario',
    scope: 'skill',
    scenario: 'Do a task.',
    context: '',
    assertions: ['Assertion 1', 'Assertion 2'],
    grader,
    graderConfig: '',
  };
}

describe('getScenarioGradingMode', () => {
  it('returns "all-model" for a scenario with grader=model', () => {
    const scenario = makeScenario('model');
    expect(getScenarioGradingMode(scenario)).toBe('all-model');
  });

  it('returns "all-code" for a scenario with grader=code', () => {
    const scenario = makeScenario('code');
    expect(getScenarioGradingMode(scenario)).toBe('all-code');
  });

  it('returns "mixed" for a scenario with grader=mixed', () => {
    const scenario = makeScenario('mixed');
    expect(getScenarioGradingMode(scenario)).toBe('mixed');
  });

  it('returns "all-code" for a scenario with grader=human (non-model, non-mixed)', () => {
    const scenario = makeScenario('human');
    expect(getScenarioGradingMode(scenario)).toBe('all-code');
  });

  it('returns "all-code" for a scenario with no grader field (defaults to code)', () => {
    const scenario = makeScenario(undefined);
    expect(getScenarioGradingMode(scenario)).toBe('all-code');
  });
});
