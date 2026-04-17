SELECT
  COALESCE(s.name, o.stage) as stage_name,
  s.sort_order,
  s.color,
  COUNT(*) as deal_count,
  SUM(o.amount) as total_value,
  ROUND(AVG(o.ai_win_probability)::numeric, 1) as avg_ai_prob
FROM nb_crm_opportunities o
LEFT JOIN nb_crm_opportunity_stages s ON s.code = o.stage
WHERE 1=1
  AND o.stage NOT IN ('won', 'lost')
{% if ctx.role != 'root' and ctx.role != 'admin' %}
  AND o.owner_id = {{ ctx.user.id }}
{% endif %}
GROUP BY s.name, o.stage, s.sort_order, s.color
ORDER BY COALESCE(s.sort_order, 99)