import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
// A card number said in groups across turns is joined (card_number preset, accumulate): short of 13 digits the question is
// "Go on." / "Continúe.", and an answer that is not digits drops the partial.
const engine=new WorkflowEngine({info(){},debug(){},error(){},warn(){}},async()=>'{"flowName":"None"}',linkFormSchemas(FLOWS),[],{...STANDARD_FUNCTIONS},{},false,'en');engine.disableCommands();
let session,checks=0;const say=async(content,start)=>{session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'collect-credit-card'}}:{})},JSON.parse(JSON.stringify(session)))));return String(session.response||'').replace(/\s+/g,' ');};
const card=()=>Object.values(session.cargo.forms||{}).map(f=>f.values&&f.values.card_number).find(Boolean);
const begin=async(language,voice)=>{session=engine.initSession('t',crypto.randomUUID(),language);session.cargo.voice=voice;await say('start',true);};
await begin('en',true);
assert.equal(await say('4111'),'Go on.');checks++;
assert.equal(await say('1111 1111'),'Go on.');checks++;
assert.match(await say('1111'),/expiration date/);assert.equal(card(),'4111111111111111');checks++;
await begin('es',true);
assert.equal(await say('4111 1111'),'Continúe.');checks++;
assert.match(await say('1111 1111'),/fecha de vencimiento/);assert.equal(card(),'4111111111111111');checks++;
await begin('en',false);
assert.match(await say('4111 1111 1111 1111'),/expiration date/);checks++;
await begin('en',false);
await say('4111');const r=await say('what?');assert.doesNotMatch(r,/^Go on/);assert.equal(card(),undefined);
assert.equal(await say('4111 1111 1111'),'Go on.');
assert.ok(Object.values(session.cargo.forms).some(f=>f.data&&f.data.__partial_card_number==='411111111111'),'the dropped partial is not joined to a later group');checks++;
await begin('en',false);
assert.notEqual(await say('1234'),'Go on.','a first group no card starts with keeps the normal reading (an expiration or code)');checks++;
console.log(`Card accumulate: all ${checks} checks passed`);
