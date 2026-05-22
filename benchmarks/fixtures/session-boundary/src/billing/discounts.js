export function discountForPlan(plan) {
  if (plan === "enterprise") {
    return 0.2;
  }

  if (plan === "pro") {
    return 0.1;
  }

  return 0;
}

