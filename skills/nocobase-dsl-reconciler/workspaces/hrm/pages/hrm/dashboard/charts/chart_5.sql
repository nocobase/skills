SELECT TO_CHAR("hire_date", 'YYYY-MM') AS label, COUNT(id)::int AS value
FROM "nb_hrm_employees"
WHERE "hire_date" IS NOT NULL
GROUP BY label
ORDER BY label
