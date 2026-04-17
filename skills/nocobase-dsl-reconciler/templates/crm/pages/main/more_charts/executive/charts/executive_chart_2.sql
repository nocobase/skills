WITH health_stats AS (
  SELECT
    COUNT(*) as total_customers,
    COUNT(*) FILTER (WHERE ai_health_score >= 80) as healthy,
    COUNT(*) FILTER (WHERE ai_health_score >= 50 AND ai_health_score < 80) as moderate,
    COUNT(*) FILTER (WHERE ai_health_score < 50) as at_risk,
    ROUND(AVG(ai_health_score)::numeric, 1) as avg_health_score,
    ROUND(AVG(ai_churn_risk)::numeric, 1) as avg_churn_risk,
    COUNT(*) FILTER (WHERE ai_churn_risk >= 50) as high_churn_risk,
    COUNT(*) FILTER (WHERE status = 'active') as active_customers
  FROM nb_crm_customers
  WHERE status != 'churned'
)
SELECT
  total_customers,
  healthy,
  moderate,
  at_risk,
  avg_health_score,
  avg_churn_risk,
  high_churn_risk,
  active_customers,
  ROUND(healthy * 100.0 / NULLIF(total_customers, 0), 1) as healthy_pct,
  ROUND(at_risk * 100.0 / NULLIF(total_customers, 0), 1) as at_risk_pct
FROM health_stats