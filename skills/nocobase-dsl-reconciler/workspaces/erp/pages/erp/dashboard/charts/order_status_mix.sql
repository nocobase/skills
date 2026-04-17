SELECT
  INITCAP(REPLACE(status, '_', ' ')) AS label,
  COUNT(*) AS value
FROM nb_erp_customer_orders
GROUP BY status
ORDER BY value DESC, label ASC;
