const t = function(key, opts) { return ctx.t(key, Object.assign({ ns: 'nb_crm' }, opts)); };
const data = ctx.data.objects || [];

const formatCurrency = function(val) {
  if (val >= 1000000) return '$' + (val / 1000000).toFixed(1) + 'M';
  if (val >= 1000) return '$' + (val / 1000).toFixed(0) + 'K';
  return '$' + val.toFixed(0);
};

const months = data.map(function(d) { return d.month_label; });
const winRates = data.map(function(d) { return Number(d.win_rate) || 0; });
const winRatesByValue = data.map(function(d) { return Number(d.win_rate_by_value) || 0; });

// Calculate averages
const avgWinRate = data.length > 0
  ? (data.reduce(function(sum, d) { return sum + Number(d.win_rate || 0); }, 0) / data.length).toFixed(1)
  : 0;

return {
  title: {
    text: t('Win Rate Trend'),
    subtext: `${t('Average')}: ${avgWinRate}%`,
    left: 'center'
  },
  tooltip: {
    trigger: 'axis',
    formatter: function(params) {
      const idx = params[0].dataIndex;
      const d = data[idx];
      return `<b>${d.month_label}</b><br/>
        ${t('Win Rate (Deals)')}: ${d.win_rate}%<br/>
        ${t('Win Rate (Value)')}: ${d.win_rate_by_value}%<br/>
        ${t('Won')}: ${d.won_count} (${formatCurrency(d.won_amount)})<br/>
        ${t('Lost')}: ${d.lost_count} (${formatCurrency(d.lost_amount)})`;
    }
  },
  legend: {
    data: [t('Win Rate (Deals)'), t('Win Rate (Value)')],
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
    data: months,
    axisLabel: { rotate: 45 }
  },
  yAxis: {
    type: 'value',
    name: t('Win Rate (%)'),
    min: 0,
    max: 100,
    axisLabel: {
      formatter: '{value}%'
    }
  },
  series: [
    {
      name: t('Win Rate (Deals)'),
      type: 'line',
      data: winRates,
      smooth: true,
      symbol: 'circle',
      symbolSize: 8,
      itemStyle: { color: '#1890ff' },
      lineStyle: { width: 3 },
      markLine: {
        silent: true,
        data: [
          {
            yAxis: Number(avgWinRate),
            lineStyle: { color: '#1890ff', type: 'dashed' },
            label: { formatter: 'Avg: {c}%' }
          }
        ]
      }
    },
    {
      name: t('Win Rate (Value)'),
      type: 'line',
      data: winRatesByValue,
      smooth: true,
      symbol: 'diamond',
      symbolSize: 8,
      itemStyle: { color: '#52c41a' },
      lineStyle: { width: 2 }
    }
  ]
}
