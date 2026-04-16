(async () => {
  try {
    const r = await ctx.api.request({
      url: 'nb_tm_borrow:list',
      params: { paginate: false, filter: {"status": "\u5f85\u5ba1\u6279"} }
    });
    const count = Array.isArray(r?.data?.data) ? r.data.data.length
                : Array.isArray(r?.data) ? r.data.length : 0;
    ctx.render(ctx.React.createElement(ctx.antd.Statistic, {
      value: count,
      valueStyle: { fontSize: 28, color:'orange' }
    }));
  } catch(e) {
    ctx.render(ctx.React.createElement(ctx.antd.Statistic, {
      value: '?', valueStyle: { fontSize: 28 }
    }));
  }
})();