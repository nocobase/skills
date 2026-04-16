var data = ctx.data.objects || [];
return {
  title: { text: 'Attendance Status Mix', left: 'center', textStyle: { fontSize: 14 } },
  tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
  series: [{ type: 'pie', radius: ['40%', '70%'], data: data.map(function(d) { return { name: d.label, value: d.value }; }), label: { show: true, formatter: '{b}\n{d}%' } }]
};
