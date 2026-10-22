/** Author-facing state explanations must use existing guards and never invent execution history. */
import assert from 'node:assert/strict';
import {explainSession} from '../dist/forms/index.js';
import {openFormInstance,acceptFormReadings} from '../dist/helpers/form-state.js';
import {prepareFormAction,confirmFormRevision} from '../dist/helpers/form-actions.js';
const flows=[{id:'make-payment',name:'MakePayment',variables:{contract:{value:{role:'performer'}}}},{id:'account-info',name:'AccountInfo',variables:{contract:{value:{role:'provider'}}}}];
const action={action:'charge',subject:'form.data.account',confirm:{exact:true},outcomes:{ok:'resolved',unknown:'unresolved'}};
const clone=structuredClone;
function fixture(){
 const session={cargo:{},flowStacks:[]};
 const id=openFormInstance(session.cargo,'make-payment',[{name:'amount',profile:{kind:'amount'},question:'Amount?'},{name:'zip',profile:{kind:'digits',min:5,max:5},question:'ZIP?'}]);
 session.cargo.forms[id].data.account='50000123';
 session.flowStacks=[[{flowId:'make-payment',variables:{form_instance:id},flowStepsStack:[{id:'ask',type:'SAY-GET'}]}]];
 return {session,id,state:session.cargo.forms[id]};
}
let checks=0;const test=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
test('missing field, component and source come from the actual form state',()=>{
 const t=fixture();const result=explainSession(t.session,{flows});assert.equal(result.status,'collecting');assert.ok(result.entries.some(e=>e.kind==='input_missing'&&e.input==='amount'&&e.component==='Performer'&&e.flowId==='make-payment'));assert.ok(result.entries.some(e=>e.step==='ask'));
});
test('inspection and a snapshot diff cannot mutate state or expose collected values',()=>{
 const t=fixture();const before=clone(t.session);acceptFormReadings(t.session.cargo,[{form:t.id,name:'amount',value:'55.25',ok:true},{form:t.id,name:'zip',value:'90210',ok:true}]);const current=clone(t.session);const result=explainSession(t.session,{flows,previous:before});assert.deepEqual(t.session,current);assert.deepEqual(before.cargo.forms[t.id].values,{});assert.deepEqual(result.entries.filter(e=>e.kind==='input_changed').map(e=>e.input),['amount','zip']);assert.doesNotMatch(JSON.stringify(result),/55\.25|90210|50000123/);
});
test('a prepared proposal needs current confirmation and is never reported as permission to execute',()=>{
 const t=fixture();acceptFormReadings(t.session.cargo,[{form:t.id,name:'amount',value:'55',ok:true},{form:t.id,name:'zip',value:'90210',ok:true}]);prepareFormAction(t.session.cargo,t.id,action,{amount:'55'});assert.equal(explainSession(t.session,{flows}).status,'confirmation');confirmFormRevision(t.session.cargo,t.id);const confirmed=explainSession(t.session,{flows});assert.ok(confirmed.entries.some(e=>e.kind==='confirmation_recorded'));assert.doesNotMatch(JSON.stringify(confirmed),/safe to charge|authorized to execute/);
});
test('changing a confirmed field explains the invalidation without recording an invented old value',()=>{
 const t=fixture();acceptFormReadings(t.session.cargo,[{form:t.id,name:'amount',value:'55',ok:true},{form:t.id,name:'zip',value:'90210',ok:true}]);prepareFormAction(t.session.cargo,t.id,action,{amount:'55'});confirmFormRevision(t.session.cargo,t.id);const before=clone(t.session);acceptFormReadings(t.session.cargo,[{form:t.id,name:'amount',value:'60',ok:true}]);const result=explainSession(t.session,{flows,previous:before});assert.ok(result.entries.some(e=>e.kind==='confirmation_invalidated'));assert.doesNotMatch(JSON.stringify(result),/"55"|"60"/);
});
test('unknown and attempted actions take precedence over a contradictory recorded confirmation',()=>{
 for(const status of ['unknown','attempted']){
  const t=fixture();t.state.actions={charge:{key:'held',status}};t.state.confirmation={revision:t.state.revision};const result=explainSession(t.session,{flows});assert.equal(result.status,'held');assert.ok(result.entries.some(e=>e.kind==='action_held'));assert.ok(result.entries.some(e=>e.kind==='confirmation_stale'));
 }
});
test('a saved journal hold remains visible without forms or active frames',()=>{
 const result=explainSession({cargo:{actionJournal:{held:{key:'a',status:'unknown'}}},flowStacks:[],lastTurnDispatch:{fromFlow:'MakePayment',matchedFlow:null}},{flows});assert.equal(result.status,'held');assert.ok(result.entries.some(e=>e.kind==='handoff'));assert.equal(result.entries.filter(e=>e.kind==='action_held').length,1);
});
test('duplicate references to the same action do not create duplicate explanations',()=>{
 const t=fixture();const record={key:'same',status:'unknown'};t.state.actions={charge:record};t.session.cargo.actionJournal={same:clone(record)};assert.equal(explainSession(t.session,{flows}).entries.filter(e=>e.kind==='action_held').length,1);
});
test('same-key journal/form contradictions preserve a single hold in both traversal orderings',()=>{
 for(const [formStatus,journalStatus] of [['completed','unknown'],['unknown','completed']]){
  const t=fixture();t.state.proposal={key:'same-action',status:'completed'};t.state.actions={charge:{key:'same-action',status:formStatus}};t.session.cargo.actionJournal={same:{key:'same-action',status:journalStatus}};
  const before=clone(t.session),result=explainSession(t.session,{flows});assert.equal(result.status,'held');assert.equal(result.entries.filter(e=>e.kind==='action_held').length,1);assert.equal(result.entries.filter(e=>e.kind==='action_completed').length,0);assert.deepEqual(t.session,before);
 }
});
test('contradictory completed/unknown evidence remains held and a proposal-only hold is visible',()=>{
 const t=fixture();t.state.proposal={key:'unknown-result',status:'completed',result:{status:'unknown'}};assert.equal(explainSession(t.session,{flows}).status,'held');
});
test('a fresh confirmation between snapshots is not described as still needing fresh consent',()=>{
 const t=fixture();acceptFormReadings(t.session.cargo,[{form:t.id,name:'amount',value:'55',ok:true},{form:t.id,name:'zip',value:'90210',ok:true}]);prepareFormAction(t.session.cargo,t.id,action,{amount:'55'});confirmFormRevision(t.session.cargo,t.id);const previous=clone(t.session);acceptFormReadings(t.session.cargo,[{form:t.id,name:'amount',value:'60',ok:true}]);prepareFormAction(t.session.cargo,t.id,action,{amount:'60'});confirmFormRevision(t.session.cargo,t.id);const result=explainSession(t.session,{flows,previous});assert.ok(result.entries.some(e=>e.kind==='confirmation_changed'));assert.ok(!result.entries.some(e=>e.kind==='confirmation_invalidated'||e.kind==='confirmation_needed'));
});
test('an empty stack is idle, not evidence of completion or no action attempted',()=>{
 const result=explainSession({cargo:{},flowStacks:[]},{flows});assert.equal(result.status,'idle');assert.deepEqual(result.entries,[]);
});
test('unmatched DISPATCH explains handoff while preserving the saved incomplete form',()=>{
 const t=fixture();t.session.flowStacks=[];t.session.lastTurnDispatch={fromFlow:'MakePayment',matchedFlow:null};const result=explainSession(t.session,{flows});assert.equal(result.status,'handed_off');assert.ok(result.entries.some(e=>e.kind==='input_missing'&&e.active===false));assert.ok(result.entries.some(e=>e.kind==='handoff'&&e.flowId==='make-payment'));
});
test('a missing registry never invents the component and malformed state stays unknown',()=>{
 const t=fixture();assert.equal(explainSession(t.session).entries[0].component,'Unknown');t.state.values=null;assert.equal(explainSession(t.session,{flows}).status,'unknown');assert.throws(()=>explainSession(null),/snapshot/);
});
test('provider execution is identified through its existing declaration',()=>{
 const result=explainSession({cargo:{},flowStacks:[[{flowId:'account-info',variables:{},flowStepsStack:[{id:'account_load'}]}]]},{flows});assert.equal(result.status,'active');assert.equal(result.entries[0].component,'Provider');assert.equal(result.entries[0].step,'account_load');
});
test('nested worker execution keeps the nearest author component and the precise worker location',()=>{
 const helper={id:'load',variables:{contract:{value:{role:'worker'}}}};
 const result=explainSession({cargo:{},flowStacks:[[{flowId:'account-info',variables:{},flowStepsStack:[]},{flowId:'load',variables:{},flowStepsStack:[{id:'lookup'}]}]]},{flows:[...flows,helper]});
 const location=result.entries.find(e=>e.kind==='current_step');assert.equal(location.component,'Provider');assert.equal(location.flowId,'account-info');assert.equal(location.workerFlowId,'load');assert.equal(location.step,'lookup');
});
console.log(`Session inspection: all ${checks} checks passed`);
