SELECT COALESCE(attendance_status, 'unknown') AS label, COUNT(*) AS value
FROM nb_hrm_attendance
GROUP BY COALESCE(attendance_status, 'unknown')
ORDER BY value DESC, label ASC;
