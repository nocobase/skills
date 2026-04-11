var CONFIG = {
  title: 'Products by Supplier',
};

var data = ctx.data.objects || [];

return {
  title: { text: CONFIG.title, left: 'center', textStyle: { fontSize: 14 } },
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
  xAxis: {
    type: 'category',
    data: data.map(function(d) { return d.name; }),
    axisLabel: { rotate: 30 }
  },
  yAxis: { type: 'value', name: 'Products' },
  series: [
    {
      name: 'Products',
      type: 'bar',
      data: data.map(function(d) { return parseInt(d.value); }),
      itemStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: '#f59e0b' },
          { offset: 1, color: '#fbbf24' }
        ]),
        borderRadius: [4, 4, 0, 0]
      }
    }
  ]
};
