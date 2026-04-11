SELECT w.name AS name, w.capacity AS capacity,
  COALESCE(SUM(p."stockQuantity"), 0) AS used
FROM nb_inv_warehouses w
LEFT JOIN nb_inv_stock_movements sm ON w.id = sm.warehouse_id
LEFT JOIN nb_inv_products p ON sm.product_id = p.id
GROUP BY w.id, w.name, w.capacity
ORDER BY w.name
