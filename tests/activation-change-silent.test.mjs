// A value changed by a flow's activation is not acknowledged: the caller's words this turn did not name it, and the flow's
// next question or confirmation states what matters. Prod 2026-10-30 (WhatsApp): a payment restarted by "YES" answered
// "Okay, I noted your payment route." although the caller never said one. A change the caller says in the form still is.
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,defineForm,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const quiet={info(){},debug(){},warn(){},error(){}};
let checks=0;const test=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};
const stopper={id:'stop-pay',name:'StopPay',description:'Stop on done',parameters:[{name:'form',type:'string'},{name:'input',type:'string'},{name:'value',type:'string'}],steps:[{id:'stop',type:'SET',variable:'noop',value:"(cargo.stopPay = value === 'done', true)"}]};
const form=defineForm({id:'pay',name:'Pay',primary:true,description:'Make a payment',contract:{summary:'Make a payment'},stop:'cargo.stopPay',
 parameters:[{name:'route',type:'string',enum:['pay','link'],description:'pay or link'}],
 inputs:[{name:'route',label:'payment route',label_es:'forma de pago',profile:{kind:'choice',choices:[{key:'pay',phrases:['pay']},{key:'link',phrases:['link']},{key:'done',phrases:['no'],exact:true}]},after:'stop-pay',question:'Type PAY or LINK.',question_es:'Escriba PAGAR o ENLACE.'},
  {name:'amount',label:'amount',profile:{kind:'amount',min:0.01},question:'How much?',question_es:'¿Cuánto?'}],
 after:[{id:'effect',type:'SET',variable:'noop',value:'(cargo.paid=true,true)'}]});
const ai=async(system,user,schema,r)=>JSON.stringify(r&&r.task==='rank_reply'?{option:'answers'}:{flowName:'None',parameters:{}});
const engine=new WorkflowEngine(quiet,ai,linkFormSchemas([...FLOWS,form,stopper]),[],STANDARD_FUNCTIONS,{},false,'en');engine.disableCommands();
let session=engine.initSession('synthetic',crypto.randomUUID(),'en');session.cargo.voice=false;
const say=async(content,start)=>{session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'pay',arguments:start}}:{})},session)));return String(session.response||'');};
await test('a change the caller says in the form is acknowledged',async()=>{
 await say('start',{});await say('link');const r=await say('pay');
 assert.match(r,/^Okay, I noted your payment route\./,r);
});
await test('a change made by the activation is not',async()=>{
 session=engine.initSession('synthetic',crypto.randomUUID(),'en');session.cargo.voice=false;
 await say('start',{});await say('no');
 assert.equal(session.flowStacks.flat().length,0,'the payment ended');session.cargo.stopPay=false;
 const r=await say('yes',{route:'pay'});
 assert.doesNotMatch(r,/noted your payment route/,r);
 assert.equal(session.cargo.forms[Object.keys(session.cargo.forms).find(k=>k.startsWith('pay'))]?.values?.route,'pay');
});
console.log(`activation change silent: ${checks} checks passed`);
