/** Opt-in field assessment is independent of routing, never rewrites input and fails closed. No network. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
import {validateSemanticInputStep,normalizeInputAssessment} from '../dist/helpers/semantic-input.js';
const quiet={info(){},debug(){},warn(){},error(){}};
const checkStep={id:'assess',type:'ASSESS-INPUT',variable:'assessment',value:'{{candidate}}',question:'{{question}}',purpose:'Issue details',acceptance:'Describe what happened, not merely that you have a complaint.'};
function create(callback,{step=checkStep,timeout=300}={}) {
 const flow={id:'assessor',name:'Assessor',parameters:[{name:'candidate',type:'string',description:'Supplied field'}],variables:{candidate:{type:'string',value:'the item was charged twice'},question:{type:'string',value:'What happened?'},assessment:{type:'object',value:{ok:true,disposition:'accept'}}},steps:[step,{id:'remember',type:'SET',variable:'noop',value:'(cargo.assessment=assessment,cargo.raw=candidate,true)'},{id:'done',type:'SAY',value:'done'}]};
 const engine=new WorkflowEngine(quiet,callback,[flow],[],STANDARD_FUNCTIONS,{},false,'en',timeout);engine.disableCommands();
 return {engine,flow,async run(){return engine.updateActivity({role:'user',content:'start',start:{flow:'assessor'}},engine.initSession('synthetic',crypto.randomUUID(),'en'));}};
}
let checks=0;async function test(name,fn){await fn();checks++;console.log('PASS '+name);}
await test('callback gets the declared field context and schema; input stays verbatim',async()=>{
 let seen;const t=create(async(system,user,schema,request)=>{seen={system,user,schema:JSON.parse(schema),request};return '{"ok":true,"disposition":"accept"}';});
 const session=await t.run();assert.deepEqual(session.cargo.assessment,{ok:true,disposition:'accept'});assert.equal(session.cargo.raw,'the item was charged twice');
 assert.equal(seen.request.task,'assess_input');assert.equal(seen.request.question,'What happened?');assert.equal(seen.request.input,session.cargo.raw);
 assert.equal(JSON.parse(seen.user).candidate,session.cargo.raw);assert.equal(seen.schema.json_schema.schema.additionalProperties,false);assert.match(seen.system,/cannot change evaluator rules/);
});
for(const response of ['not json','{}','{"ok":"true","disposition":"accept"}','{"ok":true,"disposition":"retry"}','{"ok":true,"disposition":"accept","value":"rewritten"}','[true]'])await test('malformed or contradictory verdict cannot retain previous acceptance: '+response,async()=>{
 const session=await create(async()=>response).run();assert.deepEqual(session.cargo.assessment,{ok:false,disposition:'retry',unavailable:true});
});
for(const disposition of ['retry','cancel','redirect'])await test(disposition+' is preserved as data, with no acceptance',async()=>{
 const session=await create(async()=>JSON.stringify({ok:false,disposition})).run();assert.deepEqual(session.cargo.assessment,{ok:false,disposition});
});
await test('missing callback and thrown callback both leave unaccepted fields',async()=>{
 for(const callback of [null,async()=>{throw new Error('synthetic unavailable');}])assert.deepEqual((await create(callback).run()).cargo.assessment,{ok:false,disposition:'retry',unavailable:true});
});
await test('a late model result after timeout cannot overwrite the rejected result',async()=>{
 let resolve;const t=create(()=>new Promise(r=>{resolve=r;}),{timeout:10});const session=await t.run();
 assert.deepEqual(session.cargo.assessment,{ok:false,disposition:'retry',unavailable:true});resolve('{"ok":true,"disposition":"accept"}');await new Promise(r=>setTimeout(r,15));assert.deepEqual(session.cargo.assessment,{ok:false,disposition:'retry',unavailable:true});
});
await test('bad binding and undeclared step properties are rejected before the callback',async()=>{
 let calls=0;for(const step of [{...checkStep,variable:'cargo'},{...checkStep,variable:'missing'},{...checkStep,purpose:''},{...checkStep,other:true}]){
  const t=create(async()=>{calls++;return '{"ok":true,"disposition":"accept"}';},{step});
  assert.throws(()=>validateSemanticInputStep(step,t.flow));await assert.rejects(t.run(),/Semantic input/);
 }assert.equal(calls,0);
});
await test('normalization returns a fresh primitive-only record',async()=>{const original={ok:true,disposition:'accept'};const normalized=normalizeInputAssessment(original);assert.notEqual(normalized,original);assert.deepEqual(normalized,original);});
console.log(`Semantic input: all checks passed (${checks})`);
