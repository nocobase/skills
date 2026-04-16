SELECT d.name AS label, (
  SELECT COUNT(e.id) FROM "nb_hrm_employees" e WHERE e."department_id" = d.id
) AS value
FROM "nb_hrm_departments" d
ORDER BY value DESC
