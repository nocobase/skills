var rows = ctx.data.objects || [];
var colorMap = { high: '#ff4d4f', medium: '#1677ff', low: '#bfbfbf' };
return {
  title: { text: 'Projects by Priority', left: 'center' },
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: rows.map(function(r) { return r.priority; }) },
  yAxis: { type: 'value' },
  series: [{
    name: 'Projects',
    type: 'bar',
    data: rows.map(function(r) {
      return { value: Number(r.count) || 0, itemStyle: { color: colorMap[r.priority] || '#8c8c8c' } };
    }),
  }],
};
