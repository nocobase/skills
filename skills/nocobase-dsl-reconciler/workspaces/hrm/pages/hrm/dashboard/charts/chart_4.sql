SELECT status AS label, COUNT(id)::int AS value
FROM "nb_hrm_employees"
GROUP BY status
ORDER BY value DESC
