const t = function(key, opts) { return ctx.t(key, Object.assign({ ns: 'nb_crm' }, opts)); };

const dateRange = ctx.var_form1?.date_range || [];
const dateRangeText = dateRange.length === 2
  ? ' - ' + dateRange[0] + ' to ' + dateRange[1]
  : '';

const data = ctx.data.objects || [];

const totalCustomers = data.reduce(function(sum, item) { return sum + item.customer_count; }, 0);
const totalRevenue = data.reduce(function(sum, item) { return sum + (item.total_revenue || 0); }, 0);

const topN = 8;
var displayData;
if (data.length > topN) {
  displayData = data.slice(0, topN);
  var othersCount = 0, othersRevenue = 0;
  for (var i = topN; i < data.length; i++) {
    othersCount += data[i].customer_count;
    othersRevenue += (data[i].total_revenue || 0);
  }
  displayData.push({ industry_name: t('Others'), customer_count: othersCount, total_revenue: othersRevenue });
} else {
  displayData = data;
}

return {
  dataset: { source: displayData },
  title: {
    text: t('Customer Industry Distribution') + dateRangeText,
    subtext: t('Total') + ' ' + totalCustomers + ' ' + t('Customers'),
    left: 'center'
  },
  tooltip: {
    trigger: 'item',
    formatter: function(params) {
      var count = params.data.customer_count || 0;
      var revenue = (params.data.total_revenue || 0).toLocaleString();
      var avgRevenue = count > 0 ? ((params.data.total_revenue || 0) / count).toFixed(0) : 0;
      return params.name + '<br/>' +
             t('Customers') + ': ' + count + ' (' + params.percent + '%)<br/>' +
             t('Total Revenue') + ': ¥' + revenue + '<br/>' +
             t('Avg Revenue') + ': ¥' + avgRevenue;
    }
  },
  legend: {
    orient: 'vertical', left: 'left', top: 'middle', type: 'scroll',
    formatter: function(name) {
      for (var j = 0; j < displayData.length; j++) {
        if (displayData[j].industry_name === name) return name + ' (' + displayData[j].customer_count + ')';
      }
      return name;
    }
  },
  graphic: [{
    type: 'group', left: 'center', top: 'middle',
    children: [
      { type: 'text', style: { text: t('Total'), textAlign: 'center', fill: '#666', fontSize: 14 }, top: -30 },
      { type: 'text', style: { text: '' + totalCustomers, textAlign: 'center', fill: '#5470c6', fontSize: 32, fontWeight: 'bold' }, top: 0 },
      { type: 'text', style: { text: t('Customers'), textAlign: 'center', fill: '#666', fontSize: 12 }, top: 35 }
    ]
  }],
  series: [{
    name: t('Industry Distribution'), type: 'pie',
    radius: ['40%', '70%'], center: ['50%', '50%'],
    avoidLabelOverlap: true,
    itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
    label: { show: false },
    labelLine: { show: false },
    emphasis: {
      label: { show: true, fontSize: 13, fontWeight: 'bold',
        formatter: function(params) { return params.name + '\n' + params.data.customer_count + ' (' + params.percent + '%)'; } },
      labelLine: { show: true, length: 10, length2: 8 },
      itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' }
    },
    encode: { itemName: 'industry_name', value: 'customer_count' }
  }]
}