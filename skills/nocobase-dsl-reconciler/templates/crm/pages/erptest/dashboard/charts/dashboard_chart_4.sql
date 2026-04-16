-- PO Amount by Supplier
SELECT s.name AS label, COALESCE(sum(po.total_amount), 0) AS value
FROM nb_erp_suppliers s
LEFT JOIN nb_erp_purchase_orders po ON po."supplierId" = s.id AND po.status != 'cancelled'
GROUP BY s.name
ORDER BY value DESC
