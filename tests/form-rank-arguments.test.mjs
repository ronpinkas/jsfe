/** Arguments in an unread answer (owner 2026-11-06): the asked input's rank_parameters on `answers`, a choice's parameters
 * on its pick. Each value is read by the form's own reader as if said alone; `reads` names its input, else it answers the
 * asked question (its rules decide a number's field). Fixture decisions measure the wiring, not the model. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,defineForm,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const quiet={info(){},debug(){},warn(...a){if(process.env.DBG)console.log('WARN',...a);},error(...a){if(process.env.DBG)console.log('ERR',...a);}};
const definite={name:'amount',reads:'amount',description:'The amount the caller definitely means to pay, as said.'};
const seen=[];
const candidate={name:'amount_candidate',description:'A number that may be the amount or may answer another option of this question.'};
const methodInput=(extra={})=>({name:'method',question:'Card or link?',profile:{kind:'choice',choices:[{key:'card',phrases:['card'],exact:true},{key:'link',phrases:['link'],exact:true},{key:'custom',phrases:['different sum'],exact:true,parameters:[definite]}]},rank_parameters:[definite,candidate],...extra});
let checks=0;
const test=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};
function fixture({method=methodInput(),rank={option:'answers'},args={}}={}){
 const form=defineForm({id:'pay',name:'Pay',primary:true,description:'Pay',contract:{summary:'Pay'},inputs:[method,{name:'amount',label:'amount',profile:{kind:'amount',min:0.01},question:'How much?'}],after:[{id:'done',type:'SET',variable:'noop',value:'(cargo.done=structuredClone(cargo.forms[form_instance].values),true)'}]});
 const calls=[],cfg={rank,args};
 const ai=async(_s,_u,_schema,r)=>{calls.push(r.task);
  if(r.task==='rank_reply')return JSON.stringify(cfg.rank);
  if(r.task==='extract_parameters')return JSON.stringify({parameters:cfg.args});
  return JSON.stringify({flowName:'None'});};
 const engine=new WorkflowEngine(quiet,ai,linkFormSchemas([...FLOWS,form]),[],STANDARD_FUNCTIONS,{},false,'en');engine.disableCommands();engine.intentDetection='two-stage';
 let session=engine.initSession('synthetic',crypto.randomUUID(),'en');session.cargo.voice=false;
 return {calls,cfg,get done(){return session.cargo.done;},get values(){return session.cargo.forms[session.cargo.formTasks.pay].values;},async say(content,start){session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'pay',arguments:{}}}:{})},session)));return session.response||'';}};
}
await test('answers: a definite amount is read as the amount input, by its reader',async()=>{
 const t=fixture({args:{amount:'30 dollars'}});await t.say('start',true);
 const r=await t.say('the usual payment, like last time');
 assert.equal(Number(t.values.amount),30);assert.equal(t.values.method,undefined);assert.match(r,/Card or link/);
 assert.deepEqual(t.calls,['rank_reply','extract_parameters']);
});
await test('answers: a candidate number answers the asked question, whose rules decide (a bare amount out of order is refused)',async()=>{
 const t=fixture({args:{amount_candidate:'40'}});await t.say('start',true);
 const r=await t.say('so I guess 40 then');
 assert.equal(t.values.amount,undefined);assert.match(r,/Card or link/);
});
await test('answers: the question invites the amount, so the candidate is the amount (as "40" said alone)',async()=>{
 const t=fixture({method:methodInput({invites:['amount']}),args:{amount_candidate:'40'}});await t.say('start',true);
 await t.say('so I guess 40 then');assert.equal(Number(t.values.amount),40);
 const alone=fixture({method:methodInput({invites:['amount']})});await alone.say('start',true);await alone.say('40');
 assert.equal(Number(alone.values.amount),40,'the same reading as the number said alone');
});
await test('two readings of one input that differ take nothing: asked again',async()=>{
 const t=fixture({method:methodInput({invites:['amount']}),args:{amount:'30 dollars',amount_candidate:'40'}});await t.say('start',true);
 const r=await t.say('pay 30 no 40');assert.equal(t.values.amount,undefined);assert.match(r,/Card or link/);
});
await test('a picked choice carries its arguments: the choice, then the amount',async()=>{
 const t=fixture({rank:{option:'choice:custom'},args:{amount:'25 dollars'}});await t.say('start',true);
 await t.say('a different one, like the usual');
 assert.equal(t.done.method,'custom');assert.equal(Number(t.done.amount),25,'the form completes with both');
});
await test('nothing extracted: asked again, as before',async()=>{
 const t=fixture({args:{}});await t.say('start',true);
 const r=await t.say('hmm let me think about it');assert.equal(t.values.amount,undefined);assert.equal(t.values.method,undefined);assert.match(r,/Card or link/);
});
await test('no rank_parameters: no extraction call, asked again (unchanged)',async()=>{
 const {rank_parameters,...plain}=methodInput();plain.profile.choices[2]={key:'custom',phrases:['different sum'],exact:true};
 const t=fixture({method:plain,args:{amount:'30 dollars'}});await t.say('start',true);
 await t.say('the usual payment, like last time');
 assert.equal(t.values.amount,undefined);assert.deepEqual(t.calls,['rank_reply']);
});
await test('declarations are validated',()=>{
 assert.throws(()=>fixture({method:methodInput({rank_parameters:[{name:'x'}]})}),/rank_parameters must list/);
 assert.throws(()=>fixture({method:methodInput({rank_parameters:[{name:'x',description:'d',extra:1}]})}),/rank_parameters must list/);
});
await test('a confirmation: confirm.rank_parameters read the amount and the form is confirmed again',async()=>{
 const form=defineForm({id:'pay',name:'Pay',primary:true,description:'Pay',contract:{summary:'Pay'},inputs:[{name:'amount',label:'amount',profile:{kind:'amount',min:0.01},question:'How much?'}],confirm:{question:'Pay {{cargo.forms[form_instance].values.amount}} dollars?',invites:['amount'],rank_parameters:[definite]},after:[{id:'done',type:'SET',variable:'noop',value:'(cargo.done=structuredClone(cargo.forms[form_instance].values),true)'}]});
 const cfg={rank:{option:'answers'},args:{amount:'40'}},calls=[];
 const ai=async(_s,_u,_schema,r)=>{calls.push(r.task);return JSON.stringify(r.task==='rank_reply'?cfg.rank:r.task==='extract_parameters'?{parameters:cfg.args}:{flowName:'None'});};
 const engine=new WorkflowEngine(quiet,ai,linkFormSchemas([...FLOWS,form]),[],STANDARD_FUNCTIONS,{},false,'en');engine.disableCommands();engine.intentDetection='two-stage';
 let session=engine.initSession('synthetic',crypto.randomUUID(),'en');session.cargo.voice=false;
 const say=async(content,start)=>{session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'pay',arguments:{amount:'25'}}}:{})},session)));return session.response||'';};
 assert.match(await say('start',true),/Pay 25 dollars/);
 assert.match(await say('well actually the usual one please'),/Pay 40 dollars/);assert.deepEqual(calls,['rank_reply','extract_parameters']);
 cfg.args={};assert.match(await say('hmm let me think'),/Pay 40 dollars/,'nothing extracted: asked again');
 assert.throws(()=>defineForm({id:'bad',name:'Bad',description:'b',contract:{summary:'b'},inputs:[{name:'amount',profile:{kind:'amount'}}],confirm:{question:'q',rank_parameters:[{name:'x'}]}}),/rank_parameters must list/);
});
await test("a confirmation: another input's picked option carries its parameters (the option, then the amount)",async()=>{
 const form=defineForm({id:'pay',name:'Pay',primary:true,description:'Pay',contract:{summary:'Pay'},inputs:[{name:'plan',question:'Which plan?',profile:{kind:'choice',choices:[{key:'due',phrases:['due'],exact:true},{key:'custom',phrases:['different sum'],exact:true,parameters:[definite]}]}},{name:'amount',label:'amount',profile:{kind:'amount',min:0.01},question:'How much?'}],confirm:{question:'Pay {{cargo.forms[form_instance].values.plan}} {{cargo.forms[form_instance].values.amount}}?'},after:[{id:'done',type:'SET',variable:'noop',value:'(cargo.done=structuredClone(cargo.forms[form_instance].values),true)'}]});
 const cfg={rank:{option:'choice:custom'},args:{amount:'40'}},calls=[],offered=[];
 const ai=async(_s,_u,_schema,r)=>{calls.push(r.task);if(r.task==='rank_reply')offered.push(...(r.options || []));return JSON.stringify(r.task==='rank_reply'?cfg.rank:r.task==='extract_parameters'?{parameters:cfg.args}:{flowName:'None'});};
 const engine=new WorkflowEngine(quiet,ai,linkFormSchemas([...FLOWS,form]),[],STANDARD_FUNCTIONS,{},false,'en');engine.disableCommands();engine.intentDetection='two-stage';
 let session=engine.initSession('synthetic',crypto.randomUUID(),'en');session.cargo.voice=false;
 const say=async(content,start)=>{session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'pay',arguments:{plan:'due',amount:'25'}}}:{})},session)));return session.response||'';};
 assert.match(await say('start',true),/Pay due 25/);
 assert.match(await say('make it the usual one instead'),/Pay custom 40/);assert.ok(offered.includes('choice:custom'));assert.deepEqual(calls,['rank_reply','extract_parameters']);
});
console.log(`form-rank-arguments: ${checks} checks passed`);
