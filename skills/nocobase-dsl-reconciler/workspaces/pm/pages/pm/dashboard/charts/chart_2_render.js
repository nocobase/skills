var data = ctx.data.objects || [];
var colors = ['#10b981', '#f59e0b', '#ef4444'];
return {
  title: { text: 'Tasks by Priority', left: 'center', textStyle: { fontSize: 14 } },
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
