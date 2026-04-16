var data = ctx.data.objects || [];
return {
  title: { text: 'Monthly Hire Trend', left: 'center', textStyle: { fontSize: 14 } },
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: data.map(function(d) { return d.label; }), axisLabel: { rotate: 45 } },
  yAxis: { type: 'value' },
  series: [{ type: 'line', data: data.map(function(d) { return d.value; }), smooth: true, areaStyle: { opacity: 0.2 }, itemStyle: { color: '#f59e0b' } }]
};
