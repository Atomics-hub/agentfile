import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildInvoiceSummary } from "../../src/invoices/summary.js";
import { buildOrderQuote } from "../../src/orders/quote.js";
import { taxCents } from "../../src/tax/rounding.js";

const lines = [
  {
    sku: "starter-seat",
    unitPriceCents: 1000,
    quantity: 2,
    discountable: true
  },
  {
    sku: "implementation",
    unitPriceCents: 5000,
    quantity: 1,
    discountable: false
  },
  {
    sku: "team-seat",
    unitPriceCents: 2000,
    quantity: 1,
    discountable: true
  }
];

const coupon = {
  code: "SPRING25",
  percentOff: 25
};

describe("shared discount calculation", () => {
  it("applies the same eligible-line coupon total to orders and invoices", () => {
    const quote = buildOrderQuote({ lines, coupon, taxRate: 0.0825 });
    const invoice = buildInvoiceSummary({ lines, coupon, taxRate: 0.0825 });

    assert.equal(quote.discountCents, 1000);
    assert.equal(invoice.discountCents, 1000);
    assert.deepEqual(invoice, quote);
  });

  it("preserves tax rounding behavior", () => {
    assert.equal(taxCents(1099, 0.0825), 91);
    assert.equal(taxCents(1000, 0.0725), 73);
  });
});
