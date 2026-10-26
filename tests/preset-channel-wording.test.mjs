import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
// A preset's question and retry use the channel's own words: "say or enter" on a call, "type" in writing (prod 2026-10-26:
// "Por favor diga o ingrese el número de su tarjeta" on web D365 and WhatsApp).
const engine=new WorkflowEngine({info(){},debug(){},error(){},warn(){}},async()=>'{"flowName":"None"}',linkFormSchemas(FLOWS),[],{...STANDARD_FUNCTIONS},{},false,'en');engine.disableCommands();
let session,checks=0;const say=async(content,start)=>{session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'collect-credit-card'}}:{})},JSON.parse(JSON.stringify(session)))));return String(session.response||'').replace(/\s+/g,' ');};
const begin=async(language,voice)=>{session=engine.initSession('t',crypto.randomUUID(),language);session.cargo.voice=voice;return say('start',true);};
for(const [language,voice,question,retry] of [
   ['en',true,'Please say or enter your card number.','Please say or enter the full card number.'],
   ['en',false,'Please type your card number.','Please type the full card number.'],
   ['es',true,'Por favor diga o ingrese el número de su tarjeta.','Por favor diga o ingrese el número completo de su tarjeta.'],
   ['es',false,'Por favor escriba el número de su tarjeta.','Por favor escriba el número completo de su tarjeta.'],
]){
   assert.equal(await begin(language,voice),question,`${language} voice=${voice}: the question`);checks++;
   assert.equal(await say('12'),retry,`${language} voice=${voice}: the retry after an answer that is not a card number`);checks++;
}
console.log(`Preset channel wording: all ${checks} checks passed`);
