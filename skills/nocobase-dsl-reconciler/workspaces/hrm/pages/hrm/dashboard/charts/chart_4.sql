SELECT COALESCE(leave_type, 'unknown') AS label, COUNT(*) AS value
FROM nb_hrm_leave_requests
GROUP BY COALESCE(leave_type, 'unknown')
ORDER BY value DESC, label ASC;
