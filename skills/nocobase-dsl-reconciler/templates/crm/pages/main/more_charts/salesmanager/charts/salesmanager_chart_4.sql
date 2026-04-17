WITH monthly_stats AS (
  SELECT
    -- Won opportunities this month
    COALESCE(SUM(CASE
      WHEN stage = 'won'
      AND DATE_TRUNC('month', actual_close_date) = DATE_TRUNC('month', CURRENT_DATE)
      THEN amount
    END), 0) as won_amount,

    -- Won deal count
    COUNT(CASE
      WHEN stage = 'won'
      AND DATE_TRUNC('month', actual_close_date) = DATE_TRUNC('month', CURRENT_DATE)
      THEN 1
    END) as won_count,

    -- Last month comparison
    COALESCE(SUM(CASE
      WHEN stage = 'won'
      AND DATE_TRUNC('month', actual_close_date) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
      THEN amount
    END), 0) as last_month_amount,

    -- Pipeline (active opportunities)
    COALESCE(SUM(CASE
      WHEN stage NOT IN ('won', 'lost')
      THEN amount * COALESCE(ai_win_probability, 50) / 100
    END), 0) as weighted_pipeline

  FROM nb_crm_opportunities
)
SELECT
  won_amount,
  won_count,
  last_month_amount,
  weighted_pipeline,
  5000000 as target_amount,
  ROUND(won_amount * 100.0 / NULLIF(5000000, 0), 1) as achievement_rate,
  CASE
    WHEN last_month_amount > 0
    THEN ROUND((won_amount - last_month_amount) * 100.0 / last_month_amount, 1)
    ELSE 0
  END as mom_growth
FROM monthly_stats