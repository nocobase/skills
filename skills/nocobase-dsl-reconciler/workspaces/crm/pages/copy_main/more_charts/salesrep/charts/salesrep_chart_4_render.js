const t = function(key, opts) { return ctx.t(key, Object.assign({ ns: 'nb_crm' }, opts)); };

const data = ctx.data.objects || [];

const dates = data.map(function(d) { return d.close_date?.substring(5, 10) || ''; });
const amounts = data.map(function(d) { return Number(d.won_amount) || 0; });
const counts = data.map(function(d) { return Number(d.deal_count) || 0; });

const totalAmount = amounts.reduce(function(a, b) { return a + b; }, 0);
const totalDeals = counts.reduce(function(a, b) { return a + b; }, 0);

const formatCurrency = function(val) {
  if (val >= 1000000) return '$' + (val / 1000000).toFixed(1) + 'M';
  if (val >= 1000) return '$' + (val / 1000).toFixed(0) + 'K';
  return '$' + val;
};

return {
  title: {
    text: t('Won Deals (Recent 3 Months)'),
    subtext: `${t('Total')}: ${formatCurrency(totalAmount)} (${totalDeals} ${t('deals')})`,
    left: 'center'
  },
  tooltip: {
    trigger: 'axis',
    formatter: function(params) {
      const idx = params[0].dataIndex;
      return `${dates[idx]}<br/>${t('Amount')}: ${formatCurrency(amounts[idx])}<br/>${t('Deals')}: ${counts[idx]}`;
    }
  },
  grid: {
    left: '10%',
    right: '5%',
    top: 70,
    bottom: 40
  },
  xAxis: {
    type: 'category',
    data: dates
  },
  yAxis: {
    type: 'value',
    name: t('Amount'),
    axisLabel: {
      formatter: function(val) { return formatCurrency(val); }
    }
  },
  series: [
    {
      name: t('Won Amount'),
      type: 'line',
      data: amounts,
      smooth: true,
      areaStyle: { opacity: 0.3 },
      itemStyle: { color: '#52c41a' },
      label: {
        show: true,
        position: 'top',
        formatter: function(params) { return counts[params.dataIndex] > 0 ? counts[params.dataIndex] : ''; }
      }
    }
  ]
}
