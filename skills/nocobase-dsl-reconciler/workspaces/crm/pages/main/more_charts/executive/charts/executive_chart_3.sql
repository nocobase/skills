SELECT
  u.id as user_id,
  u.nickname as rep_name,
  COUNT(*) FILTER (WHERE o.stage = 'won') as won_deals,
  COUNT(*) FILTER (WHERE o.stage NOT IN ('won', 'lost')) as open_deals,
  COALESCE(SUM(o.amount) FILTER (WHERE o.stage = 'won'), 0) as won_revenue,
  COALESCE(SUM(o.amount) FILTER (WHERE o.stage NOT IN ('won', 'lost')), 0) as pipeline_value,
  CASE
    WHEN COUNT(*) FILTER (WHERE o.stage IN ('won', 'lost')) > 0
    THEN ROUND(COUNT(*) FILTER (WHERE o.stage = 'won') * 100.0 /
         COUNT(*) FILTER (WHERE o.stage IN ('won', 'lost')), 1)
    ELSE 0
  END as win_rate
FROM nb_crm_opportunities o
JOIN users u ON o.owner_id = u.id
WHERE 1=1
  AND o."createdAt" >= DATE_TRUNC('year', CURRENT_DATE)
GROUP BY u.id, u.nickname
HAVING COUNT(*) FILTER (WHERE o.stage = 'won') > 0
   OR COUNT(*) FILTER (WHERE o.stage NOT IN ('won', 'lost')) > 0
ORDER BY won_revenue DESC
LIMIT 10