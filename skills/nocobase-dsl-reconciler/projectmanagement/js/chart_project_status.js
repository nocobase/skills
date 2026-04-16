/**
 * Chart - Projects by Status
 */
const CONFIG = {
  label: "Projects by Status",
  sql: `
    SELECT 
      CASE status
        WHEN 'planning' THEN 'Planning'
        WHEN 'in_progress' THEN 'In Progress'
        WHEN 'on_hold' THEN 'On Hold'
        WHEN 'completed' THEN 'Completed'
        WHEN 'cancelled' THEN 'Cancelled'
        ELSE status
      END as name,
      COUNT(*) as value
    FROM "nb_pm_projects"
    GROUP BY status
    ORDER BY value DESC
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
  
  const colors = ['#1677ff', '#52c41a', '#fa8c16', '#8c8c8c', '#f5222d'];
  
  const option = {
    title: {
      text: CONFIG.label,
      left: 'center',
      textStyle: { fontSize: 16, fontWeight: 'normal' }
    },
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    legend: {
      orient: 'vertical',
      right: 10,
      top: 'center'
    },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['40%', '50%'],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 8,
        borderColor: '#fff',
        borderWidth: 2
      },
      label: {
        show: false
      },
      emphasis: {
        label: {
          show: true,
          fontSize: 14,
          fontWeight: 'bold'
        }
      },
      data: data.map((item, idx) => ({
        name: item.name,
        value: parseInt(item.value),
        itemStyle: { color: colors[idx % colors.length] }
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
