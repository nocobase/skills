/**
 * Chart Render Template — returns ECharts option
 *
 * ctx.data.objects = SQL query result rows
 * Must return a valid ECharts option object
 *
 * Copy this → change the return object for your chart type
 */

var data = ctx.data.objects || [];

// Example: bar chart
return {
  title: { text: 'My Chart', left: 'center', textStyle: { fontSize: 14 } },
  tooltip: { trigger: 'axis' },
  legend: { bottom: 0 },
  xAxis: {
    type: 'category',
    data: data.map(function(d) { return d.label; }),
  },
  yAxis: { type: 'value' },
  series: [
    {
      name: 'Value',
      type: 'bar',     // bar | line | pie | scatter
      data: data.map(function(d) { return d.value; }),
      itemStyle: { color: '#1677ff' },
    }
  ]
};
