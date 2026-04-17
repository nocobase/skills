-- PO Status Distribution
SELECT COALESCE(status, 'unknown') AS label, count(*) AS value
FROM nb_erp_purchase_orders
GROUP BY status
ORDER BY value DESC
