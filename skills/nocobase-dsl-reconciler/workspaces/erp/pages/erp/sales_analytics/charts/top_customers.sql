SELECT
  COALESCE(c.name, 'Unknown') AS label,
  ROUND(COALESCE(SUM(o.total_amount), 0)::numeric, 2) AS value
FROM nb_erp_customer_orders o
LEFT JOIN nb_erp_customers c ON o."customerId" = c.id
WHERE o.status <> 'cancelled'
GROUP BY COALESCE(c.name, 'Unknown')
ORDER BY value DESC, label ASC
LIMIT 10;
