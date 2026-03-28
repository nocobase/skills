(async()=>{const v=ctx.form?.values||{};const a=parseFloat(v.{FIELD_A})||0;const b=parseFloat(v.{FIELD_B})||0;if(a>0&&b>0){ctx.form.setFieldsValue({'{RESULT}':Math.round(a*b*100)/100});}})();
