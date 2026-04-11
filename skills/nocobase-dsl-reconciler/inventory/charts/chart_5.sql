SELECT s.name AS name, COUNT(p.id) AS value
FROM nb_inv_suppliers s
LEFT JOIN nb_inv_products p ON p.supplier_id = s.id
GROUP BY s.id, s.name
ORDER BY value DESC
LIMIT 8
