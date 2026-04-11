SELECT p.name AS name, p."stockQuantity" AS value
FROM nb_inv_products p
ORDER BY p."stockQuantity" DESC
LIMIT 10
