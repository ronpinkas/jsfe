/** Session-owned action state. */
import { nextFormInput, formPath, formInputApplies } from './form-state.js';
export function formSignature(value) {
   return JSON.stringify(value, (_key, v) => v && typeof v==='object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])) : v);
}
export function selectFormAction(cargo,id,actions) {
   const state=cargo.forms?.[id];
   if(!state)throw new Error('Cannot select an action without a form instance');
   const eligible=(actions||[]).filter(action=>formInputApplies(action,state.values,cargo,state));
   if(eligible.length>1)throw new Error('Ambiguous action selection');
   return eligible[0]||null;
}
export function confirmFormRevision(cargo, id) {
   const state=cargo.forms?.[id];
   if(!state||nextFormInput(state,cargo))throw new Error('Cannot confirm an incomplete form');
   state.confirmation={revision:state.revision,values:formSignature(state.values),proposal:state.proposal?.signature || null};
   return true;
}
export function prepareFormAction(cargo,id,action,request) {
   const state=cargo.forms?.[id];
   if(!state||nextFormInput(state,cargo))throw new Error('Cannot prepare action from an incomplete form');
   if(!action?.action||!action.outcomes)throw new Error('Action contract is missing');
   const subject=action.subject?formPath({cargo,form:state,request},action.subject):null;
   const scope=formSignature({action:action.action,subject});
   const signature=formSignature({action:action.action,subject,request});
   cargo.actionJournal ||= {};
   const unresolved=Object.values(cargo.actionJournal).find(record=>record.scope===scope&&['attempted','unknown'].includes(record.status));
   state.actions ||= {};
   if(unresolved){state.actions[action.action]=unresolved;state.proposal=unresolved;return unresolved;}
   const existing=state.actions[action.action];
   if(existing?.signature===signature&&existing.status!=='superseded'&&(existing.revision===state.revision||existing.status!=='completed'||!(action.retry?.after || []).includes(existing.result?.status)))return existing;
   if(existing?.scope===scope&&['attempted','unknown'].includes(existing.status))return existing;
   const record={key:globalThis.crypto.randomUUID(),signature,revision:state.revision,status:'prepared',scope,request:structuredClone(request),action:action.action};
   if(cargo.actionRetryAuthorizations?.[scope]){record.retryAuthorization=cargo.actionRetryAuthorizations[scope];delete cargo.actionRetryAuthorizations[scope];}
   state.actions[action.action]=record;state.proposal=record;
   return record;
}
/** Unknown SEND results may be retried only by a declared policy and a freshly accepted recovery choice. */
export function authorizeFormActionRetry(cargo,id,action,consent) {
   const state=cargo.forms?.[id];
   if(action?.effect!=='send'||action.retry?.unknown!=='explicit')throw new Error('Action does not allow an explicit unknown-result retry');
   if(!state||!consent?.input||!state.accepted[consent.input]||state.errors[consent.input]||state.pending[consent.input]||state.values[consent.input]!==consent.value)throw new Error('Retry requires an accepted recovery choice');
   const scope=formSignature({action:action.action,subject:action.subject?formPath({cargo,form:state},action.subject):null});
   const consentKey=formSignature({scope,input:consent.input,sequence:state.accepted[consent.input].sequence ?? state.accepted[consent.input].revision});
   state.retryConsents ||= {};if(state.retryConsents[consentKey])throw new Error('Recovery consent was already consumed');
   const records=Object.values(cargo.actionJournal || {}).filter(record=>record.scope===scope&&record.status==='unknown');
   if(records.length)state.retryConsents[consentKey]=true;
   for(const record of records){
      const authorization={form:id,input:consent.input,value:consent.value,revision:state.revision,sequence:state.accepted[consent.input].sequence,at:Date.now()};
      record.status='superseded';record.retryAuthorization=authorization;
      cargo.actionRetryHistory ||= [];cargo.actionRetryHistory.push({key:record.key,action:record.action,authorization});
      cargo.actionRetryAuthorizations ||= {};cargo.actionRetryAuthorizations[scope]={previousKey:record.durableKey || record.key,authorization};
      for(const owner of Object.values(cargo.forms))for(const previous of Object.values(owner.actions || {}))if(previous.key===record.key){previous.status='superseded';previous.retryAuthorization=authorization;}
      delete cargo.actionJournal[record.key];
   }
   return true;
}
export function actionConfirmationValid(cargo,id,record) {
   const state=cargo.forms?.[id],confirmation=state?.confirmation;
   return !!confirmation&&confirmation.revision===state.revision&&confirmation.values===formSignature(state.values)&&confirmation.proposal===record.signature;
}
export function beginFormAction(cargo,id,action,record) {
   const state=cargo.forms?.[id];
   if(!state||nextFormInput(state,cargo))throw new Error('Cannot execute action from an incomplete form');
   const owned=state.actions?.[action.action];
   if(!owned||record.key!==owned.key||record.signature!==owned.signature)throw new Error('Action ownership mismatch');
   if(owned.status!=='prepared'||!formInputApplies(action,state.values,cargo,state))return false;
   if(owned.signature!==formSignature({action:action.action,subject:action.subject?formPath({cargo,form:state,request:owned.request},action.subject):null,request:owned.request}))return false;
   if(action.confirm?.exact&&!actionConfirmationValid(cargo,id,owned))return false;
   if(!actionGateVerified(cargo,action))return false;
   owned.status='attempted';
   cargo.actionJournal ||= {};cargo.actionJournal[owned.key]=owned;
   return true;
}
export function actionGateVerified(cargo,action) {
   const gate=action.gate?.verified;
   return !gate||[].concat(gate).every(path=>!!formPath({cargo},path));
}
export function finishFormAction(cargo,id,action,outcome) {
   const record=cargo.forms?.[id]?.actions?.[action.action];
   if(!record||record.status!=='attempted'&&record.status!=='unknown')throw new Error('Action was not attempted');
   const valid=outcome&&Object.prototype.hasOwnProperty.call(action.outcomes,outcome.status);
   record.result=valid?outcome:{status:'unknown',reason:'invalid_action_result'};
   record.status=record.result.status==='unknown'?'unknown':'completed';
   if(record.status==='completed')delete cargo.actionJournal?.[record.key];
   else cargo.actionJournal[record.key]=record;
   return record.result;
}

/** A result is consumed only after its effect-free domain projection succeeds. */
export function consumeActionReceipt(cargo,receipt) {
   if(!receipt)return true;
   if(!receipt.key||!Number.isSafeInteger(receipt.sequence)||receipt.sequence<1)throw new Error('Invalid action receipt');
   const key=receipt.key,sequence=receipt.sequence;
   cargo.actionJournalSequence=Math.max(Number(cargo.actionJournalSequence || 0),sequence);
   cargo.actionJournalApplied ||= {};
   cargo.actionJournalApplied[key]=Math.max(Number(cargo.actionJournalApplied[key] || 0),sequence);
   cargo.actionJournalReceipts ||= [];
   if(!cargo.actionJournalReceipts.includes(key))cargo.actionJournalReceipts.push(key);
   cargo.actionJournalReceiptRevisions ||= {};
   cargo.actionJournalReceiptRevisions[key]=Math.max(Number(cargo.actionJournalReceiptRevisions[key] || 0),sequence);
   return true;
}
