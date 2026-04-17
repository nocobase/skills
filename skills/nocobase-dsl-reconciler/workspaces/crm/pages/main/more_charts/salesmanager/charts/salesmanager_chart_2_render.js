const t = function(key, opts) { return ctx.t(key, Object.assign({ ns: 'nb_crm' }, opts)); };
const data = ctx.data.objects || [];

const formatCurrency = function(val) {
  if (val >= 1000000) return '$' + (val / 1000000).toFixed(1) + 'M';
  if (val >= 1000) return '$' + (val / 1000).toFixed(0) + 'K';
  return '$' + val.toFixed(0);
};

// Prepare scatter data with size based on stagnant days
const scatterData = data.map(function(item) { return {
  value: [
    Number(item.ai_win_probability),
    Number(item.amount),
    Number(item.days_stagnant) || 0
  ],
  name: item.opp_name,
  customer: item.customer_name,
  owner: item.owner_name,
  stage: item.stage_name,
  stageColor: item.stage_color,
  riskLevel: item.risk_level,
  symbolSize: Math.max(10, Math.min(40, Number(item.days_stagnant) / 2 + 10)),
  itemStyle: {
    color: item.risk_level === 'high' ? '#52c41a' :
           item.risk_level === 'medium' ? '#faad14' : '#f5222d'
  }
}; });

// Calculate quadrant counts
const highValue = data.filter(function(d) { return Number(d.amount) >= 500000; });
const lowProb = data.filter(function(d) { return Number(d.ai_win_probability) < 50; });
const atRisk = data.filter(function(d) { return Number(d.amount) >= 500000 && Number(d.ai_win_probability) < 50; });

return {
  title: {
    text: t('AI Win Probability vs Deal Size'),
    subtext: `${data.length} ${t('Active Deals')} | ${atRisk.length} ${t('At-Risk High-Value Deals')}`,
    left: 'center'
  },
  tooltip: {
    formatter: function(params) {
      const d = params.data;
      return `<b>${d.name}</b><br/>
        ${t('Customer')}: ${d.customer}<br/>
        ${t('Owner')}: ${d.owner}<br/>
        ${t('Stage')}: ${d.stage}<br/>
        ${t('Amount')}: ${formatCurrency(d.value[1])}<br/>
        ${t('AI Win Prob')}: ${d.value[0]}%<br/>
        ${t('Days Stagnant')}: ${d.value[2]}`;
    }
  },
  legend: {
    data: [t('High Prob (≥70%)'), t('Medium (40-70%)'), t('Low Prob (<40%)')],
    bottom: 10
  },
  grid: {
    left: '10%',
    right: '10%',
    top: 80,
    bottom: 80
  },
  xAxis: {
    name: t('AI Win Probability (%)'),
    nameLocation: 'middle',
    nameGap: 30,
    min: 0,
    max: 100,
    splitLine: {
      lineStyle: { type: 'dashed' }
    }
  },
  yAxis: {
    name: t('Deal Size'),
    nameLocation: 'middle',
    nameGap: 60,
    type: 'value',
    axisLabel: {
      formatter: function(val) { return formatCurrency(val); }
    },
    splitLine: {
      lineStyle: { type: 'dashed' }
    }
  },
  series: [
    {
      name: t('High Prob (≥70%)'),
      type: 'scatter',
      data: scatterData.filter(function(d) { return d.riskLevel === 'high'; }),
      emphasis: {
        focus: 'series',
        itemStyle: {
          shadowBlur: 10,
          shadowColor: 'rgba(0, 0, 0, 0.3)'
        }
      }
    },
    {
      name: t('Medium (40-70%)'),
      type: 'scatter',
      data: scatterData.filter(function(d) { return d.riskLevel === 'medium'; }),
      emphasis: {
        focus: 'series'
      }
    },
    {
      name: t('Low Prob (<40%)'),
      type: 'scatter',
      data: scatterData.filter(function(d) { return d.riskLevel === 'low'; }),
      emphasis: {
        focus: 'series'
      }
    }
  ],
  // Mark danger zone
  graphic: [
    {
      type: 'rect',
      left: '10%',
      top: 80,
      shape: {
        width: '24%',
        height: '40%'
      },
      style: {
        fill: 'rgba(245, 34, 45, 0.05)'
      },
      z: -1
    },
    {
      type: 'text',
      left: '12%',
      top: 90,
      style: {
        text: t('Danger Zone'),
        fontSize: 11,
        fill: '#f5222d'
      }
    }
  ],
  dataZoom: [
    {
      type: 'inside',
      xAxisIndex: 0
    },
    {
      type: 'inside',
      yAxisIndex: 0
    }
  ]
}
