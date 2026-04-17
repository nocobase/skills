-- Product Status Distribution
SELECT COALESCE(status, 'unknown') AS label, count(*) AS value
FROM nb_erp_products
GROUP BY status
ORDER BY value DESC
