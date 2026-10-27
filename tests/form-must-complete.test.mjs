/** must_complete (on a form or a field; a field inherits its nearest enclosing form's): an unreadable answer is never
 * handed away to DISPATCH — the input says it did not catch that and asks again. Prod 2026-10-25 18:42: the AVS zip
 * retry heard "el número postal el código postal", three-plus words that fit nothing, and DISPATCH ended the payment. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,formFlow,linkFormSchemas,compileFlowDeclarations} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const clone=value=>JSON.parse(JSON.stringify(value));
const S=(id,value,variable='noop')=>({id,type:'SET',variable,value});
const sorry=language=>language==='es'?'Disculpe, no le entendí.':"Sorry, I didn't catch that.";
let checks=0;const failures=[];
async function test(name,run){try{await run();checks++;console.log('PASS '+name);}catch(error){failures.push({name,error});console.error('FAIL '+name+'\n'+error.stack);}}
function fixture(flows,{language='en'}={}){
 const calls=[];const quiet={info(){},debug(){},error(){},warn(){}};
 const ai=async(_s,_m,_schema,request)=>{if(request?.task==='rank_reply')return JSON.stringify({option:'new_request'});if(request?.task==='detect_flow'){calls.push(request.input);return JSON.stringify({flowName:'None',parameters:{}});}throw new Error('Unexpected model task');};
 const engine=new WorkflowEngine(quiet,ai,linkFormSchemas([...FLOWS,...flows]),[],{...STANDARD_FUNCTIONS},{},false,language);engine.disableCommands();
 let session=engine.initSession('fixture',crypto.randomUUID(),language);Object.assign(session.cargo,{voice:true,account:'A',verified:true});
 return {calls,get session(){return session;},async say(content,start){session=clone(await engine.updateActivity({role:'user',content,...(start?{start:{flow:start}}:{})},clone(session)));return session.response||'';}};
}
const commit=S('commit',"(cargo.done=(cargo.done||[]).concat([cargo.forms[form_instance].values]),true)");
const pay=(extra={},zip={})=>formFlow({id:'pay',name:'Pay',version:'1',inputs:[{name:'zip',field:'zip',question:'ZIP?',question_es:'¿CÓDIGO?',...zip}],after:[commit],...extra});
const LONG=['el número postal el código postal','I am not sure what you mean by that','la verdad no me acuerdo cuál es'];
// the zip preset declares its own retry wording, which replaces the acknowledgment (formInputPrompt)
const stillAsking=(t,response,language)=>{assert.ok(response.includes(sorry(language))||/5-digit ZIP|código postal de 5 dígitos/.test(response),response);assert.equal(t.calls.length,0);assert.ok(t.session.flowStacks.flat().length>0);};

for(const language of ['en','es']){
 await test(`${language} a must_complete form re-asks every unreadable answer, long or short, and takes the zip after`,async()=>{
  const t=fixture([pay({must_complete:true})],{language});await t.say('begin','pay');
  for(const said of [...LONG,'zqx','qzx'])stillAsking(t,await t.say(said),language);
  await t.say('93 036');assert.deepEqual(t.session.cargo.done,[{zip:'93036'}]);
 });
 await test(`${language} must_complete on the field alone holds that field`,async()=>{
  const t=fixture([pay({},{must_complete:true})],{language});await t.say('begin','pay');
  stillAsking(t,await t.say(LONG[0]),language);await t.say('90001');assert.deepEqual(t.session.cargo.done,[{zip:'90001'}]);
 });
}
await test('without must_complete the same answer still yields (unchanged)',async()=>{
 const t=fixture([pay()]);await t.say('begin','pay');await t.say(LONG[0]);assert.deepEqual(t.calls,[LONG[0]]);assert.equal(t.session.flowStacks.flat().length,0);
});
await test('a field declaring must_complete false opts out of its form',async()=>{
 const t=fixture([pay({must_complete:true},{must_complete:false})]);await t.say('begin','pay');await t.say(LONG[0]);assert.deepEqual(t.calls,[LONG[0]]);
});
await test('a nested form inherits the enclosing form',async()=>{
 const card=formFlow({id:'card',name:'Card',version:'1',inputs:[{name:'zip',field:'zip',question:'ZIP?'}]});
 const outer=formFlow({id:'outer',name:'Outer',version:'1',must_complete:true,inputs:[{name:'card',form:'card'}],after:[S('outer-commit',"(cargo.done=true,true)")]});
 const t=fixture([outer,card]);await t.say('begin','outer');stillAsking(t,await t.say(LONG[1]),'en');await t.say('90001');assert.equal(t.session.cargo.done,true);
});
await test('a must_complete confirmation re-asks instead of yielding, and YES still commits',async()=>{
 const t=fixture([pay({must_complete:true,confirm:{question:'PAY WITH {{cargo.forms[form_instance].values.zip}}? YES or NO.'}})]);await t.say('begin','pay');
 let response=await t.say('90001');assert.match(response,/PAY WITH 90001/);
 for(const said of [LONG[1],'zqx','qzx','xqz']){response=await t.say(said);assert.match(response,/PAY WITH 90001/,response);assert.equal(t.calls.length,0);assert.equal(t.session.cargo.done,undefined);}
 await t.say('yes');assert.deepEqual(t.session.cargo.done,[{zip:'90001'}]);
});
await test('must_complete must be a boolean, on a form and on a field',async()=>{
 assert.throws(()=>pay({must_complete:'yes'}),/must_complete must be true or false/);
 assert.throws(()=>fixture([pay({},{must_complete:1})]),/must_complete must be true or false/);
});
await test('a JSON declaration carries must_complete',async()=>{
 const [flow]=compileFlowDeclarations([{declarationVersion:2,id:'json-pay',name:'JsonPay',version:'1',description:'pay',form:{must_complete:true,inputs:[{name:'zip',field:'zip',question:'ZIP?'}]}}],{validate:false}).filter(f=>f.id==='json-pay');
 assert.equal(flow.variables.form_must_complete.value,true);
});
console.log(`form-must-complete: ${checks} passed, ${failures.length} failed`);
if(failures.length)process.exit(1);
