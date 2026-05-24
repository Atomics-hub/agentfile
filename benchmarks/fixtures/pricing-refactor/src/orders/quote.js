import { totalDiscountCents } from "../pricing/discounts.js";
import { taxCents } from "../tax/rounding.js";

export function buildOrderQuote({ lines, coupon, taxRate }) {
  const subtotalCents = subtotal(lines);
  const discountCents = totalDiscountCents(lines, coupon);
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
