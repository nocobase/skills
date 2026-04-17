SELECT
    TO_CHAR("createdAt", 'YYYY-MM') as month,
    COUNT(*) as new_customers,
    SUM(COUNT(*)) OVER (ORDER BY TO_CHAR("createdAt", 'YYYY-MM')) as cumulative_customers
FROM nb_crm_customers
WHERE "createdAt" IS NOT NULL
  AND (is_deleted = false OR is_deleted IS NULL)
  {% if ctx.var_form1.date_range.length %}
    AND "createdAt" >= {{ ctx.var_form1.date_range[0] }}::timestamp
    AND "createdAt" < {{ ctx.var_form1.date_range[1] }}::timestamp + INTERVAL '1 day'
  {% endif %}
GROUP BY TO_CHAR("createdAt", 'YYYY-MM')
ORDER BY month ASC