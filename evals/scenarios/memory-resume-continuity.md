# Eval: memory-resume-continuity

## Scope

agent

## Target

skills/arc-managing-sessions/SKILL.md

## Scenario

You are resuming a previous coding session. A session briefing file has been saved at `session-briefing.md` in the current directory. Read it first to understand:
- What was accomplished in the previous session
- What approaches were tried and FAILED (do not retry these)
- What the agreed next step is

Then continue the work: implement the password hashing functions in `src/auth.js` based on the briefing's guidance.

## Context

You are in a Node.js project that follows a zero-external-dependencies policy (Node.js built-in modules only). The previous session investigated password hashing options and documented findings in the briefing file.

## Setup

mkdir -p src

cat > src/auth.js << 'EOF'
const crypto = require('crypto');

// TODO: implement password hashing
// Current: storing plain text (security risk)
function hashPassword(password) {
  return password; // placeholder
}

function verifyPassword(password, hash) {
  return password === hash; // placeholder
}

function createSession(userId) {
  return {
    id: crypto.randomUUID(),
    userId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  };
}

module.exports = { hashPassword, verifyPassword, createSession };
EOF

cat > session-briefing.md << 'EOF'
# Session Resume: auth-refactor

## PROJECT: secure-api

## What was accomplished
- Analyzed current auth module (`src/auth.js`) for security issues
- Identified plain-text password storage as critical vulnerability
- Researched password hashing libraries and built-in alternatives

## Session Stats
- Duration: 45 minutes | Messages: 12 | Tools: Read, Bash, Grep, Edit

## Files Modified
- src/auth.js (analysis only, no changes committed yet)

## What NOT to retry
- **bcrypt / bcryptjs** — attempted installation but caused ESM/CommonJS compatibility errors. The project uses CommonJS (`require`), and bcrypt's native addon compilation failed on this system. bcryptjs had severe performance issues (>5s per hash). Do NOT use bcrypt or bcryptjs.
- **crypto.scrypt with default parameters** — tried Node.js built-in `crypto.scrypt` with default cost parameters (N=1048576), but verification took >3 seconds per check. Need reduced cost parameters.
- **Argon2** — external dependency, violates zero-external-dependencies policy. Do NOT install argon2.

## Blockers
- None

## Next Step
Implement password hashing using `crypto.scryptSync` with tuned parameters (N=16384, r=8, p=1, keyLength=64) and a random 16-byte salt. This avoids external dependencies and the performance issues. Start by implementing `hashPassword()` then `verifyPassword()`. Store the salt alongside the hash in format `salt:hash` (both hex-encoded).

## Key Decision
Chose built-in `crypto.scryptSync` over external libraries to maintain zero-external-dependencies policy.
EOF

cat > package.json << 'EOF'
{
  "name": "secure-api",
  "version": "1.0.0",
  "description": "API with secure authentication"
}
EOF

## Assertions

- [ ] Claude reads `session-briefing.md` before modifying code
- [ ] Claude does NOT use bcrypt, bcryptjs, or argon2 (the documented failed/rejected approaches)
- [ ] Claude uses `crypto.scryptSync` as the briefing's next step specifies
- [ ] Implementation includes random salt generation (crypto.randomBytes)
- [ ] Both `hashPassword()` and `verifyPassword()` are implemented with working logic
- [ ] The hash format stores salt alongside hash (so verification can extract the salt)

## Grader

code

## Grader Config

# Check auth.js was modified
if ! [ -f src/auth.js ]; then
  echo "FAIL: src/auth.js does not exist"
  exit 1
fi

AUTH=$(cat src/auth.js)

# Must NOT contain bcrypt or argon2
if echo "$AUTH" | grep -qi "bcrypt\|argon2"; then
  echo "FAIL: Used bcrypt or argon2 despite briefing warning against them"
  exit 1
fi

# Must use scryptSync
if ! echo "$AUTH" | grep -q "scryptSync"; then
  echo "FAIL: Did not use crypto.scryptSync as documented in briefing"
  exit 1
fi

# Must include salt generation
if ! echo "$AUTH" | grep -q "randomBytes"; then
  echo "FAIL: No salt generation (crypto.randomBytes) found"
  exit 1
fi

# Must implement both functions (not just placeholders)
if echo "$AUTH" | grep -q "return password;"; then
  echo "FAIL: hashPassword still returns plaintext placeholder"
  exit 1
fi

if echo "$AUTH" | grep -q "return password === hash;"; then
  echo "FAIL: verifyPassword still uses plaintext comparison placeholder"
  exit 1
fi

# Functional test: hash and verify should work
cat > test-auth.js << 'TESTEOF'
const { hashPassword, verifyPassword } = require('./src/auth.js');

let failures = 0;

// Test 1: hashPassword returns something different from input
const hash = hashPassword('mypassword123');
if (hash === 'mypassword123') {
  console.log('FAIL: hashPassword returned plaintext');
  failures++;
}

// Test 2: verifyPassword returns true for correct password
if (!verifyPassword('mypassword123', hash)) {
  console.log('FAIL: verifyPassword returned false for correct password');
  failures++;
}

// Test 3: verifyPassword returns false for wrong password
if (verifyPassword('wrongpassword', hash)) {
  console.log('FAIL: verifyPassword returned true for wrong password');
  failures++;
}

// Test 4: Different calls produce different hashes (salt is random)
const hash2 = hashPassword('mypassword123');
if (hash === hash2) {
  console.log('FAIL: Same password produced identical hashes (salt not random)');
  failures++;
}

if (failures > 0) {
  console.log('FAIL: ' + failures + ' functional test(s) failed');
  process.exit(1);
}

console.log('PASS: All functional tests passed');
TESTEOF

node test-auth.js
if [ $? -ne 0 ]; then
  exit 1
fi

echo "PASS: All checks passed"
exit 0

## Trials

3
