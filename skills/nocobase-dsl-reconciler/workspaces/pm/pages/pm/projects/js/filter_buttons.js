const { Button, Space } = ctx.antd;

const FILTERS = [
  { key: 'all', label: 'All', filter: null },
  { key: 'planning', label: 'Planning', filter: { status: { $eq: 'planning' } } },
  { key: 'in_progress', label: 'In Progress', filter: { status: { $eq: 'in_progress' } } },
  { key: 'completed', label: 'Completed', filter: { status: { $eq: 'completed' } } },
  { key: 'on_hold', label: 'On Hold', filter: { status: { $eq: 'on_hold' } } },
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
