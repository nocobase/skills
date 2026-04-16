
const h = ctx.React.createElement;
const { Progress } = ctx.antd;
const r = ctx.record || {};
const pct = r.life_total ? Math.round((r.life_used||0)/(r.life_total)*100) : 0;
const status = pct >= 90 ? 'exception' : pct >= 70 ? 'normal' : 'success';
ctx.render(h(Progress, {percent:pct, size:'small', status, style:{width:80, margin:0}}));
