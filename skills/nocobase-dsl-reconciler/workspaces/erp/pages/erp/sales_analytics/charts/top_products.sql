SELECT
  COALESCE(p.name, 'Unknown Product') AS label,
  COALESCE(SUM(ol.quantity), 0) AS value
FROM nb_erp_order_lines ol
LEFT JOIN nb_erp_products p ON ol."productId" = p.id
LEFT JOIN nb_erp_customer_orders o ON ol."orderId" = o.id
WHERE COALESCE(o.status, 'draft') <> 'cancelled'
GROUP BY COALESCE(p.name, 'Unknown Product')
ORDER BY value DESC, label ASC
LIMIT 10;
