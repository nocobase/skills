var CONFIG = {
  title: 'Stock Movement Trend (6 Months)',
};

var data = ctx.data.objects || [];

return {
  title: { text: CONFIG.title, left: 'center', textStyle: { fontSize: 14 } },
  tooltip: { trigger: 'axis' },
  legend: { bottom: 0, data: ['Inbound', 'Outbound'] },
  xAxis: {
    type: 'category',
    data: data.map(function(d) { return d.name; }),
    axisLabel: { rotate: 45 }
  },
  yAxis: { type: 'value', name: 'Quantity' },
  series: [
    {
      name: 'Inbound',
      type: 'line',
      data: data.map(function(d) { return parseInt(d.inbound) || 0; }),
      smooth: true,
      itemStyle: { color: '#10b981' },
      areaStyle: { opacity: 0.1 }
    },
    {
      name: 'Outbound',
      type: 'line',
      data: data.map(function(d) { return parseInt(d.outbound) || 0; }),
      smooth: true,
      itemStyle: { color: '#ef4444' },
      areaStyle: { opacity: 0.1 }
    }
  ]
};
