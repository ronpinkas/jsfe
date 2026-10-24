/** Shared FORM retry, contextual yield and recovery policy; all state is conversation-owned. */
import {formIncompleteOutcome,closeFormInstance} from './form-state.js';

export function clearFormMisses(cargo,id,input) {
   const state=cargo.forms?.[id];if(!state)return true;
   state.misses ||= {};state.feedback ||= {};delete state.misses[input];delete state.feedback[input];return true;
}
export function missFormInput(cargo,id,input) {
   const state=cargo.forms?.[id];if(!state)throw new Error('Cannot record a miss without its owned form');
   state.misses ||= {};state.feedback ||= {};state.misses[input]=Number(state.misses[input]||0)+1;state.feedback[input]='miss';return state.misses[input];
}
/** Explicit retry wins. Otherwise acknowledge only an actual unrecognized answer, once per re-ask. */
export function formInputPrompt(cargo,id,input,spec,data={},language='en') {
   const es=language==='es',feedback=cargo.forms?.[id]?.feedback?.[input];
   const question=spec.question_from&&(es?(data[spec.question_from+'_es']||data[spec.question_from]):data[spec.question_from]) || (es?(spec.question_es||spec.question):spec.question) || '';
   const retry=es?spec.retry_es:spec.retry;
   if(feedback==='partial')return es?'Continúe.':'Go on.';
   if(feedback&&retry)return retry;
   return (feedback==='miss'?(es?'Disculpe, no le entendí. ':"Sorry, I didn't catch that. "):'')+question;
}
export function consumeFormFeedback(cargo,id,input) {if(cargo.forms?.[id]?.feedback)delete cargo.forms[id].feedback[input];return true;}

/** Recovery refers to the actual owning root, and never permits a fresh attempt at an unknown action. */
export function formConversationOutcome(cargo,id,reason,failure=false,recoveryMode='resume') {
   const completed=formIncompleteOutcome(cargo,id,{outcome:'unresolved',reason});
   if(completed.owner&&['resolved','deflected'].includes(completed.outcome))return {outcome:completed.outcome,reason:completed.reason,recovery:{version:1,mode:'none',reason:completed.reason}};
   const seen=new Set();let state=cargo.forms?.[id],root=state;
   while(state&&!seen.has(state.id)){seen.add(state.id);root=state;state=cargo.forms?.[state.parent];}
   if(!root)return {outcome:'unresolved',reason,recovery:{version:1,mode:'none',reason}};
   const belongs=form=>{const visited=new Set();while(form&&!visited.has(form.id)){if(form.id===root.id)return true;visited.add(form.id);form=cargo.forms?.[form.parent];}return false;};
   const unknown=Object.values(cargo.forms||{}).filter(belongs).some(form=>Object.values(form.actions||{}).some(record=>['attempted','unknown'].includes(record.status)));
   const mode=unknown?'hold':recoveryMode,why=unknown?'action_result_unknown':completed.owner?completed.reason:reason;
   return {outcome:unknown?'unresolved':completed.owner?completed.outcome:failure?'unresolved':'pending',reason:why,recovery:{version:1,mode,reason:why,form:root.id,flow:root.definition}};
}

/** An explicit withdrawal retires the owning task; unknown actions remain held for reconciliation. */
export function cancelFormTask(cargo,id) {
 // A completed primary may own an optional follow-up with an unknown send result.
 // That completion does not permit withdrawing the unresolved action's evidence.
 let root=cargo.forms?.[id];const ancestors=new Set();
 while(root?.parent && cargo.forms?.[root.parent] && !ancestors.has(root.id)){ancestors.add(root.id);root=cargo.forms[root.parent];}
 if(root){
  const belongs=state=>{const seen=new Set();while(state&&!seen.has(state.id)){if(state.id===root.id)return true;seen.add(state.id);state=cargo.forms?.[state.parent];}return false;};
  const unknown=Object.values(cargo.forms || {}).filter(belongs).some(state=>Object.values(state.actions || {}).some(record=>['attempted','unknown'].includes(record.status)));
  if(unknown)return {outcome:'unresolved',reason:'action_result_unknown',recovery:{version:1,mode:'hold',reason:'action_result_unknown',form:root.id,flow:root.definition}};
 }
 const outcome=formConversationOutcome(cargo,id,'request_cancelled',false,'none');
 if(outcome.recovery.mode==='hold')return outcome;
 const owner=outcome.recovery.form || root?.id || id;
 closeFormInstance(cargo,owner,false);
 return {outcome:'resolved',reason:'request_cancelled',recovery:{version:1,mode:'none',reason:'request_cancelled'}};
}
