const { Button, Space } = ctx.antd;
const { useState } = ctx.React;

const STATS = [
  { key: 'all', label: 'All', filter: {} },
  { key: 'planning', label: 'Planning', filter: { status: { $eq: 'planning' } } },
  { key: 'active', label: 'Active', filter: { status: { $eq: 'active' } } },
  { key: 'completed', label: 'Completed', filter: { status: { $eq: 'completed' } } },
  { key: 'on_hold', label: 'On Hold', filter: { status: { $eq: 'on_hold' } } },
];

const StatusButtons = () => {
  const [active, setActive] = useState('all');

  const handleClick = (stat) => {
    setActive(stat.key);
    if (ctx.form && ctx.form.setFieldsValue) {
      if (stat.key === 'all') {
        ctx.form.resetFields();
      } else {
        ctx.form.setFieldsValue({ status: stat.filter.status.$eq });
      }
      if (ctx.form.submit) ctx.form.submit();
    }
  };

  return (
    <Space wrap size={[8, 8]}>
      {STATS.map((s) => (
        <Button
          key={s.key}
          type={active === s.key ? 'primary' : 'default'}
          onClick={() => handleClick(s)}
        >
          {s.label}
        </Button>
      ))}
    </Space>
  );
};

ctx.render(<StatusButtons />);
