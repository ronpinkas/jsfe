/** Required tasks keep unresolved outcomes; optional follow-ups preserve their explicit completed result. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,defineForm,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS,openFormInstance,formIncompleteOutcome} from '../dist/helpers/index.js';
const RESULT={outcome:'resolved',reason:'task_completed'};
const quiet={debug(){},info(){},warn(){},error(){}};
const set=(id,value)=>({id,type:'SET',variable:'noop',value});
const call=(id,value,parameters={})=>({id,type:'FLOW',value,callType:'call',parameters});
const field={name:'preference',label:'preference',profile:{kind:'choice',choices:[{key:'ok',words:['ok'],exact:true}]},question:'Optional follow-up? Type OK.',max_attempts:1};
let count=0,effects=0;
async function test(name,run){await run();count++;console.log('PASS '+name);}
function fixture(spec={},extra=[]) {
 const form=defineForm({id:'follow-up',name:'FollowUp',description:'Fixture follow-up.',contract:{summary:'Fixture field.'},inputs:[field],...spec});
 const completed={id:'completed',name:'Completed',version:'1',steps:[{id:'complete',type:'SAY',value:'The task completed.',...RESULT},call('optional','follow-up')]};
 const giveup={id:'give-up',name:'GiveUp',version:'1',steps:[{id:'failed',type:'SAY',value:'Unable to finish.',outcome:'unresolved',reason:'fixture_give_up'}]};
 const engine=new WorkflowEngine(quiet,async(_s,_m,_x,request)=>request?.task==='rank_reply'?JSON.stringify({option:'new_request'}):JSON.stringify({flowName:'None'}),linkFormSchemas([...FLOWS,form,completed,giveup,...extra]),[],{...STANDARD_FUNCTIONS,effect:()=>{effects++;}},{},false,'en');engine.disableCommands();
 let session=engine.initSession('user',crypto.randomUUID(),'en');
 return {get session(){return session;},async say(content,start){session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start}: {})},session)));return session;}};
}
const outcome=session=>({outcome:session.lastFlowOutcome?.outcome,reason:session.lastFlowOutcome?.reason});
await test('leaving an optional follow-up on the next turn preserves the completed result',async()=>{
 const t=fixture({incomplete_outcome:RESULT});await t.say('complete',{flow:'completed'});const s=await t.say('I need different assistance');assert.deepEqual(outcome(s),RESULT);assert.equal(s.lastFlowOutcome.endedBy,'dispatch');
});
await test('an ordinary required form yields a resumable pending task after unmatched input',async()=>{
 const t=fixture();await t.say('start',{flow:'follow-up'});const s=await t.say('I need different assistance');assert.equal(s.lastFlowOutcome.outcome,'pending');assert.equal(s.lastFlowOutcome.reason,'input_not_matched');assert.equal(s.lastFlowRecovery.mode,'resume');
});
await test('dependency and replay limits preserve optional fallback and exact required defaults',async()=>{
 for(const optional of [false,true])for(const route of ['blocked','runaway']) {
  const t=fixture({...(optional?{incomplete_outcome:RESULT}:{}),...(route==='blocked'?{inputs:[{...field,when:{'cargo.ready':'yes'}}]}:{before:[set('force_limit','(cargo.forms[form_instance].replays=100000,true)')]})});
  const s=await t.say('start',{flow:'follow-up'});if(optional)assert.deepEqual(outcome(s),RESULT);else {assert.equal(s.lastFlowOutcome.outcome,'unresolved');assert.match(s.lastFlowOutcome.reason,route==='blocked'?/^form_dependencies_blocked$/:/_incomplete$/);}
 }
});
await test('input retry exhaustion preserves only a declared fallback',async()=>{
 const reject={id:'reject',name:'Reject',version:'1',steps:[set('reject_value','(cargo.inputCheck={ok:false},true)')]};
 for(const optional of [false,true]) {const t=fixture({inputs:[{...field,validator:'reject'}],...(optional?{incomplete_outcome:RESULT}:{})},[reject]);await t.say('start',{flow:'follow-up'});const s=await t.say('ok');assert.deepEqual(outcome(s),optional?RESULT:{outcome:'unresolved',reason:'fixture_give_up'});}
});
await test('confirmation unmatched and retry exhaustion share the owned outcome policy',async()=>{
 for(const optional of [false,true])for(const unmatched of [false,true]) {
  const t=fixture({inputs:[],confirm:{question:'Proceed? YES or NO.'},...(optional?{incomplete_outcome:RESULT}:{})});await t.say('start',{flow:'follow-up'});
  let s;if(unmatched)s=await t.say('I need different assistance');else for(let i=0;i<2;i++)s=await t.say('zzz');
  if(optional)assert.deepEqual(outcome(s),RESULT);else {assert.equal(s.lastFlowOutcome.outcome,'pending');assert.equal(s.lastFlowOutcome.reason,unmatched?'confirmation_not_matched':'confirmation_misses_exhausted');assert.equal(s.lastFlowRecovery.mode,'resume');}
 }
});
await test('missing specification and failed form validation honor optional policy',async()=>{
 const invalid={id:'invalid',name:'Invalid',version:'1',steps:[set('invalid_result','(cargo.formCheck=null,true)')]};
 for(const optional of [false,true]) {
  const t=fixture({inputs:[],validator:'invalid',...(optional?{incomplete_outcome:RESULT}:{})},[invalid]);const s=await t.say('start',{flow:'follow-up'});assert.deepEqual(outcome(s),optional?RESULT:{outcome:'unresolved',reason:'fixture_give_up'});
  const p=fixture({},[{id:'no-spec',name:'NoSpec',version:'1',steps:[call('missing','collect-input',{form:'{{owner}}',current:'missing'})],parameters:[{name:'owner',type:'string'}]}]);
  const owner=openFormInstance(p.session.cargo,'missing-owner',[],optional?{incomplete_outcome:RESULT}:{});const missing=await p.say('probe',{flow:'no-spec',arguments:{owner}});assert.deepEqual(outcome(missing),optional?RESULT:{outcome:'unresolved',reason:'collect_input_spec'});
 }
});
await test('a declared object parameter supplies the explicit completed result',async()=>{
 const t=fixture({parameters:[{name:'completed_result',type:'object',internal:true}],incomplete_outcome:{from:'completed_result'}});await t.say('start',{flow:'follow-up',arguments:{completed_result:RESULT}});const s=await t.say('I need different assistance');assert.deepEqual(outcome(s),RESULT);
});
await test('only the nearest owned ancestor supplies a fallback, never another task',async()=>{
 const cargo={};const root=openFormInstance(cargo,'optional',[],{incomplete_outcome:RESULT}),child=openFormInstance(cargo,'child',[],{parent:root,input:'child'}),grandchild=openFormInstance(cargo,'grandchild',[],{parent:child,input:'grandchild'});
 assert.deepEqual(formIncompleteOutcome(cargo,grandchild),{...RESULT,owner:root});cargo.forms[child].incomplete_outcome={outcome:'deflected',reason:'child_left'};assert.deepEqual(formIncompleteOutcome(cargo,grandchild),{outcome:'deflected',reason:'child_left',owner:child});
 const unrelated=openFormInstance(cargo,'required',[]);assert.deepEqual(formIncompleteOutcome(cargo,unrelated),{outcome:'unresolved',reason:'form_incomplete',owner:''});
});
await test('an explicit incomplete business result remains authoritative on a contextual yield',async()=>{
 const declared={outcome:'unresolved',reason:'caller_declared_incomplete'};const t=fixture({incomplete_outcome:declared});await t.say('start',{flow:'follow-up'});const s=await t.say('I need different assistance');assert.deepEqual(outcome(s),declared);assert.equal(s.lastFlowRecovery.mode,'resume');
});
await test('malformed declarations cannot claim a completed task',async()=>{
 for(const incomplete_outcome of [{outcome:'success',reason:'bad'},{outcome:'resolved',reason:''},{outcome:'resolved',reason:'ok',extra:true},{from:'unknown'},{from:'completed_result',outcome:'resolved'}])assert.throws(()=>fixture({incomplete_outcome}),/incomplete_outcome/);
 assert.throws(()=>openFormInstance({},'invalid',[],{incomplete_outcome:{outcome:'resolved'}}),/incomplete_outcome/);
});
assert.equal(effects,0,'outcome policy never invokes effects');
console.log('Form incomplete outcomes: all '+count+' checks passed');
