SELECT TO_CHAR("createdAt", 'MM-DD') as date, COUNT(*) as count 
FROM "nb_helpdesk_tickets" 
WHERE "createdAt" > NOW() - '14 days'::interval
GROUP BY TO_CHAR("createdAt", 'MM-DD'), DATE("createdAt")
ORDER BY DATE("createdAt")
