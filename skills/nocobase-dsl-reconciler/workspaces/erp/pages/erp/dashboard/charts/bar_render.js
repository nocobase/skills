var data = ctx.data.objects || [];
return {
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: data.map(function(d) { return d.label; }), axisLabel: { rotate: 20 } },
  yAxis: { type: 'value' },
  series: [{
    type: 'bar',
    data: data.map(function(d) { return d.value; }),
    itemStyle: { color: '#1d4ed8' }
  }]
};
