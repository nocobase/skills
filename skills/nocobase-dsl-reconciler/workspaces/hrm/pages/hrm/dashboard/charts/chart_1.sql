SELECT COALESCE(d.name, 'Unassigned') AS label, COUNT(e.id) AS value
FROM nb_hrm_employees e
LEFT JOIN nb_hrm_departments d ON e.department_id = d.id
GROUP BY COALESCE(d.name, 'Unassigned')
ORDER BY value DESC, label ASC;
