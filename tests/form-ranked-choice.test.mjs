/** A form answer its reader cannot read goes to the reply ranker, never straight to the host: the ranker is offered the
 * question's choices and the escapes (a person; text on a call with a textable number); a picked choice is taken, a
 * reply that picks none is asked again; abort ends every flow; a new request goes to intent detection. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,defineForm,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const quiet={info(){},debug(){},warn(){},error(){}};
let checks=0;const test=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};
function fixture({option='answers',key='1',fallback=false,choices=null,confirmation}={}){
 const form=defineForm({id:'pay',name:'Pay',primary:true,description:'Make a payment',contract:{summary:'Make a payment'},
  inputs:[{name:'sub',label:'sub account',profile:{kind:'choice',choices:choices||[{key:'1',phrases:['1','first account'],label:'First account'},{key:'2',phrases:['2','second account'],label:'Second account'}]},...(confirmation?{confirmation}:{}),question:'Which account? Press 1 for the first account, 2 for the second account.'}],
  after:[{id:'effect',type:'SET',variable:'noop',value:'(cargo.paid=cargo.forms[form_instance].values.sub,true)'}]});
 const other={id:'other',name:'Other',primary:true,description:'A different service',steps:[{id:'other-ran',type:'SET',variable:'noop',value:'(cargo.other=true,true)'}]};
 const agent={id:'live-agent-requested',name:'LiveAgentRequested',description:'A person',steps:[{id:'agent-ran',type:'SET',variable:'noop',value:'(cargo.agent=true,true)'}]};
 const calls=[],cfg={option,key,fallback};
 const ai=async(system,user,schema,r)=>{calls.push(r.task);
  if(r.task==='rank_reply'){cfg.offered=r.options;cfg.labels=Object.fromEntries((r.choices||[]).map(c=>[c.key,c.label]));const picked=cfg.option==='answers'&&cfg.key!==null?'choice:'+cfg.key:cfg.option;return JSON.stringify({option:picked,...(cfg.fallback?{fallback:true}:{})});}
  if(r.task==='detect_flow')return JSON.stringify({flowName:'Other'});
  return JSON.stringify({parameters:cfg.key===null?{}:{key:cfg.key}});};
 const engine=new WorkflowEngine(quiet,ai,linkFormSchemas([...FLOWS,form,other,agent]),[],STANDARD_FUNCTIONS,{},false,'en');engine.disableCommands();engine.intentDetection='two-stage';
 let session=engine.initSession('synthetic',crypto.randomUUID(),'en');session.cargo.voice=false;
 return {calls,cfg,get session(){return session;},async say(content,start){session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'pay',arguments:{}}}:{})},session)));return session.response||'';}};
}
await test('a ranked answer takes the offered key it picks, in one call',async()=>{
 const t=fixture();assert.match(await t.say('start',true),/Which account/);await t.say('I went with the top one');
 assert.equal(t.session.cargo.paid,'1');assert.deepEqual(t.calls,['rank_reply']);
 assert.deepEqual(t.cfg.offered,['choice:1','choice:2','choice:__agent','answers','abort','new_request'],'no text escape without a call');
});
await test('a one-word answer is ranked too',async()=>{
 const t=fixture();await t.say('start',true);await t.say('top');assert.equal(t.session.cargo.paid,'1');assert.deepEqual(t.calls,['rank_reply']);
});
await test('a request for a person is taken at any question',async()=>{
 const t=fixture({key:'__agent'});await t.say('start',true);await t.say('can I talk to somebody');
 assert.equal(t.session.cargo.agent,true);assert.equal(t.session.cargo.paid,undefined);
});
await test('an exact choice is offered and taken; its label is its key and its worded phrases (prod 10-28: exact choices were dropped)',async()=>{
 const menu=[{key:'pay',phrases:['1','pay','pagar','pay here'],exact:true},{key:'card-77',phrases:['4242','ending in 4242'],label:'Visa ending in 4242',exact:true},{key:'link',phrases:['2','link','enlace'],exact:true}];
 let t=fixture({choices:menu,key:'pay'});await t.say('start',true);
 assert.match(await t.say('I would like to pay in advance before I travel'),/./);
 assert.deepEqual(t.cfg.offered.filter(o=>o.startsWith('choice:')),['choice:pay','choice:card-77','choice:link','choice:__agent']);
 assert.equal(t.session.cargo.paid,'pay');
 assert.deepEqual([t.cfg.labels.pay,t.cfg.labels['card-77'],t.cfg.labels.link],['pay (pagar, pay here)','Visa ending in 4242','link (enlace)']);
 t=fixture({choices:menu,key:'card-77'});await t.say('start',true);await t.say('use the visa I have on file');
 assert.equal(t.session.cargo.paid,'card-77','a choice whose key is not one of its phrases is taken');
});
await test('the YES of a firm confirmation is never offered; a NO is',async()=>{
 const yn=[{key:'yes',phrases:['yes'],exact:true},{key:'no',phrases:['no'],exact:true}];
 let t=fixture({choices:yn,confirmation:'firm',key:'no'});await t.say('start',true);await t.say('nah not really');
 assert.deepEqual(t.cfg.offered.filter(o=>o.startsWith('choice:')),['choice:no','choice:__agent']);assert.equal(t.session.cargo.paid,'no');
 t=fixture({choices:[{key:'yes',phrases:['yes']},{key:'no',phrases:['no']}],confirmation:'soft',key:'yes'});await t.say('start',true);await t.say('I suppose that works for me');
 assert.deepEqual(t.cfg.offered.filter(o=>o.startsWith('choice:')),['choice:yes','choice:no','choice:__agent']);assert.equal(t.session.cargo.paid,'yes');
 t=fixture({choices:[{key:'yes',phrases:['yes']},{key:'no',phrases:['no']}],confirmation:'firm',key:'no'});await t.say('start',true);await t.say('I suppose that works for me');
 assert.deepEqual(t.cfg.offered.filter(o=>o.startsWith('choice:')),['choice:no','choice:__agent']);
});
await test('a ranked answer that picks nothing asks again, never the host',async()=>{
 const t=fixture({key:null});await t.say('start',true);const r=await t.say('I went with the top one');
 assert.match(r,/^Sorry, I didn't catch that\. Which account/);assert.equal(t.session.cargo.paid,undefined);assert.equal(t.session.lastTurnDispatch,undefined);
 t.cfg.key='2';await t.say('the bottom one I think');assert.equal(t.session.cargo.paid,'2','the next answer is taken');
});
await test('a key not offered is never taken',async()=>{
 const t=fixture({key:'7'});await t.say('start',true);await assert.rejects(t.say('I went with number seven'),/not an offered option/);assert.equal(t.session.cargo.paid,undefined);
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
