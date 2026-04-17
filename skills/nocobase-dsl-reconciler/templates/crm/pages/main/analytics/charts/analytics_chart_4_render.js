const t = function(key, opts) { return ctx.t(key, Object.assign({ ns: 'nb_crm' }, opts)); };

const dateRange = ctx.var_form1?.date_range || [];
const dateRangeText = dateRange.length === 2
  ? dateRange[0] + ' to ' + dateRange[1]
  : t('All Time');

const data = ctx.data.objects;

const growthRates = [];
for (var i = 1; i < data.length; i++) {
  var prevCount = data[i-1].new_customers || 0;
  var currCount = data[i].new_customers || 0;
  var rate = prevCount > 0
    ? (((currCount - prevCount) / prevCount) * 100).toFixed(1)
    : 0;
  growthRates.push({ month: data[i].month, rate: rate });
}

const avgNewCustomers = data.length > 0
  ? (data.reduce(function(sum, item) { return sum + item.new_customers; }, 0) / data.length).toFixed(0)
  : 0;

return {
  dataset: { source: data },
  title: {
    text: t('Customer Growth Trend') + ' - ' + dateRangeText,
    subtext: t('Monthly Avg') + ': ' + avgNewCustomers + ' ' + t('customers'),
    left: 'center'
  },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'cross' },
    formatter: function(params) {
      var result = params[0].axisValue + '<br/>';
      params.forEach(function(item) {
        if (item.seriesName === t('New Customers')) {
          result += item.marker + t('New Customers') + ': ' + item.value.new_customers + '<br/>';
        } else if (item.seriesName === t('Cumulative')) {
          result += item.marker + t('Cumulative') + ': ' + item.value.cumulative_customers + '<br/>';
        }
      });
      var growthItem = null;
      for (var j = 0; j < growthRates.length; j++) {
        if (growthRates[j].month === params[0].axisValue) { growthItem = growthRates[j]; break; }
      }
      if (growthItem) {
        var rate = growthItem.rate;
        var arrow = rate > 0 ? '↑' : rate < 0 ? '↓' : '→';
        var color = rate > 0 ? '#67C23A' : rate < 0 ? '#F56C6C' : '#909399';
        result += '<span style="color:' + color + '">' + t('MoM') + ': ' + arrow + ' ' + Math.abs(rate) + '%</span>';
      }
      return result;
    }
  },
  legend: { data: [t('New Customers'), t('Cumulative')], bottom: 0 },
  grid: { left: '3%', right: '4%', bottom: '80', top: '100', containLabel: true },
  dataZoom: [
    { type: 'slider', show: data.length > 12, xAxisIndex: [0],
      start: Math.max(0, ((data.length - 12) / data.length) * 100), end: 100, bottom: 40 },
    { type: 'inside', xAxisIndex: [0],
      start: Math.max(0, ((data.length - 12) / data.length) * 100), end: 100 }
  ],
  xAxis: { type: 'category', boundaryGap: false, axisLabel: { rotate: 45, fontSize: 10 } },
  yAxis: [
    { type: 'value', name: t('New Customers'), position: 'left' },
    { type: 'value', name: t('Cumulative'), position: 'right' }
  ],
  series: [
    { name: t('New Customers'), type: 'bar',
      encode: { x: 'month', y: 'new_customers' },
      itemStyle: { color: '#5470c6' },
      label: { show: true, position: 'top', fontSize: 9 },
      markLine: { silent: true, symbol: 'none',
        label: { position: 'end', formatter: t('Average') + ': ' + avgNewCustomers },
        data: [{ type: 'average', name: t('Average'),
          lineStyle: { color: '#5470c6', type: 'dashed', width: 2 } }] } },
    { name: t('Cumulative'), type: 'line', yAxisIndex: 1, smooth: true,
      encode: { x: 'month', y: 'cumulative_customers' },
      itemStyle: { color: '#91cc75' }, lineStyle: { width: 3 }, emphasis: { focus: 'series' } }
  ]
}