const t = function(key, opts) { return ctx.t(key, Object.assign({ ns: 'nb_crm' }, opts)); };
const data = ctx.data.objects || [];

const formatCurrency = function(val) {
  if (val >= 1000000) return '$' + (val / 1000000).toFixed(1) + 'M';
  if (val >= 1000) return '$' + (val / 1000).toFixed(0) + 'K';
  return '$' + val.toFixed(0);
};

// Prepare data
const repNames = data.map(function(d) { return d.rep_name; }).reverse();
const wonAmounts = data.map(function(d) { return Number(d.won_amount); }).reverse();
const pipelineValues = data.map(function(d) { return Number(d.pipeline_value); }).reverse();

// Medal colors for top 3
const getBarColor = function(index, total) {
  const realIndex = total - 1 - index;
  if (realIndex === 0) return '#ffd700'; // Gold
  if (realIndex === 1) return '#c0c0c0'; // Silver
  if (realIndex === 2) return '#cd7f32'; // Bronze
  return '#1890ff';
};

return {
  title: {
    text: t('Sales Team Leaderboard'),
    subtext: t('Ranked by Won Revenue'),
    left: 'center'
  },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    formatter: function(params) {
      const idx = data.length - 1 - params[0].dataIndex;
      const rep = data[idx];
      return `<b>#${rep.rank} ${rep.rep_name}</b><br/>
        ${t('Won')}: ${formatCurrency(rep.won_amount)} (${rep.won_deals} ${t('deals')})<br/>
        ${t('Pipeline')}: ${formatCurrency(rep.pipeline_value)} (${rep.active_deals} ${t('deals')})<br/>
        ${t('Win Rate')}: ${rep.win_rate || 0}%`;
    }
  },
  legend: {
    data: [t('Won Revenue'), t('Pipeline Value')],
    bottom: 10
  },
  grid: {
    left: '20%',
    right: '10%',
    top: 80,
    bottom: 60
  },
  xAxis: {
    type: 'value',
    axisLabel: {
      formatter: function(val) { return formatCurrency(val); }
    }
  },
  yAxis: {
    type: 'category',
    data: repNames,
    axisLabel: {
      formatter: function(name) {
        const idx = repNames.indexOf(name);
        const realRank = data.length - idx;
        const medal = realRank === 1 ? '🥇 ' : realRank === 2 ? '🥈 ' : realRank === 3 ? '🥉 ' : '';
        return medal + name;
      }
    }
  },
  series: [
    {
      name: t('Won Revenue'),
      type: 'bar',
      data: wonAmounts.map(function(val, idx) { return {
        value: val,
        itemStyle: {
          color: getBarColor(idx, data.length)
        }
      }; }),
      label: {
        show: true,
        position: 'right',
        formatter: function(params) { return formatCurrency(params.value); }
      }
    },
    {
      name: t('Pipeline Value'),
      type: 'bar',
      data: pipelineValues,
      itemStyle: {
        color: 'rgba(24, 144, 255, 0.3)'
      },
      label: {
        show: false
      }
    }
  ]
}
