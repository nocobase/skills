SELECT COALESCE(pay_period, 'Unknown') AS label, COALESCE(SUM(net_pay), 0) AS value
FROM nb_hrm_payroll
GROUP BY COALESCE(pay_period, 'Unknown')
ORDER BY label ASC;
