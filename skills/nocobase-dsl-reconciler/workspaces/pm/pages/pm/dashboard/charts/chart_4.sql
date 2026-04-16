SELECT
  CASE status
    WHEN 'not_started' THEN 'Not Started'
    WHEN 'in_progress' THEN 'In Progress'
    WHEN 'completed' THEN 'Completed'
    ELSE status
  END AS label,
  COUNT(*) AS value
FROM nb_pm_milestones
GROUP BY status
ORDER BY value DESC
