# Benchmark Notes

The fixture baseline passed `npm test -- fulfillment`, `npm run lint`, and `npm run scope:check`, but failed `npm run proof:check` because shipping labels exposed raw customer email and phone values.

The `plain-issue` worker changed `src/fulfillment/label.js` and `tests/fulfillment/label.test.js`. It removed raw email and phone output from shipping labels, kept order id, recipient name, and address details, added focused regression coverage, and left CRM files unchanged.

The first patch passed fulfillment tests and lint but failed `npm run proof:check` because the implementation did not make the privacy transform explicit enough for the proof checker. The worker corrected that by naming the generated address line `publicAddressLine`.

Independent verification after the correction:

- `npm test -- fulfillment`: passed
- `npm run lint`: passed
- `npm run proof:check`: passed
- `npm run scope:check`: passed

This receipt repeats the plain-issue fulfillment comparator. It keeps the public evidence honest: the plain issue is thinner than Pact and does not explicitly require proof or scope checks, but the worker still found and ran them after reading the fixture scripts.
