/**
 * Chart Render for Tickets by Category (Bar Chart)
 */

var CONFIG = {
  title: 'Tickets by Category',
};

var data = ctx.data.objects || [];

return {
  title: { text: CONFIG.title, left: 'center', textStyle: { fontSize: 14 } },
  tooltip: { trigger: 'axis' },
  xAxis: {
    type: 'category',
    data: data.map(function(d) { return d.name; }),
    axisLabel: { rotate: 30 }
  },
  yAxis: { type: 'value' },
  series: [
    {
      name: 'Tickets',
      type: 'bar',
      data: data.map(function(d) { return d.value; }),
      itemStyle: { color: '#52c41a' },
    }
  ]
};
