/** Actual serialized inline steps are retired before their awaited answer or old action can execute. */
import assert from 'node:assert/strict';
import {WorkflowEngine,continuationSafetyProtocol} from '../dist/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
import {openFormInstance} from '../dist/helpers/form-state.js';
import {withSafetyRevision} from '../dist/forms/index.js';
import {assertFlowHostCapabilities} from '../dist/host/capabilities.js';
const clone=x=>JSON.parse(JSON.stringify(x)), quiet={debug(){},info(){},warn(){},error(){}};
const base={id:'request',name:'Request',version:'1',description:'test request',variables:{answer:{type:'string',scope:'flow',value:''}},steps:[{id:'ask',type:'SAY-GET',variable:'answer',value:'Confirm?',value_es:'¿Confirma?'},{id:'effect',type:'SET',variable:'done',value:'(cargo.effects=(cargo.effects||0)+1,true)'},{id:'finish',type:'RETURN',value:"'done'"}]};
const make=flows=>{const e=new WorkflowEngine(quiet,async()=>'{"flowName":"None"}',flows,[],{...STANDARD_FUNCTIONS}, {},false,'en');e.disableCommands();return e;};
const begin=async(flow=base,es=false)=>{const e=make([flow]),s=e.initSession('synthetic','revision-'+Math.random(),es?'es':'en');return clone(await e.updateActivity({role:'user',content:'start',start:{flow:flow.id}},s));};
let checks=0;
assert.equal(continuationSafetyProtocol(),1);assert.equal(assertFlowHostCapabilities([withSafetyRevision(base,'new')]),true);checks++;
for(const es of [false,true])for(const previous of [base,withSafetyRevision(base,'old')]){
 const saved=await begin(previous,es);saved.cargo.identity={verified:true};saved.globalAccumulatedMessages=['OLD CONFIRMED MESSAGE'];
 const original=clone(saved.flowStacks[0][0]);assert(original.pendingVariable);assert(original.flowStepsStack.some(s=>s.id==='effect'));
 const next=make([withSafetyRevision(base,'new')]);let s=await next.updateActivity({role:'user',content:es?'sí':'yes',start:{flow:'request'}},saved);
 assert.equal(s.cargo.effects,undefined);assert.deepEqual(s.cargo.identity,{verified:true});assert.equal(s.flowStacks.flat().length,0);assert.equal(s.lastFlowOutcome.reason,'obsolete_continuation');assert.match(s.response,es?/ni he procesado/i:/not.*processed/i);assert.doesNotMatch(s.response,/OLD CONFIRMED/);assert.equal(next.hostStart,null);assert.equal(next.pendingDispatchFrom,null);
 s=await next.updateActivity({role:'user',content:'new request',start:{flow:'request'}},clone(s));assert.match(s.response,/Confirm|Confirma/);assert.equal(s.cargo.effects,undefined);assert.equal(s.flowStacks.flat()[0].safetyRevision,'new');
 s=await next.updateActivity({role:'user',content:'yes'},clone(s));assert.equal(s.cargo.effects,1);checks++;
}
for(const changed of [false,true]){
 const flow=changed?withSafetyRevision(base,'same'):base,saved=await begin(flow),next=make([flow]);const s=await next.updateActivity({role:'user',content:'yes'},saved);assert.equal(s.cargo.effects,1);checks++;
}
// Stale accepted task confirmation is destroyed, not handed to the new definition.
{
 const saved=await begin();const id=openFormInstance(saved.cargo,'request',[]);saved.cargo.formTasks={request:id};saved.cargo.forms[id].values={consent:true};saved.cargo.forms[id].confirmation={revision:0};
 const s=await make([withSafetyRevision(base,'new')]).updateActivity({role:'user',content:'yes'},saved);
 assert.equal(s.cargo.forms[id],undefined);assert.equal(s.cargo.formTasks.request,undefined);assert.equal(s.cargo.effects,undefined);checks++;
}
// A completed owner's unknown optional descendant remains blocked; unrelated safely retired roots cannot hide it.
for(const source of ['descendant','journal','legacy','paymentHolds']){
 const saved=await begin();saved.cargo.contact_info='Call 877-555-0100';
 const id=openFormInstance(saved.cargo,'request',[]);saved.cargo.formTasks={request:id};saved.cargo.forms[id].primary_outcome={outcome:'resolved'};
 if(source==='descendant'){const child=openFormInstance(saved.cargo,'send',[],{parent:id,input:'optional'});saved.cargo.forms[child].actions={send:{status:'unknown',key:'send-1'}};}
 if(source==='journal')saved.cargo.actionJournal={send:{status:'attempted',key:'send-1'}};
 if(source==='legacy')saved.cargo.chargeUnknownAt=123;
 if(source==='paymentHolds')saved.cargo.paymentHolds={charge:{reason:'unknown',at:123}};
 const before=clone(saved.cargo),next=make([withSafetyRevision(base,'new')]);let s=await next.updateActivity({role:'user',content:'yes'},saved);
 assert.equal(s.cargo.effects,undefined);assert(s.continuationSafetyHold);assert.match(s.response,/outside this conversation/);assert.match(s.response,/877-555-0100/);
 if(source==='descendant'){assert.deepEqual(s.cargo.forms[id].values,before.forms[id].values);assert.equal(s.cargo.forms[id].confirmation,null);assert.equal(s.cargo.formTasks.request,undefined);assert.equal(s.cargo.forms[id].continuationRetired,true);assert.deepEqual(s.cargo.forms[s.cargo.forms[id].children.optional].actions,{send:{status:'unknown',key:'send-1'}});}else if(source==='journal')assert.deepEqual(s.cargo.actionJournal,before.actionJournal);else assert.deepEqual(s.cargo[source==='legacy'?'chargeUnknownAt':'paymentHolds'],before[source==='legacy'?'chargeUnknownAt':'paymentHolds']);
 s=await next.updateActivity({role:'user',content:'new request',start:{flow:'request'}},clone(s));assert.equal(s.cargo.effects,undefined);assert.equal(s.flowStacks.flat().length,0);assert(s.continuationSafetyHold);checks++;
}
// An opted-in suspended ancestor must invalidate even when the currently waiting worker did not opt in.
{
 const worker={...base,id:'worker',name:'Worker'},root={...base,steps:[{id:'call',type:'FLOW',value:'worker'}]};const e=make([root,worker]);let s=clone(await e.updateActivity({role:'user',content:'start',start:{flow:'request'}},e.initSession('synthetic','nested','en')));assert.equal(s.flowStacks[0].length,2);
 s=await make([withSafetyRevision(root,'new'),worker]).updateActivity({role:'user',content:'yes'},s);assert.equal(s.cargo.effects,undefined);assert.equal(s.lastFlowOutcome.reason,'obsolete_continuation');checks++;
}
// Yielded tasks have no active frame; their session definition snapshot still guards old schemas/consent.
for(const prior of [undefined,'old','new']){
 const saved=await begin();saved.flowStacks=[[]];const id=openFormInstance(saved.cargo,'request',[]);saved.cargo.formTasks={request:id};saved.cargo.forms[id].confirmation={revision:0};saved.cargo.forms[id].values={consent:true};
 if(prior)saved.continuationSafetyRevisions={request:prior};else delete saved.continuationSafetyRevisions;
 const next=make([withSafetyRevision(base,'new')]);const s=await next.updateActivity({role:'user',content:'new request',start:{flow:'request'}},saved);
 if(prior==='new'){assert(s.cargo.forms[id]);assert.match(s.response,/Confirm/);}else{assert.equal(s.cargo.forms[id],undefined);assert.equal(s.cargo.formTasks.request,undefined);assert.equal(s.lastFlowOutcome.reason,'obsolete_continuation');}
 assert.equal(s.cargo.effects,undefined);checks++;
}
// Removing an opt-in or the current definition cannot silently revive a yielded old task.
for(const definitions of [[base],[]]){
 const old=make([withSafetyRevision(base,'old')]),saved=old.initSession('synthetic','yielded-removal','en');
 const id=openFormInstance(saved.cargo,'request',[]);saved.cargo.formTasks={request:id};saved.cargo.forms[id].values={consent:true};saved.cargo.forms[id].confirmation={revision:0};
 const s=await make(definitions).updateActivity({role:'user',content:'yes'},clone(saved));
 assert.equal(s.cargo.forms[id],undefined);assert.equal(s.cargo.formTasks.request,undefined);assert.equal(s.cargo.effects,undefined);assert.equal(s.lastFlowOutcome.reason,'obsolete_continuation');checks++;
}
for(const invalid of ['',null,1,' invalid ']){assert.throws(()=>make([{...base,safetyRevision:invalid}]),/Invalid safetyRevision/);checks++;}
// A standalone engine without the protocol helper cannot activate a revised definition.
{
 const guarded=withSafetyRevision(base,'new'),without=make([guarded]);delete without.functionsRegistry?.continuationSafetyProtocol;
 // Directly exclude the helper from the constructor approval list, matching an older host.
 const oldHost=new WorkflowEngine(quiet,async()=>'{"flowName":"None"}',[guarded],[],{}, {},false,'en');oldHost.disableCommands();
 await assert.rejects(()=>oldHost.updateActivity({role:'user',content:'start',start:{flow:'request'}},oldHost.initSession('synthetic','unsupported','en')),/continuationSafetyProtocol|required true|requireTrue|expression|SET/i);checks++;
}
console.log(`continuation-safety: ${checks} checks passed`);
