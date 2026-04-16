(async () => {
  try {
    const r = await ctx.api.request({
      url: 'nb_tm_repair:list',
      params: { paginate: false }
    });
    const count = Array.isArray(r?.data?.data) ? r.data.data.length
                : Array.isArray(r?.data) ? r.data.length : 0;
    ctx.render(ctx.React.createElement(ctx.antd.Statistic, {
      value: count,
      valueStyle: { fontSize: 28 }
    }));
  } catch(e) {
    ctx.render(ctx.React.createElement(ctx.antd.Statistic, {
      value: '?', valueStyle: { fontSize: 28 }
    }));
  }
})();