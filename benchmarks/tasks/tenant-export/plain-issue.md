# Preserve Tenant Isolation In Order Exports

Order exports should only include orders that belong to the requested tenant.

Update the order export behavior so paid/exportable orders are still included, draft orders are still excluded, and data from other tenants does not appear in the export for the requested tenant.

Please update the implementation and run the export tests and lint before finishing.
