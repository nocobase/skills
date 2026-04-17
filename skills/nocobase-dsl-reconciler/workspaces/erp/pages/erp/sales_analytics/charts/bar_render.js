var data = ctx.data.objects || [];
return {
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: data.map(function(d) { return d.label; }), axisLabel: { rotate: 25 } },
  yAxis: { type: 'value' },
  series: [{
    type: 'bar',
    data: data.map(function(d) { return d.value; }),
    itemStyle: { color: '#7c3aed' }
  }]
};
