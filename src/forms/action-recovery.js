/** Durable resume snapshots contain engine data only, never a live engine or transport. */
import {applyRecoveryStatePolicy} from '../host/recovery-policy.js';
import {assertActionRecoveryIdentity,actionRecoveryIdentityMatches} from '../host/recovery-identity.js';
import {actionProjectionExpression,validateActionProjection} from './action-projection.js';
const clone=value=>JSON.parse(JSON.stringify(value));
export function resumableActionSession(session, flows, identity) {
   if (!session) throw new Error('Action journal requires an active engine session');
   const recoveryIdentity=assertActionRecoveryIdentity(identity);
   const snapshot = clone(session);
   snapshot.actionRecoveryIdentity=recoveryIdentity;
   let owner;
   for (let s = snapshot.flowStacks.length - 1; s >= 0 && !owner; s--) {
      const frames = snapshot.flowStacks[s];
      for (let f = frames.length - 1; f >= 0; f--) {
         if (frames[f].flowId === 'perform-action') { owner = { s, f, frame: frames[f] }; break; }
      }
   }
   const definition = flows.find(flow => flow.id === 'perform-action');
   if (!owner || !definition) throw new Error('Durable action ports require the shared perform-action worker');
   snapshot.flowStacks.length = owner.s + 1;
   snapshot.flowStacks[owner.s].length = owner.f + 1;
   owner.frame.flowStepsStack = clone(definition.steps).reverse();
   owner.frame.inputStack = [];
   delete owner.frame.pendingVariable;
   delete owner.frame.pendingInterruption;
   // Earlier completed actions in this turn may still have unsent messages.
   snapshot.response = null;
   return snapshot;
}
function matchingSnapshot(session,recovery,identity) {
   const snapshot=recovery?.session;
   if(!snapshot||snapshot.sessionId!==session.sessionId||snapshot.userId!==session.userId)throw new Error('Durable action checkpoint belongs to a different session');
   if(!actionRecoveryIdentityMatches(identity,snapshot.actionRecoveryIdentity))throw new Error('Durable action checkpoint requires a compatible runtime and flow contract');
   return snapshot;
}
/** Mutate the supplied session so the host retains its original object reference. */
export function restoreActionSession(session, recovery, contextEntry, identity) {
   const restored=clone(matchingSnapshot(session,recovery,identity));
   applyRecoveryStatePolicy(restored,session);
   for (const key of Object.keys(session)) delete session[key];
   Object.assign(session, restored);
   session.cargo ||= {};
   session.lastTurnRecovery = { key: recovery.key, sequence: recovery.sequence, deferredInput: contextEntry };
   return session;
}
/** Update only the exact action identity; later requests and draft values remain owned by their current task. */
export function reconcileRecoveredAction(cargo,key,result) {
   const matches=record=>record&&(record.durableKey || record.key)===key;
   const update=record=>{if(matches(record)){record.result=JSON.parse(JSON.stringify(result));record.status=result.status==='unknown'?'unknown':'completed';}};
   for(const state of Object.values(cargo.forms || {})){for(const record of Object.values(state.actions || {}))update(record);update(state.proposal);}
   for(const [localKey,record] of Object.entries(cargo.actionJournal || {}))if(matches(record)){update(record);if(record.status==='completed')delete cargo.actionJournal[localKey];}
   return true;
}
/**
 * Recover a late result against CURRENT cargo. Only its effect-free projector runs: no
 * original presenter, caller continuation, confirmation, or nested performer is replayed.
 * The engine must restore the returned suspended stacks in a finally block after playing.
 */
export function projectActionRecoverySession(session,recovery,contextEntry,flows,identity) {
   const snapshot=matchingSnapshot(session,recovery,identity),record=recovery.record;
   if(!record||record.key!==recovery.key||record.sequence!==recovery.sequence)throw new Error('Late action recovery requires its exact durable record');
   const frames=snapshot.flowStacks.flat().filter(Boolean),actionIndex=frames.findLastIndex(frame=>frame.flowId==='perform-action');
   const registry=new Map(flows.map(flow=>[flow.id,flow]));
   let owner,definition;
   for(let i=actionIndex-1;i>=0;i--){const candidate=registry.get(frames[i].flowId);if(candidate?.variables?.contract?.value?.role==='performer'){owner=frames[i];definition=candidate;break;}}
   if(!owner||!definition)throw new Error('Late action recovery requires an owning declarative performer');
   const project=definition.variables?.[definition.variables.contract.value.projects || 'projection']?.value || [];
   validateActionProjection(project,definition.id);
   const variables=owner.variables || {},form=variables.form_instance;
   const formSnapshot=snapshot.cargo?.forms?.[form];
   if(!formSnapshot)throw new Error('Late action recovery is missing its owned form snapshot');
   const frame=clone(owner),result=clone(record.result || {status:'unknown',reason:'result_pending'});
   frame.variables={...frame.variables,pf_recovery_form:clone(formSnapshot),pf_recovery_request:clone(variables.pf_request || frames[actionIndex]?.variables?.request || {}),pf_recovery_result:result,pf_recovery_key:record.key,
      pf_recovery_receipt:{key:record.key,sequence:record.sequence,attemptId:record.attemptId,scopeId:record.scopeId,signature:record.signature}};
   const set=(id,variable,value)=>({id,type:'SET',variable,value,requireTrue:true});
   const notice=result.status==='unknown'
      ? {en:'I still could not confirm whether your earlier request completed. I have not repeated it.',es:'Todavía no pude confirmar si su solicitud anterior se completó. No la he repetido.'}
      : ['refused','failed','invalid_email'].includes(result.status)
         ? {en:'Your earlier request did not complete.',es:'Su solicitud anterior no se completó.'}
         : {en:'I recovered a result for your earlier request.',es:'Recuperé un resultado de su solicitud anterior.'};
   frame.flowStepsStack=[
      set('recovery_project','pf_projected',actionProjectionExpression(project,{form:'form_instance',formSnapshot:'pf_recovery_form',request:'pf_recovery_request',result:'pf_recovery_result',key:'pf_recovery_key'})),
      set('recovery_reconcile','noop',`(${reconcileRecoveredAction.toString()})(cargo,pf_recovery_key,pf_recovery_result)`),
      set('recovery_receipt','noop','consumeActionReceipt(cargo,pf_recovery_receipt)'),
      {id:'recovery_notice',type:'SAY',value:notice.en,value_es:notice.es},
   ].reverse();
   frame.inputStack=[];frame.contextStack=[];
   for(const key of ['pendingVariable','pendingVariableContext','pendingVariableAsSpoken','pendingInterruption'])delete frame[key];
   const suspendedStacks=session.flowStacks;
   session.flowStacks=[[frame]];
   session.lastTurnRecovery={key:record.key,sequence:record.sequence,deferredInput:contextEntry,projection:true};
   return suspendedStacks;
}
