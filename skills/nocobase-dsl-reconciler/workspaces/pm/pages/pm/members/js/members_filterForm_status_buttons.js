const { Button, Space } = ctx.antd;
const { useState } = ctx.React;

const STATS = [
  { key: 'all', label: 'All', filter: {} },
  { key: 'manager', label: 'Manager', filter: { role: { $eq: 'manager' } } },
  { key: 'developer', label: 'Developer', filter: { role: { $eq: 'developer' } } },
  { key: 'designer', label: 'Designer', filter: { role: { $eq: 'designer' } } },
];

const StatusButtons = () => {
  const [active, setActive] = useState('all');

  const handleClick = (stat) => {
    setActive(stat.key);
    if (ctx.form && ctx.form.setFieldsValue) {
      if (stat.key === 'all') {
        ctx.form.resetFields();
      } else {
        ctx.form.setFieldsValue({ role: stat.filter.role.$eq });
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
