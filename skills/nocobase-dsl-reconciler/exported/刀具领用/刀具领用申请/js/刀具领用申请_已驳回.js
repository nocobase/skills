(async () => {
  try {
    const r = await ctx.api.request({
      url: 'nb_tm_borrow:list',
      params: { paginate: false, filter: {"status": "\u5df2\u9a73\u56de"} }
    });
    const count = Array.isArray(r?.data?.data) ? r.data.data.length
                : Array.isArray(r?.data) ? r.data.length : 0;
    ctx.render(ctx.React.createElement(ctx.antd.Statistic, {
      value: count,
      valueStyle: { fontSize: 28, color:'red' }
    }));
  } catch(e) {
    ctx.render(ctx.React.createElement(ctx.antd.Statistic, {
      value: '?', valueStyle: { fontSize: 28 }
    }));
  }
})();