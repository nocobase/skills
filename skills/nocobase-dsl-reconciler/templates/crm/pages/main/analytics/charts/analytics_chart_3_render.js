const t = function(key, opts) { return ctx.t(key, Object.assign({ ns: 'nb_crm' }, opts)); };

const dateRange = ctx.var_form1?.date_range || [];
const dateRangeText = dateRange.length === 2
  ? dateRange[0] + ' to ' + dateRange[1]
  : t('All Time');

const data = ctx.data.objects;

const growthRates = [];
for (var i = 1; i < data.length; i++) {
  var prevRevenue = data[i-1].monthly_revenue || 0;
  var currRevenue = data[i].monthly_revenue || 0;
  var rate = prevRevenue > 0
    ? (((currRevenue - prevRevenue) / prevRevenue) * 100).toFixed(1)
    : 0;
  growthRates.push(rate);
}

return {
  dataset: { source: data },
  title: {
    text: t('Monthly Sales Trend') + ' - ' + dateRangeText,
    subtext: t('Revenue, Order Count, and AOV Analysis'),
    left: 'center'
  },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'cross' },
    formatter: function(params) {
      var result = params[0].axisValue + '<br/>';
      params.forEach(function(item) {
        if (item.seriesName === t('Order Count')) {
          result += item.marker + t('Order Count') + ': ' + item.value.order_count + '<br/>';
        } else if (item.seriesName === t('Monthly Revenue')) {
          result += item.marker + t('Monthly Revenue') + ': ¥' + (item.value.monthly_revenue || 0).toLocaleString() + '<br/>';
        } else if (item.seriesName === t('Avg Order Value')) {
          result += item.marker + t('Avg Order Value') + ': ¥' + (item.value.avg_order_value || 0).toLocaleString() + '<br/>';
        }
      });
      var idx = params[0].dataIndex;
      if (idx > 0 && growthRates[idx - 1]) {
        var r = growthRates[idx - 1];
        var arrow = r > 0 ? '↑' : r < 0 ? '↓' : '→';
        var color = r > 0 ? '#67C23A' : r < 0 ? '#F56C6C' : '#909399';
        result += '<span style="color:' + color + '">' + t('MoM') + ': ' + arrow + ' ' + Math.abs(r) + '%</span>';
      }
      return result;
    }
  },
  legend: { data: [t('Monthly Revenue'), t('Order Count'), t('Avg Order Value')], bottom: 0 },
  grid: { left: '3%', right: '4%', bottom: '80', top: '100', containLabel: true },
  dataZoom: [
    { type: 'slider', show: data.length > 12, xAxisIndex: [0],
      start: Math.max(0, ((data.length - 12) / data.length) * 100), end: 100, bottom: 40 },
    { type: 'inside', xAxisIndex: [0],
      start: Math.max(0, ((data.length - 12) / data.length) * 100), end: 100 }
  ],
  xAxis: { type: 'category', boundaryGap: false, axisLabel: { rotate: 45, fontSize: 10 } },
  yAxis: [
    { type: 'value', name: t('Amount') + '(¥)', position: 'left',
      axisLabel: { formatter: function(value) { return value >= 10000 ? (value/10000).toFixed(1) + 'w' : value; } } },
    { type: 'value', name: t('Order Count'), position: 'right' }
  ],
  series: [
    { name: t('Monthly Revenue'), type: 'line', smooth: true,
      encode: { x: 'month', y: 'monthly_revenue' },
      itemStyle: { color: '#5470c6' }, lineStyle: { width: 3 }, emphasis: { focus: 'series' } },
    { name: t('Order Count'), type: 'bar', yAxisIndex: 1,
      encode: { x: 'month', y: 'order_count' },
      itemStyle: { color: '#91cc75', opacity: 0.7 },
      label: { show: true, position: 'top', fontSize: 9 } },
    { name: t('Avg Order Value'), type: 'line',
      encode: { x: 'month', y: 'avg_order_value' },
      itemStyle: { color: '#fac858' },
      lineStyle: { type: 'dashed', width: 2 }, symbol: 'circle', symbolSize: 6 }
  ]
}