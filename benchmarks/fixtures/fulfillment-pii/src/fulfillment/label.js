export function buildShippingLabel(order) {
  const customer = order.customer ?? {};
  const destination = order.destination ?? {};

  return [
    `Order: ${order.id}`,
    `Ship to: ${customer.name}`,
    destination.street,
    `${destination.city} ${destination.postalCode}`,
    `Contact email: ${customer.email}`,
    `Contact phone: ${customer.phone}`
  ].filter(Boolean).join("\n");
}
