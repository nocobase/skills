/**
 * ECharts Custom Chart Block Template
 *
 * @type chart.option.raw
 * @template chart-custom
 *
 * === AI Modification Guide ===
 * 1. Modify the ECharts config inside buildOption(data)
 * 2. data is already an array (auto-extracted from ctx.data.objects with validation)
 * 3. No need to handle ctx.data format — the template handles it
 * ====================
 */

// ─── Safe Data Extraction (Do not modify) ────────────────────
const data = (() => {
  const raw = ctx.data;
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.objects)) return raw.objects;
  if (raw && Array.isArray(raw.data)) return raw.data;
  return [];
})();

if (data.length === 0) {
  return { title: { text: '暂无数据', left: 'center', top: 'center', textStyle: { color: '#999', fontSize: 14 } } };
}

// ─── CONFIG: AI modifies here ────────────────────────────────
function buildOption(data) {
  // Example: bar chart
  const categories = data.map(d => d.name || '');
  const values = data.map(d => parseFloat(d.value || 0));

  return {
    title: { text: '图表标题', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: categories },
    yAxis: { type: 'value' },
    series: [{
      type: 'bar',
      data: values,
      itemStyle: { color: '#1677ff', borderRadius: [4, 4, 0, 0] },
    }],
  };
}
// ─── CONFIG END ────────────────────────────────────

return buildOption(data);
