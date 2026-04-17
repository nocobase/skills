const t = function(key, opts) { return ctx.t(key, Object.assign({ ns: 'nb_crm' }, opts)); };

const dateRange = ctx.var_form1?.date_range || [];
const dateRangeText = dateRange.length === 2
  ? dateRange[0] + ' to ' + dateRange[1]
  : t('All Time');

const data = ctx.data.objects || [];
const conversionRates = [];
for (var i = 1; i < data.length; i++) {
  var rate = data[i-1].count > 0
    ? ((data[i].count / data[i-1].count) * 100).toFixed(1)
    : 0;
  conversionRates.push(rate);
}

return {
  dataset: { source: ctx.data.objects },
  title: {
    text: t('Sales Funnel Analysis') + ' - ' + dateRangeText,
    subtext: t('Complete conversion from leads to orders'),
    left: 'center'
  },
  tooltip: {
    trigger: 'item',
    formatter: function(params) {
      var idx = params.dataIndex;
      var result = params.name + '<br/>';
      result += t('Count') + ': ' + params.data.count + '<br/>';
      result += t('Value') + ': ¥' + (params.data.potential_value || 0).toLocaleString() + '<br/>';
      if (idx > 0 && conversionRates[idx - 1]) {
        result += t('Conversion Rate') + ': ' + conversionRates[idx - 1] + '%';
      } else if (idx === 0) {
        result += '(' + t('Funnel Top') + ')';
      }
      return result;
    }
  },
  series: [{
    name: t('Sales Funnel'),
    type: 'funnel',
    left: '10%', top: 100, bottom: 60, width: '80%',
    min: 0, max: 100, minSize: '20%', maxSize: '100%',
    sort: 'descending', gap: 2,
    label: {
      show: true, position: 'inside',
      formatter: function(params) {
        var idx = params.dataIndex;
        var text = params.name + '\n' + params.data.count;
        if (idx > 0 && conversionRates[idx - 1]) {
          text += '\n▼ ' + conversionRates[idx - 1] + '%';
        }
        return text;
      },
      fontSize: 14, fontWeight: 'bold', color: '#333',
      textBorderColor: '#fff', textBorderWidth: 2
    },
    itemStyle: {
      borderColor: '#fff', borderWidth: 2,
      color: function(params) {
        var colors = ['#5470c6', '#91cc75', '#fac858', '#ee6666'];
        return colors[params.dataIndex % colors.length];
      },
      opacity: 0.85
    },
    emphasis: {
      label: { fontSize: 18, fontWeight: 'bold', color: '#333', textBorderColor: '#fff', textBorderWidth: 3 },
      itemStyle: { opacity: 1 }
    },
    encode: { value: 'count', itemName: 'stage' }
  }],
  graphic: [{
    type: 'text', left: 'center', bottom: 20,
    style: { text: '▼ ' + t('indicates conversion rate from previous stage'), fontSize: 12, fill: '#666' }
  }]
}