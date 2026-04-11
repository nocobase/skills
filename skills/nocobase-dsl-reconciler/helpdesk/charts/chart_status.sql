SELECT "status" as name, COUNT(*) as value 
FROM "nb_helpdesk_tickets" 
GROUP BY "status"
