-- Products per Category
SELECT c.name AS label, count(p.id) AS value
FROM nb_erp_categories c
LEFT JOIN nb_erp_products p ON p."categoryId" = c.id
GROUP BY c.name
ORDER BY value DESC
