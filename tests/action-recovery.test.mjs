import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,definePerformer,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
import {createActionJournal,createMemoryActionStorage,checkpointActionSession,actionSessionSnapshot} from '../dist/host/index.js';
let effects=0,checks=0;
const S=(id,variable,value)=>({id,type:'SET',variable,value});
const performer=definePerformer({id:'crash-task',name:'CrashTask',description:'Recover a newly created task',inputs:[],
   performs:[{action:'write',effect:'write',flow:'effect',outcomes:{saved:'resolved',unknown:'unresolved'}}],
   prepare:'prepare',present:'present',contract:{summary:'crash task'}});
const workers=[
   {id:'prepare',name:'Prepare',steps:[S('prepare-request','noop',"(cargo.actionRequest={item:'one'},true)")]},
   {id:'effect',name:'Effect',steps:[{id:'effect-call',type:'CALL-TOOL',tool:'write',variable:'outcome',args:{},onFail:S('unknown','outcome',"({status:'unknown'})")},S('record-outcome','noop','(cargo.actionOutcome=outcome,cargo.businessProjection={reference:outcome.reference},true)')]},
   {id:'present',name:'Present',steps:[{id:'present-outcome',type:'SAY',value:'{{cargo.actionResult.status}} {{cargo.businessProjection ? cargo.businessProjection.reference : ""}}'}]},
].map(f=>({version:'1',description:f.name,scope:'isolated',...f}));
const tools=[{id:'write',name:'write',description:'test effect',parameters:{type:'object',properties:{}},implementation:{type:'local',function:'write',retries:0}}];
const quiet={debug(){},info(){},warn(){},error(){}};
function engine(journal){const e=new WorkflowEngine(quiet,async()=>'{"flowName":"None"}',linkFormSchemas([...FLOWS,performer,...workers]),tools,{...STANDARD_FUNCTIONS,write:async()=>{effects++;return {status:'saved',reference:'R-'+effects};}},{},false,'en');e.disableCommands();e.actionJournal=journal;return e;}
const store=createMemoryActionStorage();const port=()=>createActionJournal({storage:store,namespace:'recovery-test'});
let e=engine(port()),saved=e.initSession('user','recover-complete','en');
const clone=v=>JSON.parse(JSON.stringify(v));
let completed=await e.updateActivity({role:'user',content:'create',start:{flow:'crash-task'}},clone(saved));
assert.match(completed.response,/saved R-1/);checks++;
// Simulate lost session save: start with the old, completely empty host session.
e=engine(port());let recovered=await e.updateActivity({role:'user',content:'NO'},clone(saved));
assert.match(recovered.response,/saved R-1/);assert.equal(effects,1);checks++;
assert.equal(recovered.cargo.businessProjection.reference,'R-1');checks++;
assert.equal(recovered.lastTurnRecovery.deferredInput.content,'NO');checks++;
assert.equal(recovered.flowStacks.flat().length,0);checks++;
const snapshot=actionSessionSnapshot(recovered);assert.ok(snapshot.session.cargo.actionJournalReceipts.length);checks++;
await checkpointActionSession(e.actionJournal,recovered,snapshot.keys);assert.equal((await e.actionJournal.pending({sessionId:saved.sessionId})).checkpoint,null);checks++;
// Claim succeeds but process disappears before completion: no second external write.
const stalledStore=createMemoryActionStorage(),base=createActionJournal({storage:stalledStore,namespace:'stalled'});
e=engine({...base,complete:async()=>{throw new Error('lost process after write');}});
saved=e.initSession('user','recover-unknown','en');
await e.updateActivity({role:'user',content:'create',start:{flow:'crash-task'}},clone(saved));
assert.equal(effects,2);checks++;
e=engine(createActionJournal({storage:stalledStore,namespace:'stalled'}));
recovered=await e.updateActivity({role:'user',content:'create again',start:{flow:'crash-task'}},clone(saved));
assert.match(recovered.response,/unknown/);assert.equal(effects,2);checks++;
await checkpointActionSession(e.actionJournal,recovered,recovered.cargo.actionJournalReceipts);
assert.equal((await e.actionJournal.pending({sessionId:saved.sessionId})).checkpoint,null);checks++;
const r=await e.updateActivity({role:'user',content:'again',start:{flow:'crash-task'}},clone(recovered));
assert.match(r.response,/unknown/);assert.equal(effects,2);checks++;
console.log(`action-recovery: all ${checks} checks passed`);
