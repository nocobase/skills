WITH monthly_stats AS (
  SELECT
    DATE_TRUNC('month', actual_close_date) as month,
    COUNT(*) FILTER (WHERE stage = 'won') as won_count,
    COUNT(*) FILTER (WHERE stage = 'lost') as lost_count,
    COUNT(*) as total_closed,
    SUM(amount) FILTER (WHERE stage = 'won') as won_amount,
    SUM(amount) FILTER (WHERE stage = 'lost') as lost_amount
  FROM nb_crm_opportunities
  WHERE stage IN ('won', 'lost')
    AND actual_close_date IS NOT NULL
    AND actual_close_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '12 months'
  GROUP BY DATE_TRUNC('month', actual_close_date)
)
SELECT
  TO_CHAR(month, 'YYYY-MM') as month_label,
  month,
  won_count,
  lost_count,
  total_closed,
  ROUND(won_count * 100.0 / NULLIF(total_closed, 0), 1) as win_rate,
  ROUND(won_amount * 100.0 / NULLIF(won_amount + lost_amount, 0), 1) as win_rate_by_value,
  COALESCE(won_amount, 0) as won_amount,
  COALESCE(lost_amount, 0) as lost_amount
FROM monthly_stats
WHERE total_closed > 0
ORDER BY month