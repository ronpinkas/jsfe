/** Contextual field intake: the reply ranker decides, the stage-2 extraction reads the answer. Fixture decisions only. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,defineForm,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
import {assertFlowHostCapabilities} from '../dist/host/index.js';
const response={description:'The concrete issue in the caller’s own words. Omit a fragment or a generic complaint announcement.'};
const quiet={info(){},debug(){},warn(){},error(){}};
let checks=0;
const test=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};
function fixture({choice='ContinueCurrent',answer='A duplicate charge appeared.',fail,inputs,confident=true}={}){
 const form=defineForm({id:'case',name:'Case',primary:true,description:'Report a billing issue',contract:{summary:'Report a billing issue'},inputs:inputs||[{name:'details',profile:{kind:'text',narrative:true},response,question:'What happened?'}],after:[{id:'effect',type:'SET',variable:'noop',value:'(cargo.effects=(cargo.effects||0)+1,cargo.captured=structuredClone(cargo.forms[form_instance].values),true)'}]});
 const other={id:'other',name:'Other',primary:true,description:'A different service',steps:[{id:'other-ran',type:'SET',variable:'noop',value:'(cargo.other=true,true)'}]};
 const calls=[],cfg={answer,confident};
 const ai=async(system,user,schema,r)=>{
  calls.push({system,user,schema,request:r});
  assert.ok(['rank_reply','detect_flow','extract_parameters'].includes(r.task),'Only the ranker and the intent stages');
  if(fail===r.task)throw new Error('synthetic routing failure');
  if(r.task==='rank_reply')return JSON.stringify(choice==='ContinueCurrent'?{option:'answers',...(cfg.confident?{}:{fallback:true})}:{option:choice==='None'?'abort':'new_request'});
  return JSON.stringify(r.task==='detect_flow'?{flowName:choice}:{parameters:cfg.answer===undefined?{}:{answer:cfg.answer}});
 };
 const engine=new WorkflowEngine(quiet,ai,linkFormSchemas([...FLOWS,form,other]),[],STANDARD_FUNCTIONS,{},false,'en');engine.disableCommands();engine.intentDetection='two-stage';
 let session=engine.initSession('synthetic',crypto.randomUUID(),'en');session.cargo.voice=false;
 return {form,calls,cfg,engine,get session(){return session;},async say(content,start){session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'case',arguments:start===true?{}:start}}:{})},session)));return session.response||'';}};
}
await test('declarations reuse contextual responses and reject the retired classifier contract',()=>{
 const t=fixture();assert.ok(t.form.variables.contract.value.requires.includes('jsfe:contextual-responses:v1'));assertFlowHostCapabilities([t.form]);
 assert.throws(()=>fixture({inputs:[{name:'x',profile:{kind:'text'},meaning:{purpose:'p',acceptance:'a'}}]}),/retired/);
 assert.throws(()=>fixture({inputs:[{name:'x',profile:{kind:'text'},response:{description:''}}]}),/description/);
 assert.throws(()=>assertFlowHostCapabilities([{id:'old',variables:{contract:{value:{requires:['jsfe:semantic-input-validation:v1']}}}}]),/unsupported/);
});
await test('new response definitions fail closed with an older helper registry',async()=>{
 const t=fixture();
 const old={...STANDARD_FUNCTIONS};delete old.validateFormResponse;
 const engine=new WorkflowEngine(quiet,null,linkFormSchemas([...FLOWS,t.form]),[],old,{});engine.disableCommands();
 const session=engine.initSession('synthetic',crypto.randomUUID(),'en');
 await assert.rejects(engine.updateActivity({role:'user',content:'start',start:{flow:'case',arguments:{details:'A duplicate charge appeared.'}}},session));assert.equal(engine.cargo.effects,undefined);
});
await test('valid contextual answer continues once and preserves exact caller words',async()=>{
 const t=fixture();await t.say('start',true);const raw='A duplicate charge appeared.';await t.say(raw);
 assert.equal(t.session.cargo.effects,1);assert.equal(t.session.cargo.captured.details,raw);assert.equal(t.calls.length,2);
 assert.equal(t.calls[1].request.flow.parameters[0].description,response.description);
 for(const c of t.calls)assert.match(c.system+c.user,/What happened/);
});
await test('a confident answer with nothing extracted is kept as said',async()=>{
 const t=fixture({answer:null});await t.say('start',true);await t.say('Ya no lo uso.');
 assert.equal(t.session.cargo.effects,1);assert.equal(t.session.cargo.captured.details,'Ya no lo uso.');assert.equal(t.calls.length,2);
});
await test('a default answers with nothing extracted asks again, never the host',async()=>{
 const t=fixture({answer:null,confident:false});await t.say('start',true);assert.equal(await t.say("it's"),'What happened?','the question alone, no rejection wording');
 assert.equal(t.session.cargo.effects,undefined);assert.ok(t.session.flowStacks.flat().length,'the form is still asking');
 const state=t.session.cargo.forms[t.session.cargo.formTasks.case];assert.equal(state.values.details,undefined);assert.equal(t.calls.length,2);
 assert.equal(t.session.lastTurnDispatch,undefined,'no DISPATCH to the host');
 Object.assign(t.cfg,{answer:'A duplicate charge appeared.',confident:true});await t.say('A duplicate charge appeared.');assert.equal(t.session.cargo.effects,1,'the next answer is taken');
});
await test('a confident answer survives an extraction failure',async()=>{
 const t=fixture({fail:'extract_parameters'});await t.say('start',true);await t.say('A duplicate charge appeared.');
 assert.equal(t.session.cargo.effects,1);assert.equal(t.session.cargo.captured.details,'A duplicate charge appeared.');
});
await test('a withdrawn request ends every flow as a RETURN, reported user_aborted',async()=>{
 const t=fixture({choice:'None'});await t.say('start',true);await t.say('never mind');
 assert.equal(t.session.cargo.effects,undefined);assert.equal(t.calls.length,1);assert.equal(t.session.flowStacks.flat().length,0);assert.equal(t.session.lastFlowRecovery,undefined);assert.equal(t.session.lastFlowOutcome.outcome,'user_aborted');assert.match(t.session.response,/The process has been cancelled at your request - how can I help you\?/);
});
await test('a new request for the same primary starts it again',async()=>{
 const t=fixture({choice:'Case',answer:null});await t.say('start',true);assert.match(await t.say('I want to report another issue.'),/What happened/);assert.equal(t.session.cargo.effects,undefined);assert.equal(t.session.lastTurnDispatch.matchedFlow,'Case');assert.deepEqual(t.calls.map(c=>c.request.task),['rank_reply','detect_flow','extract_parameters']);
});
await test('a different workflow starts without storing the old field',async()=>{
 const t=fixture({choice:'Other'});await t.say('start',true);await t.say('Instead do another service');assert.equal(t.session.cargo.other,true);assert.equal(t.session.cargo.effects,undefined);assert.deepEqual(t.calls.map(c=>c.request.task),['rank_reply','detect_flow']);
});
for(const fail of ['rank_reply','extract_parameters'])await test(fail+' failure preserves the pending owner and cannot execute',async()=>{
 const t=fixture({fail,confident:false});await t.say('start',true);await assert.rejects(t.say('A duplicate charge appeared.'),/synthetic routing failure/);assert.equal(t.engine.cargo.effects,undefined);assert.ok(t.engine.flowStacks.flat().length);assert.equal(t.engine.flowStacks.flat().at(-1).flowStepsStack.at(-1).id,'response_dispatch');
});
await test('activation parameters use their declared extraction description without a second routing decision',async()=>{
 const t=fixture();assert.equal(t.engine.flowsMenu.find(f=>f.id==='case').parameters.find(p=>p.name==='details').description,response.description);await t.say('start',{details:'A duplicate charge appeared.'});assert.equal(t.calls.length,0);assert.equal(t.session.cargo.effects,1);
});
await test('ordinary legacy text fields keep their existing deterministic reader',async()=>{
 const t=fixture({inputs:[{name:'details',profile:{kind:'text'},question:'What happened?'}]});await t.say('start',true);await t.say('A plain text answer');assert.equal(t.session.cargo.effects,1);assert.equal(t.calls.length,0);
});
console.log(`Contextual FORM input: all checks passed (${checks})`);
