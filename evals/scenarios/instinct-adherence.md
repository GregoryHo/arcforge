# Eval: instinct-adherence

## Scope

skill

## Target

evals/skill-files/instinct-result-objects.md

## Scenario

Write a function `processOrder(order)` in a file called `order.js` that validates and processes an order object.

Validations (check in order):
1. `order` must not be null/undefined
2. `order.items` must be a non-empty array
3. `order.total` must be a positive number
4. `order.paymentMethod` must be a non-empty string
5. `order.shipping` must have `street`, `city`, and `zip` (all non-empty strings)

If all validations pass:
1. If `order.coupon === 'SAVE10'`, apply 10% discount: `discountedTotal = total * 0.9` (otherwise `discountedTotal = total`)
2. Calculate tax on the discounted total: `tax = discountedTotal * 0.08`
3. Calculate `finalTotal = discountedTotal + tax`
4. Return the processed result with finalTotal, tax, and discount amount

Handle validation failures with descriptive error messages.

Export using `module.exports = { processOrder }`.

## Context

You are writing a single JavaScript file. Node.js is available.

## Setup

# Empty directory — just write the function

## Assertions

- [ ] Function does NOT use `throw` for validation failures (no throw statements in function body)
- [ ] Failure cases return objects with `ok: false` property (Result pattern)
- [ ] Success case returns object with `ok: true` property (Result pattern)
- [ ] All 5 validation conditions are checked with descriptive errors
- [ ] Tax, discount, and finalTotal calculations are correct

## Grader

code

## Grader Config

FAIL=0
FILE=$(find . -name "*.js" -not -path "*/node_modules/*" | head -1)
if [ -z "$FILE" ] || ! grep -q "processOrder" "$FILE"; then
  echo "A1:FAIL:no JS file with processOrder found"
  echo "A2:FAIL:no file to check"
  echo "A3:FAIL:no file to check"
  exit 1
fi

# A1: Must NOT use throw for validation
if grep -q "throw" "$FILE"; then
  echo "A1:FAIL:found throw statement(s) — expected Result objects"
  FAIL=1
else
  echo "A1:PASS"
fi

# A2: Must use ok: true/false Result pattern
if grep -q "ok:" "$FILE"; then
  echo "A2:PASS"
else
  echo "A2:FAIL:no ok: property found"
  FAIL=1
fi

# A3: Functional test (validations + calculations correct)
cat > test-order.js << 'TESTEOF'
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
function checkFail(desc, input) {
  const r = processOrder(input);
  if (!r || r.ok !== false) { console.log('FAIL: ' + desc + ' — expected { ok: false }'); failures++; }
  if (r && !r.error) { console.log('FAIL: ' + desc + ' — missing error'); failures++; }
}
function checkPass(desc, input, expectProps) {
  const r = processOrder(input);
  if (!r || r.ok !== true) { console.log('FAIL: ' + desc + ' — expected { ok: true }'); failures++; return; }
  if (expectProps) {
    const v = r.value || r;
    for (const [key, val] of Object.entries(expectProps)) {
      const actual = v[key];
      if (typeof val === 'number' && Math.abs(actual - val) > 0.01) {
        console.log('FAIL: ' + desc + ' — ' + key + ': expected ' + val + ', got ' + actual);
        failures++;
      }
    }
  }
}
const ship = { street: '1 Main', city: 'NYC', zip: '10001' };
checkFail('null', null);
checkFail('undefined', undefined);
checkFail('empty items', { items: [], total: 10, paymentMethod: 'card', shipping: ship });
checkFail('zero total', { items: ['a'], total: 0, paymentMethod: 'card', shipping: ship });
checkFail('no payment', { items: ['a'], total: 10, paymentMethod: '', shipping: ship });
checkFail('missing zip', { items: ['a'], total: 10, paymentMethod: 'card', shipping: { street: '1', city: 'X' } });
checkPass('no coupon', { items: ['a'], total: 100, paymentMethod: 'card', shipping: ship }, { finalTotal: 108, tax: 8 });
checkPass('SAVE10', { items: ['a'], total: 100, paymentMethod: 'card', coupon: 'SAVE10', shipping: ship }, { finalTotal: 97.2, tax: 7.2 });
if (failures > 0) { console.log('FAIL: ' + failures + ' test(s)'); process.exit(1); }
console.log('PASS');
TESTEOF

if node test-order.js "$FILE" 2>&1; then
  echo "A3:PASS"
else
  echo "A3:FAIL:functional test failed"
  FAIL=1
fi

exit $FAIL

## Version

2

## Trials

5
