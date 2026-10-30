/** Shared FORM retry, contextual yield and recovery policy; all state is conversation-owned. */
import {formIncompleteOutcome,closeFormInstance} from './form-state.js';
import {isWholeNo} from './answer.js';
import {readInputProfile} from './match-inputs.js';

export function clearFormMisses(cargo,id,input) {
   const state=cargo.forms?.[id];if(!state)return true;
   state.misses ||= {};state.feedback ||= {};delete state.misses[input];delete state.feedback[input];return true;
}
export function missFormInput(cargo,id,input) {
   const state=cargo.forms?.[id];if(!state)throw new Error('Cannot record a miss without its owned form');
   state.misses ||= {};state.feedback ||= {};state.misses[input]=Number(state.misses[input]||0)+1;state.feedback[input]='miss';return state.misses[input];
}
/** must_complete: the field's own declaration (true or false) wins, else any enclosing form that declares it. Such an input never hands the
 * turn away on an unreadable answer: it says it did not catch that and asks again. Its exits stay explicit (the form's
 * stop words, max_attempts and on_exhausted, and whatever the host intercepts before the engine). */
export function formMustComplete(cargo,id,input) {
   const seen=new Set();let name=input;
   while(id&&cargo.forms?.[id]&&!seen.has(id)) {
      seen.add(id);const state=cargo.forms[id];
      const group=(state.specs||[]).find(s=>s.name===name||s.any_of?.some(i=>i.name===name));
      const member=group?.any_of?.find(i=>i.name===name);
      for(const declared of [member?.must_complete,group?.must_complete])if(typeof declared==='boolean')return declared;
      if(state.must_complete===true)return true;
      name=state.result_input;id=state.parent;
   }
   return false;
}
/**
 * Explicit retry wins. Otherwise acknowledge only an actual unrecognized answer, once per re-ask.
 * question_text / retry_text (and _es): the written-channel wording, used only when the conversation is not a call.
 */
export function formInputPrompt(cargo,id,input,spec,data={},language='en') {
   const es=language==='es',feedback=cargo.forms?.[id]?.feedback?.[input],text=!cargo?.voice;
   const written=(key)=>text?(es?(spec[key+'_text_es']||spec[key+'_text']):spec[key+'_text']):undefined;
   const question=spec.question_from&&(es?(data[spec.question_from+'_es']||data[spec.question_from]):data[spec.question_from]) || written('question') || (es?(spec.question_es||spec.question):spec.question) || '';
   const retry=written('retry') || (es?spec.retry_es:spec.retry);
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

/** The form that answers a whole NO said at this question: the nearest form up the chain (this one, or a sub-form's owner)
 * that declares `on_no`, when the question is not a yes/no or confirmation and does not read the NO itself. '' if none. */
export function formNoOwner(cargo,id,spec,answer) {
   const raw=String(answer ?? '').replace(/\\(['"\\])/g,'$1').trim();
   if(!raw || !isWholeNo(raw) || !spec || spec.confirmation || spec.proposal)return '';
   if([spec,...(Array.isArray(spec.any_of)?spec.any_of:[])].some(s=>s && s.profile && readInputProfile(s.profile,raw,true)))return '';   // the question offers NO itself
   const seen=new Set();
   for(let f=id;f&&cargo.forms?.[f]&&!seen.has(f);f=cargo.forms[f].parent){seen.add(f);if(cargo.forms[f].on_no)return f;}
   return '';
}
