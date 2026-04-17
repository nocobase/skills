-- Inventory by Warehouse
SELECT w.name AS label, COALESCE(sum(i.quantity), 0) AS value
FROM nb_erp_warehouses w
LEFT JOIN nb_erp_inventory i ON i."warehouseId" = w.id
GROUP BY w.name
ORDER BY value DESC
