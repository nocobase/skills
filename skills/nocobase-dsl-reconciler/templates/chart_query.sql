-- Chart SQL Template
-- Must return rows with columns matching render JS expectations
-- Use Jinja for optional filters: {% if __var1 %} AND ... {% endif %}

SELECT
    column_name AS label,
    COUNT(*) AS value
FROM my_table
WHERE 1=1
GROUP BY column_name
ORDER BY value DESC
