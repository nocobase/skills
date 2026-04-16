/**
 * Chart Render - Tasks by Priority
 */
var CONFIG = {
  title: 'Tasks by Priority',
};

var data = ctx.data.objects || [];

// Color map for priorities
var colorMap = {
  'Urgent': '#f5222d',
  'High': '#fa8c16',
  'Medium': '#1677ff',
  'Low': '#52c41a'
};

return {
  title: { text: CONFIG.title, left: 'center', textStyle: { fontSize: 14 } },
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
  xAxis: {
    type: 'category',
    data: data.map(function(d) { return d.label; }),
    axisTick: { alignWithLabel: true }
  },
  yAxis: { type: 'value' },
  series: [{
    type: 'bar',
    barWidth: '60%',
    data: data.map(function(d) {
      return {
        value: parseInt(d.value),
        itemStyle: { color: colorMap[d.label] || '#1677ff' }
      };
    })
  }]
};
