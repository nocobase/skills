SELECT
  INITCAP(REPLACE(status, '_', ' ')) AS label,
  COUNT(*) AS value
FROM nb_erp_purchase_orders
GROUP BY status
ORDER BY value DESC, label ASC;
