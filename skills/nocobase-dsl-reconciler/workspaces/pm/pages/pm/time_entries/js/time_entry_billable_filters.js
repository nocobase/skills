const { Button, Space } = ctx.antd;

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'true', label: 'Billable' },
  { key: 'false', label: 'Non-billable' },
];

const location = ctx.router?.state?.location || {};
const pathname = location.pathname || '';
const search = location.search || '';
const activeFilter = new URLSearchParams(search).get('billable') || 'all';

function navigateWithFilter(nextFilter) {
  const params = new URLSearchParams(search);
  if (!nextFilter || nextFilter === 'all') {
    params.delete('billable');
  } else {
    params.set('billable', nextFilter);
  }
  const query = params.toString();
  ctx.router.navigate(query ? `${pathname}?${query}` : pathname);
}

function BillableFilters() {
  return (
    <Space wrap size={[8, 8]}>
      {FILTER_OPTIONS.map((option) => (
        <Button
          key={option.key}
          type={activeFilter === option.key ? 'primary' : 'default'}
          onClick={() => navigateWithFilter(option.key)}
        >
          {option.label}
        </Button>
      ))}
    </Space>
  );
}

ctx.render(<BillableFilters />);
