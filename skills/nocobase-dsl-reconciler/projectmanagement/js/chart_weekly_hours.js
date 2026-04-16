/**
 * Chart - Weekly Hours
 */
const CONFIG = {
  label: "Weekly Hours Logged",
  sql: `
    SELECT 
      TO_CHAR("work_date", 'YYYY-MM-DD') as day,
      SUM(hours) as hours
    FROM "nb_pm_time_entries"
    WHERE "work_date" >= NOW() - INTERVAL '7 days'
    GROUP BY "work_date"
    ORDER BY "work_date"
  `
};

// Fetch data
async function fetchData() {
  try {
    const res = await ctx.request({
      url: "/api/sql:query",
      method: "POST",
      data: { sql: CONFIG.sql }
    });
    return res.data || [];
  } catch (e) {
    return [];
  }
}

// Render chart
function renderChart(data) {
  const chartDom = document.createElement("div");
  chartDom.style.cssText = "width:100%;height:300px;background:#fff;padding:16px;border-radius:8px;";
  
  if (data.length === 0) {
    chartDom.innerHTML = '<div style="text-align:center;padding:100px;color:#999;">No data</div>';
    return chartDom;
  }
  
  const option = {
    title: {
      text: CONFIG.label,
      left: 'center',
      textStyle: { fontSize: 16, fontWeight: 'normal' }
    },
    tooltip: {
      trigger: 'axis'
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: data.map(d => d.day),
      axisLabel: {
        formatter: function(value) {
          return value.substring(5); // Show MM-DD
        }
      }
    },
    yAxis: {
      type: 'value',
      name: 'Hours'
    },
    series: [{
      name: 'Hours',
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 8,
      lineStyle: {
        color: '#1677ff',
        width: 3
      },
      itemStyle: {
        color: '#1677ff'
      },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(22, 119, 255, 0.3)' },
            { offset: 1, color: 'rgba(22, 119, 255, 0.05)' }
          ]
        }
      },
      data: data.map(d => parseFloat(d.hours).toFixed(1))
    }]
  };
  
  const chart = echarts.init(chartDom);
  chart.setOption(option);
  
  // Responsive
  window.addEventListener('resize', () => chart.resize());
  
  return chartDom;
}

// Main render
const root = document.getElementById(rootId);
root.innerHTML = '<div style="padding:16px;">Loading chart...</div>';

fetchData().then(data => {
  root.innerHTML = '';
  root.appendChild(renderChart(data));
});
