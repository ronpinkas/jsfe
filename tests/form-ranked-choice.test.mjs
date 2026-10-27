/** A form answer its reader cannot read goes to the reply ranker, never straight to the host: a choice takes the
 * offered key the reply picks, else asks again; abort ends every flow; a new request goes to intent detection. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,defineForm,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const quiet={info(){},debug(){},warn(){},error(){}};
let checks=0;const test=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};
function fixture({option='answers',key='1',fallback=false}={}){
 const form=defineForm({id:'pay',name:'Pay',primary:true,description:'Make a payment',contract:{summary:'Make a payment'},
  inputs:[{name:'sub',label:'sub account',profile:{kind:'choice',choices:[{key:'1',phrases:['1','first account'],label:'First account'},{key:'2',phrases:['2','second account'],label:'Second account'}]},question:'Which account? Press 1 for the first account, 2 for the second account.'}],
  after:[{id:'effect',type:'SET',variable:'noop',value:'(cargo.paid=cargo.forms[form_instance].values.sub,true)'}]});
 const other={id:'other',name:'Other',primary:true,description:'A different service',steps:[{id:'other-ran',type:'SET',variable:'noop',value:'(cargo.other=true,true)'}]};
 const calls=[],cfg={option,key,fallback};
 const ai=async(system,user,schema,r)=>{calls.push(r.task);
  if(r.task==='rank_reply')return JSON.stringify({option:cfg.option,...(cfg.fallback?{fallback:true}:{})});
  if(r.task==='detect_flow')return JSON.stringify({flowName:'Other'});
  return JSON.stringify({parameters:cfg.key===null?{}:{key:cfg.key}});};
 const engine=new WorkflowEngine(quiet,ai,linkFormSchemas([...FLOWS,form,other]),[],STANDARD_FUNCTIONS,{},false,'en');engine.disableCommands();engine.intentDetection='two-stage';
 let session=engine.initSession('synthetic',crypto.randomUUID(),'en');session.cargo.voice=false;
 return {calls,cfg,get session(){return session;},async say(content,start){session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'pay',arguments:{}}}:{})},session)));return session.response||'';}};
}
await test('a ranked answer takes the offered key it picks',async()=>{
 const t=fixture();assert.match(await t.say('start',true),/Which account/);await t.say('I went with the top one');
 assert.equal(t.session.cargo.paid,'1');assert.deepEqual(t.calls,['rank_reply','extract_parameters']);
});
await test('a ranked answer that picks nothing asks again, never the host',async()=>{
 const t=fixture({key:null});await t.say('start',true);const r=await t.say('I went with the top one');
 assert.match(r,/^Sorry, I didn't catch that\. Which account/);assert.equal(t.session.cargo.paid,undefined);assert.equal(t.session.lastTurnDispatch,undefined);
 t.cfg.key='2';await t.say('the bottom one I think');assert.equal(t.session.cargo.paid,'2','the next answer is taken');
});
await test('a key not offered is never taken',async()=>{
 const t=fixture({key:'7'});await t.say('start',true);assert.match(await t.say('I went with number seven'),/Sorry, I didn't catch that/);assert.equal(t.session.cargo.paid,undefined);
});
await test('abort ends every flow',async()=>{
 const t=fixture({option:'abort'});await t.say('start',true);const r=await t.say('forget it I do not want this');
 assert.match(r,/cancelled at your request/);assert.equal(t.session.flowStacks.flat().length,0);assert.equal(t.session.lastFlowOutcome.outcome,'user_aborted');
});
await test('a new request goes to intent detection',async()=>{
 const t=fixture({option:'new_request'});await t.say('start',true);await t.say('actually I need something else entirely');
 assert.equal(t.session.cargo.other,true);assert.equal(t.session.cargo.paid,undefined);
});
await test('a readable key needs no model call',async()=>{
 const t=fixture();await t.say('start',true);await t.say('Ya oprimí el uno.');assert.equal(t.session.cargo.paid,'1');assert.deepEqual(t.calls,[]);
});
console.log(`Ranked form choice: all checks passed (${checks})`);
