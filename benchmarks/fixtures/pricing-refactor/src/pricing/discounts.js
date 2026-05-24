export function discountForLine(line, coupon) {
  if (!coupon || !line.discountable) {
    return 0;
  }

  return roundCents(line.unitPriceCents * line.quantity * coupon.percentOff / 100);
}

export function totalDiscountCents(lines, coupon) {
  return lines.reduce((total, line) => total + discountForLine(line, coupon), 0);
}

function roundCents(value) {
  return Math.round(value);
}
