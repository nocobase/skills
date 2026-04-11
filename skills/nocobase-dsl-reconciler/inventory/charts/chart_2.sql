SELECT 
  TO_CHAR("movementDate", 'YYYY-MM') AS name,
  SUM(CASE WHEN "movementType" = 'Inbound' THEN quantity ELSE 0 END) AS inbound,
  SUM(CASE WHEN "movementType" = 'Outbound' THEN quantity ELSE 0 END) AS outbound
FROM nb_inv_stock_movements
WHERE "movementDate" >= NOW() - INTERVAL '6 months'
GROUP BY TO_CHAR("movementDate", 'YYYY-MM')
ORDER BY name
