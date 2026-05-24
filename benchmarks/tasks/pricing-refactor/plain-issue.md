# Fix invoice discount totals

Invoice summaries only apply a percent-off coupon to the first eligible line item, while order quotes apply the coupon to every eligible line item. Make invoice summaries use the same discount calculation as order quotes.

Please keep tax rounding behavior unchanged and avoid touching tax files. Add or update focused pricing tests, then run:

```sh
npm test -- pricing
npm run lint
```
