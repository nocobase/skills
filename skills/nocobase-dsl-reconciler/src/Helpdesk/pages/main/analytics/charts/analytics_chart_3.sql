SELECT
    TO_CHAR(order_date, 'YYYY-MM') as month,
    COUNT(*) as order_count,
    COALESCE(SUM(order_amount), 0) as monthly_revenue,
    ROUND(AVG(order_amount)::numeric, 2) as avg_order_value
FROM nb_crm_orders
WHERE order_date IS NOT NULL
  {% if ctx.var_form1.owner_99b8gb9klj1.id %}
    AND owner_id = {{ ctx.var_form1.owner_99b8gb9klj1.id }}
  {% endif %}
  {% if ctx.var_form1.status_filter.length > 0 %}
    AND status = ANY({{ ctx.var_form1.status_filter }})
  {% endif %}
  {% if ctx.var_form1.date_range.length %}
    AND order_date >= {{ ctx.var_form1.date_range[0] }}::timestamp
    AND order_date < {{ ctx.var_form1.date_range[1] }}::timestamp + INTERVAL '1 day'
  {% endif %}
GROUP BY TO_CHAR(order_date, 'YYYY-MM')
ORDER BY month ASC