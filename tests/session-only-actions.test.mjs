/** Session-only protection follows saved action state, never an engine-local memory journal. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,definePerformer,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
import {openFormInstance,acceptFormReadings} from '../dist/helpers/form-state.js';
import {prepareFormAction,beginFormAction,finishFormAction,confirmFormRevision,authorizeFormActionRetry} from '../dist/helpers/form-actions.js';
import {claimSessionAction,completeSessionAction} from '../dist/forms/session-actions.js';
const clone=value=>JSON.parse(JSON.stringify(value));
let checks=0;const test=async(name,run)=>{await run();checks++;console.log('PASS '+name);};
const action={action:'charge',effect:'charge',flow:'charge-effect',subject:'cargo.account',gate:{verified:'cargo.verified'},confirm:{exact:true,question:'Charge $25?',question_es:'¿Cobrar $25?'},outcomes:{paid:'resolved',unknown:'unresolved'}};
function state(){const cargo={account:'A',verified:true},id=openFormInstance(cargo,'pay',[{name:'amount',profile:{kind:'amount'}}]);acceptFormReadings(cargo,[{form:id,name:'amount',value:'25',ok:true}]);const record=prepareFormAction(cargo,id,action,{account:'A',amount:25});return {cargo,id,record};}
await test('session transport cannot execute an unconfirmed or foreign request',()=>{
 const {cargo,id,record}=state();assert.equal(beginFormAction(cargo,id,action,record),false);assert.equal(claimSessionAction(cargo,record,action).status,'hold');
 confirmFormRevision(cargo,id);assert.equal(beginFormAction(cargo,id,action,record),true);
 assert.throws(()=>claimSessionAction(cargo,{...record,key:'foreign'},action),/ownership/);
 assert.throws(()=>claimSessionAction(cargo,{...record,request:{amount:99}},action),/ownership/);
 assert.equal(claimSessionAction(cargo,record,action).status,'execute');assert.equal(claimSessionAction(cargo,record,action).status,'hold');
 assert.equal(beginFormAction(cargo,id,action,record),false);
});
await test('a claimed attempt survives serialization and is never blindly executed again',()=>{
 let {cargo,id,record}=state();confirmFormRevision(cargo,id);beginFormAction(cargo,id,action,record);claimSessionAction(cargo,record,action);
 cargo=clone(cargo);record=prepareFormAction(cargo,id,action,{account:'A',amount:25});
 assert.equal(beginFormAction(cargo,id,action,record),false);assert.equal(claimSessionAction(cargo,record,action).status,'hold');
 const reply=completeSessionAction(cargo,record,action,{status:'paid',reference:'R1'});assert.equal(reply.receipt,undefined);
 assert.deepEqual(completeSessionAction(cargo,record,action,{status:'paid',reference:'R2'}).outcome,reply.outcome);
 // The port cached the result, but the flow disappeared before finishFormAction. Reentry replays the outcome.
 cargo=clone(cargo);record=prepareFormAction(cargo,id,action,{account:'A',amount:25});const replay=claimSessionAction(cargo,record,action);assert.equal(replay.status,'replay');assert.equal(replay.outcome.reference,'R1');
 finishFormAction(cargo,id,action,replay.outcome);assert.equal(beginFormAction(cargo,id,action,record),false);
 assert.equal(cargo.actionJournalReceipts,undefined);assert.equal(record.durableKey,undefined);
});
await test('unknown charge blocks changed requests and form replacement within the saved session',()=>{
 let {cargo,id,record}=state();confirmFormRevision(cargo,id);beginFormAction(cargo,id,action,record);claimSessionAction(cargo,record,action);
 const reply=completeSessionAction(cargo,record,action,null);assert.equal(reply.outcome.status,'unknown');finishFormAction(cargo,id,action,reply.outcome);
 cargo=clone(cargo);acceptFormReadings(cargo,[{form:id,name:'amount',value:'30',ok:true}]);
 let held=prepareFormAction(cargo,id,action,{account:'A',amount:30});assert.equal(held.key,record.key);confirmFormRevision(cargo,id);assert.equal(beginFormAction(cargo,id,action,held),false);
 delete cargo.forms[id];const other=openFormInstance(cargo,'new-pay',[]);held=prepareFormAction(cargo,other,action,{account:'A',amount:30});confirmFormRevision(cargo,other);assert.equal(held.key,record.key);assert.equal(beginFormAction(cargo,other,action,held),false);
});
await test('corrections and authentication expiry retain existing exact-action guards',()=>{
 const {cargo,id,record}=state();confirmFormRevision(cargo,id);acceptFormReadings(cargo,[{form:id,name:'amount',value:'30',ok:true}]);let revised=prepareFormAction(cargo,id,action,{account:'A',amount:30});assert.equal(beginFormAction(cargo,id,action,revised),false);
 confirmFormRevision(cargo,id);cargo.verified=false;assert.equal(beginFormAction(cargo,id,action,revised),false);cargo.verified=true;cargo.account='B';assert.equal(beginFormAction(cargo,id,action,revised),false);assert.equal(record.status,'prepared');
});
await test('unknown SEND retries require a declared policy and fresh accepted consent',()=>{
 const cargo={account:'A',verified:true},id=openFormInstance(cargo,'send',[{name:'retry',profile:{kind:'choice',choices:[{key:'yes',words:['yes']}]}}]);
 const send={...action,action:'send',effect:'send',retry:{unknown:'explicit'},outcomes:{sent:'resolved',unknown:'unresolved'}};
 acceptFormReadings(cargo,[{form:id,name:'retry',value:'yes',ok:true}]);let record=prepareFormAction(cargo,id,send,{to:'one'});confirmFormRevision(cargo,id);assert.equal(beginFormAction(cargo,id,send,record),true);claimSessionAction(cargo,record,send);finishFormAction(cargo,id,send,completeSessionAction(cargo,record,send,{status:'unknown'}).outcome);
 assert.throws(()=>authorizeFormActionRetry(cargo,id,action,{input:'retry',value:'yes'}),/does not allow/);
 assert.throws(()=>authorizeFormActionRetry(cargo,id,send,{input:'missing',value:'yes'}),/accepted recovery choice/);
 const firstKey=record.key;assert.equal(authorizeFormActionRetry(cargo,id,send,{input:'retry',value:'yes'}),true);
 record=prepareFormAction(cargo,id,send,{to:'one'});assert.notEqual(record.key,firstKey);assert.equal(record.sessionClaimed,undefined);confirmFormRevision(cargo,id);assert.equal(beginFormAction(cargo,id,send,record),true);assert.equal(claimSessionAction(cargo,record,send).status,'execute');finishFormAction(cargo,id,send,completeSessionAction(cargo,record,send,{status:'unknown'}).outcome);
 assert.throws(()=>authorizeFormActionRetry(cargo,id,send,{input:'retry',value:'yes'}),/already consumed/);
});
const quiet={debug(){},info(){},warn(){},error(){}};
function fixture(){const effects=[];let outcome={status:'paid',reference:'P1'};
 const performer=definePerformer({id:'pay',name:'Pay',description:'Charge a confirmed payment',inputs:[],contract:{summary:'Charge once per confirmed request'},performs:[action],prepare:'prepare',present:'present'});
 const workers=[{id:'prepare',name:'Prepare',steps:[{id:'request',type:'SET',variable:'noop',value:"(cargo.actionRequest={account:cargo.account,amount:25},true)"}]},
 {id:'charge-effect',name:'ChargeEffect',parameters:[{name:'request',type:'object'}],steps:[{id:'charge',type:'CALL-TOOL',tool:'charge',variable:'reply',args:{request:'{{request}}'},onFail:{id:'failure',type:'SET',variable:'reply',value:"({status:'unknown'})"}},{id:'result',type:'SET',variable:'noop',value:'(cargo.actionOutcome=reply,true)'}]},
 {id:'present',name:'Present',parameters:[{name:'result',type:'object'}],steps:[{id:'say-result',type:'SAY',value:'{{result.status}} {{result.reference || ""}}'},{id:'receipt',type:'SAY-GET',value:'Receipt?',variable:'answer'}]}].map(f=>({version:'1',description:f.name,scope:'isolated',...f}));
 const tools=[{id:'charge',name:'charge',description:'Hermetic payment',parameters:{type:'object',properties:{request:{type:'object'}}},implementation:{type:'local',function:'charge',retries:0}}];
 function engine(mode='session-only'){const e=new WorkflowEngine(quiet,async()=>'{"flowName":"None"}',linkFormSchemas([...FLOWS,performer,...workers]),tools,{...STANDARD_FUNCTIONS,charge:async({request})=>{effects.push(clone(request));return clone(outcome);}},{},false,'en');e.disableCommands();e.actionPersistence=mode;return e;}
 function session(e){const s=e.initSession('user',crypto.randomUUID(),'en');Object.assign(s.cargo,{account:'A',verified:true});return s;}
 return {engine,session,effects,setOutcome(value){outcome=value;}};
}
await test('real native execution defaults to durable and fails closed without a journal',async()=>{
 const f=fixture(),e=f.engine('durable');let s=f.session(e);s=await e.updateActivity({role:'user',content:'pay',start:{flow:'pay'}},s);assert.match(s.response,/Charge/);s=await e.updateActivity({role:'user',content:'yes'},clone(s));assert.equal(f.effects.length,0);assert.match(s.response,/unknown/);assert.equal(e.actionJournal,undefined);
});
await test('real session-only performer requires confirmation, executes once and replays saved completion',async()=>{
 const f=fixture();let e=f.engine(),s=f.session(e);s=await e.updateActivity({role:'user',content:'pay',start:{flow:'pay'}},s);assert.match(s.response,/Charge/);assert.equal(f.effects.length,0);
 s=await e.updateActivity({role:'user',content:'yes'},clone(s));assert.match(s.response,/paid P1/);assert.equal(f.effects.length,1);assert.equal(s.actionPersistence,'session-only');assert.equal(s.cargo.actionJournalReceipts,undefined);assert.equal(e.actionJournal,undefined);
 e=f.engine();s=await e.updateActivity({role:'user',content:'again',start:{flow:'pay'}},clone(s));assert.equal(f.effects.length,1);
 s=await e.updateActivity({role:'user',content:'yes'},clone(s));assert.equal(f.effects.length,1);
 // Once that task closes, an explicitly new confirmed task may intentionally execute again.
 s=await e.updateActivity({role:'user',content:'new payment',start:{flow:'pay'}},clone(s));assert.match(s.response,/Charge/);assert.equal(f.effects.length,1);
 s=await e.updateActivity({role:'user',content:'yes'},clone(s));assert.equal(f.effects.length,2);
});
await test('real saved unknown outcome never retries a charge on reentry or renewed YES',async()=>{
 const f=fixture();f.setOutcome({status:'unknown'});let e=f.engine(),s=f.session(e);s=await e.updateActivity({role:'user',content:'pay',start:{flow:'pay'}},s);s=await e.updateActivity({role:'user',content:'yes'},clone(s));assert.match(s.response,/unknown/);assert.equal(f.effects.length,1);
 e=f.engine();s=await e.updateActivity({role:'user',content:'again',start:{flow:'pay'}},clone(s));s=await e.updateActivity({role:'user',content:'yes'},clone(s));assert.equal(f.effects.length,1);
 s=await e.updateActivity({role:'user',content:'new payment',start:{flow:'pay'}},clone(s));
 s=await e.updateActivity({role:'user',content:'yes'},clone(s));assert.equal(f.effects.length,1);assert.match(s.response,/unknown/);
});
await test('mode cannot change within a saved conversation or abandon durable recovery metadata',async()=>{
 const f=fixture(),e=f.engine();const durable=f.engine('durable');let s=f.session(e);
 await assert.rejects(durable.updateActivity({role:'user',content:'pay',start:{flow:'pay'}},clone(s)),/persistence cannot change/);
 s=f.session(durable);s.actionPersistence='durable';await assert.rejects(e.updateActivity({role:'user',content:'pay',start:{flow:'pay'}},s),/persistence cannot change/);
 for(const cargo of [{actionJournalReceipts:['old']},{actionJournalSequence:1}]){s=f.session(e);delete s.actionPersistence;Object.assign(s.cargo,cargo);await assert.rejects(e.updateActivity({role:'user',content:'pay',start:{flow:'pay'}},s),/durable/);}
 assert.throws(()=>{e.actionPersistence='bogus';},/actionPersistence/);e.actionJournal={};await assert.rejects(e.updateActivity({role:'user',content:'pay'},f.session(e)),/cannot attach/);assert.equal(f.effects.length,0);
});
await test('lost session save intentionally provides no cross-invocation deduplication guarantee',async()=>{
 const f=fixture();let e=f.engine(),s=f.session(e);s=await e.updateActivity({role:'user',content:'pay',start:{flow:'pay'}},s);const beforeCharge=clone(s);
 await e.updateActivity({role:'user',content:'yes'},clone(beforeCharge));assert.equal(f.effects.length,1);
 e=f.engine();await e.updateActivity({role:'user',content:'yes'},clone(beforeCharge));assert.equal(f.effects.length,2,'unsaved successful effect is outside session-only protection');
});
console.log(`Session-only actions: all ${checks} checks passed`);
