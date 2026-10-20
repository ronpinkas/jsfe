/** Non-durable transport policy. All state belongs to the conversation, never the engine instance. */
import {formSignature} from '../helpers/form-actions.js';

const hold = reason => ({status:'hold',outcome:{status:'unknown',reason}});
function ownedAction(cargo, record, action) {
   if (!record?.key || record.action !== action?.action) throw new Error('Session action identity mismatch');
   const owner = Object.values(cargo?.forms || {}).find(form => form.actions?.[action.action]?.key === record.key);
   const owned = owner?.actions[action.action];
   if (!owned || owned.signature !== record.signature || owned.scope !== record.scope ||
       formSignature(owned.request) !== formSignature(record.request)) throw new Error('Session action ownership mismatch');
   if (owned.durableKey) throw new Error('A durable action cannot be migrated to session-only execution');
   return owned;
}

/** beginFormAction has already checked completeness, exact confirmation, gate, revision and ownership. */
export function claimSessionAction(cargo, record, action) {
   const owned = ownedAction(cargo, record, action);
   if (owned.sessionOutcome) return {status:'replay',outcome:structuredClone(owned.sessionOutcome)};
   if (owned.status !== 'attempted' || owned.sessionClaimed) return hold('action_result_unresolved');
   owned.sessionClaimed = true;
   cargo.actionJournal[owned.key] = owned;
   return {status:'execute'};
}

/** Cache the first observed outcome before returning it. No receipt or durable recovery checkpoint is created. */
export function completeSessionAction(cargo, record, action, outcome) {
   const owned = ownedAction(cargo, record, action);
   if (!owned.sessionClaimed) throw new Error('Session action completion without claim');
   if (!owned.sessionOutcome) {
      if (!['attempted','unknown'].includes(owned.status)) throw new Error('Session action is not pending');
      owned.sessionOutcome = outcome && Object.hasOwn(action.outcomes || {}, outcome.status)
         ? structuredClone(outcome) : {status:'unknown',reason:'invalid_action_result'};
      cargo.actionJournal[owned.key] = owned;
   }
   return {status:owned.sessionOutcome.status === 'unknown' ? 'unknown' : 'completed',outcome:structuredClone(owned.sessionOutcome)};
}
