// Event: Conditional Required — make fields required/optional based on trigger value
// Tool: nb_inject_js(uid, code, event_name="formValuesChange")
// Placeholders: {TRIGGER}, {TRIGGER_VALUES}, {TARGET_FIELDS}
// {TRIGGER_VALUES} = values that activate required: ["urgent","high"]
// {TARGET_FIELDS} = fields to make required: ["approval_note","reason"]
(async()=>{const v=ctx.form?.values||{};const trigger=v.{TRIGGER};const activeVals={TRIGGER_VALUES};const targets={TARGET_FIELDS};const isActive=activeVals.includes(trigger);targets.forEach(fname=>{const field=ctx.form.query(fname).take();if(!field)return;if(typeof field.setRequired==='function'){field.setRequired(isActive);}else{try{field.required=isActive;}catch(e){}}});})();
