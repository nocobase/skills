SELECT "category" as name, COUNT(*) as value 
FROM "nb_helpdesk_tickets" 
GROUP BY "category"
ORDER BY value DESC
LIMIT 5
