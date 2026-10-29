import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
// An expiration said with words between month and year, or with the month by name, is read (prod 2026-10-28 21:54: "el mes 06 año 31" was asked again).
const engine=new WorkflowEngine({info(){},debug(){},error(){},warn(){}},async()=>'{"flowName":"None"}',linkFormSchemas(FLOWS),[],{...STANDARD_FUNCTIONS},{},false,'en');engine.disableCommands();
let session,checks=0;const say=async(content,start)=>{session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'collect-credit-card'}}:{})},JSON.parse(JSON.stringify(session)))));return String(session.response||'').replace(/\s+/g,' ');};
for(const [language,said,mmyy] of [['es','el mes 06 año 31','0631'],['es','06 del año 31','0631'],['en','month 06 year 31','0631'],['en','6 of 2031','0631'],['es','0631','0631'],['es','junio del 31','0631'],['es','junio de 2031','0631'],['es','diciembre 28','1228'],['en','June 2031','0631'],['en','December of 28','1228'],['en','sept 29','0929'],['en','Jun. 31','0631']]){
   session=engine.initSession('t',crypto.randomUUID(),language);session.cargo.voice=true;
   await say('start',true);await say('4111111111111111');
   const reply=await say(said);
   assert.match(reply,language==='es'?/código de seguridad/:/security code/,`${said}: read as the expiration, the security code is asked next (got: ${reply})`);checks++;
   assert.match(JSON.stringify(session.cargo),new RegExp(`"card_expiration":"${mmyy}"`),`${said}: stored as ${mmyy}`);checks++;
}
console.log(`card-expiration-words: ${checks} checks passed`);
