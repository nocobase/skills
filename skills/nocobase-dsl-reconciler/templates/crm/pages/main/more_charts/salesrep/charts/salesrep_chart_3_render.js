const t = function(key, opts) { return ctx.t(key, Object.assign({ ns: 'nb_crm' }, opts)); };

const data = ctx.data.objects || [];

const categories = data.map(function(d) { return d.status_name; });
const counts = data.map(function(d) { return Number(d.lead_count) || 0; });
const colors = data.map(function(d) { return d.color; });

const total = counts.reduce(function(a, b) { return a + b; }, 0);

return {
  title: {
    text: t('My Lead Status'),
    subtext: `${t('Total')}: ${total} ${t('leads')}`,
    left: 'center'
  },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' }
  },
  grid: {
    left: '10%',
    right: '5%',
    top: 70,
    bottom: 40
  },
  xAxis: {
    type: 'category',
    data: categories
  },
  yAxis: {
    type: 'value',
    name: t('Count')
  },
  series: [
    {
      name: t('Leads'),
      type: 'bar',
      data: counts.map(function(val, idx) { return {
        value: val,
        itemStyle: { color: colors[idx] }
      }; }),
      label: {
        show: true,
        position: 'top'
      },
      barWidth: '50%'
    }
  ]
}
