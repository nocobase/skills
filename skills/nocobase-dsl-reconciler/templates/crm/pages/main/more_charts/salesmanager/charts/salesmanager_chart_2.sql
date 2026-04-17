SELECT
  o.id,
  o.name as opp_name,
  c.name as customer_name,
  u.nickname as owner_name,
  o.amount,
  o.ai_win_probability,
  o.stage,
  s.name as stage_name,
  s.color as stage_color,
  o.expected_close_date,
  COALESCE(o.stagnant_days,
    EXTRACT(DAY FROM NOW() - COALESCE(o.last_activity_at, o."createdAt"))::int
  ) as days_stagnant,
  CASE
    WHEN o.ai_win_probability >= 70 THEN 'high'
    WHEN o.ai_win_probability >= 40 THEN 'medium'
    ELSE 'low'
  END as risk_level
FROM nb_crm_opportunities o
LEFT JOIN nb_crm_customers c ON c.id = o.customer_id
LEFT JOIN users u ON u.id = o.owner_id
LEFT JOIN nb_crm_opportunity_stages s ON s.code = o.stage
WHERE o.stage NOT IN ('won', 'lost')
ORDER BY o.amount DESC