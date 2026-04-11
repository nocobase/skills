/**
 * Chart Render for Tickets by Priority (Bar Chart)
 */

var CONFIG = {
  title: 'Tickets by Priority',
};

var data = ctx.data.objects || [];

return {
  title: { text: CONFIG.title, left: 'center', textStyle: { fontSize: 14 } },
  tooltip: { trigger: 'axis' },
  xAxis: {
    type: 'category',
    data: data.map(function(d) { return d.category; }),
  },
  yAxis: { type: 'value' },
  series: [
    {
      name: 'Tickets',
      type: 'bar',
      data: data.map(function(d) { return d.value; }),
      itemStyle: { color: '#1677ff' },
    }
  ]
};
