SELECT status AS label, COUNT(id)::int AS value
FROM "nb_hrm_leave_requests"
GROUP BY status
ORDER BY value DESC
