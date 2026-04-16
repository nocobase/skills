var data = ctx.data.objects || [];
var colors = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444'];
return {
  title: { text: 'Tasks by Status', left: 'center', textStyle: { fontSize: 14 } },
  tooltip: { trigger: 'item' },
  legend: { bottom: 0 },
  series: [{
    type: 'pie',
    radius: ['40%', '70%'],
    avoidLabelOverlap: false,
    itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
    label: { show: false, position: 'center' },
    emphasis: { label: { show: true, fontSize: 16, fontWeight: 'bold' } },
    data: data.map(function(d, i) {
      return { value: parseInt(d.value, 10), name: d.label, itemStyle: { color: colors[i % colors.length] } };
    })
  }]
};
