SELECT
    COALESCE(stage, 'Not Set') as stage_name,
    COUNT(*) as opportunity_count,
    COALESCE(SUM(amount), 0) as total_amount,
    ROUND(AVG(
        CASE
            WHEN stage = 'won' THEN 1.0
            WHEN stage = 'lost' THEN 0
            ELSE win_probability
        END
    )::numeric * 100, 2) as avg_probability,
    COALESCE(SUM(
        amount * (
            CASE
                WHEN stage = 'won' THEN 1.0
                WHEN stage = 'lost' THEN 0
                ELSE win_probability
            END
        )
    ), 0) as weighted_amount
FROM nb_crm_opportunities
WHERE 1=1
  {% if ctx.var_form1.owner_99b8gb9klj1.id %}
    AND owner_id = {{ ctx.var_form1.owner_99b8gb9klj1.id }}
  {% endif %}
  {% if ctx.var_form1.date_range.length %}
    AND "createdAt" >= {{ ctx.var_form1.date_range[0] }}::timestamp
    AND "createdAt" < {{ ctx.var_form1.date_range[1] }}::timestamp + INTERVAL '1 day'
  {% endif %}
GROUP BY stage
ORDER BY
    CASE stage
        WHEN 'prospecting' THEN 1
        WHEN 'analysis' THEN 2
        WHEN 'proposal' THEN 3
        WHEN 'negotiation' THEN 4
        WHEN 'won' THEN 5
        WHEN 'lost' THEN 6
        ELSE 7
    END