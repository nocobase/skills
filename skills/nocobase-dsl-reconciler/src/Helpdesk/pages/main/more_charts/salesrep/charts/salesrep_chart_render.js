const t = function(key, opts) { return ctx.t(key, Object.assign({ ns: 'nb_crm' }, opts)); };

const data = ctx.data.objects || [];

const formatCurrency = function(val) {
  if (val >= 1000000) return '$' + (val / 1000000).toFixed(1) + 'M';
  if (val >= 1000) return '$' + (val / 1000).toFixed(0) + 'K';
  return '$' + val.toFixed(0);
};

// Prepare donut data
const pieData = data.map(function(item) { return {
  name: item.stage_name,
  value: Number(item.deal_count),
  amount: Number(item.total_value),
  avgProb: Number(item.avg_ai_prob),
  itemStyle: {
    color: item.color || '#1890ff'
  }
}; });

const totalDeals = pieData.reduce(function(sum, item) { return sum + item.value; }, 0);
const totalValue = pieData.reduce(function(sum, item) { return sum + item.amount; }, 0);

return {
  title: {
    text: t('My Opportunities by Stage'),
    left: 'center'
  },
  tooltip: {
    trigger: 'item',
    formatter: function(params) {
      const d = params.data;
      return `<b>${d.name}</b><br/>
        ${t('Deals')}: ${d.value} (${params.percent}%)<br/>
        ${t('Value')}: ${formatCurrency(d.amount)}<br/>
        ${t('Avg AI Prob')}: ${d.avgProb}%`;
    }
  },
  legend: {
    orient: 'vertical',
    right: 10,
    top: 'center'
  },
  series: [
    {
      name: t('Stage'),
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['40%', '55%'],
      avoidLabelOverlap: true,
      itemStyle: {
        borderRadius: 6,
        borderColor: '#fff',
        borderWidth: 2
      },
      label: {
        show: true,
        formatter: '{b}: {c}'
      },
      emphasis: {
        label: {
          show: true,
          fontSize: 16,
          fontWeight: 'bold'
        }
      },
      data: pieData
    }
  ],
  graphic: [
    {
      type: 'text',
      left: '35%',
      top: '48%',
      style: {
        text: totalDeals.toString(),
        textAlign: 'center',
        fontSize: 28,
        fontWeight: 'bold',
        fill: '#333'
      }
    },
    {
      type: 'text',
      left: '35%',
      top: '57%',
      style: {
        text: t('Deals'),
        textAlign: 'center',
        fontSize: 12,
        fill: '#999'
      }
    },
    {
      type: 'text',
      left: 'center',
      bottom: 10,
      style: {
        text: `${t('Total Pipeline')}: ${formatCurrency(totalValue)}`,
        fontSize: 13,
        fill: '#666'
      }
    }
  ]
}
