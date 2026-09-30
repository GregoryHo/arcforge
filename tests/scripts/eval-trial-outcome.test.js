const {
  isTrialKilled,
  isOutputComplete,
  isProviderRefusal,
} = require('../../scripts/lib/eval-trial-outcome');

describe('eval-trial-outcome', () => {
  describe('isTrialKilled', () => {
    it('should be false when the CLI exited on its own', () => {
      expect(isTrialKilled({ stdout: 'x', stderr: '', exitCode: 0 })).toBe(false);
      expect(isTrialKilled({ stdout: '', stderr: 'boom', exitCode: 1 })).toBe(false);
    });

    it('should be false for a missing or empty exec result', () => {
      expect(isTrialKilled(undefined)).toBe(false);
      expect(isTrialKilled({})).toBe(false);
    });

    it('should detect the ETIMEDOUT shape node reports on darwin', () => {
      // Probe-observed: killed undefined, signal null, status 143.
      const err = Object.assign(new Error('ETIMEDOUT'), {
        code: 'ETIMEDOUT',
        signal: null,
        status: 143,
      });
      expect(isTrialKilled({ stdout: '', stderr: '', exitCode: 143, error: err })).toBe(true);
    });

    it('should detect the POSIX killed/signal shape', () => {
      const killedErr = Object.assign(new Error('killed'), { killed: true });
      expect(isTrialKilled({ error: killedErr })).toBe(true);
      const signalErr = Object.assign(new Error('sigterm'), { signal: 'SIGTERM' });
      expect(isTrialKilled({ error: signalErr })).toBe(true);
    });
  });

  describe('isOutputComplete', () => {
    it('should treat a terminal result event with text as complete', () => {
      expect(isOutputComplete({ textResult: 'The answer', actions: [] })).toBe(true);
    });

    it('should ignore a blank result event', () => {
      expect(isOutputComplete({ textResult: '   ', actions: [] })).toBe(false);
    });

    it('should treat a transcript ending in agent text as complete', () => {
      const actions = [
        { type: 'tool', name: 'Bash', index: 0 },
        { type: 'text', content: 'Here is the report', index: 1 },
      ];
      expect(isOutputComplete({ textResult: '', actions })).toBe(true);
    });

    it('should treat a transcript ending mid tool-loop as incomplete', () => {
      const actions = [
        { type: 'text', content: 'Let me check', index: 0 },
        { type: 'tool', name: 'Bash', index: 1 },
      ];
      expect(isOutputComplete({ textResult: '', actions })).toBe(false);
    });

    it('should treat an empty or absent action log as incomplete', () => {
      expect(isOutputComplete({ textResult: '', actions: [] })).toBe(false);
      expect(isOutputComplete({})).toBe(false);
      expect(isOutputComplete()).toBe(false);
    });
  });

  describe('isProviderRefusal', () => {
    const limitText = "You've hit your session limit · resets 3pm";

    it('should flag a limit message delivered with zero output tokens', () => {
      expect(
        isProviderRefusal({ textResult: limitText, actions: [], usage: { output_tokens: 0 } }),
      ).toBe(true);
    });

    it('should flag it whatever the wording, since no model turn produced it', () => {
      expect(
        isProviderRefusal({
          textResult: 'Quota exceeded for this organization',
          usage: { output_tokens: 0 },
        }),
      ).toBe(true);
    });

    it('should not flag a real answer, which costs output tokens', () => {
      expect(
        isProviderRefusal({ textResult: limitText, actions: [], usage: { output_tokens: 42 } }),
      ).toBe(false);
    });

    it('should not flag a trial whose usage was not reported', () => {
      expect(isProviderRefusal({ textResult: limitText, usage: { output_tokens: null } })).toBe(
        false,
      );
      expect(isProviderRefusal({ textResult: limitText })).toBe(false);
    });

    it('should not flag a trial that called a tool', () => {
      const actions = [{ type: 'tool', name: 'Bash', index: 0 }];
      expect(
        isProviderRefusal({ textResult: limitText, actions, usage: { output_tokens: 0 } }),
      ).toBe(false);
    });

    it('should not flag an empty turn — that is trial_output_missing', () => {
      expect(isProviderRefusal({ textResult: '', usage: { output_tokens: 0 } })).toBe(false);
    });
  });
});
