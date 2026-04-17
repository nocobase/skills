const t = function(key, opts) { return ctx.t(key, Object.assign({ ns: 'nb_crm' }, opts)); };
const data = ctx.data.objects || [];

// Prepare funnel data
const funnelData = data.map(function(item) { return {
  name: item.stage_name,
  value: Number(item.deal_count),
  amount: Number(item.total_value),
  avgProb: Number(item.avg_ai_prob),
  avgSize: Number(item.avg_deal_size),
  itemStyle: {
    color: item.color || '#1890ff'
  }
}; });

// Calculate totals
const totalDeals = funnelData.reduce(function(sum, item) { return sum + item.value; }, 0);
const totalValue = funnelData.reduce(function(sum, item) { return sum + item.amount; }, 0);

// Format currency
const formatCurrency = function(val) {
  if (val >= 1000000) return '$' + (val / 1000000).toFixed(1) + 'M';
  if (val >= 1000) return '$' + (val / 1000).toFixed(0) + 'K';
  return '$' + val.toFixed(0);
};

return {
  title: {
    text: t('Sales Pipeline'),
    subtext: `${totalDeals} ${t('Active Deals')} | ${formatCurrency(totalValue)} ${t('Pipeline Value')}`,
    left: 'center'
  },
  tooltip: {
    trigger: 'item',
    formatter: function(params) {
      const d = params.data;
      return `<b>${d.name}</b><br/>
        ${t('Deals')}: ${d.value}<br/>
        ${t('Value')}: ${formatCurrency(d.amount)}<br/>
        ${t('Avg AI Prob')}: ${d.avgProb}%<br/>
        ${t('Avg Deal')}: ${formatCurrency(d.avgSize)}`;
    }
  },
  legend: {
    show: false
  },
  series: [
    {
      name: t('Pipeline'),
      type: 'funnel',
      left: '10%',
      top: 80,
      bottom: 60,
      width: '80%',
      min: 0,
      max: Math.max(...funnelData.map(function(d) { return d.value; })),
      minSize: '20%',
      maxSize: '100%',
      sort: 'none',
      gap: 2,
      label: {
        show: true,
        position: 'inside',
        formatter: function(params) {
          const d = params.data;
          return `{name|${d.name}}\n{value|${d.value} ${t('deals')} | ${formatCurrency(d.amount)}}`;
        },
        rich: {
          name: {
            fontSize: 14,
            fontWeight: 'bold',
            color: '#fff'
          },
          value: {
            fontSize: 11,
            color: 'rgba(255,255,255,0.85)'
          }
        }
      },
      labelLine: {
        show: false
      },
      itemStyle: {
        borderColor: '#fff',
        borderWidth: 1
      },
      emphasis: {
        label: {
          fontSize: 16
        }
      },
      data: funnelData
    }
  ],
  graphic: [
    {
      type: 'text',
      left: 'center',
      bottom: 10,
      style: {
        text: t('Stages flow from top (early) to bottom (late)'),
        fontSize: 11,
        fill: '#999'
      }
    }
  ]
}
