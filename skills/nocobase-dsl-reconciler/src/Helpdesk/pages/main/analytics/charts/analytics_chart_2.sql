-- Sales Funnel: Lead -> Opportunity -> Quotation -> Order
SELECT '1-Lead' as stage, COUNT(*) as count, 0 as potential_value
FROM nb_crm_leads
WHERE 1=1
  {% if ctx.var_form1.owner_99b8gb9klj1.id %}
    AND owner_id = {{ ctx.var_form1.owner_99b8gb9klj1.id }}
  {% endif %}
  {% if ctx.var_form1.date_range.length %}
    AND "createdAt" >= {{ ctx.var_form1.date_range[0] }}::timestamp
    AND "createdAt" < {{ ctx.var_form1.date_range[1] }}::timestamp + INTERVAL '1 day'
  {% endif %}

UNION ALL

SELECT '2-Opportunity' as stage, COUNT(*) as count, COALESCE(SUM(amount), 0) as potential_value
FROM nb_crm_opportunities
WHERE 1=1
  {% if ctx.var_form1.owner_99b8gb9klj1.id %}
    AND owner_id = {{ ctx.var_form1.owner_99b8gb9klj1.id }}
  {% endif %}
  {% if ctx.var_form1.date_range.length %}
    AND "createdAt" >= {{ ctx.var_form1.date_range[0] }}::timestamp
    AND "createdAt" < {{ ctx.var_form1.date_range[1] }}::timestamp + INTERVAL '1 day'
  {% endif %}

UNION ALL

SELECT '3-Quotation' as stage, COUNT(*) as count, COALESCE(SUM(total_amount), 0) as potential_value
FROM nb_crm_quotations
WHERE status != 'cancelled'
  {% if ctx.var_form1.date_range.length %}
    AND "createdAt" >= {{ ctx.var_form1.date_range[0] }}::timestamp
    AND "createdAt" < {{ ctx.var_form1.date_range[1] }}::timestamp + INTERVAL '1 day'
  {% endif %}

UNION ALL

SELECT '4-Order' as stage, COUNT(*) as count, COALESCE(SUM(order_amount), 0) as potential_value
FROM nb_crm_orders
WHERE 1=1
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

ORDER BY stage