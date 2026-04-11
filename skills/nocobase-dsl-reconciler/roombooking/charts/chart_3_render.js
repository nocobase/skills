var data = ctx.data.objects || [];
return {
  title: { text: 'Line Chart', left: 'center', textStyle: { fontSize: 14 } },
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: data.map(function(d) { return d.label; }) },
  yAxis: { type: 'value' },
  series: [{ type: 'line', data: data.map(function(d) { return d.value; }), smooth: true, areaStyle: { opacity: 0.1 }, itemStyle: { color: '#1677ff' } }]
};