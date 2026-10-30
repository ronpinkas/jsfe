// A form may declare `on_no`: a whole NO said at one of its questions (or a question of a sub-form it owns) that is not a
// yes/no or confirmation question, and that the question does not read itself, runs that worker. Prod 2026-10-30: NO at
// "Which sub account should the payment go to?" ended the payment; the payment now starts its selection again. A form
// without `on_no` is unchanged.
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,defineForm,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const quiet={info(){},debug(){},warn(){},error(){}};
let checks=0;const test=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};
const again={id:'pay-again',name:'PayAgain',description:'Start the selection again',parameters:[{name:'form',type:'string'}],
 steps:[{id:'again-reset',type:'SET',variable:'noop',value:"(resetFormInputs(cargo,form,['sub']),cargo.again=(cargo.again||0)+1,true)"},{id:'again-say',type:'SAY',value:"I understand, let's start again.",value_es:'Entiendo, empecemos de nuevo.'}]};
function fixture(onNo){
 const card=defineForm({id:'card-form',name:'CardForm',description:'Card',contract:{summary:'Card'},inputs:[{name:'number',label:'card number',profile:{kind:'digits',min:15,max:16},question:'What is the card number?'}]});
 const form=defineForm({id:'pay',name:'Pay',primary:true,description:'Make a payment',contract:{summary:'Make a payment'},...(onNo?{on_no:'pay-again'}:{}),
  inputs:[{name:'sub',label:'sub account',profile:{kind:'choice',choices:[{key:'50',phrases:['50']},{key:'51',phrases:['51']}]},question:'Which sub account?'},
   {name:'save',label:'save card',confirmation:'firm',profile:{kind:'choice',choices:[{key:'yes',phrases:['yes'],exact:true},{key:'no',phrases:['no'],exact:true}]},question:'Save the card?'},
   {name:'card',form:'card-form'}],
  after:[{id:'effect',type:'SET',variable:'noop',value:'(cargo.done=cargo.forms[form_instance].values,true)'}]});
 const calls=[];
 const ai=async(system,user,schema,r)=>{calls.push(r&&r.task);return JSON.stringify(r&&r.task==='rank_reply'?{option:'abort'}:{flowName:'None',parameters:{}});};
 const engine=new WorkflowEngine(quiet,ai,linkFormSchemas([...FLOWS,card,form,again]),[],STANDARD_FUNCTIONS,{},false,'en');engine.disableCommands();
 let session=engine.initSession('synthetic',crypto.randomUUID(),'en');session.cargo.voice=false;
 return {calls,get session(){return session;},async say(content,start){session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'pay',arguments:{}}}:{})},session)));return String(session.response||'');}};
}
await test('NO at a question of a form with on_no runs its worker, and the form asks again',async()=>{
 const t=fixture(true);await t.say('start',true);const r=await t.say('No');
 assert.match(r,/^I understand, let's start again\.\s+Which sub account\?/,r);assert.equal(t.session.cargo.again,1);assert.deepEqual(t.calls,[]);
});
await test('NO at a yes/no question is that question\'s answer',async()=>{
 const t=fixture(true);await t.say('start',true);await t.say('51');await t.say('no');
 assert.equal(t.session.cargo.again,undefined);
 const f=Object.values(t.session.cargo.forms).find(f=>f.definition==='pay');assert.equal(f.values.save,'no');
});
await test('NO at a sub-form\'s question runs its owner\'s worker',async()=>{
 const t=fixture(true);await t.say('start',true);await t.say('51');assert.match(await t.say('yes'),/card number/);
 const r=await t.say('no');assert.equal(t.session.cargo.again,1,r);assert.match(r,/^I understand, let's start again\.\s+Which sub account\?/,r);
});
await test('without on_no a NO is read as before (the reply ranker)',async()=>{
 const t=fixture(false);await t.say('start',true);await t.say('No');assert.equal(t.session.cargo.again,undefined);assert.deepEqual(t.calls,['rank_reply']);
});
await test('a NO inside other words is not intercepted',async()=>{
 const t=fixture(true);await t.say('start',true);await t.say('no not that one, I mean the other account');assert.equal(t.session.cargo.again,undefined);
});
await test('NO offered by one option of an any_of question is that question\'s answer',async()=>{
 const pick=defineForm({id:'pick',name:'Pick',primary:true,description:'Pick',contract:{summary:'Pick'},on_no:'pay-again',
  inputs:[{name:'selection',exclusive:true,label:'amount',question:'An amount, or NO?',any_of:[{name:'amount',label:'amount',profile:{kind:'amount',min:1}},{name:'option',label:'option',profile:{kind:'choice',choices:[{key:'done',phrases:['no'],exact:true}]}}]}],
  after:[{id:'pick-done',type:'SET',variable:'noop',value:'(cargo.picked=cargo.forms[form_instance].values,true)'}]});
 const engine=new WorkflowEngine(quiet,async()=>JSON.stringify({flowName:'None',parameters:{}}),linkFormSchemas([...FLOWS,pick,again]),[],STANDARD_FUNCTIONS,{},false,'en');engine.disableCommands();
 let session=engine.initSession('synthetic',crypto.randomUUID(),'en');session.cargo.voice=false;
 session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content:'start',start:{flow:'pick',arguments:{}}},session)));
 session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content:'no'},session)));
 assert.equal(session.cargo.again,undefined);assert.equal(session.cargo.picked?.option,'done');
});
console.log(`form on_no: ${checks} checks passed`);
