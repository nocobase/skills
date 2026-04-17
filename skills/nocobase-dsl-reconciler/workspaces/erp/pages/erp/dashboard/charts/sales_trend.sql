SELECT
  TO_CHAR(DATE_TRUNC('month', order_date::timestamp), 'YYYY-MM') AS label,
  ROUND(COALESCE(SUM(total_amount), 0), 2) AS value
FROM nb_erp_customer_orders
WHERE status <> 'cancelled'
GROUP BY DATE_TRUNC('month', order_date::timestamp)
ORDER BY DATE_TRUNC('month', order_date::timestamp);
