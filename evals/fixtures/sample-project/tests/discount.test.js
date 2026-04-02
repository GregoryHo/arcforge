const { describe, it } = require('node:test');
const assert = require('node:assert');
const { calculateDiscount } = require('../src/discount');

describe('calculateDiscount', () => {
  it('returns original price for regular customers', () => {
    assert.strictEqual(calculateDiscount(100, 'regular'), 100);
  });

  it('applies 10% discount for premium customers', () => {
    assert.strictEqual(calculateDiscount(100, 'premium'), 90);
  });

  it('applies 20% discount for vip customers', () => {
    assert.strictEqual(calculateDiscount(100, 'vip'), 80);
  });

  it('throws on invalid customer type', () => {
    assert.throws(() => calculateDiscount(100, 'unknown'), /Invalid customer type/);
  });

  it('throws on negative price', () => {
    assert.throws(() => calculateDiscount(-1, 'regular'), /non-negative/);
  });
});
