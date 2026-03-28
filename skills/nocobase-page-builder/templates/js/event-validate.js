// Event: Cross-field Validation — validates field relationships (e.g. end > start date)
// Tool: nb_inject_js(uid, code, event_name="formValuesChange")
// Placeholders: {FIELD_A}, {FIELD_B}, {RULE}, {MESSAGE}
// {RULE}: "date_after" = B must be after A, "greater" = B must be > A, "not_equal" = B != A
(async()=>{const v=ctx.form?.values||{};const a=v.{FIELD_A};const b=v.{FIELD_B};if(!a||!b)return;const rule='{RULE}';let invalid=false;if(rule==='date_after'){invalid=new Date(b)<new Date(a);}else if(rule==='greater'){invalid=Number(b)<=Number(a);}else if(rule==='not_equal'){invalid=a===b;}if(invalid){ctx.message?.warning('{MESSAGE}');}})();
