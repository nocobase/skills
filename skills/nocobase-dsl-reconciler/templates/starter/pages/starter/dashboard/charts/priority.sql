SELECT
  COALESCE(priority, 'unspecified') AS priority,
  COUNT(*) AS count
FROM nb_starter_projects
GROUP BY priority
ORDER BY
  CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END
