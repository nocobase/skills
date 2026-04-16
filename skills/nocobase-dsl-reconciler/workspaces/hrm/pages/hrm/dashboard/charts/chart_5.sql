SELECT COALESCE(rating, 'unrated') AS label, COUNT(*) AS value
FROM nb_hrm_performance_reviews
GROUP BY COALESCE(rating, 'unrated')
ORDER BY value DESC, label ASC;
