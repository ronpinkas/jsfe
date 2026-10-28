/** A confirmation's unread answer goes to the reply ranker with the confirmation question, never straight to the host:
 * a decline is the NO; an answer that declines nothing is asked again; abort ends every flow; a new request goes to
 * intent detection. The ranker can never confirm: only the exact YES does. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,defineForm,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const quiet={info(){},debug(){},warn(){},error(){}};
let checks=0;const test=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};
function fixture({option='answers',key='no'}={}){
 const form=defineForm({id:'pay',name:'Pay',primary:true,description:'Make a payment',contract:{summary:'Make a payment'},
  inputs:[{name:'amount',label:'amount',profile:{kind:'text'},question:'How much?'}],
  confirm:{question:'Charge it now? Say YES or NO.'},
  after:[{id:'effect',type:'SET',variable:'noop',value:'(cargo.paid=true,true)'}]});
 const other={id:'other',name:'Other',primary:true,description:'A different service',steps:[{id:'other-ran',type:'SET',variable:'noop',value:'(cargo.other=true,true)'}]};
 const calls=[],contexts=[],cfg={option,key};
 const ai=async(system,user,schema,r)=>{calls.push(r.task);contexts.push(String(system)+String(user));
  if(r.task==='rank_reply')return JSON.stringify({option:cfg.option});
  if(r.task==='detect_flow')return JSON.stringify({flowName:'Other'});
  return JSON.stringify({parameters:cfg.key===null?{}:{key:cfg.key}});};
 const engine=new WorkflowEngine(quiet,ai,linkFormSchemas([...FLOWS,form,other]),[],STANDARD_FUNCTIONS,{},false,'en');engine.disableCommands();engine.intentDetection='two-stage';
 let session=engine.initSession('synthetic',crypto.randomUUID(),'en');session.cargo.voice=false;
 return {calls,contexts,cfg,get session(){return session;},async say(content,start){session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'pay',arguments:{}}}:{})},session)));return session.response||'';}};
}
async function atConfirm(t){await t.say('start',true);const r=await t.say('fifty');assert.match(r,/Charge it now/);t.calls.length=0;t.contexts.length=0;}
await test('an unread decline is the NO, ranked with the confirmation question',async()=>{
 const t=fixture();await atConfirm(t);await t.say('that card was lost and I have another one');
 assert.equal(t.session.cargo.paid,undefined);assert.deepEqual(Object.values(t.session.cargo.formConfirm),['no']);assert.equal(t.session.lastTurnDispatch,undefined);
 assert.equal(t.calls[0],'rank_reply');assert.ok(t.contexts[0].includes('Charge it now'),'the ranker sees the confirmation question');
});
await test('the ranker never confirms: a key other than no is asked again',async()=>{
 const t=fixture({key:'yes'});await atConfirm(t);const r=await t.say('sure thing go right ahead with it');
 assert.equal(t.session.cargo.paid,undefined);assert.match(r,/Charge it now/);assert.equal(t.session.lastTurnDispatch,undefined);
 assert.equal(await t.say('yes').then(()=>t.session.cargo.paid),true,'the exact YES still confirms');
});
await test('two unread answers that decline nothing hand off, as before',async()=>{
 const t=fixture({key:null});await atConfirm(t);await t.say('I am not sure what you mean by that');await t.say('I mean what I said before');
 assert.equal(t.session.cargo.paid,undefined);assert.ok(t.session.lastTurnDispatch,'the second miss hands off');
});
await test('abort ends every flow',async()=>{
 const t=fixture({option:'abort'});await atConfirm(t);const r=await t.say('forget it I do not want this');
 assert.match(r,/cancelled at your request/);assert.equal(t.session.flowStacks.flat().length,0);assert.equal(t.session.cargo.paid,undefined);
});
await test('a new request goes to intent detection',async()=>{
 const t=fixture({option:'new_request'});await atConfirm(t);await t.say('actually I need something else entirely');
 assert.equal(t.session.cargo.other,true);assert.equal(t.session.cargo.paid,undefined);
});
await test('a short unread answer needs no model call',async()=>{
 const t=fixture();await atConfirm(t);await t.say('hmm');assert.deepEqual(t.calls,[]);assert.equal(t.session.cargo.paid,undefined);
});
console.log(`Ranked form confirmation: all checks passed (${checks})`);
