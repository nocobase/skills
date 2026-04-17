const t = function(key, opts) { return ctx.t(key, Object.assign({ ns: 'nb_crm' }, opts)); };
const data = ctx.data.objects || [];

const formatCurrency = function(val) {
  if (val >= 1000000) return '$' + (val / 1000000).toFixed(1) + 'M';
  if (val >= 1000) return '$' + (val / 1000).toFixed(0) + 'K';
  return '$' + val.toFixed(0);
};

const weeks = data.map(function(d) { return d.week_label; });
const wonAmounts = data.map(function(d) { return Number(d.won_amount) || null; });
const forecastAmounts = data.map(function(d) { return d.is_forecast ? Number(d.forecast_amount) : null; });

// Find current week index
const currentIdx = data.findIndex(function(d) { return !d.is_forecast && data[data.indexOf(d) + 1]?.is_forecast; });

// Calculate total for period
const periodTotal = data
  .filter(function(d) { return !d.is_forecast && d.won_amount > 0; })
  .reduce(function(sum, d) { return sum + Number(d.won_amount); }, 0);

return {
  title: {
    text: t('Weekly Revenue Trend'),
    subtext: `${t('Last 12 Weeks')}: ${formatCurrency(periodTotal)}`,
    left: 'center'
  },
  tooltip: {
    trigger: 'axis',
    formatter: function(params) {
      let result = `<b>${params[0].axisValue}</b><br/>`;
      params.forEach(function(p) {
        if (p.value !== null && p.value !== undefined) {
          result += `${p.seriesName}: ${formatCurrency(p.value)}<br/>`;
        }
      });
      return result;
    }
  },
  legend: {
    data: [t('Closed Revenue'), t('Forecast')],
    bottom: 10
  },
  grid: {
    left: '10%',
    right: '5%',
    top: 80,
    bottom: 60
  },
  xAxis: {
    type: 'category',
    data: weeks,
    axisLabel: {
      rotate: 45
    }
  },
  yAxis: {
    type: 'value',
    name: t('Revenue'),
    axisLabel: {
      formatter: function(val) { return formatCurrency(val); }
    }
  },
  series: [
    {
      name: t('Closed Revenue'),
      type: 'line',
      data: wonAmounts,
      smooth: true,
      symbol: 'circle',
      symbolSize: 8,
      itemStyle: { color: '#52c41a' },
      lineStyle: { width: 3 },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(82, 196, 26, 0.3)' },
            { offset: 1, color: 'rgba(82, 196, 26, 0.05)' }
          ]
        }
      }
    },
    {
      name: t('Forecast'),
      type: 'line',
      data: forecastAmounts,
      smooth: true,
      symbol: 'diamond',
      symbolSize: 8,
      itemStyle: { color: '#faad14' },
      lineStyle: {
        width: 2,
        type: 'dashed'
      }
    }
  ],
  // Mark current week
  markLine: currentIdx >= 0 ? {
    silent: true,
    data: [
      {
        xAxis: currentIdx,
        lineStyle: { color: '#999', type: 'dashed' },
        label: { formatter: t('This Week') }
      }
    ]
  } : undefined
}
