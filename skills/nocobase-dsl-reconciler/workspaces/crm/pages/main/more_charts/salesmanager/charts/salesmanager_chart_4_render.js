const t = function(key, opts) { return ctx.t(key, Object.assign({ ns: 'nb_crm' }, opts)); };
const rawData = ctx.data.objects[0] || {};

const data = {
  wonAmount: Number(rawData.won_amount) || 0,
  wonCount: Number(rawData.won_count) || 0,
  target: Number(rawData.target_amount) || 5000000,
  achievementRate: Number(rawData.achievement_rate) || 0,
  momGrowth: Number(rawData.mom_growth) || 0,
  weightedPipeline: Number(rawData.weighted_pipeline) || 0
};

const formatCurrency = function(val) {
  if (val >= 1000000) return '$' + (val / 1000000).toFixed(2) + 'M';
  if (val >= 1000) return '$' + (val / 1000).toFixed(0) + 'K';
  return '$' + val.toFixed(0);
};

const getColor = function(rate) {
  if (rate >= 100) return '#52c41a';
  if (rate >= 80) return '#1890ff';
  if (rate >= 60) return '#faad14';
  return '#f5222d';
};

return {
  title: {
    text: t('Monthly Revenue'),
    subtext: `${t('Target')}: ${formatCurrency(data.target)}`,
    left: 'center'
  },
  series: [
    {
      name: t('Achievement'),
      type: 'gauge',
      center: ['50%', '60%'],
      radius: '75%',
      startAngle: 200,
      endAngle: -20,
      min: 0,
      max: 120,
      splitNumber: 12,
      axisLine: {
        lineStyle: {
          width: 25,
          color: [
            [0.5, '#f5222d'],
            [0.67, '#faad14'],
            [0.83, '#1890ff'],
            [1, '#52c41a']
          ]
        }
      },
      pointer: {
        itemStyle: { color: 'auto' },
        width: 6,
        length: '55%'
      },
      axisTick: {
        distance: -25,
        length: 8,
        lineStyle: { color: '#fff', width: 2 }
      },
      splitLine: {
        distance: -30,
        length: 15,
        lineStyle: { color: '#fff', width: 3 }
      },
      axisLabel: {
        color: 'inherit',
        distance: 35,
        fontSize: 11,
        formatter: function(value) { return value + '%'; }
      },
      detail: {
        valueAnimation: true,
        formatter: function() {
          const growthIcon = data.momGrowth >= 0 ? '↑' : '↓';
          const growthColor = data.momGrowth >= 0 ? '#52c41a' : '#f5222d';
          return `{value|${formatCurrency(data.wonAmount)}}\n{rate|${data.achievementRate}% ${t('of target')}}\n{growth|${growthIcon} ${Math.abs(data.momGrowth)}% ${t('MoM')}}`;
        },
        rich: {
          value: {
            fontSize: 28,
            fontWeight: 'bold',
            color: getColor(data.achievementRate),
            padding: [0, 0, 5, 0]
          },
          rate: {
            fontSize: 14,
            color: '#666',
            padding: [5, 0, 5, 0]
          },
          growth: {
            fontSize: 12,
            color: data.momGrowth >= 0 ? '#52c41a' : '#f5222d'
          }
        },
        offsetCenter: [0, '75%']
      },
      data: [{ value: Math.min(data.achievementRate, 120) }]
    }
  ],
  graphic: [
    {
      type: 'group',
      left: '10%',
      bottom: 20,
      children: [
        {
          type: 'text',
          style: {
            text: `${t('Won Deals')}: ${data.wonCount}`,
            fontSize: 12,
            fill: '#666'
          }
        }
      ]
    },
    {
      type: 'group',
      right: '10%',
      bottom: 20,
      children: [
        {
          type: 'text',
          style: {
            text: `${t('Pipeline')}: ${formatCurrency(data.weightedPipeline)}`,
            fontSize: 12,
            fill: '#666'
          }
        }
      ]
    }
  ]
}
