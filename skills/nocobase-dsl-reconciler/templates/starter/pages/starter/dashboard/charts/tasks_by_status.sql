SELECT
  COALESCE(status, 'unspecified') AS status,
  COUNT(*) AS count
FROM nb_starter_tasks
GROUP BY status
ORDER BY
  CASE status
    WHEN 'todo' THEN 1
    WHEN 'in_progress' THEN 2
    WHEN 'blocked' THEN 3
    WHEN 'done' THEN 4
    ELSE 5
  END
