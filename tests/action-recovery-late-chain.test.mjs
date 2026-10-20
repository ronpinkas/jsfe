/** Independent continuation-order regression: a late durable write never rewinds an acknowledged caller tail. */
import assert from 'node:assert/strict';
import {fixture} from './fixtures/action-recovery.mjs';
import {checkpointActionSession,retainRecoveryState} from '../dist/host/index.js';
import {definePerformer,validateFlowContracts} from '../dist/forms/index.js';
const clone=value=>JSON.parse(JSON.stringify(value));
let checks=0;
async function test(name,run){await run();checks++;console.log('PASS '+name);}
await test('late first completion projects onto current state without repeating the acknowledged second write',async()=>{
   const f=fixture('late-first-chain',{completionTimeout:5}),base=f.port();let release,finished;
   const gate=new Promise(resolve=>release=resolve),settled=new Promise(resolve=>finished=resolve);
   let e=f.engine({...base,complete:async args=>{if(args.record.action==='alpha'){await gate;try{return await base.complete(args);}finally{finished();}}return base.complete(args);}});
   let live=await e.updateActivity({role:'user',content:'create both',start:{flow:'both-and-wait'}},e.initSession('user','late-first-chain','en'));
   assert.deepEqual(f.effects,['alpha','beta']);assert.match(live.response,/alpha unknown/);assert.match(live.response,/beta saved beta-2/);
   assert.equal(live.cargo.projected.length,1);
   const suspended=clone(live.flowStacks);live.cargo.currentDraft={owner:'current',amount:17};
   await checkpointActionSession(base,live,live.cargo.actionJournalReceipts);
   release();await settled;
   e=f.engine();live=await e.updateActivity({role:'user',content:'unrelated new information'},live);
   assert.deepEqual(f.effects,['alpha','beta']);assert.deepEqual(live.cargo.currentDraft,{owner:'current',amount:17});assert.deepEqual(clone(live.flowStacks),suspended);
   assert.deepEqual(live.cargo.projected.map(item=>item.reference).sort(),['alpha-1','beta-2']);
   assert.equal(live.cargo.alphaAfter.status,'unknown','caller after hook is not replayed');
   assert.equal(live.cargo.betaAfter.reference,'beta-2');
   assert.match(live.response,/I recovered a result/);assert.equal(live.lastTurnRecovery.deferredInput.content,'unrelated new information');
   const alpha=(await base.pending({sessionId:live.sessionId})).records.find(row=>row.action==='alpha');
   assert.equal(live.cargo.actionJournalApplied[alpha.key],alpha.sequence);
   assert.ok(!Object.values(live.cargo.actionJournal || {}).some(record=>(record.durableKey || record.key)===alpha.key));
   await checkpointActionSession(base,live,live.cargo.actionJournalReceipts);
   assert.equal((await base.pending({sessionId:live.sessionId})).records.length,0);
   live=await e.updateActivity({role:'user',content:'keep'},live);
   assert.deepEqual(f.effects,['alpha','beta']);assert.equal(live.flowStacks.flat().length,0,'suspended pending input resumes normally');
});
await test('late lower-progress projection survives a newer pending snapshot whose save was lost',async()=>{
   const f=fixture('late-multiple-pending',{completionTimeout:5}),base=f.port();let release,finished;
   const gate=new Promise(resolve=>release=resolve),settled=new Promise(resolve=>finished=resolve);
   let e=f.engine({...base,complete:async args=>{await gate;try{return await base.complete(args);}finally{finished();}}});
   let persisted=await e.updateActivity({role:'user',content:'create A',start:{flow:'alpha-task'}},e.initSession('user','late-multiple-pending','en'));
   const waiting=f.engine();persisted=await waiting.updateActivity({role:'user',content:'check A'},persisted);
   await checkpointActionSession(base,persisted,persisted.cargo.actionJournalReceipts);
   await f.engine().updateActivity({role:'user',content:'create B',start:{flow:'beta-task'}},clone(persisted)); // B's host save is lost.
   release();await settled;
   assert.deepEqual(f.effects,['alpha','beta']);
   e=f.engine();persisted=await e.updateActivity({role:'user',content:'status A'},persisted);
   assert.deepEqual(persisted.cargo.projected.map(item=>item.reference),['alpha-1']);
   await checkpointActionSession(base,persisted,persisted.cargo.actionJournalReceipts);
   persisted=await e.updateActivity({role:'user',content:'status B'},persisted);
   assert.deepEqual(f.effects,['alpha','beta']);assert.deepEqual(persisted.cargo.projected.map(item=>item.reference).sort(),['alpha-1','beta-2']);
   await checkpointActionSession(base,persisted,persisted.cargo.actionJournalReceipts);
   assert.equal((await base.pending({sessionId:persisted.sessionId})).records.length,0);
});
await test('projection failure never consumes a durable completion and can recover without repeating its effect',async()=>{
   const f=fixture('projection-failure'),base=f.port(),e=f.engine();let live=e.initSession('user','projection-failure','en');live.cargo.failProjection=true;
   await assert.rejects(e.updateActivity({role:'user',content:'create',start:{flow:'alpha-task'}},live),/required SET|must evaluate to true|fixture projection failed/i);
   assert.deepEqual(f.effects,['alpha']);assert.equal(Object.keys(live.cargo.actionJournalApplied || {}).length,0);
   const pending=await base.pending({sessionId:live.sessionId});assert.equal(pending.records.length,1);assert.equal(pending.records[0].status,'completed');
   live.cargo.failProjection=false;live=await f.engine().updateActivity({role:'user',content:'recover'},live);
   assert.deepEqual(f.effects,['alpha']);assert.equal(live.cargo.projected[0].reference,'alpha-1');
   await checkpointActionSession(base,live,live.cargo.actionJournalReceipts);assert.equal((await base.pending({sessionId:live.sessionId})).records.length,0);
});
await test('a host reset epoch projects the earlier result without restoring old authentication or drafts',async()=>{
   const f=fixture('reset-epoch-projection'),e=f.engine(),origin=e.initSession('user','reset-epoch-projection','en');
   origin.actionRecoveryEpoch='before-reset';Object.assign(origin.cargo,{verified:true,privateCache:{balance:25},oldDraft:{amount:7}});
   await e.updateActivity({role:'user',content:'create',start:{flow:'alpha-task'}},clone(origin)); // The original host save never landed.
   const resumedEngine=f.engine(),reset=resumedEngine.initSession('user',origin.sessionId,'es');
   reset.actionRecoveryEpoch='after-reset';reset.cargo={verified:false,resetMarker:true};
   const recovered=await resumedEngine.updateActivity({role:'user',content:'nuevo mensaje'},reset);
   assert.deepEqual(f.effects,['alpha']);assert.equal(recovered.actionRecoveryEpoch,'after-reset');assert.equal(recovered.cargo.verified,false);
   assert.equal(recovered.cargo.resetMarker,true);assert.equal(recovered.cargo.privateCache,undefined);assert.equal(recovered.cargo.oldDraft,undefined);
   assert.equal(recovered.cargo.forms,undefined,'old forms are not recreated after a host reset');assert.deepEqual(recovered.flowStacks,[[]]);
   assert.equal(recovered.cargo.projected[0].reference,'alpha-1');assert.match(recovered.response,/Recuperé un resultado/);
   await checkpointActionSession(resumedEngine.actionJournal,recovered,recovered.cargo.actionJournalReceipts);
   assert.equal((await f.port().pending({sessionId:origin.sessionId})).records.length,0);
});
await test('newer host expiry selects pure projection and cannot restore derived permissions or private caches',async()=>{
   const f=fixture('expiry-crash-resume'),e=f.engine(),origin=e.initSession('user','expiry-crash-resume','en');
   Object.assign(origin.cargo,{verified:true,verifiedAt:100,privateCache:{balance:25},derivedAllowed:true});
   const persisted=clone(origin);
   await e.updateActivity({role:'user',content:'create',start:{flow:'alpha-task'}},clone(origin));
   persisted.cargo.verified=false;persisted.cargo.derivedAllowed=false;delete persisted.cargo.verifiedAt;delete persisted.cargo.privateCache;
   retainRecoveryState(persisted,['cargo.verified','cargo.verifiedAt','cargo.privateCache']);
   const resumedEngine=f.engine(),recovered=await resumedEngine.updateActivity({role:'user',content:'status'},persisted);
   assert.deepEqual(f.effects,['alpha']);assert.equal(recovered.lastTurnRecovery.projection,true,'newer host invalidation blocks old continuation and presenter replay');assert.equal(recovered.cargo.derivedAllowed,false);
   assert.equal(recovered.cargo.verified,false);assert.equal(Object.hasOwn(recovered.cargo,'verifiedAt'),false);assert.equal(Object.hasOwn(recovered.cargo,'privateCache'),false);
   assert.equal(recovered.cargo.projected[0].reference,'alpha-1');assert.match(recovered.response,/I recovered a result/);assert.doesNotMatch(recovered.response,/alpha saved alpha-1/);
   assert.equal(recovered.actionRecoveryPolicy.paths['cargo.privateCache'].present,false);
   await checkpointActionSession(resumedEngine.actionJournal,recovered,recovered.cargo.actionJournalReceipts);
   assert.equal((await f.port().pending({sessionId:origin.sessionId})).records.length,0);
});
await test('a fresh action recomputes its gate instead of trusting an old derived permission flag',async()=>{
   const f=fixture('fresh-derived-gate'),e=f.engine();
   e.flowsMenu.find(flow=>flow.id==='alpha-task').variables.performs.value[0].gate={flow:'fresh-gate-check',verified:['cargo.allowed']};
   e.flowsMenu.push({id:'fresh-gate-check',name:'FreshGateCheck',version:'1',scope:'isolated',description:'Recompute a subject permission.',steps:[{id:'recheck',type:'SET',variable:'noop',value:'(cargo.gateChecks=Number(cargo.gateChecks || 0)+1,cargo.allowed=cargo.currentTrusted===true,true)'}]});
   let current=e.initSession('user','fresh-gate-denied','en');Object.assign(current.cargo,{currentTrusted:false,allowed:true});
   current=await e.updateActivity({role:'user',content:'create',start:{flow:'alpha-task'}},current);
   assert.deepEqual(f.effects,[]);assert.equal(current.cargo.allowed,false);assert.equal(current.cargo.gateChecks,1);
   let trusted=e.initSession('user','fresh-gate-allowed','en');Object.assign(trusted.cargo,{currentTrusted:true,allowed:false});
   trusted=await e.updateActivity({role:'user',content:'create',start:{flow:'alpha-task'}},trusted);
   assert.deepEqual(f.effects,['alpha']);assert.equal(trusted.cargo.allowed,true);assert.equal(trusted.cargo.gateChecks,1);assert.equal(trusted.cargo.projected[0].reference,'alpha-1');
});
await test('project declarations reject orchestration and malformed temporary variables',async()=>{
   const base={id:'bad',name:'Bad',description:'Fixture',inputs:[],prepare:'prepare',present:'present',performs:[{action:'save',effect:'write',flow:'effect',outcomes:{saved:'resolved'}}],contract:{summary:'Fixture'}};
   for(const step of [{type:'FLOW',value:'effect'},{type:'CALL-TOOL',tool:'write'},{type:'SAY',value:'hello'},{type:'SET',variable:'cargo',value:'{}'},{type:'SET',variable:'noop',value:'true',onFail:{type:'END'}}])assert.throws(()=>definePerformer({...base,project:[step]}),/project permits only SET/);
   const flow=definePerformer({...base,project:[{type:'SET',variable:'noop',value:'true'}]});flow.variables.projection.value.push({type:'FLOW',value:'effect'});
   assert.throws(()=>validateFlowContracts([flow],[],{externalFlows:['prepare','present','effect','perform-action','give-up','form-init','form-run','form-done']}),/project permits only SET/);
});
console.log(`Late action continuation: all ${checks} checks passed`);
