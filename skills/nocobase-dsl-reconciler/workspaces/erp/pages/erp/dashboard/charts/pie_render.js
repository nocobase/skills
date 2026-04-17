var data = ctx.data.objects || [];
return {
  tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
  legend: { bottom: 0 },
  series: [{
    type: 'pie',
    radius: ['35%', '70%'],
    data: data.map(function(d) { return { name: d.label, value: d.value }; }),
    label: { formatter: '{b}: {d}%' }
  }]
};
