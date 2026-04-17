var data = ctx.data.objects || [];
var colorMap = { active: '#52c41a', inactive: '#d9d9d9', discontinued: '#ff4d4f' };
return {
  title: { text: 'Product Status', left: 'center', textStyle: { fontSize: 14 } },
  tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
  series: [{ type: 'pie', radius: ['40%', '70%'], data: data.map(function(d) { return { name: d.label, value: d.value, itemStyle: { color: colorMap[d.label] || '#d9d9d9' } }; }), label: { show: true, formatter: '{b}\n{d}%' } }]
};
