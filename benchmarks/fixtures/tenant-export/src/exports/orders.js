export function exportOrdersForTenant(orders, tenantId) {
  return orders
    .filter((order) => order.status !== "draft")
    .map((order) => ({
      id: order.id,
      tenantId: order.tenantId,
      status: order.status,
      totalCents: order.totalCents
    }));
}
