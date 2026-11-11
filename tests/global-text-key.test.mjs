/** Keypad 9 switches a call to text at any question (owner 2026-10-31; global since 1.42.0): a call, the whole answer "9", a
 * caller number that can take texts and a set with switch-to-text. A question that declares a choice for 9, an amount question,
 * a text conversation and a caller we cannot text keep the answer. No network calls. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,defineForm,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
let checks=0;const test=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};
const toText={id:'switch-to-text',name:'SwitchToText',primary:true,description:'Continue by text',steps:[{id:'tt',type:'SAY',value:'Texting you now.',value_es:'Le escribo ahora.'}]};
const form=defineForm({id:'pay',name:'Pay',primary:true,description:'Make a payment',contract:{summary:'Make a payment'},inputs:[{name:'zip',label:'ZIP code',profile:{kind:'digits',min:5,max:5},question:'What is the ZIP code?'}]});
const menu=(choices,extra={})=>({id:'menu',name:'Menu',primary:true,description:'A menu',steps:[
 {id:'m_ask',type:'FLOW',value:'ask-choice',callType:'call',parameters:{question:'Pick one.',question_es:'Elija.',choices,...extra}},
 {id:'m_said',type:'SAY',value:'picked {{cargo.choice}}',value_es:'elegido {{cargo.choice}}'}]});
function fixture({flows=[form],start='pay',voice=true,callerId='+18184515475',withText=true}={}){
 const ai=async(system,user,schema,r)=>{if(r && r.task==='rank_reply')return JSON.stringify({option:'answers'});if(/voice input cleaner/.test(system))return String(user);return '{"flowName":"None"}';};
 const engine=new WorkflowEngine({info(){},debug(){},warn(){},error(){}},ai,linkFormSchemas([...FLOWS,...flows,...(withText?[toText]:[])]),[],STANDARD_FUNCTIONS,{},false,'en');engine.disableCommands();
 let session=engine.initSession('synthetic',crypto.randomUUID(),'en');Object.assign(session.cargo,{voice,callerId,twilioNumber:'+12135101971'});
 return {get session(){return session;},async say(content,go){session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(go?{start:{flow:start,arguments:{}}}:{})},session)));return String(session.response||'');}};
}
const active=s=>(s.flowStacks||[]).flat().length;
await test('"9" at a form question ends the flows and starts switch-to-text',async()=>{
 const t=fixture();assert.match(await t.say('go',true),/ZIP code\?/);assert.match(await t.say('9'),/Texting you now\./);assert.equal(active(t.session),0);
});
await test('"9." on a call at a confirmation-style choice question too',async()=>{
 const t=fixture({flows:[menu([{key:'1',phrases:['one']},{key:'2',phrases:['two']}],{accept_other:true})],start:'menu'});await t.say('go',true);
 assert.match(await t.say('9.'),/Texting you now\./);
});
await test('a question that declares a choice for 9 keeps it',async()=>{
 const t=fixture({flows:[menu([{key:'1',phrases:['one']},{key:'9',phrases:['nine']}])],start:'menu'});await t.say('go',true);
 assert.match(await t.say('9'),/^picked /);
});
await test('an amount question keeps it',async()=>{
 const t=fixture({flows:[menu([{key:'full',phrases:['full']}],{amount:true,accept_other:true})],start:'menu'});await t.say('go',true);
 assert.doesNotMatch(await t.say('9'),/Texting you now/);
});
await test('text, an uncallable caller, or no switch-to-text: not a switch',async()=>{
 for(const opts of [{voice:false},{callerId:'+525512345678'},{withText:false}]){
  const t=fixture(opts);await t.say('go',true);assert.doesNotMatch(await t.say('9'),/Texting you now/,JSON.stringify(opts));assert.ok(active(t.session)>0);
 }
});
console.log(`Keypad 9: all ${checks} checks passed`);
