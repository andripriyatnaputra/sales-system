-- Enforce positive quantities and monetary values for all newly written
-- procurement, delivery, billing, and invoice rows. NOT VALID keeps existing
-- historical rows intact while applying the rules to new and updated rows.
-- Existing violations can be reviewed and remediated separately before the
-- constraints are validated.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'purchase_request_items_qty_positive'
    ) THEN
        ALTER TABLE purchase_request_items
            ADD CONSTRAINT purchase_request_items_qty_positive CHECK (qty > 0) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_items_values_positive'
    ) THEN
        ALTER TABLE purchase_order_items
            ADD CONSTRAINT purchase_order_items_values_positive CHECK (qty > 0 AND unit_cost > 0) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payment_schedules_values_positive'
    ) THEN
        ALTER TABLE payment_schedules
            ADD CONSTRAINT payment_schedules_values_positive
            CHECK (sequence >= 1 AND amount > 0 AND (percentage IS NULL OR (percentage > 0 AND percentage <= 100))) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'bast_vendor_items_qty_positive'
    ) THEN
        ALTER TABLE bast_vendor_items
            ADD CONSTRAINT bast_vendor_items_qty_positive CHECK (qty_received > 0) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'bast_customer_items_qty_positive'
    ) THEN
        ALTER TABLE bast_customer_items
            ADD CONSTRAINT bast_customer_items_qty_positive CHECK (qty_delivered > 0) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'billing_requests_amount_positive'
    ) THEN
        ALTER TABLE billing_requests
            ADD CONSTRAINT billing_requests_amount_positive CHECK (amount > 0) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'invoices_values_valid'
    ) THEN
        ALTER TABLE invoices
            ADD CONSTRAINT invoices_values_valid CHECK (amount > 0 AND tax_amount >= 0) NOT VALID;
    END IF;
END $$;
