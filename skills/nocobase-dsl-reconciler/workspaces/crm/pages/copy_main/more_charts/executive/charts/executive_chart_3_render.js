const t = function(key, opts) { return ctx.t(key, Object.assign({ ns: 'nb_crm' }, opts)); };
const data = ctx.data.objects || [];

const formatCurrency = function(val) {
  if (val >= 1000000) return '$' + (val / 1000000).toFixed(1) + 'M';
  if (val >= 1000) return '$' + (val / 1000).toFixed(0) + 'K';
  return '$' + val;
};

const names = data.map(function(d) { return d.rep_name; }).reverse();
const wonRevenue = data.map(function(d) { return Number(d.won_revenue) || 0; }).reverse();
const pipelineValue = data.map(function(d) { return Number(d.pipeline_value) || 0; }).reverse();

return {
  title: {
    text: t('Sales Leaderboard (YTD)'),
    left: 'center'
  },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    formatter: function(params) {
      const idx = data.length - 1 - params[0].dataIndex;
      const d = data[idx];
      return `<b>${d.rep_name}</b><br/>
        ${t('Won')}: ${formatCurrency(d.won_revenue)} (${d.won_deals} ${t('deals')})<br/>
        ${t('Pipeline')}: ${formatCurrency(d.pipeline_value)} (${d.open_deals} ${t('deals')})<br/>
        ${t('Win Rate')}: ${d.win_rate}%`;
    }
  },
  legend: {
    data: [t('Won Revenue'), t('Pipeline')],
    bottom: 10
  },
  grid: {
    left: '25%',
    right: '5%',
    top: 50,
    bottom: 50
  },
  xAxis: {
    type: 'value',
    axisLabel: {
      formatter: function(val) { return formatCurrency(val); }
    }
  },
  yAxis: {
    type: 'category',
    data: names
  },
  series: [
    {
      name: t('Won Revenue'),
      type: 'bar',
      stack: 'total',
      data: wonRevenue,
      itemStyle: { color: '#52c41a' },
      label: {
        show: true,
        position: 'insideRight',
        formatter: function(p) { return p.value > 0 ? formatCurrency(p.value) : ''; }
      }
    },
    {
      name: t('Pipeline'),
      type: 'bar',
      stack: 'total',
      data: pipelineValue,
      itemStyle: { color: '#1890ff' }
    }
  ]
}
