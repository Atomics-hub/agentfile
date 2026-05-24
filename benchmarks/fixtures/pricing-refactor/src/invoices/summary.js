import { discountForLine } from "../pricing/discounts.js";
import { taxCents } from "../tax/rounding.js";

export function buildInvoiceSummary({ lines, coupon, taxRate }) {
  const subtotalCents = subtotal(lines);
  let discountCents = 0;
  let couponApplied = false;

  for (const line of lines) {
    if (!couponApplied) {
      discountCents += discountForLine(line, coupon);
      couponApplied = discountCents > 0;
    }
  }

  const taxableCents = subtotalCents - discountCents;

  return {
    subtotalCents,
    discountCents,
    taxCents: taxCents(taxableCents, taxRate),
    totalCents: taxableCents + taxCents(taxableCents, taxRate)
  };
}

function subtotal(lines) {
  return lines.reduce((total, line) => total + line.unitPriceCents * line.quantity, 0);
}
