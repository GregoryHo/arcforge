'use strict';

function calculateDiscount(price, customerType) {
  if (typeof price !== 'number' || price < 0) {
    throw new Error('Price must be a non-negative number');
  }
  switch (customerType) {
    case 'regular':
      return price;
    case 'premium':
      return price * 0.9;
    case 'vip':
      return price * 0.8;
    default:
      throw new Error(`Invalid customer type: ${customerType}`);
  }
}

module.exports = { calculateDiscount };
