/** Changed or unknown recovery contracts never resume/project/ACK old effects under a newer registry. */
import assert from 'node:assert/strict';
import {fixture} from './fixtures/action-recovery.mjs';
const clone=value=>JSON.parse(JSON.stringify(value));
let checks=0;const test=async(name,run)=>{await run();checks++;console.log('PASS '+name);};
for(const kind of ['changed_definitions','missing_identity','changed_runtime'])await test(kind+' holds without touching current task or acknowledging the pending result',async()=>{
 const f=fixture('compat-'+kind),base=f.port(),e=f.engine(),saved=e.initSession('user','compat-'+kind,'en');
 await e.updateActivity({role:'user',content:'create',start:{flow:'alpha-task'}},clone(saved));
 const pending=await base.pending({sessionId:saved.sessionId});assert.equal(pending.records.length,1);const key=pending.records[0].key;
 let journal=base;
 if(kind!=='changed_definitions')journal={...base,async pending(input){const result=await base.pending(input);for(const row of result.records){if(kind==='missing_identity')delete row.checkpoint.actionRecoveryIdentity;else row.checkpoint.actionRecoveryIdentity.runtime='sha256:'+'0'.repeat(64);}return result;}};
 const current=f.engine(journal);
 if(kind==='changed_definitions')current.flowsMenu.find(flow=>flow.id==='alpha-task').variables.projection.value.push({id:'future_projection',type:'SET',variable:'noop',value:'(cargo.newProjectorRan=true,true)'});
 const live=clone(saved);live.cargo={currentDraft:{owner:'current',amount:87}};const before=clone(live.cargo),stacks=clone(live.flowStacks);
 const held=await current.updateActivity({role:'user',content:'NO new request',start:{flow:'beta-task'}},live);
 assert.deepEqual(f.effects,['alpha']);assert.deepEqual(held.cargo,before);assert.deepEqual(held.flowStacks,stacks);
 assert.equal(held.lastTurnRecovery.hold,true);assert.equal(held.lastTurnRecovery.reason,'incompatible_recovery_identity');assert.equal(held.lastTurnRecovery.deferredInput.content,'NO new request');
 assert.match(held.response,/not repeated.*latest message/i);assert.equal(held.cargo.actionJournalApplied,undefined);assert.equal(held.cargo.actionJournalReceipts,undefined);
 assert.ok((await base.pending({sessionId:held.sessionId})).records.some(row=>row.key===key),'old result remains pending');
});
await test('compatible identity still restores a true crash and consumes only its original effect',async()=>{
 const f=fixture('compat-same'),e=f.engine(),saved=e.initSession('user','compat-same','en');await e.updateActivity({role:'user',content:'create',start:{flow:'alpha-task'}},clone(saved));
 const recovered=await f.engine().updateActivity({role:'user',content:'new message'},clone(saved));assert.deepEqual(f.effects,['alpha']);assert.equal(recovered.cargo.projected[0].reference,'alpha-1');assert.equal(recovered.lastTurnRecovery.hold,undefined);
});
await test('journal activation requires the recovery port instead of silently skipping preflight',async()=>{
 const f=fixture('compat-port'),base=f.port(),e=f.engine({...base,pending:undefined});const saved=e.initSession('user','compat-port','en');
 await assert.rejects(e.updateActivity({role:'user',content:'create',start:{flow:'alpha-task'}},saved),/requires pending/);assert.deepEqual(f.effects,[]);
});
console.log(`Recovery compatibility: all ${checks} checks passed`);
