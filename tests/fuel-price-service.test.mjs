import assert from 'node:assert/strict';

const sampleCircleKSite = {
  id: '123456',
  name: 'CIRCLE K HERSTEDØSTERVEJ',
  address: {
    street: 'Herstedøstervej 27',
    city: 'Albertslund',
    postalCode: '2620',
    country: 'DK'
  },
  fuelPrices: [
    {
      code: 'e10',
      displayName: 'miles 95',
      price: 16.89,
      currency: 'DKK',
      volumeUnit: 'LITER',
      lastUpdated: '2026-05-23T10:00:00.000Z'
    },
    {
      code: 'diesel',
      displayName: 'miles Diesel',
      price: 16.49,
      currency: 'DKK',
      volumeUnit: 'LITER',
      lastUpdated: '2026-05-23T10:00:00.000Z'
    }
  ]
};

assert.equal(sampleCircleKSite.fuelPrices.length, 2);
assert.equal(sampleCircleKSite.fuelPrices[0].price, 16.89);
console.log('fuel price model sample ok');
