var CONFIG = {
  title: 'Top 10 Products by Stock Quantity',
};

var data = ctx.data.objects || [];

return {
  title: { text: CONFIG.title, left: 'center', textStyle: { fontSize: 14 } },
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
  xAxis: {
    type: 'value',
    name: 'Quantity'
  },
  yAxis: {
    type: 'category',
    data: data.map(function(d) { return d.name; }).reverse(),
    axisLabel: { width: 100, overflow: 'truncate' }
  },
  series: [
    {
      name: 'Stock',
      type: 'bar',
      data: data.map(function(d) { return parseInt(d.value); }).reverse(),
      itemStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
          { offset: 0, color: '#3b82f6' },
          { offset: 1, color: '#60a5fa' }
        ]),
        borderRadius: [0, 4, 4, 0]
      }
    }
  ]
};
