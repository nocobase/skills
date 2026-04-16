(async () => {
  try {
    const r = await ctx.api.request({
      url: 'nb_tm_repair:list',
      params: { paginate: false, filter: {"status": "\u5df2\u5b8c\u6210"} }
    });
    const count = Array.isArray(r?.data?.data) ? r.data.data.length
                : Array.isArray(r?.data) ? r.data.length : 0;
    ctx.render(ctx.React.createElement(ctx.antd.Statistic, {
      value: count,
      valueStyle: { fontSize: 28, color:'green' }
    }));
  } catch(e) {
    ctx.render(ctx.React.createElement(ctx.antd.Statistic, {
      value: '?', valueStyle: { fontSize: 28 }
    }));
  }
})();