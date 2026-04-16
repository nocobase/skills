SELECT
  CASE priority
    WHEN 'low' THEN 'Low'
    WHEN 'medium' THEN 'Medium'
    WHEN 'high' THEN 'High'
    ELSE priority
  END AS label,
  COUNT(*) AS value
FROM nb_pm_tasks
GROUP BY priority
ORDER BY value DESC
