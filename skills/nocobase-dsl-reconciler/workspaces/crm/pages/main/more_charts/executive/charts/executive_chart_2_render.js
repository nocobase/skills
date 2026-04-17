const t = function(key, opts) { return ctx.t(key, Object.assign({ ns: 'nb_crm' }, opts)); };
const rawData = ctx.data.objects[0] || {};

const data = {
  total: Number(rawData.total_customers) || 0,
  healthy: Number(rawData.healthy) || 0,
  moderate: Number(rawData.moderate) || 0,
  atRisk: Number(rawData.at_risk) || 0,
  avgHealth: Number(rawData.avg_health_score) || 0,
  avgChurn: Number(rawData.avg_churn_risk) || 0,
  highChurnRisk: Number(rawData.high_churn_risk) || 0,
  healthyPct: Number(rawData.healthy_pct) || 0,
  atRiskPct: Number(rawData.at_risk_pct) || 0
};

const getHealthColor = function(score) {
  if (score >= 80) return '#52c41a';
  if (score >= 50) return '#faad14';
  return '#f5222d';
};

return {
  title: {
    text: t('Customer Health Overview'),
    subtext: `${data.total} ${t('Total Customers')}`,
    left: 'center'
  },
  tooltip: {
    formatter: function(params) {
      return `${params.seriesName}: ${params.value}`;
    }
  },
  series: [
    // Main health gauge
    {
      name: t('Avg Health Score'),
      type: 'gauge',
      center: ['50%', '55%'],
      radius: '65%',
      startAngle: 200,
      endAngle: -20,
      min: 0,
      max: 100,
      splitNumber: 10,
      axisLine: {
        lineStyle: {
          width: 20,
          color: [
            [0.5, '#f5222d'],
            [0.8, '#faad14'],
            [1, '#52c41a']
          ]
        }
      },
      pointer: {
        itemStyle: { color: 'auto' },
        width: 5,
        length: '55%'
      },
      axisTick: {
        distance: -20,
        length: 8,
        lineStyle: { color: '#fff', width: 2 }
      },
      splitLine: {
        distance: -25,
        length: 15,
        lineStyle: { color: '#fff', width: 3 }
      },
      axisLabel: {
        color: 'inherit',
        distance: 30,
        fontSize: 11
      },
      detail: {
        valueAnimation: true,
        formatter: function() { return `{value|${data.avgHealth}}\n{title|${t('Avg Health Score')}}`; },
        rich: {
          value: {
            fontSize: 28,
            fontWeight: 'bold',
            color: getHealthColor(data.avgHealth)
          },
          title: {
            fontSize: 12,
            color: '#666',
            padding: [5, 0, 0, 0]
          }
        },
        offsetCenter: [0, '70%']
      },
      data: [{ value: data.avgHealth }]
    }
  ],
  graphic: [
    // Healthy count
    {
      type: 'group',
      left: '10%',
      bottom: 30,
      children: [
        {
          type: 'circle',
          shape: { r: 8 },
          style: { fill: '#52c41a' }
        },
        {
          type: 'text',
          left: 20,
          top: -8,
          style: {
            text: `${t('Healthy')}: ${data.healthy} (${data.healthyPct}%)`,
            fontSize: 12,
            fill: '#333'
          }
        }
      ]
    },
    // Moderate count
    {
      type: 'group',
      left: 'center',
      bottom: 30,
      children: [
        {
          type: 'circle',
          shape: { r: 8 },
          style: { fill: '#faad14' }
        },
        {
          type: 'text',
          left: 20,
          top: -8,
          style: {
            text: `${t('Moderate')}: ${data.moderate}`,
            fontSize: 12,
            fill: '#333'
          }
        }
      ]
    },
    // At Risk count
    {
      type: 'group',
      right: '10%',
      bottom: 30,
      children: [
        {
          type: 'circle',
          shape: { r: 8 },
          style: { fill: '#f5222d' }
        },
        {
          type: 'text',
          left: 20,
          top: -8,
          style: {
            text: `${t('At Risk')}: ${data.atRisk} (${data.atRiskPct}%)`,
            fontSize: 12,
            fill: data.atRisk > 0 ? '#f5222d' : '#333'
          }
        }
      ]
    },
    // Churn risk warning
    data.highChurnRisk > 0 ? {
      type: 'text',
      left: 'center',
      bottom: 5,
      style: {
        text: `⚠️ ${data.highChurnRisk} ${t('customers with high churn risk')} (≥50%)`,
        fontSize: 11,
        fill: '#f5222d'
      }
    } : null
  ].filter(Boolean)
}
