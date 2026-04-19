SELECT
  COALESCE(status, 'unspecified') AS status,
  COUNT(*) AS count
FROM nb_starter_projects
GROUP BY status
ORDER BY count DESC
