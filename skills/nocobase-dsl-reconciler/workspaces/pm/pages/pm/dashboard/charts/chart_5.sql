SELECT
  CASE impact
    WHEN 'low' THEN 'Low'
    WHEN 'medium' THEN 'Medium'
    WHEN 'high' THEN 'High'
    ELSE impact
  END AS label,
  COUNT(*) AS value
FROM nb_pm_risks
GROUP BY impact
ORDER BY value DESC
