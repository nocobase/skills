const t = function(key, opts) { return ctx.t(key, Object.assign({ ns: 'nb_crm' }, opts)); };

const dateRange = ctx.var_form1?.date_range || [];
const dateRangeText = dateRange.length === 2
  ? dateRange[0] + ' to ' + dateRange[1]
  : t('All Time');

return {
  dataset: { source: ctx.data.objects },
  title: {
    text: t('Opportunity Stage Distribution') + ' - ' + dateRangeText,
    subtext: t('Sorted by Sales Funnel Sequence'),
    left: 'center'
  },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    formatter: function(params) {
      var result = params[0].axisValue + '<br/>';
      params.forEach(function(item) {
        if(item.seriesName === t('Count')) {
          result += item.marker + t('Count') + ': ' + item.value.opportunity_count + '<br/>';
        } else if(item.seriesName === t('Avg Probability')) {
          result += item.marker + t('Avg Probability') + ': ' + item.value.avg_probability + '%<br/>';
        } else {
          result += item.marker + t('Total Amount') + ': ¥' + (item.value.total_amount || 0).toLocaleString() + '<br/>';
        }
      });
      result += t('Weighted Amount') + ': ¥' + (params[0].value.weighted_amount || 0).toLocaleString();
      return result;
    }
  },
  legend: { data: [t('Count'), t('Total Amount'), t('Avg Probability')], bottom: 0 },
  grid: { left: '3%', right: '4%', bottom: '60', top: '100', containLabel: true },
  xAxis: { type: 'category', axisLabel: { rotate: 30, interval: 0, fontSize: 10 } },
  yAxis: [
    { type: 'value', name: t('Count') + '/' + t('Amount'), position: 'left',
      axisLabel: { formatter: function(value) { return value >= 10000 ? (value/10000).toFixed(1) + 'w' : value; } } },
    { type: 'value', name: t('Probability') + '(%)', position: 'right', max: 100 }
  ],
  series: [
    { name: t('Count'), type: 'bar', encode: { x: 'stage_name', y: 'opportunity_count' },
      itemStyle: { color: '#5470c6' }, label: { show: true, position: 'top', fontSize: 9 } },
    { name: t('Total Amount'), type: 'bar', encode: { x: 'stage_name', y: 'total_amount' },
      itemStyle: { color: '#91cc75' } },
    { name: t('Avg Probability'), type: 'line', yAxisIndex: 1,
      encode: { x: 'stage_name', y: 'avg_probability' },
      itemStyle: { color: '#fac858' },
      label: { show: true, position: 'top', formatter: function(params) { return params.value.avg_probability + '%'; }, fontSize: 9 } }
  ]
}