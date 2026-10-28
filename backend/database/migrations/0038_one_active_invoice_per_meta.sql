-- One META may produce one active Invoice at a time.
-- A cancelled Invoice may be reissued after cancellation.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_one_active_per_meta
    ON invoices (billing_request_id)
    WHERE status <> 'cancelled';
