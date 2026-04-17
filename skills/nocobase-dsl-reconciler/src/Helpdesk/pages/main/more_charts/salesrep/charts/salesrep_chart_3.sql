SELECT
  status,
  CASE status
    WHEN 'new' THEN 'New'
    WHEN 'working' THEN 'Working'
    WHEN 'qualified' THEN 'Qualified'
    WHEN 'unqualified' THEN 'Unqualified'
    ELSE status
  END as status_name,
  CASE status
    WHEN 'new' THEN '#1890ff'
    WHEN 'working' THEN '#faad14'
    WHEN 'qualified' THEN '#52c41a'
    WHEN 'unqualified' THEN '#8c8c8c'
    ELSE '#d9d9d9'
  END as color,
  COUNT(*) as lead_count
FROM nb_crm_leads
WHERE 1=1
  AND is_converted = false
{% if ctx.role != 'root' and ctx.role != 'admin' %}
  AND owner_id = {{ ctx.user.id }}
{% endif %}
GROUP BY status
ORDER BY
  CASE status
    WHEN 'new' THEN 1
    WHEN 'working' THEN 2
    WHEN 'qualified' THEN 3
    WHEN 'unqualified' THEN 4
    ELSE 5
  END