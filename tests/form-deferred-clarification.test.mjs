// Which input a value the request carried belongs to is asked when the form asks that input, never when the form opens
// (owner 2026-11-17). Prod 2026-11-16 18:15: a payment request carrying 1500 and the monthly option heard "nothing is due"
// and, in the same reply, "Is 1500 your amount or your payment option?". A form that stops first never asks; a conflict in a
// reply is the caller answering now and is still asked at once.
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,defineForm,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS,openFormInstance,deferFormClarification,takeFormClarification,formClarificationKept,acceptFormReadings} from '../dist/helpers/index.js';
const quiet={info(){},debug(){},warn(){},error(){}};
let checks=0;const test=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};
const selection={name:'selection',exclusive:true,label:'payment',question:'An amount or an option?',question_es:'¿Un monto o una opción?',
 any_of:[{name:'amount',label:'amount',label_es:'monto',profile:{kind:'amount',min:1}},
  {name:'option',label:'payment option',label_es:'opción de pago',profile:{kind:'choice',choices:[{key:'monthly',phrases:['monthly','1500']},{key:'full',phrases:['full balance']}]}}]};
function fixture(){
 const form=defineForm({id:'pay',name:'Pay',primary:true,description:'Make a payment',contract:{summary:'Make a payment'},stop:'cargo.stopPay',
  inputs:[{name:'account',label:'account',profile:{kind:'choice',choices:[{key:'50',phrases:['50']},{key:'51',phrases:['51']}]},question:'Which account?',question_es:'¿Qué cuenta?'},selection],
  after:[{id:'pay-done',type:'SET',variable:'noop',value:'(cargo.paid=cargo.forms[form_instance].values,true)'}]});
 const ai=async(system,user,schema,r)=>JSON.stringify(r&&r.task==='rank_reply'?{option:'answers'}:{flowName:'None',parameters:{}});
 const engine=new WorkflowEngine(quiet,ai,linkFormSchemas([...FLOWS,form]),[],STANDARD_FUNCTIONS,{},false,'en');engine.disableCommands();
 let session=engine.initSession('synthetic',crypto.randomUUID(),'en');session.cargo.voice=false;
 return {get session(){return session;},set(k,v){session.cargo[k]=v;},
  async say(content,args){session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(args?{start:{flow:'pay',arguments:args}}:{})},session)));return String(session.response||'').replace(/\s+/g,' ');}};
}
const conflict={amount:'1500',option:'monthly'};
const pay=t=>Object.values(t.session.cargo.forms||{}).find(f=>f.definition==='pay');
await test('a conflict the request carried is not asked when the form opens: the first question is',async()=>{
 const t=fixture();const r=await t.say('pay 1500 monthly',conflict);
 assert.match(r,/^Which account\?/,r);assert.doesNotMatch(r,/your amount or your payment option/i,r);
 assert.equal(pay(t).clarify.length,1,'kept on the form');
});
await test('it is asked when the form reaches its input, and the pick is taken',async()=>{
 const t=fixture();await t.say('pay 1500 monthly',conflict);const r=await t.say('51');
 assert.match(r,/Is 1500 your amount or your payment option\?/,r);
 await t.say('1');assert.deepEqual(t.session.cargo.paid,{account:'51',amount:'1500'},JSON.stringify(t.session.cargo.paid));
});
await test('a form that stops before the input never asks it (nothing due)',async()=>{
 const t=fixture();t.set('stopPay',true);const r=await t.say('pay 1500 monthly',conflict);
 assert.doesNotMatch(r,/your amount or your payment option/i,r);
});
await test('a form that stops after the first answer never asks it',async()=>{
 const t=fixture();await t.say('pay 1500 monthly',conflict);t.set('stopPay',true);const r=await t.say('51');
 assert.doesNotMatch(r,/your amount or your payment option/i,r);
});
await test('Spanish: asked at its input',async()=>{
 const t=fixture();t.session.language='es';await t.say('pagar 1500 mensual',conflict);const r=await t.say('51');
 assert.match(r,/¿1500 es su monto o su opción de pago\?/,r);
});
await test('a conflict in a reply is still asked at once',async()=>{
 const t=fixture();await t.say('pay',{});const r=await t.say('$50 full balance');
 assert.match(r,/your amount or your payment option|Is .* your amount/i,r);
});
await test('a value given at the question settles a kept conflict: never asked later, even after a reset',()=>{
 const cargo={};const id=openFormInstance(cargo,'pay-unit',[{name:'account',profile:{kind:'text'}},selection]);
 const readings=[{form:id,name:'amount',value:1500,origin:'activation'},{form:id,name:'option',value:'monthly',origin:'activation'}];
 deferFormClarification(cargo,readings);
 assert.equal(takeFormClarification(cargo,id,'account'),null,'another input does not take it');
 assert.equal(formClarificationKept(cargo,id,'option'),true);assert.equal(formClarificationKept(cargo,id,'account'),false);
 acceptFormReadings(cargo,[{form:id,name:'option',value:'full',ok:true}]);
 assert.equal(cargo.forms[id].clarify,undefined);assert.equal(takeFormClarification(cargo,id,'selection'),null);
 deferFormClarification(cargo,readings);assert.equal(takeFormClarification(cargo,id,'selection').length,2,'its group takes it');
 assert.equal(takeFormClarification(cargo,id,'selection'),null,'taken once');
 assert.throws(()=>deferFormClarification(cargo,[readings[0]]));
});
console.log(`form deferred clarification: ${checks} checks passed`);
