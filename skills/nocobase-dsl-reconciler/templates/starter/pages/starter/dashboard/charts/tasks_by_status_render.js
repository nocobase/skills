var rows = ctx.data.objects || [];
var colorMap = { todo: '#8c8c8c', in_progress: '#1677ff', blocked: '#ff4d4f', done: '#52c41a' };
return {
  title: { text: 'Tasks by Status', left: 'center' },
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: rows.map(function(r) { return r.status; }) },
  yAxis: { type: 'value' },
  series: [{
    name: 'Tasks',
    type: 'bar',
    data: rows.map(function(r) {
      return { value: Number(r.count) || 0, itemStyle: { color: colorMap[r.status] || '#8c8c8c' } };
    }),
  }],
};
