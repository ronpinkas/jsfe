/** Conditional dispatch classifies before ending the live continuation. No network. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
let checks=0;
const quiet={info(){},debug(){},warn(){},error(){}};
const set=(id,value)=>({id,type:'SET',variable:'noop',value});
const flow=(id,steps,extra={})=>({id,name:id,version:'1.0.0',description:id,primary:true,steps,...extra});
const ask=(id,value)=>({id,type:'SAY-GET',variable:'answer',value,as_spoken:true});
const guarded=(extra={})=>({id:'try_handoff',type:'DISPATCH',onResponse:'continue',responseContext:'The account identifier.',outcome:'unresolved',reason:'not_input',recovery:{version:1,mode:'none',reason:'not_input'},...extra});
const child=flow('Child',[ask('original','[identifier]'),set('queued',"(cargo.observed=answer,true)"),{id:'queue',type:'SAY',value:'[queued]'},guarded(),set('fallback',"(cargo.fallback=(cargo.fallback || 0)+1,true)"),ask('retry','[retry identifier]'),set('accept',"(cargo.identifier=answer,true)")],{primary:false});
const owner=flow('Owner',[set('draft',"(cargo.draft={account:'old',confirmed:false},true)"),{id:'child',type:'FLOW',value:'Child',callType:'call'},ask('confirm','[confirm]'),set('effect',"(cargo.effects=(cargo.effects || 0)+1,true)")]);
const other=flow('Other',[ask('other_prompt','[other]')]);
function setup({flows=[owner,child,other],result=()=>({flowName:'ContinueCurrent',parameters:{}})}={}){
 const calls=[];const engine=new WorkflowEngine(quiet,async(system,user,schema)=>{calls.push({system,user,schema});return JSON.stringify(await result(system,user,schema));},flows,[],{},{},false,'en');engine.disableCommands();
 let session=engine.initSession('test',crypto.randomUUID(),'en');
 return{engine,calls,get session(){return session;},async say(content,start){session=await engine.updateActivity({role:'user',content,...(start?{start:{flow:start}}:{})},JSON.parse(JSON.stringify(session)));return session.response;}};
}
{
 const t=setup();await t.say('start','Owner');const before=t.session.flowStacks.flat().map(f=>f.transaction.id);
 assert.match(await t.say('not an identifier'),/\[queued\].*\[retry identifier\]/s);
 assert.deepEqual(t.session.flowStacks.flat().map(f=>f.transaction.id),before,'ContinueCurrent preserves exact live transaction ownership');
 assert.equal(t.session.cargo.fallback,1);assert.equal(t.session.lastTurnDispatch,undefined);assert.equal(t.session.lastFlowRecovery,undefined);assert.equal(t.session.lastFlowOutcome,undefined);assert.deepEqual(t.session.cargo.draft,{account:'old',confirmed:false});assert.equal(t.session.cargo.effects,undefined);assert.equal(t.calls.length,1);
 await t.say('56035214');assert.equal(t.session.cargo.identifier,'56035214');assert.equal(t.session.cargo.effects,undefined,'Recovery never bypasses confirmation');assert.match(t.session.response,/\[confirm\]/);assert.equal(t.calls.length,1,'Accepted recovery input is not reclassified');checks++;
}
{
 const t=setup({result:()=>({flowName:'Other',parameters:{}})});await t.say('start','Owner');assert.match(await t.say('another supported request'),/\[other\]/);assert.doesNotMatch(t.session.response,/queued|retry/);assert.deepEqual(t.session.flowStacks.flat().map(f=>f.flowName),['Other']);assert.deepEqual(t.session.lastTurnDispatch,{fromFlow:'Child',matchedFlow:'Other'});assert.equal(t.session.cargo.fallback,undefined);assert.equal(t.session.cargo.effects,undefined);assert.equal(t.session.lastFlowOutcome,undefined);assert.equal(t.calls.length,1);checks++;
}
{
 const t=setup({result:()=>({flowName:'None',parameters:{}})});await t.say('start','Owner');await t.say('what are your store hours');assert.equal(t.session.response,null);assert.equal(t.session.flowStacks.flat().length,0);assert.equal(t.session.cargo.fallback,undefined);assert.deepEqual(t.session.lastTurnDispatch,{fromFlow:'Child',matchedFlow:null});assert.equal(t.session.lastFlowOutcome.outcome,'unresolved');assert.equal(t.calls.length,1,'Host handoff reuses the contextual None decision');checks++;
}
{
 const double=flow('Double',[ask('a','[ask]'),guarded(),guarded({id:'again'}),{id:'plain',type:'DISPATCH'}]);const t=setup({flows:[double,other]});await t.say('start','Double');await t.say('not a request');assert.equal(t.calls.length,1,'Conditional fallthrough and later ordinary handoff reuse one decision');assert.equal(t.session.response,null);assert.equal(t.session.flowStacks.flat().length,0);assert.deepEqual(t.session.lastTurnDispatch,{fromFlow:'Double',matchedFlow:null});checks++;
}
{
 const echo=flow('Echo',[guarded(),ask('fallback','[new flow fallback]')]);const t=setup({flows:[owner,child,echo],result:()=>({flowName:'Echo'})});await t.say('start','Owner');assert.match(await t.say('change request'),/new flow fallback/);assert.equal(t.calls.length,1,'A newly activated flow cannot route the same turn again');assert.equal(t.session.flowStacks.flat().length,1);checks++;
}
{
 const t=setup({result:()=>{throw new Error('synthetic model unavailable');}});await t.say('start','Owner');const ids=t.session.flowStacks.flat().map(f=>f.transaction.id);
 await assert.rejects(t.say('not an identifier'),/synthetic model unavailable/);assert.deepEqual(t.engine.flowStacks.flat().map(f=>f.transaction.id),ids,'A classification error cannot pop the collector or owner');assert.equal(t.engine.flowStacks.flat().at(-1).flowStepsStack.at(-1).id,'try_handoff');assert.equal(t.engine.dispatchIfMatched,null,'Per-turn callback is cleared on error');assert.equal(t.engine.cargo.effects,undefined);assert.equal(t.engine.cargo.fallback,undefined);checks++;
}
{
 const t=setup({flows:[flow('Validation',[guarded()])]});assert.deepEqual(t.engine.validateFlow('Validation').errors,[]);
 const missing=setup({flows:[flow('Missing',[guarded({responseContext:''})])]});assert.ok(missing.engine.validateFlow('Missing').errors.some(e=>/requires a non-empty/.test(e)));
 const plain=setup({flows:[flow('Plain',[{id:'d',type:'DISPATCH',responseContext:'bad'}])]});assert.ok(plain.engine.validateFlow('Plain').errors.some(e=>/responseContext requires/.test(e)));
 const bad=setup({flows:[flow('Bad',[guarded({onResponse:'restore'})])]});assert.ok(bad.engine.validateFlow('Bad').errors.some(e=>/onResponse must be/.test(e)));checks++;
}
for(const id of ['continuecurrent','__JSFE_CONTINUE_CURRENT__']){
 const conflict=flow(id,[set('bad',"(cargo.forbidden=true,true)")]);const t=setup({flows:[owner,child,conflict],result:()=>({flowName:'ContinueCurrent'})});await t.say('start','Owner');await assert.rejects(t.say('invalid identifier'),/reserved for contextual dispatch/);assert.equal(t.engine.cargo.forbidden,undefined,'A differently cased registry name cannot impersonate a continuation');assert.equal(t.calls.length,0);checks++;
}
console.log(`Conditional dispatch: all ${checks} checks passed`);
