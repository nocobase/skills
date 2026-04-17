SELECT
  INITCAP(REPLACE(payment_status, '_', ' ')) AS label,
  COUNT(*) AS value
FROM nb_erp_customer_orders
GROUP BY payment_status
ORDER BY value DESC, label ASC;
