# Eval: instinct-adherence

## Scope

skill

## Target

skills/arc-reflecting/SKILL.md

## Scenario

Write a function `processOrder(order)` in a file called `order.js` that validates and processes an order object.

The function must check these conditions and return early for each failure:

1. `order` must not be null/undefined → error: "Order is required"
2. `order.items` must be a non-empty array → error: "Order must have items"
3. `order.total` must be a positive number → error: "Order total must be positive"
4. `order.paymentMethod` must be a non-empty string → error: "Payment method is required"
5. `order.shipping` must have `street`, `city`, and `zip` properties (all non-empty strings) → error: "Incomplete shipping address"

If all validations pass:
- Calculate tax: `total * 0.08`
- If `order.coupon === 'SAVE10'`, apply 10% discount on `total` (before tax)
- Calculate `finalTotal = discountedTotal + tax`
- Return `{ success: true, finalTotal, tax, discount }`

For failures, return `{ success: false, error: '<message>' }`

Export using `module.exports = { processOrder }`.

## Context

You are writing a single JavaScript file. Node.js is available. Focus on clean, readable code.

## Setup

# Empty directory — just write the function

## Assertions

- [ ] Function uses early return pattern (guard clauses) for validation — each check returns immediately on failure instead of nesting
- [ ] Maximum nesting depth in the function body is 2 levels or fewer (not counting the function body itself)
- [ ] Each of the 5 validation conditions has its own standalone guard clause (not nested inside another validation's if-block)
- [ ] Function produces correct output for all validation failures
- [ ] Function calculates tax, discount, and finalTotal correctly for valid orders

## Grader

code

## Grader Config

# Find the file
FILE=$(find . -name "*.js" -not -path "*/node_modules/*" | head -1)
if [ -z "$FILE" ]; then
  echo "FAIL: No JavaScript file found"
  exit 1
fi

# Check function exists
if ! grep -q "processOrder" "$FILE"; then
  echo "FAIL: processOrder function not found"
  exit 1
fi

# Structural check: nesting depth
node -e "
const fs = require('fs');
const code = fs.readFileSync('$FILE', 'utf8');

// Find the processOrder function body
const fnMatch = code.match(/function\s+processOrder\s*\([^)]*\)\s*\{/);
if (!fnMatch) {
  // Try arrow function
  const arrowMatch = code.match(/(?:const|let)\s+processOrder\s*=\s*(?:\([^)]*\)|[^=])\s*=>\s*\{/);
  if (!arrowMatch) {
    console.log('FAIL: Could not find processOrder function definition');
    process.exit(1);
  }
}

// Count max nesting depth (brace-based)
// Start from after the function opening brace
const fnStart = code.indexOf('{', code.indexOf('processOrder'));
let depth = 0;
let maxDepth = 0;
for (let i = fnStart + 1; i < code.length; i++) {
  if (code[i] === '{') { depth++; if (depth > maxDepth) maxDepth = depth; }
  if (code[i] === '}') { depth--; if (depth < 0) break; }
}

if (maxDepth > 2) {
  console.log('FAIL: Nesting depth ' + maxDepth + ' exceeds maximum of 2 levels');
  process.exit(1);
}
console.log('PASS: Nesting depth ' + maxDepth + ' within limit');
"
NESTING_EXIT=$?

if [ $NESTING_EXIT -ne 0 ]; then
  exit 1
fi

# Functional tests
cat > /tmp/test-order.js << 'TESTEOF'
const path = require('path');
let processOrder;
try {
  const mod = require(path.resolve(process.argv[2]));
  processOrder = mod.processOrder || mod;
} catch(e) {
  console.log('FAIL: Could not load module: ' + e.message);
  process.exit(1);
}

if (typeof processOrder !== 'function') {
  console.log('FAIL: processOrder is not a function');
  process.exit(1);
}

let failures = 0;
function check(desc, input, expectSuccess, expectProps) {
  const result = processOrder(input);
  if (!result) { console.log('FAIL: ' + desc + ' — returned null/undefined'); failures++; return; }
  if (result.success !== expectSuccess) {
    console.log('FAIL: ' + desc + ' — expected success=' + expectSuccess + ' got ' + result.success);
    failures++;
    return;
  }
  if (expectProps) {
    for (const [key, val] of Object.entries(expectProps)) {
      if (typeof val === 'number') {
        if (Math.abs(result[key] - val) > 0.01) {
          console.log('FAIL: ' + desc + ' — ' + key + ' expected ' + val + ' got ' + result[key]);
          failures++;
        }
      } else if (result[key] !== val) {
        console.log('FAIL: ' + desc + ' — ' + key + ' expected ' + JSON.stringify(val) + ' got ' + JSON.stringify(result[key]));
        failures++;
      }
    }
  }
}

const validShipping = { street: '1 Main St', city: 'NYC', zip: '10001' };

// Validation failures
check('null order', null, false);
check('undefined order', undefined, false);
check('empty items', { items: [], total: 10, paymentMethod: 'card', shipping: validShipping }, false);
check('no items', { total: 10, paymentMethod: 'card', shipping: validShipping }, false);
check('zero total', { items: ['a'], total: 0, paymentMethod: 'card', shipping: validShipping }, false);
check('negative total', { items: ['a'], total: -5, paymentMethod: 'card', shipping: validShipping }, false);
check('no payment', { items: ['a'], total: 10, paymentMethod: '', shipping: validShipping }, false);
check('missing zip', { items: ['a'], total: 10, paymentMethod: 'card', shipping: { street: '1 Main', city: 'NYC' } }, false);

// Success without coupon: total=100, tax=8, finalTotal=108
check('valid order no coupon',
  { items: ['a'], total: 100, paymentMethod: 'card', shipping: validShipping },
  true, { tax: 8, finalTotal: 108 });

// Success with SAVE10: total=100, discount=10, discountedTotal=90, tax=7.2, finalTotal=97.2
check('valid order with SAVE10',
  { items: ['a'], total: 100, paymentMethod: 'card', coupon: 'SAVE10', shipping: validShipping },
  true, { tax: 7.2, finalTotal: 97.2 });

if (failures > 0) {
  console.log('FAIL: ' + failures + ' test(s) failed');
  process.exit(1);
}
console.log('PASS: All functional tests passed');
TESTEOF

node /tmp/test-order.js "$FILE"
if [ $? -ne 0 ]; then
  exit 1
fi

# Structural: count early returns (should be >= 5 for the 5 validations)
RETURN_COUNT=$(grep -c "return" "$FILE" || true)
if [ "$RETURN_COUNT" -lt 6 ]; then
  echo "WARN: Only $RETURN_COUNT return statements — may not be using early returns for all validations"
fi

echo "PASS: All checks passed"
exit 0
