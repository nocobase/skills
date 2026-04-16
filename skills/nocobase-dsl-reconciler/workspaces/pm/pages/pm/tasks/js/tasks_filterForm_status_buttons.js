const { Button, Space } = ctx.antd;
const { useState } = ctx.React;

const STATS = [
  { key: 'all', label: 'All', filter: {} },
  { key: 'todo', label: 'Todo', filter: { status: { $eq: 'todo' } } },
  { key: 'in_progress', label: 'In Progress', filter: { status: { $eq: 'in_progress' } } },
  { key: 'review', label: 'Review', filter: { status: { $eq: 'review' } } },
  { key: 'done', label: 'Done', filter: { status: { $eq: 'done' } } },
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
