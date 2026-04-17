// CRM Dashboard - Filter and Reset Buttons
const { Button, Space } = ctx.antd;
const { SearchOutlined, ReloadOutlined } = ctx.libs.antdIcons;
const { useState } = ctx.React;

const FilterButtons = () => {
  const [filterLoading, setFilterLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const chartModelIds = [
    'hu4haj59bjz',
    'efd8l319buz',
    'fado2jfs4bz',
    'dvigfls2dy1',
    'iay7yvf7pt5'
  ];

  const refreshAllCharts = async () => {
    const results = [];
    for (const chartId of chartModelIds) {
      try {
        const chartResource = ctx.engine.getModel(chartId, true)?.resource;
        if (chartResource) {
          await chartResource.refresh();
          results.push({ id: chartId, success: true });
        } else {
          results.push({ id: chartId, success: false, error: 'Resource not found' });
        }
      } catch (error) {
        results.push({ id: chartId, success: false, error: error.message });
      }
    }
    const successCount = results.filter(r => r.success).length;
    if (successCount === chartModelIds.length) {
      ctx.message.success(`Successfully refreshed ${successCount} charts`);
    } else if (successCount > 0) {
      ctx.message.warning(`Refreshed ${successCount}/${chartModelIds.length} charts`);
    } else {
      ctx.message.error('Failed to refresh charts');
    }
  };

  const handleFilter = async () => {
    setFilterLoading(true);
    try {
      await refreshAllCharts();
    } catch (error) {
      ctx.message.error('Filter failed: ' + error.message);
    } finally {
      setFilterLoading(false);
    }
  };

  const handleReset = async () => {
    setResetLoading(true);
    try {
      if (ctx.form?.resetFields) {
        ctx.form.resetFields();
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      ctx.message.success('Filters reset successfully');
      await refreshAllCharts();
    } catch (error) {
      ctx.message.error('Reset failed: ' + error.message);
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'flex-end', paddingTop: '20px' }}>
      <Space size="middle" wrap>
        <Button type="primary" onClick={handleFilter} loading={filterLoading} icon={<SearchOutlined />}>Filter</Button>
        <Button onClick={handleReset} loading={resetLoading} icon={<ReloadOutlined />}>Reset</Button>
      </Space>
    </div>
  );
};

ctx.render(<FilterButtons />);
