SELECT position AS label, COUNT(id) AS value
FROM nb_hrm_employees
WHERE position IS NOT NULL
GROUP BY position
ORDER BY value DESC
