import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
// The security code (owner 2026-11-17; prod 2026-11-16: "9 1 7 4." at the card number question was stored as the code of a Visa
// and three charges were declined): out of order a bare number fills it only beside its word, and the completed card checks
// the code's length against the card's brand.
const engine=new WorkflowEngine({info(){},debug(){},error(){},warn(){}},async(s,u,sch,r)=>r?.task==='rank_reply'?'{"option":"answers"}':'{"flowName":"None"}',linkFormSchemas(FLOWS),[],{...STANDARD_FUNCTIONS},{},false,'en');engine.disableCommands();
let session,checks=0;const say=async(content,start)=>{session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'collect-credit-card'}}:{})},JSON.parse(JSON.stringify(session)))));return String(session.response||'').replace(/\s+/g,' ');};
const values=()=>Object.assign({},...Object.values(session.cargo.formResults||{}),...Object.values(session.cargo.forms||{}).filter(f=>f.values).map(f=>f.values));
const begin=async(language,voice)=>{session=engine.initSession('t',crypto.randomUUID(),language);session.cargo.voice=voice;await say('start',true);};
const text=r=>JSON.stringify(r);
let r;
await begin('es',true);
r=await say('9 1 7 4.');
assert.match(r,/Si 9 1 7 4 es el código de seguridad de la tarjeta, agregue las palabras CÓDIGO DE SEGURIDAD\./,r);
assert.match(r,/número de su tarjeta/,r);assert.equal(values().card_cvv,undefined);checks++;
await begin('en',false);
r=await say('7206');assert.match(r,/If 7206 is the security code of the card, add the words SECURITY CODE\./,r);assert.equal(values().card_cvv,undefined);checks++;
r=await say('security code 123');assert.equal(values().card_cvv,'123',text(values()));checks++;
await begin('en',false);
await say('4111111111111111');
r=await say('123');assert.equal(values().card_cvv,undefined,'a bare number at the expiration question answers the expiration');assert.match(r,/expiration/,r);checks++;
// The code at its own question, before the card number: 3 or 4 digits pass; the completed Visa card asks it again.
await begin('en',false);
await say('security code 9174');assert.equal(values().card_cvv,'9174');
await say('4111111111111111');await say('0929');
r=await say('91910');
assert.match(r,/That security code doesn't look right\. It is the 3 digits on the back of the card\./,r);
assert.match(r,/What is the security code/,r);checks++;
r=await say('123');assert.equal(values().card_cvv,'123');assert.doesNotMatch(r,/doesn't look right/,r);checks++;
// American Express keeps 4.
await begin('en',false);
await say('security code 1234');await say('378282246310005');await say('0929');r=await say('91910');
assert.doesNotMatch(r,/doesn't look right/,r);assert.equal(values().card_cvv,'1234');checks++;
// The expiration out of order fills only beside its word too (owner 2026-11-17).
await begin('en',false);
r=await say('09/29');assert.match(r,/If 09\/29 is the expiration date of the card, add the word EXPIRATION\./,r);assert.equal(values().card_expiration,undefined);checks++;
r=await say('expiration 09/29');assert.equal(values().card_expiration,'0929');checks++;
await begin('es',true);
r=await say('vencimiento 0 4 3 1');assert.equal(values().card_expiration,'0431',r);assert.doesNotMatch(r,/código de seguridad/,r);checks++;
await begin('es',true);await say('4111111111111111');
r=await say('1 2 2 9, ya');assert.equal(values().card_expiration,'1229','at its own question the expiration needs no word');checks++;
// A number two fields could take names both (owner 2026-11-17).
await begin('en',false);
r=await say('1234');assert.match(r,/If 1234 is the expiration date of the card, add the word EXPIRATION\. If 1234 is the security code of the card, add the words SECURITY CODE\./,r);checks++;
console.log(`Card security code: all ${checks} checks passed`);
