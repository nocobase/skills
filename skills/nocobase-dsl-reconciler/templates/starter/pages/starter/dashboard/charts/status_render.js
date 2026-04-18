var rows = ctx.data.objects || [];
return {
  title: { text: 'Projects by Status', left: 'center' },
  tooltip: { trigger: 'item' },
  legend: { bottom: 0 },
  series: [{
    name: 'Projects',
    type: 'pie',
    radius: ['40%', '70%'],
    label: { formatter: '{b}: {c} ({d}%)' },
    data: rows.map(function(r) { return { name: r.status, value: Number(r.count) || 0 }; }),
  }],
};
