import assert from 'node:assert/strict';
import {checkpointActionSession} from '../dist/host/index.js';
import {fixture} from './fixtures/action-recovery.mjs';
const clone=value=>JSON.parse(JSON.stringify(value));
let passed=0,failed=0;
async function test(name,run){try{await run();passed++;console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+': '+error.message);}}
await test('same-session completion failure after receipt replays the durable success',async()=>{
   const f=fixture('ack-same-object');let e=f.engine();const actual=e.APPROVED_FUNCTIONS.jsfeCompleteAction;
   e.APPROVED_FUNCTIONS.jsfeCompleteAction=async args=>{await actual(args);throw new Error('callback interrupted after durable receipt');};
   let live=e.initSession('user','same-object','en');live=await e.updateActivity({role:'user',content:'create',start:{flow:'alpha-task'}},live);
   e=f.engine();const recovered=await e.updateActivity({role:'user',content:'what happened?'},live);
   assert.match(recovered.response,/I recovered a result/);assert.equal(recovered.cargo.projected.find(item=>item.label==='alpha').reference,'alpha-1');assert.match(recovered.response,/latest message was not processed; please send it again/);assert.deepEqual(f.effects,['alpha']);assert.equal(recovered.lastTurnRecovery.deferredInput.content,'what happened?');
});
await test('mixed completed and unresolved effects recover every unpresented outcome',async()=>{
   const f=fixture('ack-mixed');const base=f.port();let e=f.engine({...base,complete:args=>args.record.action==='beta'?Promise.reject(new Error('lost before beta completion')):base.complete(args)});
   const saved=e.initSession('user','mixed','en');await e.updateActivity({role:'user',content:'create both',start:{flow:'both-tasks'}},clone(saved));
   e=f.engine();const recovered=await e.updateActivity({role:'user',content:'NO'},clone(saved));
   assert.match(recovered.response,/alpha saved alpha-1/);assert.match(recovered.response,/beta unknown/);assert.deepEqual(f.effects,['alpha','beta']);assert.equal(recovered.lastTurnRecovery.deferredInput.content,'NO');
});
await test('nested performer presentation receives its own action result',async()=>{
   const f=fixture('ack-nested',{nested:true}),e=f.engine();const completed=await e.updateActivity({role:'user',content:'create',start:{flow:'alpha-task'}},e.initSession('user','nested','en'));
   assert.match(completed.response,/alpha saved alpha-1/);assert.match(completed.response,/beta saved beta-2/);assert.equal(completed.cargo.alphaAfter.reference,'alpha-1');assert.equal(completed.cargo.betaAfter.reference,'beta-2');
});
await test('recovery explicitly reports the deferred message in the session language',async()=>{
   const f=fixture('ack-deferred-es');let e=f.engine();const saved=e.initSession('user','deferred-es','es');
   await e.updateActivity({role:'user',content:'crear',start:{flow:'alpha-task'}},clone(saved));e=f.engine();
   const recovered=await e.updateActivity({role:'user',content:'cancela el servicio'},clone(saved));
   assert.match(recovered.response,/Su último mensaje no se procesó; envíelo de nuevo/);assert.doesNotMatch(recovered.response,/Your latest message/);assert.equal(recovered.lastTurnRecovery.deferredInput.content,'cancela el servicio');assert.deepEqual(f.effects,['alpha']);
});
await test('a completion-port timeout can recover its late durable result without another effect',async()=>{
   const f=fixture('ack-real-timeout',{completionTimeout:5}),base=f.port();let release,finished;
   const gate=new Promise(resolve=>{release=resolve;}),settled=new Promise(resolve=>{finished=resolve;});
   let e=f.engine({...base,complete:async args=>{await gate;try{return await base.complete(args);}finally{finished();}}});
   const origin=e.initSession('user-A','timeout-A','en');const live=await e.updateActivity({role:'user',content:'create',start:{flow:'alpha-task'}},origin);
   assert.match(live.response,/alpha unknown/);assert.deepEqual(f.effects,['alpha']);
   const waitingEngine=f.engine();const held=await waitingEngine.updateActivity({role:'user',content:'check while completion is pending'},live);assert.match(held.response,/I still could not confirm whether your earlier request completed/);assert.equal((held.cargo.projected || []).length,0);assert.deepEqual(f.effects,['alpha']);
   await checkpointActionSession(waitingEngine.actionJournal,held,held.cargo.actionJournalReceipts);assert.equal((await base.pending({sessionId:held.sessionId})).checkpoint,null);
   const other=e.initSession('user-B','timeout-B','en');await e.updateActivity({role:'assistant',content:'other conversation'},other);release();await settled;
   assert.equal(other.cargo.actionJournalReceipts,undefined);e=f.engine();const recovered=await e.updateActivity({role:'user',content:'what happened?'},held);
   assert.match(recovered.response,/I recovered a result/);assert.equal(recovered.cargo.projected.find(item=>item.label==='alpha').reference,'alpha-1');assert.deepEqual(f.effects,['alpha']);
});
await test('a late journal callback cannot attach its receipt to another active session',async()=>{
   const f=fixture('ack-late');const base=f.port();let release;const pending=new Promise(resolve=>{release=resolve;});const e=f.engine({...base,claim:async args=>{await pending;return base.claim(args);}});
   const origin=e.initSession('user-A','origin-A','en');origin.flowStacks=[[{flowId:'perform-action',flowStepsStack:[],inputStack:[],contextStack:[],variables:{}}]];e.sessionContext=origin;e.sessionId=origin.sessionId;e.cargo=origin.cargo;
   const callback=e.APPROVED_FUNCTIONS.jsfeClaimAction({record:{key:'origin-key',action:'alpha',scope:'alpha-scope',signature:'alpha-request'},action:{action:'alpha',effect:'write',outcomes:{saved:'resolved',unknown:'unresolved'}}});
   const other=e.initSession('user-B','other-B','en');await e.updateActivity({role:'assistant',content:'other conversation'},other);release();const late=await callback;
   assert.equal(other.cargo.actionJournalReceipts,undefined);assert.equal(late.receipt.key,'origin-key');assert.ok((await base.pending({sessionId:origin.sessionId})).records.some(record=>record.key==='origin-key'));
});
console.log(`action recovery acknowledgments: ${failed?failed+' FAILED':'all checks passed'} (${passed})`);if(failed)process.exitCode=1;
