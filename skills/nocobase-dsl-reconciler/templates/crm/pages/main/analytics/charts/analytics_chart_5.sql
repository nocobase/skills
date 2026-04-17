SELECT
    COALESCE(a.industry, 'Uncategorized') as industry_name,
    COUNT(DISTINCT a.id) as customer_count,
    COALESCE(SUM(o.order_amount), 0) as total_revenue
FROM nb_crm_customers a
LEFT JOIN nb_crm_orders o ON o.customer_id = a.id AND o.status = 'completed'
WHERE (a.is_deleted = false OR a.is_deleted IS NULL)
  {% if ctx.var_form1.date_range.length %}
    AND a."createdAt" >= {{ ctx.var_form1.date_range[0] }}::timestamp
    AND a."createdAt" < {{ ctx.var_form1.date_range[1] }}::timestamp + INTERVAL '1 day'
  {% endif %}
GROUP BY a.industry
ORDER BY customer_count DESC