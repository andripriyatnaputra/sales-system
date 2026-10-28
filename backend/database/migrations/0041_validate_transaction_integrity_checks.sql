-- The read-only staging audit reported no existing violations. Validate the
-- integrity constraints so PostgreSQL can treat them as fully trusted rules.
ALTER TABLE purchase_request_items
    VALIDATE CONSTRAINT purchase_request_items_qty_positive;

ALTER TABLE purchase_order_items
    VALIDATE CONSTRAINT purchase_order_items_values_positive;

ALTER TABLE payment_schedules
    VALIDATE CONSTRAINT payment_schedules_values_positive;

ALTER TABLE bast_vendor_items
    VALIDATE CONSTRAINT bast_vendor_items_qty_positive;

ALTER TABLE bast_customer_items
    VALIDATE CONSTRAINT bast_customer_items_qty_positive;

ALTER TABLE billing_requests
    VALIDATE CONSTRAINT billing_requests_amount_positive;

ALTER TABLE invoices
    VALIDATE CONSTRAINT invoices_values_valid;
