/** A confirmation's unread answer goes to the reply ranker with the confirmation question, never straight to the host:
 * it is offered NO and the escapes, never YES (only the exact YES confirms). A decline is the NO; an answer that declines
 * nothing is asked again, and after two the give-up worker takes over; abort ends every flow; a new request goes to
 * intent detection. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,defineForm,definePerformer,formFlow,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const quiet={info(){},debug(){},warn(){},error(){}};
let checks=0;const test=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};
function fixture({option='answers',key='no',soft=false}={}){
 const form=(soft?defineForm:(spec)=>formFlow({...spec,confirm_soft:false}))({id:'pay',name:'Pay',primary:true,description:'Make a payment',contract:{summary:'Make a payment'},
  inputs:[{name:'amount',label:'amount',profile:{kind:'text'},question:'How much?'}],
  confirm:{question:'Charge it now? Say YES or NO.'},
  after:[{id:'effect',type:'SET',variable:'noop',value:'(cargo.paid=true,true)'}]});
 const other={id:'other',name:'Other',primary:true,description:'A different service',steps:[{id:'other-ran',type:'SET',variable:'noop',value:'(cargo.other=true,true)'}]};
 const giveUp={id:'give-up',name:'GiveUp',description:'A person takes over',parameters:[{name:'context',type:'string'},{name:'context_es',type:'string'}],steps:[{id:'gave-up',type:'SET',variable:'noop',value:'(cargo.gaveUp=true,true)'}]};
 const calls=[],contexts=[],cfg={option,key};
 const ai=async(system,user,schema,r)=>{calls.push(r.task);contexts.push(String(system)+String(user));
  if(r.task==='rank_reply'){cfg.offered=r.options;const pick='choice:'+cfg.key;return JSON.stringify({option:cfg.option==='answers'&&r.options.includes(pick)?pick:cfg.option});}
  if(r.task==='detect_flow')return JSON.stringify({flowName:'Other'});
  return JSON.stringify({parameters:cfg.key===null?{}:{key:cfg.key}});};
 const engine=new WorkflowEngine(quiet,ai,linkFormSchemas([...FLOWS,form,other,giveUp]),[],STANDARD_FUNCTIONS,{},false,'en');engine.disableCommands();engine.intentDetection='two-stage';
 let session=engine.initSession('synthetic',crypto.randomUUID(),'en');session.cargo.voice=false;
 return {calls,contexts,cfg,get session(){return session;},async say(content,start){session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'pay',arguments:{}}}:{})},session)));return session.response||'';}};
}
async function atConfirm(t){await t.say('start',true);const r=await t.say('fifty');assert.match(r,/Charge it now/);t.calls.length=0;t.contexts.length=0;}
await test('an unread decline is the NO, ranked with the confirmation question',async()=>{
 const t=fixture();await atConfirm(t);await t.say('that card was lost and I have another one');
 assert.equal(t.session.cargo.paid,undefined);assert.deepEqual(Object.values(t.session.cargo.formConfirm),['no']);assert.equal(t.session.lastTurnDispatch,undefined);
 assert.deepEqual(t.calls,['rank_reply']);assert.ok(t.contexts[0].includes('Charge it now'),'the ranker sees the confirmation question');
 assert.deepEqual(t.cfg.offered,['choice:no','choice:__agent','answers','abort','new_request','irrelevant'],'never YES');
});
await test('the ranker never confirms: a key other than no is asked again',async()=>{
 const t=fixture({key:'yes'});await atConfirm(t);const r=await t.say('sure thing go right ahead with it');
 assert.equal(t.session.cargo.paid,undefined);assert.match(r,/Charge it now/);assert.equal(t.session.lastTurnDispatch,undefined);
 assert.equal(await t.say('yes').then(()=>t.session.cargo.paid),true,'the exact YES still confirms');
});
await test('two unread answers that decline nothing go to the give-up worker, never a silent DISPATCH',async()=>{
 const t=fixture({key:null});await atConfirm(t);await t.say('I am not sure what you mean by that');await t.say('I mean what I said before');
 assert.equal(t.session.cargo.paid,undefined);assert.equal(t.session.cargo.gaveUp,true);assert.equal(t.session.lastTurnDispatch,undefined);
});
await test('abort ends every flow',async()=>{
 const t=fixture({option:'abort'});await atConfirm(t);const r=await t.say('forget it I do not want this');
 assert.match(r,/cancelled at your request/);assert.equal(t.session.flowStacks.flat().length,0);assert.equal(t.session.cargo.paid,undefined);
});
await test('a new request goes to intent detection',async()=>{
 const t=fixture({option:'new_request'});await atConfirm(t);await t.say('actually I need something else entirely');
 assert.equal(t.session.cargo.other,true);assert.equal(t.session.cargo.paid,undefined);
});
await test('a one-word unread answer is ranked too',async()=>{
 const t=fixture();await atConfirm(t);await t.say('hmm');assert.deepEqual(t.calls,['rank_reply']);assert.deepEqual(Object.values(t.session.cargo.formConfirm),['no']);
});
// A soft confirmation (a performer none of whose actions is exact; owner 2026-11-08, prod 11:07 "Sí, para enviar." at a
// ticket's confirmation was asked again): its YES is read as a soft confirmation's and is offered to the ranker.
await test('soft: the ranker is offered YES, and a YES pick confirms',async()=>{
 const t=fixture({key:'yes',soft:true});await atConfirm(t);await t.say('sure thing go right ahead with it');
 assert.deepEqual(t.cfg.offered,['choice:yes','choice:no','choice:__agent','answers','abort','new_request','irrelevant']);assert.equal(t.session.cargo.paid,true);
});
await test('soft: a decline is still the NO',async()=>{
 const t=fixture({soft:true});await atConfirm(t);await t.say('that card was lost and I have another one');
 assert.equal(t.session.cargo.paid,undefined);assert.deepEqual(Object.values(t.session.cargo.formConfirm),['no']);
});
await test('soft: a plain YES word confirms without the ranker',async()=>{
 const t=fixture({soft:true});await atConfirm(t);await t.say('okay');assert.equal(t.session.cargo.paid,true);assert.deepEqual(t.calls,[]);
});
// Firmness comes from what the confirmation authorizes: only a payment (effect 'charge') makes it firm (owner 2026-11-09).
const confirmationOf=(actions)=>{const f=definePerformer({id:'act',name:'Act',description:'An action',inputs:[],contract:{summary:'Act'},performs:actions,prepare:'prepare-act',present:'present-act'});
 const find=(o)=>o && typeof o==='object' ? (o.type==='FLOW' && o.value==='confirm-form' ? o : Object.values(o).map(find).find(Boolean)) : null;return find(f)?.parameters?.confirmation ?? null;};
await test('a performer with a payment confirms firmly',async()=>{assert.equal(confirmationOf([{action:'charge',effect:'charge',flow:'charge-effect',confirm:{exact:true,question:'Charge it? YES or NO.'},outcomes:{paid:'resolved'}}]),'firm');});
await test('a performer with no exact action confirms softly',async()=>{assert.equal(confirmationOf([{action:'file',effect:'create',flow:'file-effect',confirm:{question:'Submit it? YES or NO.'},outcomes:{filed:'resolved'}}]),'soft');});
await test('an exact cancellation confirms softly',async()=>{assert.equal(confirmationOf([{action:'cancel',effect:'cancel',flow:'cancel-effect',confirm:{exact:true,question:'Cancel it? YES or NO.'},outcomes:{cancelled:'resolved'}}]),'soft');});
await test('a plain form confirms softly',async()=>{assert.ok(JSON.stringify(defineForm({id:'f',name:'F',description:'F',contract:{summary:'F'},inputs:[{name:'a',profile:{kind:'text'},question:'A?'}],confirm:{question:'OK?'}})).includes('"confirmation":"soft"'));});
console.log(`Ranked form confirmation: all checks passed (${checks})`);
