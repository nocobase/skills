/**
 * Chart Render - Projects by Status
 */
var CONFIG = {
  title: 'Projects by Status',
};

var data = ctx.data.objects || [];

// Pie chart colors
var colors = ['#1677ff', '#52c41a', '#fa8c16', '#8c8c8c', '#f5222d'];

return {
  title: { text: CONFIG.title, left: 'center', textStyle: { fontSize: 14 } },
  tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
  legend: { orient: 'vertical', right: 10, top: 'center' },
  series: [{
    type: 'pie',
    radius: ['40%', '70%'],
    center: ['40%', '50%'],
    avoidLabelOverlap: false,
    itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
    label: { show: false },
    emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
    data: data.map(function(d, idx) {
      return {
        name: d.label,
        value: parseInt(d.value),
        itemStyle: { color: colors[idx % colors.length] }
      };
    })
  }]
};
