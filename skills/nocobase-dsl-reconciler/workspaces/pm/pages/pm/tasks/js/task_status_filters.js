const { Button, Space } = ctx.antd;

const STATUS_OPTIONS = [
  { key: 'all', label: 'All', value: null },
  { key: 'todo', label: 'To Do', value: 'todo' },
  { key: 'in_progress', label: 'In Progress', value: 'in_progress' },
  { key: 'blocked', label: 'Blocked', value: 'blocked' },
  { key: 'done', label: 'Done', value: 'done' },
];

const location = ctx.router?.state?.location || {};
const pathname = location.pathname || '';
const search = location.search || '';
const activeStatus = new URLSearchParams(search).get('status') || 'all';

function navigateWithStatus(nextStatus) {
  const params = new URLSearchParams(search);
  if (!nextStatus || nextStatus === 'all') {
    params.delete('status');
  } else {
    params.set('status', nextStatus);
  }
  const query = params.toString();
  ctx.router.navigate(query ? `${pathname}?${query}` : pathname);
}

function StatusFilters() {
  return (
    <Space wrap size={[8, 8]}>
      {STATUS_OPTIONS.map((option) => (
        <Button
          key={option.key}
          type={activeStatus === option.key ? 'primary' : 'default'}
          onClick={() => navigateWithStatus(option.key)}
        >
          {option.label}
        </Button>
      ))}
    </Space>
  );
}

ctx.render(<StatusFilters />);
