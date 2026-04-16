SELECT leave_type AS label, COUNT(id)::int AS value
FROM "nb_hrm_leave_requests"
GROUP BY leave_type
ORDER BY value DESC
