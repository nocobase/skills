(async()=>{const v=ctx.form?.values||{};const m={MAP};if(v.{TRIGGER}&&m[v.{TRIGGER}]!==undefined){ctx.form.setFieldsValue({'{TARGET}':m[v.{TRIGGER}]});}})();
