/**
 * Chart Render Template — returns ECharts option
 *
 * ctx.data.objects = SQL query result rows
 * ctx.chartInstance = ECharts instance (for bindEvents after render)
 *
 * Click-to-popup: set CONFIG.popup and CONFIG.clickField
 * Click passes the clicked dimension value as popup filter
 *
 * Must return a valid ECharts option object
 */

// ==================== CONFIG ====================
var CONFIG = {
  title: 'My Chart',
  // Click to open popup (optional)
  // popup: {
  //   collection: 'my_table',         // popup shows this collection's data
  //   clickField: 'department',       // filter field = clicked dimension value
  //   mode: 'drawer',                 // drawer | dialog
  //   size: 'large',
  // },
};
// ==================== END CONFIG ====================

var data = ctx.data.objects || [];

// Bind click event for popup
if (CONFIG.popup && ctx.chartInstance) {
  ctx.chartInstance.off('click');
  ctx.chartInstance.on('click', function(params) {
    var filterValue = params.name || params.data;
    if (filterValue) {
      var filter = {};
      filter[CONFIG.popup.clickField] = { '$eq': filterValue };
      ctx.openView(ctx.model.uid + '-drill', {
        mode: CONFIG.popup.mode || 'drawer',
        title: CONFIG.title + ': ' + filterValue,
        size: CONFIG.popup.size || 'large',
        filterByTk: filterValue,
      });
    }
  });
}

// Example: bar chart
return {
  title: { text: CONFIG.title, left: 'center', textStyle: { fontSize: 14 } },
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
      type: 'bar',
      data: data.map(function(d) { return d.value; }),
      itemStyle: { color: '#1677ff' },
      cursor: CONFIG.popup ? 'pointer' : 'default',
    }
  ]
};
