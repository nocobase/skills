SELECT
  COALESCE(s.name, 'Unassigned') AS label,
  COUNT(p.id) AS value
FROM nb_erp_products p
LEFT JOIN nb_erp_suppliers s ON p."preferred_supplierId" = s.id
WHERE p.inventory_status IN ('low_stock', 'out_of_stock')
GROUP BY COALESCE(s.name, 'Unassigned')
ORDER BY value DESC, label ASC;
