SELECT d.name AS label, COUNT(e.id) AS value
FROM "nb_hrm_departments" d
JOIN "nb_hrm_employees" e ON e."department_id" = d.id
GROUP BY d.name
ORDER BY value DESC
