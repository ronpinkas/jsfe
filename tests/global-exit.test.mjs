/** The global exit (owner 2026-11-11): a whole-answer *, EXIT, QUIT or SALIR ends every flow at any question, before any reader,
 * command or the reply ranker, and the engine starts `global-exit` (or the tenant flow that wraps it) with the outcome in force.
 * CANCEL is not a global exit. A question declaring its own exit choice takes the answer. The ranker's `abort` keeps the
 * generic reply. No network calls. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,defineForm,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS,isGlobalExit} from '../dist/helpers/index.js';
let checks=0;const test=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};
for(const said of ['*','**','exit','EXIT.','Exit please','quit','Quit now','salir','Salir por favor','  * '])assert.equal(isGlobalExit(said),true,said);
for(const said of ['cancel','cancelar','exit the menu','I want to exit','no','*1','8','salida','',null])assert.equal(isGlobalExit(said),false,String(said));
checks++;
const support={id:'contact-support',name:'ContactSupport',description:'Support closing',parameters:[{name:'support_context',type:'string'}],steps:[
 {id:'cs_mark',type:'SET',variable:'noop',value:"(cargo.supportOutcome=typeof exit_outcome !== 'undefined' ? exit_outcome : '(none)',true)"},
 {id:'cs_say',type:'SAY',value:'Closing.',value_es:'Cierre.'}]};
const form=defineForm({id:'pay',name:'Pay',primary:true,description:'Make a payment',contract:{summary:'Make a payment'},inputs:[{name:'zip',label:'ZIP code',profile:{kind:'digits',min:5,max:5},question:'How much?',question_es:'¿Cuánto?'}]});
function fixture({extra=[],option='answers',language='en'}={}){
 const calls=[];
 const ai=async(system,user,schema,r)=>{calls.push(r && r.task);if(r && r.task==='rank_reply')return JSON.stringify({option});if(/voice input cleaner/.test(system))return (String(user).match(/voice response: "([\s\S]*)"\n/)||[,String(user)])[1];return '{"flowName":"None"}';};
 const engine=new WorkflowEngine({info(){},debug(){},warn(){},error(){}},ai,linkFormSchemas([...FLOWS,form,support,...extra]),[],STANDARD_FUNCTIONS,{},false,language);engine.disableCommands();
 let session=engine.initSession('synthetic',crypto.randomUUID(),language);session.cargo.voice=true;
 return {calls,get session(){return session;},async say(content,start){session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'pay',arguments:{}}}:{})},session)));return String(session.response||'');},async sayStart(flow){session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content:'go',start:{flow,arguments:{}}},session)));return String(session.response||'');}};
}
const active=s=>(s.flowStacks||[]).flat().length;
for(const said of ['*','exit','Salir.','quit please'])await test(`"${said}" ends every flow and reaches the support closing`,async()=>{
 const t=fixture();assert.match(await t.say('start',true),/How much\?/);t.calls.length=0;
 assert.match(await t.say(said),/Closing\./);
 assert.equal(active(t.session),0);assert.equal(t.session.cargo.supportOutcome,'');
 assert.ok(!t.calls.includes('rank_reply'),'the ranker never sees it');
});
await test('"cancel" is not the global exit: the ranker reads it',async()=>{
 const t=fixture();await t.say('start',true);t.calls.length=0;await t.say('cancel');
 assert.ok(t.calls.includes('rank_reply'));assert.equal(t.session.cargo.supportOutcome,undefined);
});
await test("the ranker's abort keeps the generic reply, never the global exit",async()=>{
 const t=fixture({option:'abort'});await t.say('start',true);
 const r=await t.say('forget all of this I changed my mind');
 assert.match(r,/cancelled at your request/);assert.doesNotMatch(r,/Closing/);assert.equal(active(t.session),0);assert.equal(t.session.cargo.supportOutcome,undefined);
});
await test('a question that declares its own exit choice takes the answer',async()=>{
 const menu={id:'menu',name:'Menu',primary:true,description:'A menu',steps:[
  {id:'m_ask',type:'FLOW',value:'ask-choice',callType:'call',parameters:{question:'Pick one: say EXIT to go back to the main menu.',question_es:'Elija.',choices:[{key:'back',phrases:['exit','salir','*']},{key:'one',phrases:['one']}]}},
  {id:'m_said',type:'SAY',value:'picked {{cargo.choice}}',value_es:'elegido {{cargo.choice}}'}]};
 for(const said of ['exit','*','SALIR']){
  const t=fixture({extra:[menu]});
  const s0=await t.sayStart('menu');assert.match(s0,/Pick one/);
  const r=await t.say(said);assert.match(r,/picked back/,said);assert.doesNotMatch(r,/Closing/);
 }
});
await test('a tenant flow that wraps global-exit is started instead',async()=>{
 const wrapper={id:'tenant-exit',name:'TenantExit',wraps:'global-exit',description:'Tenant exit',parameters:[{name:'exit_outcome',type:'string'}],steps:[{id:'te_say',type:'SAY',value:'Goodbye from the tenant.',value_es:'Adiós.'}]};
 const t=fixture({extra:[wrapper]});await t.say('start',true);
 assert.match(await t.say('*'),/Goodbye from the tenant\./);assert.equal(t.session.cargo.supportOutcome,undefined);
});
await test('Spanish SALIR in a Spanish session',async()=>{
 const t=fixture({language:'es'});assert.match(await t.say('empezar',true),/¿Cuánto\?/);assert.match(await t.say('SALIR'),/Cierre\./);
});
await test("the question's exit context reaches contact-support; a declared cancel_flow is the flow's own exit",async()=>{
 const supportCtx={...support,parameters:[{name:'support_context',type:'string'},{name:'support_context_es',type:'string'}],steps:[{id:'cs_say',type:'SAY',value:"Closing for {{support_context || 'nothing'}}.",value_es:'Cierre.'}]};
 const ask={id:'ask',name:'Ask',primary:true,description:'Ask',steps:[{id:'a',type:'FLOW',value:'ask-choice',callType:'call',parameters:{question:'Pick one.',question_es:'Elija.',choices:[{key:'1',phrases:['1','one']}],exit_context:'your payment',exit_context_es:'su pago'}}]};
 const t1=(()=>{const e=new WorkflowEngine({info(){},debug(){},warn(){},error(){}},async(s,u)=>/voice input cleaner/.test(s)?(String(u).match(/voice response: "([\s\S]*)"\n/)||[,String(u)])[1]:'{"flowName":"None"}',linkFormSchemas([...FLOWS,ask,supportCtx]),[],STANDARD_FUNCTIONS,{},false,'en');e.disableCommands();return e;})();
 let s1=t1.initSession('x',crypto.randomUUID(),'en');s1.cargo.voice=true;
 s1=JSON.parse(JSON.stringify(await t1.updateActivity({role:'user',content:'go',start:{flow:'ask',arguments:{}}},s1)));
 s1=JSON.parse(JSON.stringify(await t1.updateActivity({role:'user',content:'*'},s1)));
 assert.match(String(s1.response),/Closing for your payment\./);
 const own={id:'cancel-process',name:'CancelProcess',description:'Own exit',steps:[{id:'c',type:'SAY',value:'Cancelled here.',value_es:'Cancelado.'}]};
 const menu={id:'m2',name:'M2',primary:true,description:'M2',variables:{cancel_flow:{type:'string',value:'cancel-process'}},steps:[{id:'q',type:'SAY-GET',variable:'x',value:'Say something.'},{id:'d',type:'SAY',value:'done'}]};
 const t2=new WorkflowEngine({info(){},debug(){},warn(){},error(){}},async(s,u)=>/voice input cleaner/.test(s)?(String(u).match(/voice response: "([\s\S]*)"\n/)||[,String(u)])[1]:'{"flowName":"None"}',linkFormSchemas([...FLOWS,menu,own,supportCtx]),[],STANDARD_FUNCTIONS,{},false,'en');t2.disableCommands();
 let s2=t2.initSession('y',crypto.randomUUID(),'en');s2.cargo.voice=true;
 s2=JSON.parse(JSON.stringify(await t2.updateActivity({role:'user',content:'go',start:{flow:'m2',arguments:{}}},s2)));
 s2=JSON.parse(JSON.stringify(await t2.updateActivity({role:'user',content:'exit'},s2)));
 assert.match(String(s2.response),/Cancelled here\./);
});
console.log(`Global exit: all ${checks} checks passed`);
