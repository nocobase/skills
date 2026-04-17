WITH stage_data AS (
  SELECT
    COALESCE(s.name, o.stage) as stage_name,
    s.sort_order,
    s.color,
    COUNT(*) as deal_count,
    SUM(o.amount) as total_value,
    ROUND(AVG(o.ai_win_probability)::numeric, 1) as avg_ai_prob,
    ROUND(AVG(o.amount)::numeric, 0) as avg_deal_size
  FROM nb_crm_opportunities o
  LEFT JOIN nb_crm_opportunity_stages s ON s.code = o.stage
  WHERE o.stage NOT IN ('won', 'lost')
  GROUP BY s.name, o.stage, s.sort_order, s.color
)
SELECT
  stage_name,
  sort_order,
  color,
  deal_count,
  total_value,
  avg_ai_prob,
  avg_deal_size
FROM stage_data
ORDER BY COALESCE(sort_order, 99)