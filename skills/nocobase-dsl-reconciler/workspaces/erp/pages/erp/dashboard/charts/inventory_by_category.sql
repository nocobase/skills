SELECT
  COALESCE(category, 'Uncategorized') AS label,
  ROUND(COALESCE(SUM(current_stock * standard_cost), 0), 2) AS value
FROM nb_erp_products
GROUP BY COALESCE(category, 'Uncategorized')
ORDER BY value DESC, label ASC;
