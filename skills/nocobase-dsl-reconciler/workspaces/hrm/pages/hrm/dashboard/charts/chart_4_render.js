var data = ctx.data.objects || [];
return {
  title: { text: 'Employees by Status', left: 'center', textStyle: { fontSize: 14 } },
  tooltip: { trigger: 'item' },
  series: [{
    type: 'pie',
    radius: '60%',
    data: data.map(function(d) { return { name: d.label, value: Number(d.value) }; }),
    emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.5)' } }
  }]
};
