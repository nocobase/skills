/**
 * Chart - Tasks by Priority
 */
const CONFIG = {
  label: "Tasks by Priority",
  sql: `
    SELECT 
      CASE priority
        WHEN 'low' THEN 'Low'
        WHEN 'medium' THEN 'Medium'
        WHEN 'high' THEN 'High'
        WHEN 'urgent' THEN 'Urgent'
        ELSE priority
      END as name,
      COUNT(*) as value
    FROM "nb_pm_tasks"
    GROUP BY priority
    ORDER BY 
      CASE priority
        WHEN 'urgent' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
        ELSE 5
      END
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
  
  const colorMap = {
    'Urgent': '#f5222d',
    'High': '#fa8c16',
    'Medium': '#1677ff',
    'Low': '#52c41a'
  };
  
  const option = {
    title: {
      text: CONFIG.label,
      left: 'center',
      textStyle: { fontSize: 16, fontWeight: 'normal' }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: data.map(d => d.name),
      axisTick: { alignWithLabel: true }
    },
    yAxis: {
      type: 'value'
    },
    series: [{
      type: 'bar',
      barWidth: '60%',
      data: data.map(d => ({
        value: parseInt(d.value),
        itemStyle: { color: colorMap[d.name] || '#1677ff' }
      }))
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
