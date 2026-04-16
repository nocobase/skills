SELECT
  CASE status
    WHEN 'planning' THEN 'Planning'
    WHEN 'in_progress' THEN 'In Progress'
    WHEN 'completed' THEN 'Completed'
    WHEN 'on_hold' THEN 'On Hold'
    ELSE status
  END AS label,
  COUNT(*) AS value
FROM nb_pm_projects
GROUP BY status
ORDER BY value DESC
