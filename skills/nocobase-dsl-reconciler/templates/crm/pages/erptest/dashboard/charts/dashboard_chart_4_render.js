var data = ctx.data.objects || [];
return {
  title: { text: 'PO Amount by Supplier', left: 'center', textStyle: { fontSize: 14 } },
  tooltip: { trigger: 'axis', formatter: function(p) { return p[0].name + ': ¥' + Number(p[0].value).toLocaleString(); } },
  xAxis: { type: 'category', data: data.map(function(d) { return d.label; }), axisLabel: { rotate: 30 } },
  yAxis: { type: 'value' },
  series: [{ type: 'bar', data: data.map(function(d) { return d.value; }), itemStyle: { color: '#722ed1' } }]
};
