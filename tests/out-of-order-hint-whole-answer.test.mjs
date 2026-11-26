import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
// An out-of-order hint is a match too (owner 2026-11-26): "add the words SECURITY CODE" is said only when the number is the whole
// answer. A number inside a sentence is no match: no hint, and the reply ranker reads the sentence. Prod 2026-11-25: "Voy a pagar
// el monto vencido de 107 dólares." (CA5b1d), "Pagar los 102 dólares pendientes…" (CA7c25) and "Yo Debo 800 prestamo personal"
// were each told to add CÓDIGO DE SEGURIDAD, and the ranker was never asked.
let ranks=0;
const engine=new WorkflowEngine({info(){},debug(){},error(){},warn(){}},async(s,u,sch,r)=>r?.task==='rank_reply'?(ranks++,'{"option":"answers"}'):'{"flowName":"None"}',linkFormSchemas(FLOWS),[],{...STANDARD_FUNCTIONS},{},false,'en');engine.disableCommands();
let session,checks=0;const say=async(content,start)=>{session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'collect-credit-card'}}:{})},JSON.parse(JSON.stringify(session)))));return String(session.response||'').replace(/\s+/g,' ');};
const values=()=>Object.assign({},...Object.values(session.cargo.formResults||{}),...Object.values(session.cargo.forms||{}).filter(f=>f.values).map(f=>f.values));
const begin=async(language,voice)=>{session=engine.initSession('t',crypto.randomUUID(),language);session.cargo.voice=voice;await say('start',true);};
const HINT=/código de seguridad de la tarjeta, agregue|security code of the card, add/;
for (const sentence of ['Voy a pagar el monto vencido de 107 dólares.','Pagar los 102 dólares pendientes con la cuenta con terminación','Yo Debo 800 prestamo personal']) {
   await begin('es',true);ranks=0;
   const r=await say(sentence);
   assert.doesNotMatch(r,HINT,`${sentence}: no hint [${r}]`);assert.ok(ranks>0,`${sentence}: the reply ranker read it`);assert.equal(values().card_cvv,undefined);checks++;
}
await begin('en',false);ranks=0;
let r=await say('I want to pay 107 dollars');assert.doesNotMatch(r,HINT,r);assert.ok(ranks>0,'English sentence: the ranker read it');checks++;
// The whole answer keeps its hint: the number alone, with courtesy words, or with the field's own words.
await begin('es',true);
r=await say('107');assert.match(r,/Si 1 0 7 es el código de seguridad de la tarjeta, agregue las palabras CÓDIGO DE SEGURIDAD\./,r);checks++;
await begin('es',true);
r=await say('107 por favor');assert.match(r,/Si 1 0 7 es el código de seguridad/,r);checks++;
await begin('en',false);
r=await say('9174 thanks');assert.match(r,/If 9174 is the security code of the card, add the words SECURITY CODE\./,r);checks++;
console.log(`Out-of-order hint, whole answer only: all ${checks} checks passed`);
