var data = ctx.data.objects || [];
return {
  title: { text: 'Leave Requests by Type', left: 'center', textStyle: { fontSize: 14 } },
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: data.map(function(d) { return d.label; }), axisLabel: { rotate: 30 } },
  yAxis: { type: 'value' },
  series: [{ type: 'bar', data: data.map(function(d) { return d.value; }), itemStyle: { color: '#10b981' } }]
};
