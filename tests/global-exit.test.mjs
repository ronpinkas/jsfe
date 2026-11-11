/** The global exit (owner 2026-11-11): a whole-answer *, EXIT, QUIT or SALIR ends every flow at any question, before any reader,
 * command or the reply ranker, and the engine starts `global-exit` (or the tenant flow that wraps it) with the outcome in force.
 * CANCEL is not a global exit. The ranker's `abort` takes the same path. No network calls. */
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
 const ai=async(system,user,schema,r)=>{calls.push(r && r.task);if(r && r.task==='rank_reply')return JSON.stringify({option});if(/voice input cleaner/.test(system))return String(user);return '{"flowName":"None"}';};
 const engine=new WorkflowEngine({info(){},debug(){},warn(){},error(){}},ai,linkFormSchemas([...FLOWS,form,support,...extra]),[],STANDARD_FUNCTIONS,{},false,language);engine.disableCommands();
 let session=engine.initSession('synthetic',crypto.randomUUID(),language);session.cargo.voice=true;
 return {calls,get session(){return session;},async say(content,start){session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'pay',arguments:{}}}:{})},session)));return String(session.response||'');}};
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
await test("the ranker's abort takes the same path",async()=>{
 const t=fixture({option:'abort'});await t.say('start',true);
 assert.match(await t.say('forget all of this I changed my mind'),/Closing\./);assert.equal(active(t.session),0);
});
await test('a tenant flow that wraps global-exit is started instead',async()=>{
 const wrapper={id:'tenant-exit',name:'TenantExit',wraps:'global-exit',description:'Tenant exit',parameters:[{name:'exit_outcome',type:'string'}],steps:[{id:'te_say',type:'SAY',value:'Goodbye from the tenant.',value_es:'Adiós.'}]};
 const t=fixture({extra:[wrapper]});await t.say('start',true);
 assert.match(await t.say('*'),/Goodbye from the tenant\./);assert.equal(t.session.cargo.supportOutcome,undefined);
});
await test('Spanish SALIR in a Spanish session',async()=>{
 const t=fixture({language:'es'});assert.match(await t.say('empezar',true),/¿Cuánto\?/);assert.match(await t.say('SALIR'),/Cierre\./);
});
console.log(`Global exit: all ${checks} checks passed`);
