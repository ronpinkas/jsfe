/** provides.menu.whole_phrases: a fact's phrase answers only as the whole reply. A phrase inside a sentence goes to the reply
 * ranker, offered what the menu's reader accepts; a pick is taken with the facts it also clears; no pick is the host's, without
 * intent detection; a new request goes to intent detection. The stub scores through the real decoder and only what was offered. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
import {decodeReplyRankSystemOne} from '../dist/host/reply-rank.js';
const quiet={info(){},debug(){},warn(){},error(){}};
let checks=0;const test=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};
const S=(id,value)=>({id,type:'SET',variable:'noop',value});
const W=(id,steps)=>({id,name:id,description:'Fixture '+id,version:'1',scope:'isolated',steps});
const pay=W('pay-flow',[S('paid','(cargo.paid=true,true)'),{id:'pay_said',type:'SAY',value:'PAYING',value_es:'PAGANDO'}]);
const load=W('load-fact',[S('loaded','(cargo.info={balance:17,duedate:"the 6th",limit:900},true)')]);
const agent=W('live-agent-requested',[S('agent_ran','(cargo.agent=true,true)')]);
const other={id:'other',name:'Other',primary:true,description:'A different service',version:'1',steps:[S('other_ran','(cargo.other=true,true)'),{id:'other_said',type:'SAY',value:'OTHER',value_es:'OTRO'}]};
const catalog=(whole=true)=>({subject:'account',source:{flow:'load-fact',result:'cargo.info',refresh:'per_turn'},
 facts:[{key:'balance',description:'the balance owed',phrases:['balance','my balance'],path:'balance',say:'BALANCE {value}',say_es:'SALDO {value}',public:true},
  {key:'duedate',description:'when the next payment is due',phrases:['due date'],path:'duedate',say:'DUE {value}',say_es:'VENCE {value}',public:true},
  {key:'limit',phrases:['credit limit'],path:'limit',say:'LIMIT {value}',say_es:'LIMITE {value}',public:true},
  {key:'summary',description:'never offered: no phrases',path:'balance',say:'SUMMARY',say_es:'RESUMEN',public:true}],
 menu:{...(whole?{whole_phrases:true}:{}),question:'What next? Say PAY.',question_es:'¿Qué sigue? Diga PAGAR.',
  choices:[{key:'pay',exact:true,label:'make a payment now',phrases:['1','pay'],flow:'pay-flow'}],done:{phrases:['done'],say:'BYE',say_es:'ADIOS'}}});
async function run(reply,scores,{whole=true,detect='None',language='en'}={}){
 const calls=[];let offered=null,labels=null;
 const ai=async(system,user,schema,r)=>{calls.push(r.task);
  if(r.task==='rank_reply'){offered=r.options;labels=Object.fromEntries((r.choices||[]).map(c=>[c.key,c.label]));
   const answers=Object.fromEntries(r.systemOne.index.map(q=>[q.id,{noul:scores[q.option]??0.01}]));const d=decodeReplyRankSystemOne(answers,r);
   return JSON.stringify({option:d.option,...(d.also?{also:d.also}:{}),...(d.fallback?{fallback:true}:{})});}
  if(r.task==='detect_flow')return JSON.stringify({flowName:detect,parameters:{}});
  return JSON.stringify({flowName:detect,parameters:{}});};
 const engine=new WorkflowEngine(quiet,ai,linkFormSchemas([...FLOWS,pay,load,agent,other]),[],STANDARD_FUNCTIONS,{},false,language);engine.disableCommands();
 let session=engine.initSession('menu',crypto.randomUUID(),language);session.cargo.info={balance:17,duedate:'the 6th',limit:900};session.cargo.verb='type';session.cargo.verb_es='escriba';
 session=await engine.updateActivity({role:'user',content:'begin',start:{flow:'provider-menu',arguments:{provides:catalog(whole)}}},session);
 session=structuredClone(await engine.updateActivity({role:'user',content:reply},structuredClone(session)));
 return {calls,offered,labels,session,response:session.response||''};
}
await test('a phrase that is the whole reply answers without the ranker',async()=>{
 for(const said of ['balance','my balance','Balance.','balance please']){const t=await run(said,{});assert.deepEqual(t.calls,[],said);assert.match(t.response,/BALANCE/,said);}
});
await test('a phrase inside a sentence goes to the ranker, offered every choice the reader accepts, never a phrase-less fact',async()=>{
 const t=await run('why did my balance go up',{'choice:fact:balance':0.9});
 assert.deepEqual(t.calls,['rank_reply']);
 assert.deepEqual(t.offered.filter(o=>o.startsWith('choice:')),['choice:fact:balance','choice:fact:duedate','choice:fact:limit','choice:act:pay','choice:done','choice:__agent']);
 assert.equal(t.labels['fact:balance'],'the balance owed','a fact reads as its description');
 assert.equal(t.labels['act:pay'],'make a payment now','an action reads as its label');
 assert.match(t.labels['fact:limit'],/credit limit/,'no description: its key and phrases');
 assert.match(t.response,/BALANCE/);
});
await test('every fact the reply clears at the also cut is answered, in one reply, and the menu comes back',async()=>{
 const t=await run('what is my balance and when is the due date',{'choice:fact:balance':0.8,'choice:fact:duedate':0.75,'choice:fact:limit':0.55});
 assert.match(t.response,/BALANCE/);assert.match(t.response,/DUE/);assert.doesNotMatch(t.response,/LIMIT/,'below the also cut');assert.match(t.response,/What next/);
});
await test('an action the sentence asks for runs; a fact it also clears is not said',async()=>{
 const t=await run('I want to pay my balance',{'choice:act:pay':0.95,'choice:fact:balance':0.9});
 assert.equal(t.session.cargo.paid,true);assert.doesNotMatch(t.response,/BALANCE/);
});
await test('a person is taken',async()=>{
 const t=await run('talk to someone about my balance',{'choice:__agent':0.9});assert.equal(t.session.cargo.agent,true);
});
await test('no pick is the host\'s: no intent detection, no fact, every flow ended',async()=>{
 for(const scores of [{},{irrelevant:0.9}]){const t=await run('my balance is wrong I think',scores,{detect:'Other'});
  assert.deepEqual(t.calls,['rank_reply'],'no detection');assert.equal(t.session.cargo.other,undefined);assert.doesNotMatch(t.response,/BALANCE/);assert.equal(t.session.flowStacks.flat().length,0,'the flows ended');}
});
await test('a new request goes to intent detection',async()=>{
 const t=await run('raise my credit limit',{new_request:0.9},{detect:'Other'});
 assert.ok(t.calls.includes('detect_flow')||t.calls.length>1,JSON.stringify(t.calls));assert.equal(t.session.cargo.other,true);assert.match(t.response,/OTHER/);
});
await test('a reply with no phrase is a plain DISPATCH to intent detection, without the ranker',async()=>{
 const t=await run('cancel everything',{},{detect:'Other'});assert.ok(!t.calls.includes('rank_reply'));assert.equal(t.session.cargo.other,true);
});
await test('without the attribute a phrase inside a sentence still answers: the default is unchanged',async()=>{
 const t=await run('why did my balance go up',{},{whole:false});assert.deepEqual(t.calls,[]);assert.match(t.response,/BALANCE/);
});
await test('Spanish asks the Spanish question',async()=>{
 const t=await run('por qué my balance subió',{'choice:fact:balance':0.9},{language:'es'});assert.match(t.response,/SALDO/);
});
await test('decoder: an escape and a fixed option are never in also, a non-choice pick has none',async()=>{
 const req={systemOne:{index:[{id:'a',option:'choice:x'},{id:'b',option:'choice:y'},{id:'c',option:'choice:__agent'},{id:'d',option:'new_request'}]}};
 const noul=(a,b,c,d)=>({a:{noul:a},b:{noul:b},c:{noul:c},d:{noul:d}});
 assert.deepEqual(decodeReplyRankSystemOne(noul(.9,.7,.8,.9),req).also,['y']);
 assert.equal(decodeReplyRankSystemOne(noul(.9,.59,.1,.1),req).also,undefined);
 assert.equal(decodeReplyRankSystemOne(noul(.1,.1,.9,.1),req).option,'choice:__agent');
 assert.equal(decodeReplyRankSystemOne(noul(.1,.1,.1,.9),req).also,undefined);
});
console.log(`provider-menu-ranked: ${checks} tests`);
