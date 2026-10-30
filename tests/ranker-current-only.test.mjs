// The reply ranker is offered what the word reader would accept, and no more: a choice of ANOTHER question that its
// author declared `current_only` (valid only while its own question is asked) is never offered there. Other questions'
// choices that are not current_only stay offered, exact ones included ("NEW CARD" at the charge confirmation). Prod
// 2026-10-30 (WhatsApp): at "Which sub account should the payment go to?", "NO" was ranked as the route question's `done`
// and ended the payment, and "Sub account 80" as its `switch`, which forgot the verified account.
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,defineForm,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const quiet={info(){},debug(){},warn(){},error(){}};
let checks=0;const test=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};
const ROUTE=[{key:'switch',phrases:['another account'],exact:true,current_only:true},{key:'pay',phrases:['pay'],exact:true,current_only:true},{key:'link',phrases:['link'],exact:true},{key:'done',phrases:['no'],exact:true,current_only:true},{key:'balance',phrases:['balance'],exact:true,current_only:true}];
const PLAN=[{key:'balance',phrases:['full balance'],exact:true},{key:'custom',phrases:['different amount'],exact:true}];
const SUBS=[{key:'50',phrases:['50','sub account 50']},{key:'51',phrases:['51','sub account 51']}];
function fixture(pick){
 const form=defineForm({id:'pay',name:'Pay',primary:true,description:'Make a payment',contract:{summary:'Make a payment'},
  inputs:[{name:'route',label:'payment route',profile:{kind:'choice',choices:ROUTE},question:'Type PAY or LINK.'},
   {name:'option',label:'payment option',profile:{kind:'choice',choices:PLAN},question:'Which amount?'},
   {name:'sub',label:'sub account',profile:{kind:'choice',choices:SUBS},question:'Which sub account should the payment go to?'}],
  after:[{id:'effect',type:'SET',variable:'noop',value:'(cargo.done=cargo.forms[form_instance].values,true)'}]});
 const agent={id:'live-agent-requested',name:'LiveAgentRequested',description:'A person',steps:[{id:'agent-ran',type:'SET',variable:'noop',value:'(cargo.agent=true,true)'}]};
 const seen={};
 const ai=async(system,user,schema,r)=>{if(r.task==='rank_reply'){seen.offered=r.options;return JSON.stringify({option:pick});}return JSON.stringify({flowName:'None',parameters:{}});};
 const engine=new WorkflowEngine(quiet,ai,linkFormSchemas([...FLOWS,form,agent]),[],STANDARD_FUNCTIONS,{},false,'en');engine.disableCommands();engine.intentDetection='two-stage';
 let session=engine.initSession('synthetic',crypto.randomUUID(),'en');session.cargo.voice=false;
 return {seen,get session(){return session;},async say(content,start){session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'pay',arguments:{}}}:{})},session)));return session.response||'';}};
}
const choicesOf=(offered)=>offered.filter(o=>o.startsWith('choice:')&&!o.startsWith('choice:__')).sort();
await test('another question\'s current_only choices are not offered; its other choices are, exact ones included',async()=>{
 const t=fixture('choice:51');await t.say('start',true);await t.say('pay');
 assert.match(await t.say('different amount'),/Which sub account/);
 await t.say('the one with sixty six I guess');
 assert.deepEqual(choicesOf(t.seen.offered),['choice:50','choice:51','choice:balance','choice:custom','choice:link'].sort(),'no switch, pay, done or route balance; the plan\'s choices and the route\'s link stay');
 assert.equal(t.session.cargo.done.sub,'51');
});
await test('at its own question a current_only choice is offered',async()=>{
 const t=fixture('choice:done');await t.say('start',true);await t.say('hmm I am not sure about any of this');
 assert.ok(['choice:switch','choice:pay','choice:done','choice:balance'].every(o=>t.seen.offered.includes(o)));
});
console.log(`Ranker current_only: all checks passed (${checks})`);
