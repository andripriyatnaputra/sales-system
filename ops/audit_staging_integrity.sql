-- Read-only integrity report for the staging database.
-- This intentionally reports historical violations instead of failing the
-- deployment; migration 0040 protects new and updated rows with NOT VALID
-- constraints while legacy data is reviewed separately.
BEGIN TRANSACTION READ ONLY;

SELECT 'purchase_request_items.qty_positive' AS check_name, COUNT(*)::bigint AS violations
FROM purchase_request_items
WHERE qty <= 0;

SELECT 'purchase_order_items.values_positive' AS check_name, COUNT(*)::bigint AS violations
FROM purchase_order_items
WHERE qty <= 0 OR unit_cost <= 0;

SELECT 'payment_schedules.values_valid' AS check_name, COUNT(*)::bigint AS violations
FROM payment_schedules
WHERE sequence < 1
   OR amount <= 0
   OR (percentage IS NOT NULL AND (percentage <= 0 OR percentage > 100));

SELECT 'bast_vendor_items.qty_positive' AS check_name, COUNT(*)::bigint AS violations
FROM bast_vendor_items
WHERE qty_received <= 0;

SELECT 'bast_customer_items.qty_positive' AS check_name, COUNT(*)::bigint AS violations
FROM bast_customer_items
WHERE qty_delivered <= 0;

SELECT 'billing_requests.amount_positive' AS check_name, COUNT(*)::bigint AS violations
FROM billing_requests
WHERE amount <= 0;

SELECT 'invoices.values_valid' AS check_name, COUNT(*)::bigint AS violations
FROM invoices
WHERE amount <= 0 OR tax_amount < 0;

SELECT 'invoices.due_not_before_issue' AS check_name, COUNT(*)::bigint AS violations
FROM invoices
WHERE issue_date IS NOT NULL
  AND due_date IS NOT NULL
  AND due_date < issue_date;

SELECT 'purchase_orders.over_ordered_pr_items' AS check_name, COUNT(*)::bigint AS violations
FROM (
    SELECT pri.id
    FROM purchase_request_items pri
    LEFT JOIN purchase_order_items poi ON poi.purchase_request_item_id = pri.id
    LEFT JOIN purchase_orders po
        ON po.id = poi.purchase_order_id
       AND po.status NOT IN ('rejected', 'cancelled')
    GROUP BY pri.id, pri.qty
    HAVING COALESCE(SUM(poi.qty) FILTER (WHERE po.id IS NOT NULL), 0) > pri.qty + 0.005
) violations;

SELECT 'bast_vendor.over_received_po_items' AS check_name, COUNT(*)::bigint AS violations
FROM (
    SELECT poi.id
    FROM purchase_order_items poi
    LEFT JOIN bast_vendor_items bvi ON bvi.purchase_order_item_id = poi.id
    GROUP BY poi.id, poi.qty
    HAVING COALESCE(SUM(bvi.qty_received), 0) > poi.qty + 0.005
) violations;

SELECT 'bast_customer.over_delivered_so_items' AS check_name, COUNT(*)::bigint AS violations
FROM (
    SELECT soi.id
    FROM sales_order_items soi
    LEFT JOIN bast_customer_items bci ON bci.sales_order_item_id = soi.id
    GROUP BY soi.id, soi.qty
    HAVING COALESCE(SUM(bci.qty_delivered), 0) > soi.qty + 0.005
) violations;

SELECT 'payment_schedules.over_allocated_vendor_pos' AS check_name, COUNT(*)::bigint AS violations
FROM (
    SELECT po.id
    FROM purchase_orders po
    LEFT JOIN payment_schedules ps
        ON ps.parent_type = 'vendor_po' AND ps.parent_id = po.id
    GROUP BY po.id, po.total_value
    HAVING COALESCE(SUM(ps.amount), 0) > po.total_value + 0.005
        OR COALESCE(SUM(ps.percentage), 0) > 100.005
) violations;

SELECT 'invoices.multiple_active_per_meta' AS check_name, COUNT(*)::bigint AS violations
FROM (
    SELECT billing_request_id
    FROM invoices
    WHERE status <> 'cancelled'
    GROUP BY billing_request_id
    HAVING COUNT(*) > 1
) violations;

SELECT 'approval_requests.approved_without_approved_steps' AS check_name, COUNT(*)::bigint AS violations
FROM approval_requests ar
WHERE ar.status = 'approved'
  AND (
      NOT EXISTS (
          SELECT 1 FROM approval_steps s
          WHERE s.approval_request_id = ar.id
      )
      OR EXISTS (
          SELECT 1 FROM approval_steps s
          WHERE s.approval_request_id = ar.id
            AND s.status <> 'approved'
      )
  );

SELECT 'approval_requests.pending_without_steps' AS check_name, COUNT(*)::bigint AS violations
FROM approval_requests ar
WHERE ar.status = 'pending'
  AND NOT EXISTS (
      SELECT 1 FROM approval_steps s
      WHERE s.approval_request_id = ar.id
  );

COMMIT;
