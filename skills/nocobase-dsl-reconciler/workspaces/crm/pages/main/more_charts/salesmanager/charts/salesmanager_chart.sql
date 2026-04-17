WITH rep_stats AS (
  SELECT
    u.id as user_id,
    u.nickname as rep_name,
    COUNT(*) FILTER (WHERE o.stage = 'won') as won_deals,
    COALESCE(SUM(o.amount) FILTER (WHERE o.stage = 'won'), 0) as won_amount,
    COUNT(*) FILTER (WHERE o.stage NOT IN ('won', 'lost')) as active_deals,
    COALESCE(SUM(o.amount) FILTER (WHERE o.stage NOT IN ('won', 'lost')), 0) as pipeline_value,
    COALESCE(SUM(o.amount * COALESCE(o.ai_win_probability, 50) / 100)
      FILTER (WHERE o.stage NOT IN ('won', 'lost')), 0) as weighted_pipeline,
    ROUND(
      COUNT(*) FILTER (WHERE o.stage = 'won') * 100.0 /
      NULLIF(COUNT(*) FILTER (WHERE o.stage IN ('won', 'lost')), 0)
    , 1) as win_rate
  FROM users u
  LEFT JOIN nb_crm_opportunities o ON o.owner_id = u.id
  WHERE u.id IN (SELECT DISTINCT owner_id FROM nb_crm_opportunities WHERE owner_id IS NOT NULL)
  GROUP BY u.id, u.nickname
)
SELECT
  rep_name,
  won_deals,
  won_amount,
  active_deals,
  pipeline_value,
  weighted_pipeline,
  COALESCE(win_rate, 0) as win_rate,
  ROW_NUMBER() OVER (ORDER BY
    won_amount DESC
  ) as rank
FROM rep_stats
ORDER BY rank
LIMIT 10