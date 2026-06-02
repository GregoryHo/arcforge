const {
  sanitizeObservationPayload,
  redactObservationText,
} = require('../../scripts/lib/sanitize-observation');

// ---------------------------------------------------------------------------
// redactObservationText — adversarial fixtures
// ---------------------------------------------------------------------------

describe('redactObservationText — JSON value forms', () => {
  it('redacts JSON "api_key": "value" (spaced colon)', () => {
    const out = redactObservationText('"api_key": "sk-12345"');
    expect(out).not.toContain('sk-12345');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts JSON "api_key":"value" (no space)', () => {
    const out = redactObservationText('"api_key":"sk-12345"');
    expect(out).not.toContain('sk-12345');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts JSON "api-key": "value"', () => {
    const out = redactObservationText('"api-key": "abc-xyz"');
    expect(out).not.toContain('abc-xyz');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts JSON "secret": "value"', () => {
    const out = redactObservationText('"secret": "s3cr3t"');
    expect(out).not.toContain('s3cr3t');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts JSON "password": "value"', () => {
    const out = redactObservationText('"password": "hunter2"');
    expect(out).not.toContain('hunter2');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts JSON "token": "value"', () => {
    const out = redactObservationText('"token": "ghp_AAAA"');
    expect(out).not.toContain('ghp_AAAA');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts JSON "authorization": "value"', () => {
    const out = redactObservationText('"authorization": "Bearer tok123"');
    expect(out).not.toContain('tok123');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts JSON "credentials": "value"', () => {
    const out = redactObservationText('"credentials": "user:pass"');
    expect(out).not.toContain('user:pass');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts JSON "credential": "value" (singular)', () => {
    const out = redactObservationText('"credential": "abc"');
    expect(out).not.toContain('"abc"');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts JSON "cookie": "value"', () => {
    const out = redactObservationText('"cookie": "session=abc123"');
    expect(out).not.toContain('session=abc123');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts JSON "x-api-key": "value"', () => {
    const out = redactObservationText('"x-api-key": "apikeyval"');
    expect(out).not.toContain('apikeyval');
    expect(out).toContain('[REDACTED]');
  });
});

describe('redactObservationText — YAML value forms', () => {
  it('redacts YAML api_key: value (unquoted)', () => {
    const out = redactObservationText('api_key: sk-12345');
    expect(out).not.toContain('sk-12345');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts YAML api_key: "value" (quoted)', () => {
    const out = redactObservationText('api_key: "sk-12345"');
    expect(out).not.toContain('sk-12345');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts YAML password: mypassword', () => {
    const out = redactObservationText('password: mypassword');
    expect(out).not.toContain('mypassword');
    expect(out).toContain('[REDACTED]');
  });
});

describe('redactObservationText — dotenv / shell export forms', () => {
  it('redacts dotenv API_KEY=value', () => {
    const out = redactObservationText('OPENAI_API_KEY=sk-proj-abc');
    expect(out).not.toContain('sk-proj-abc');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts dotenv GITHUB_TOKEN=value', () => {
    const out = redactObservationText('GITHUB_TOKEN=ghp_xxxx');
    expect(out).not.toContain('ghp_xxxx');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts dotenv FOO_TOKEN=value', () => {
    const out = redactObservationText('FOO_TOKEN=secretvalue');
    expect(out).not.toContain('secretvalue');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts shell export API_KEY=value', () => {
    const out = redactObservationText('export OPENAI_API_KEY=sk-proj-xyz');
    expect(out).not.toContain('sk-proj-xyz');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts shell export GITHUB_TOKEN="value"', () => {
    const out = redactObservationText('export GITHUB_TOKEN="ghp_secret"');
    expect(out).not.toContain('ghp_secret');
    expect(out).toContain('[REDACTED]');
  });
});

describe('redactObservationText — Authorization header forms', () => {
  it('redacts Authorization: Bearer xyz', () => {
    const out = redactObservationText('Authorization: Bearer sk-12345abc');
    expect(out).not.toContain('sk-12345abc');
    expect(out).toMatch(/Authorization: Bearer \[REDACTED\]|\*\*\*/);
  });

  it('redacts Authorization: Basic xyz', () => {
    const out = redactObservationText('Authorization: Basic dXNlcjpwYXNz');
    expect(out).not.toContain('dXNlcjpwYXNz');
    expect(out).toMatch(/Authorization: Basic \[REDACTED\]|\*\*\*/);
  });

  it('redacts Authorization header embedded in curl command', () => {
    const out = redactObservationText(
      "curl -H 'Authorization: Bearer sk-12345' https://api.example.com",
    );
    expect(out).not.toContain('sk-12345');
    expect(out).toContain('https://api.example.com');
  });
});

describe('redactObservationText — URL credentials', () => {
  it('redacts https://user:pass@host', () => {
    const out = redactObservationText('https://admin:hunter2@db.internal.io/path');
    expect(out).not.toContain('hunter2');
    expect(out).toContain('[REDACTED]');
    expect(out).toContain('db.internal.io');
  });

  it('redacts http://user:pass@host', () => {
    const out = redactObservationText('http://user:secret@example.com');
    expect(out).not.toContain('secret');
    expect(out).toContain('[REDACTED]');
  });
});

describe('redactObservationText — JWT-shaped strings', () => {
  it('redacts a JWT-shaped token (eyJ...)', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMTIzIn0.signature_here_abc';
    const out = redactObservationText(jwt);
    expect(out).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(out).toContain('[REDACTED-JWT]');
  });

  it('redacts a JWT embedded in a larger string', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMTIzIn0.sig_abc_def_ghi';
    const out = redactObservationText(`Bearer ${jwt} extra text`);
    expect(out).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(out).toContain('[REDACTED-JWT]');
  });
});

describe('redactObservationText — private key blocks', () => {
  it('redacts a private key block', () => {
    const key = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA2a2rwplBQLzHPZe5TNJQM97pCm9v
-----END RSA PRIVATE KEY-----`;
    const out = redactObservationText(key);
    expect(out).not.toContain('MIIEowIBAAKCAQEA');
    expect(out).toContain('[REDACTED-KEY]');
  });

  it('redacts an EC PRIVATE KEY block', () => {
    const key = `-----BEGIN EC PRIVATE KEY-----
MHQCAQEEIOhwFcfpj1WvDXd4lMwKMKqJ
-----END EC PRIVATE KEY-----`;
    const out = redactObservationText(key);
    expect(out).not.toContain('MHQCAQEEIOhwFcfpj1WvDXd4lMwKMKqJ');
    expect(out).toContain('[REDACTED-KEY]');
  });
});

describe('redactObservationText — suffixed env vars', () => {
  it('redacts *_API_KEY pattern (STRIPE_API_KEY)', () => {
    const out = redactObservationText('STRIPE_API_KEY=sk_live_abc123');
    expect(out).not.toContain('sk_live_abc123');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts *_TOKEN pattern (SLACK_BOT_TOKEN)', () => {
    const out = redactObservationText('SLACK_BOT_TOKEN=xoxb-123-secret');
    expect(out).not.toContain('xoxb-123-secret');
    expect(out).toContain('[REDACTED]');
  });
});

describe('redactObservationText — set-cookie and auth keyword', () => {
  it('redacts set-cookie header value', () => {
    const out = redactObservationText('set-cookie: session=abc123; Path=/');
    expect(out).not.toContain('abc123');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts auth: value', () => {
    const out = redactObservationText('auth: Bearer token123');
    expect(out).not.toContain('token123');
    expect(out).toContain('[REDACTED]');
  });
});

describe('redactObservationText — edge cases', () => {
  it('returns empty string for null/undefined input', () => {
    expect(redactObservationText(null)).toBe('');
    expect(redactObservationText(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(redactObservationText('')).toBe('');
  });

  it('does not redact innocent text', () => {
    const out = redactObservationText('npm test -- --watch');
    expect(out).toBe('npm test -- --watch');
  });

  it('handles multiple secrets in one input', () => {
    const out = redactObservationText('api_key: abc123\npassword: hunter2\ntoken: ghp_xxx');
    expect(out).not.toContain('abc123');
    expect(out).not.toContain('hunter2');
    expect(out).not.toContain('ghp_xxx');
    expect(out.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('handles a secret embedded in the middle of a larger text', () => {
    const out = redactObservationText(
      'Running curl -H "api_key: secret99" -d data https://api.example.com/endpoint',
    );
    expect(out).not.toContain('secret99');
    expect(out).toContain('https://api.example.com/endpoint');
  });

  it('is idempotent — applying twice equals applying once', () => {
    const input = 'Authorization: Bearer sk-12345';
    const once = redactObservationText(input);
    const twice = redactObservationText(once);
    expect(twice).toBe(once);
  });

  it('redacts passwd keyword', () => {
    const out = redactObservationText('passwd: mypassword123');
    expect(out).not.toContain('mypassword123');
    expect(out).toContain('[REDACTED]');
  });
});

// ---------------------------------------------------------------------------
// sanitizeObservationPayload — truncation + redaction
// ---------------------------------------------------------------------------

describe('sanitizeObservationPayload — truncation', () => {
  it('returns the full string when under maxLen', () => {
    expect(sanitizeObservationPayload('hello', 100)).toBe('hello');
  });

  it('truncates with [truncated] marker when over maxLen', () => {
    const out = sanitizeObservationPayload('A'.repeat(200), 100);
    expect(out.endsWith('...[truncated]')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(100 + '...[truncated]'.length);
  });

  it('redacts AND truncates long secret-containing strings', () => {
    const big = `api_key: ${'x'.repeat(5000)}`;
    const out = sanitizeObservationPayload(big, 100);
    expect(out).not.toContain('x'.repeat(50));
    expect(out).toContain('[REDACTED]');
  });
});
