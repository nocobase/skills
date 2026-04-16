const { Button, Space } = ctx.antd;

const FILTERS = [
  { key: 'all', label: 'All', filter: null },
  { key: 'manager', label: 'Manager', filter: { role: { $eq: 'manager' } } },
  { key: 'developer', label: 'Developer', filter: { role: { $eq: 'developer' } } },
  { key: 'designer', label: 'Designer', filter: { role: { $eq: 'designer' } } },
  { key: 'tester', label: 'Tester', filter: { role: { $eq: 'tester' } } },
  { key: 'analyst', label: 'Analyst', filter: { role: { $eq: 'analyst' } } },
];

function FilterButtons() {
  const [active, setActive] = ctx.React.useState('all');

  const applyFilter = (f) => {
    const parent = ctx.engine?.getModel(ctx.model.parent);
    const tableBlock = parent?.children?.find(c => c.key === 'table');
    if (tableBlock) {
      tableBlock.resource.addFilterGroup(ctx.model.uid, f || { $and: [] });
      tableBlock.resource.refresh();
    }
  };

  return (
    <Space wrap>
      {FILTERS.map(f => (
        <Button
          key={f.key}
          type={active === f.key ? 'primary' : 'default'}
          onClick={() => { setActive(f.key); applyFilter(f.filter); }}
        >
          {f.label}
        </Button>
      ))}
    </Space>
  );
}

ctx.render(<FilterButtons />);
