/**
 * Chart Render for Tickets Trend (Line Chart)
 */

var CONFIG = {
  title: 'Tickets Trend (Last 14 Days)',
};

var data = ctx.data.objects || [];

return {
  title: { text: CONFIG.title, left: 'center', textStyle: { fontSize: 14 } },
  tooltip: { trigger: 'axis' },
  xAxis: {
    type: 'category',
    data: data.map(function(d) { return d.date; }),
  },
  yAxis: { type: 'value' },
  series: [
    {
      name: 'Tickets',
      type: 'line',
      data: data.map(function(d) { return d.count; }),
      smooth: true,
      itemStyle: { color: '#1677ff' },
      areaStyle: { opacity: 0.2 }
    }
  ]
};
