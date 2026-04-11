var CONFIG = {
  title: 'Warehouse Capacity Utilization',
};

var data = ctx.data.objects || [];

return {
  title: { text: CONFIG.title, left: 'center', textStyle: { fontSize: 14 } },
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  legend: { bottom: 0, data: ['Capacity', 'Used'] },
  xAxis: {
    type: 'category',
    data: data.map(function(d) { return d.name; }),
    axisLabel: { rotate: 30 }
  },
  yAxis: { type: 'value', name: 'Units' },
  series: [
    {
      name: 'Capacity',
      type: 'bar',
      data: data.map(function(d) { return parseInt(d.capacity) || 0; }),
      itemStyle: { color: '#e5e7eb' }
    },
    {
      name: 'Used',
      type: 'bar',
      data: data.map(function(d) { return parseInt(d.used) || 0; }),
      itemStyle: { color: '#8b5cf6' }
    }
  ]
};
