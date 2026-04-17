WITH activity_stats AS (
  SELECT
    type,
    COUNT(*) FILTER (
      WHERE activity_date >= DATE_TRUNC('week', CURRENT_DATE)
    ) as this_week,
    COUNT(*) FILTER (
      WHERE activity_date >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days'
        AND activity_date < DATE_TRUNC('week', CURRENT_DATE)
    ) as last_week
  FROM nb_crm_activities
  WHERE 1=1
    AND activity_date >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '14 days'
  {% if ctx.role != 'root' and ctx.role != 'admin' %}
    AND owner_id = {{ ctx.user.id }}
  {% endif %}
  GROUP BY type
)
SELECT
  CASE type
    WHEN 'call' THEN 'Calls'
    WHEN 'email' THEN 'Emails'
    WHEN 'meeting' THEN 'Meetings'
    WHEN 'visit' THEN 'Visits'
    WHEN 'note' THEN 'Notes'
    WHEN 'task' THEN 'Tasks'
    ELSE type
  END as activity_type,
  type as type_code,
  COALESCE(this_week, 0) as this_week,
  COALESCE(last_week, 0) as last_week,
  CASE
    WHEN last_week > 0 THEN ROUND((this_week - last_week) * 100.0 / last_week, 1)
    WHEN this_week > 0 THEN 100
    ELSE 0
  END as change_pct
FROM activity_stats
ORDER BY this_week DESC