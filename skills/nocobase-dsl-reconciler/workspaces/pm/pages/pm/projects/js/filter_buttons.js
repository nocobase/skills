var React = ctx.React;
var { Button, Space } = ctx.antd;

var FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active', filter: { status: { $eq: 'in_progress' } } },
  { key: 'completed', label: 'Completed', filter: { status: { $eq: 'completed' } } },
];

function FilterButtons() {
  var [active, setActive] = React.useState('all');

  function handleClick(item) {
    setActive(item.key);
    if (item.filter) {
      ctx.form.setValuesIn('filter', item.filter);
    } else {
      ctx.form.reset();
    }
    ctx.form.submit();
  }

  return React.createElement(Space, null,
    FILTERS.map(function(item) {
      return React.createElement(Button, {
        key: item.key,
        type: active === item.key ? 'primary' : 'default',
        onClick: function() { handleClick(item); }
      }, item.label);
    })
  );
}

export default FilterButtons;
