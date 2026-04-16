SELECT
  CASE status
    WHEN 'todo' THEN 'To Do'
    WHEN 'in_progress' THEN 'In Progress'
    WHEN 'done' THEN 'Done'
    WHEN 'blocked' THEN 'Blocked'
    ELSE status
  END AS label,
  COUNT(*) AS value
FROM nb_pm_tasks
GROUP BY status
ORDER BY value DESC
