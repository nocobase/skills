var data = ctx.data.objects || [];
return {
  title: { text: 'Milestones by Status', left: 'center', textStyle: { fontSize: 14 } },
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: data.map(function(d) { return d.label; }), axisLabel: { rotate: 0 } },
  yAxis: { type: 'value' },
  series: [{
    type: 'bar',
    data: data.map(function(d) { return parseInt(d.value, 10); }),
    itemStyle: { color: '#8b5cf6', borderRadius: [4, 4, 0, 0] }
  }]
};
