SELECT COALESCE(d.name, 'Unassigned') AS label, COUNT(e.id)::int AS value
FROM "nb_hrm_departments" d
LEFT JOIN "nb_hrm_employees" e ON e."department_id" = d.id
GROUP BY d.name
ORDER BY value DESC
