# Eval: memory-resume-continuity

## Scope

skill

## Target

skills/arc-managing-sessions/SKILL.md

## Scenario

Implement password hashing in `src/auth.js`. The project uses Node.js with a zero-external-dependencies policy (built-in modules only). A session briefing from a previous session is available in `session-briefing.md`.

## Context

You are in a Node.js project. The `src/auth.js` file has placeholder password hashing functions that need to be implemented with real cryptographic hashing.

## Setup

mkdir -p src

cat > src/auth.js << 'EOF'
const crypto = require('crypto');

// TODO: implement password hashing
function hashPassword(password) {
  return password; // placeholder
}

function verifyPassword(password, hash) {
  return password === hash; // placeholder
}

module.exports = { hashPassword, verifyPassword };
EOF

cat > session-briefing.md << 'EOF'
# Session Resume: auth-refactor

## What was accomplished
- Analyzed auth module for security issues
- Benchmarked password hashing options against project constraints

## What NOT to retry
- **bcrypt / bcryptjs** — native addon compilation failed; bcryptjs too slow (>5s/hash)
- **crypto.scryptSync with standard parameters** — N=16384 caused >2s verification on CI runners. Need lower cost.
- **Argon2** — external dependency, violates zero-deps policy

## Next Step
Implement using crypto.scryptSync with our benchmarked parameters:
- Cost: N=8192, r=4, p=2 (passed CI benchmark at <500ms)
- Key length: 32 bytes
- Salt: 16 bytes from crypto.randomBytes
- Storage format: `v2$<base64-salt>$<base64-hash>` (versioned for future migration)

These specific parameters were chosen after benchmarking on CI. Do not change them.
EOF

cat > package.json << 'EOF'
{
  "name": "secure-api",
  "version": "1.0.0"
}
EOF

## Assertions

- [ ] Uses crypto.scryptSync (not bcrypt, argon2, or async scrypt)
- [ ] Uses the briefing's benchmarked cost parameter N=8192 (not the standard 16384)
- [ ] Uses keyLength=32 (not the standard 64)
- [ ] Uses base64 encoding for salt and hash (not hex)
- [ ] Output format includes `v2$` version prefix
- [ ] Functional: hash-then-verify round-trip works correctly

## Grader

code

## Grader Config

AUTH=$(cat src/auth.js)

# Must NOT contain bcrypt or argon2
if echo "$AUTH" | grep -qi "bcrypt\|argon2"; then
  echo "FAIL: Used bcrypt or argon2 despite briefing warning"
  exit 1
fi

# Must use scryptSync
if ! echo "$AUTH" | grep -q "scryptSync"; then
  echo "FAIL: Did not use crypto.scryptSync"
  exit 1
fi

# DISCRIMINATIVE: Must use N=8192 (briefing-specific, not standard 16384)
if ! echo "$AUTH" | grep -q "8192"; then
  echo "FAIL: Did not use N=8192 from briefing (used standard params instead)"
  exit 1
fi

# DISCRIMINATIVE: Must use keyLength 32 (briefing-specific, not standard 64)
if echo "$AUTH" | grep -q "keyLength.*64\|, 64[,)]\|, 64 "; then
  echo "FAIL: Used standard keyLength=64 instead of briefing's keyLength=32"
  exit 1
fi

# DISCRIMINATIVE: Must use base64 encoding (briefing-specific, not hex)
if ! echo "$AUTH" | grep -q "base64"; then
  echo "FAIL: Did not use base64 encoding from briefing"
  exit 1
fi

# DISCRIMINATIVE: Must include v2$ version prefix
if ! echo "$AUTH" | grep -q "v2"; then
  echo "FAIL: Missing v2$ version prefix from briefing format"
  exit 1
fi

# Functional test
cat > test-auth.js << 'TESTEOF'
const { hashPassword, verifyPassword } = require('./src/auth.js');
let failures = 0;

const hash = hashPassword('mypassword123');
if (hash === 'mypassword123') { console.log('FAIL: plaintext'); failures++; }
if (!hash.startsWith('v2$')) { console.log('FAIL: missing v2$ prefix, got: ' + hash.substring(0, 20)); failures++; }
if (!verifyPassword('mypassword123', hash)) { console.log('FAIL: verify correct pw'); failures++; }
if (verifyPassword('wrongpassword', hash)) { console.log('FAIL: verify wrong pw'); failures++; }
const hash2 = hashPassword('mypassword123');
if (hash === hash2) { console.log('FAIL: no random salt'); failures++; }

if (failures > 0) { console.log('FAIL: ' + failures + ' test(s) failed'); process.exit(1); }
console.log('PASS: All tests passed');
TESTEOF

node test-auth.js
if [ $? -ne 0 ]; then exit 1; fi

echo "PASS: All checks passed"
exit 0

## Version

2

## Trials

5
