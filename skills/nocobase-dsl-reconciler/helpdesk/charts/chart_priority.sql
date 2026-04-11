SELECT "priority" as category, COUNT(*) as value 
FROM "nb_helpdesk_tickets" 
GROUP BY "priority"
ORDER BY CASE "priority"
  WHEN 'P0-Critical' THEN 1
  WHEN 'P1-High' THEN 2
  WHEN 'P2-Medium' THEN 3
  WHEN 'P3-Low' THEN 4
END
