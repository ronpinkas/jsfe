/** Conditional dispatch ranks the reply before ending the live continuation. No network. */
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
// A fixture's decision: ContinueCurrent = the reply answers, None = it withdraws the request, a flow name = a new request
// (which intent detection then routes to that flow).
const optionFor=flowName=>flowName==='ContinueCurrent'?'answers':flowName==='None'?'abort':'new_request';
function setup({flows=[owner,child,other],result=()=>({flowName:'ContinueCurrent',parameters:{}})}={}){
 const calls=[];const engine=new WorkflowEngine(quiet,async(system,user,schema,request)=>{calls.push({system,user,schema,task:request?.task});const decided=await result(system,user,schema);return JSON.stringify(request?.task==='rank_reply'?{option:optionFor(decided.flowName)}:decided);},flows,[],{},{},false,'en');engine.disableCommands();
 let session=engine.initSession('test',crypto.randomUUID(),'en');
 return{engine,calls,get session(){return session;},async say(content,start){session=await engine.updateActivity({role:'user',content,...(start?{start:{flow:start}}:{})},JSON.parse(JSON.stringify(session)));return session.response;}};
}
{
 const t=setup();await t.say('start','Owner');const before=t.session.flowStacks.flat().map(f=>f.transaction.id);
 assert.match(await t.say('not an identifier'),/\[queued\].*\[retry identifier\]/s);
 assert.deepEqual(t.session.flowStacks.flat().map(f=>f.transaction.id),before,'An answer preserves exact live transaction ownership');
 assert.equal(t.session.cargo.fallback,1);assert.equal(t.session.lastTurnDispatch,undefined);assert.equal(t.session.lastFlowRecovery,undefined);assert.equal(t.session.lastFlowOutcome,undefined);assert.deepEqual(t.session.cargo.draft,{account:'old',confirmed:false});assert.equal(t.session.cargo.effects,undefined);assert.equal(t.calls.length,1);
 await t.say('56035214');assert.equal(t.session.cargo.identifier,'56035214');assert.equal(t.session.cargo.effects,undefined,'Recovery never bypasses confirmation');assert.match(t.session.response,/\[confirm\]/);assert.equal(t.calls.length,1,'Accepted recovery input is not reclassified');checks++;
}
{
 const t=setup({result:()=>({flowName:'Other',parameters:{}})});await t.say('start','Owner');assert.match(await t.say('another supported request'),/\[other\]/);assert.doesNotMatch(t.session.response,/queued|retry/);assert.deepEqual(t.session.flowStacks.flat().map(f=>f.flowName),['Other']);assert.deepEqual(t.session.lastTurnDispatch,{fromFlow:'Child',matchedFlow:'Other'});assert.equal(t.session.cargo.fallback,undefined);assert.equal(t.session.cargo.effects,undefined);assert.equal(t.session.lastFlowOutcome,undefined);assert.deepEqual(t.calls.map(c=>c.task),['rank_reply','detect_flow'],'A new request is ranked, then routed once');checks++;
}
{
 const t=setup({result:()=>({flowName:'None',parameters:{}})});await t.say('start','Owner');await t.say('never mind');assert.equal(t.session.response,'The process has been cancelled at your request - how can I help you?');assert.equal(t.session.flowStacks.flat().length,0);assert.equal(t.session.cargo.fallback,undefined);assert.equal(t.session.lastTurnDispatch,undefined,'A withdrawn request is a RETURN, not a DISPATCH');assert.equal(t.session.lastFlowOutcome.endedBy,'return');assert.equal(t.session.lastFlowOutcome.outcome,'user_aborted');assert.equal(t.calls.length,1,'A withdrawn request ends every flow without intent detection');checks++;
}
{
 const double=flow('Double',[ask('a','[ask]'),guarded(),guarded({id:'again'}),{id:'plain',type:'DISPATCH'}]);const t=setup({flows:[double,other]});await t.say('start','Double');await t.say('not a request');assert.deepEqual(t.calls.map(c=>c.task),['rank_reply','rank_reply'],'Each contextual step ranks; after an answer a later ordinary DISPATCH goes to the host unrouted');assert.equal(t.session.response,null);assert.equal(t.session.flowStacks.flat().length,0);assert.deepEqual(t.session.lastTurnDispatch,{fromFlow:'Double',matchedFlow:null});checks++;
}
{
 const echo=flow('Echo',[guarded(),ask('fallback','[new flow fallback]')]);const t=setup({flows:[owner,child,echo],result:()=>({flowName:'Echo'})});await t.say('start','Owner');assert.match(await t.say('change request'),/new flow fallback/);assert.deepEqual(t.calls.map(c=>c.task),['rank_reply','detect_flow'],'A newly activated flow does not rank the same turn again');assert.equal(t.session.flowStacks.flat().length,1);checks++;
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
{
 const named=flow('ContinueCurrent',[ask('named','[named]')]);const t=setup({flows:[owner,child,named],result:()=>({flowName:'ContinueCurrent'})});assert.match(await t.say('start','ContinueCurrent'),/\[named\]/,'ContinueCurrent is no longer a reserved name');checks++;
}
console.log(`Conditional dispatch: all ${checks} checks passed`);
