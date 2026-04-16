SELECT
  DATE(actual_close_date) as close_date,
  COUNT(*) as deal_count,
  SUM(amount) as won_amount
FROM nb_crm_opportunities
WHERE 1=1
  AND stage = 'won'
  AND actual_close_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '3 months'
  AND actual_close_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
{% if ctx.role != 'root' and ctx.role != 'admin' %}
  AND owner_id = {{ ctx.user.id }}
{% endif %}
GROUP BY DATE(actual_close_date)
ORDER BY close_date