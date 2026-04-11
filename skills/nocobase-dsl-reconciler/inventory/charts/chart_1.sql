SELECT category AS name, COUNT(*) AS value
FROM nb_inv_products
GROUP BY category
ORDER BY value DESC
