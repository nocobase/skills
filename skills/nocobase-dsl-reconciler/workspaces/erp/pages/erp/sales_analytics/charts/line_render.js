var data = ctx.data.objects || [];
return {
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: data.map(function(d) { return d.label; }) },
  yAxis: { type: 'value' },
  series: [{
    type: 'line',
    data: data.map(function(d) { return d.value; }),
    smooth: true,
    areaStyle: { opacity: 0.12 },
    itemStyle: { color: '#1d4ed8' }
  }]
};
