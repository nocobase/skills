
(async () => {
  const h = ctx.React.createElement;
  try {
    const r = await ctx.api.request({
      url: 'nb_tm_tools:list',
      params: { pageSize: 200, filter: { status: { '$ne': '已报废' } } }
    });
    const data = (r?.data?.data || []).filter(item =>
      (item.life_total||0) - (item.life_used||0) <= 0
    );
    const { Table, Tag, Alert } = ctx.antd;
    const columns = [
      { title: '刀具编号', dataIndex: 'code', key: 'code', width: 140 },
      { title: '刀具名称', dataIndex: 'name', key: 'name' },
      { title: '类别', dataIndex: 'category', key: 'category', width: 80 },
      { title: '设计寿命', dataIndex: 'life_total', key: 'lt', width: 80, align: 'right' },
      { title: '已使用', dataIndex: 'life_used', key: 'lu', width: 80, align: 'right',
        render: v => h('span', {style:{color:'#ff4d4f', fontWeight:500}}, v) },
      { title: '超出', key: 'over', width: 80, align: 'right',
        render: (_, rec) => {
          const over = (rec.life_used||0) - (rec.life_total||0);
          return h(Tag, {color:'red'}, '+'+over);
        }
      },
    ];
    ctx.render(h('div', {style:{padding:16}}, [
      data.length > 0
        ? h(Alert, {key:'a', type:'warning', showIcon:true, style:{marginBottom:16},
            message: '发现 '+data.length+' 把刀具寿命已耗尽，建议尽快报废'})
        : h(Alert, {key:'a', type:'success', showIcon:true, style:{marginBottom:16},
            message: '所有刀具寿命正常，无需报废'}),
      h(Table, {key:'t', columns, dataSource:data, rowKey:'id', size:'small', pagination:false}),
    ]));
  } catch(e) { ctx.render(h('div',{style:{color:'red',padding:16}},'加载失败: '+e.message)); }
})();
