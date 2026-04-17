WITH weekly_revenue AS (
  SELECT
    DATE_TRUNC('week', actual_close_date) as week,
    SUM(amount) as won_amount,
    COUNT(*) as deal_count,
    ROUND(AVG(amount)::numeric, 0) as avg_deal_size
  FROM nb_crm_opportunities
  WHERE stage = 'won'
    AND actual_close_date IS NOT NULL
    AND actual_close_date >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '12 weeks'
  GROUP BY DATE_TRUNC('week', actual_close_date)
),
weekly_forecast AS (
  SELECT
    DATE_TRUNC('week', expected_close_date) as week,
    SUM(amount * COALESCE(ai_win_probability, 50) / 100) as forecast_amount
  FROM nb_crm_opportunities
  WHERE stage NOT IN ('won', 'lost')
    AND expected_close_date IS NOT NULL
    AND expected_close_date >= CURRENT_DATE
    AND expected_close_date < CURRENT_DATE + INTERVAL '8 weeks'
  GROUP BY DATE_TRUNC('week', expected_close_date)
),
all_weeks AS (
  SELECT generate_series(
    DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '12 weeks',
    DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '4 weeks',
    '1 week'::interval
  ) as week
)
SELECT
  TO_CHAR(w.week, 'MM-DD') as week_label,
  w.week,
  COALESCE(r.won_amount, 0) as won_amount,
  COALESCE(r.deal_count, 0) as deal_count,
  COALESCE(r.avg_deal_size, 0) as avg_deal_size,
  COALESCE(f.forecast_amount, 0) as forecast_amount,
  CASE WHEN w.week > DATE_TRUNC('week', CURRENT_DATE) THEN true ELSE false END as is_forecast
FROM all_weeks w
LEFT JOIN weekly_revenue r ON r.week = w.week
LEFT JOIN weekly_forecast f ON f.week = w.week
ORDER BY w.week