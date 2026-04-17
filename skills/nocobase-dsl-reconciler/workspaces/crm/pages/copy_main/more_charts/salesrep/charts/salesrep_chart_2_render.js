const t = function(key, opts) { return ctx.t(key, Object.assign({ ns: 'nb_crm' }, opts)); };

const data = ctx.data.objects || [];

const types = data.map(function(d) { return d.activity_type; });
const thisWeek = data.map(function(d) { return Number(d.this_week); });
const lastWeek = data.map(function(d) { return Number(d.last_week); });

const totalThis = thisWeek.reduce(function(a, b) { return a + b; }, 0);
const totalLast = lastWeek.reduce(function(a, b) { return a + b; }, 0);
const overallChange = totalLast > 0 ? ((totalThis - totalLast) / totalLast * 100).toFixed(1) : 0;

return {
  title: {
    text: t('Weekly Activity Comparison'),
    subtext: `${t('This Week')}: ${totalThis} | ${t('Last Week')}: ${totalLast} | ${overallChange >= 0 ? '+' : ''}${overallChange}%`,
    left: 'center'
  },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    formatter: function(params) {
      const idx = params[0].dataIndex;
      const item = data[idx];
      const changeIcon = item.change_pct >= 0 ? '↑' : '↓';
      const changeColor = item.change_pct >= 0 ? '#52c41a' : '#f5222d';
      return `<b>${item.activity_type}</b><br/>
        ${t('This Week')}: ${item.this_week}<br/>
        ${t('Last Week')}: ${item.last_week}<br/>
        <span style="color:${changeColor}">${changeIcon} ${Math.abs(item.change_pct)}%</span>`;
    }
  },
  legend: {
    data: [t('This Week'), t('Last Week')],
    bottom: 10
  },
  grid: {
    left: '10%',
    right: '10%',
    top: 80,
    bottom: 60
  },
  xAxis: {
    type: 'category',
    data: types
  },
  yAxis: {
    type: 'value',
    name: t('Count')
  },
  series: [
    {
      name: t('This Week'),
      type: 'bar',
      data: thisWeek,
      itemStyle: { color: '#1890ff' },
      label: {
        show: true,
        position: 'top'
      }
    },
    {
      name: t('Last Week'),
      type: 'bar',
      data: lastWeek,
      itemStyle: { color: '#d9d9d9' },
      label: {
        show: true,
        position: 'top'
      }
    }
  ]
}
