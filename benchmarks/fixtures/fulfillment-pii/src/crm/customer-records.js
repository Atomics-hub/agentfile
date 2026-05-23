export function customerRecordForSupport(customer) {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    tags: [...(customer.tags ?? [])]
  };
}
