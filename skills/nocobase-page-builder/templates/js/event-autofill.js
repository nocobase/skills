// Event: Auto-fill Defaults — fills current user and/or today's date on form open
// Tool: nb_inject_js(uid, code, event_name="beforeRender")
// Placeholders: {FILLS}
// {FILLS} = JSON array: [{"field":"reporter","source":"currentUser"},{"field":"apply_date","source":"today"}]
// source: "currentUser" = ctx.model.currentUser.nickname, "today" = today's date ISO
(async()=>{const fills={FILLS};fills.forEach(f=>{const field=ctx.form.query(f.field).take();if(!field||field.value)return;if(f.source==='currentUser'){const nick=ctx.model?.currentUser?.nickname||'';if(nick)ctx.form.setValuesIn(f.field,nick);}else if(f.source==='today'){ctx.form.setValuesIn(f.field,new Date().toISOString().slice(0,10));}});})();
