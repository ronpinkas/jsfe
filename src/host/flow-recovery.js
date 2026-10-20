/** Explicit conversational recovery. No engine, transport, credentials or host-state imports. */
/** @typedef {{version:1,mode:'resume'|'restart'|'hold'|'none',reason:string,form?:string,flow?:string}} FlowRecovery */
const modes=new Set(['resume','restart','hold','none']);
const text=value=>typeof value==='string'&&!!value.trim()&&value===value.trim();
/** @returns {FlowRecovery} */
export function validateFlowRecovery(value) {
   if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||!['version','mode','reason'].every(key=>Object.hasOwn(value,key))||Object.keys(value).some(key=>!['version','mode','reason','form','flow'].includes(key))||value.version!==1||!modes.has(value.mode)||!text(value.reason))throw new Error('Invalid JSFE flow recovery descriptor');
   if(value.form!==undefined||value.flow!==undefined){if(!text(value.form)||!text(value.flow))throw new Error('Flow recovery requires both form and flow identities');}
   if(value.mode==='resume'&&!value.form)throw new Error('Resume recovery requires an owned form');
   return {...value};
}
/** Undefined means historical behavior; null explicitly clears a completed task's handoff. */
export function flowHandoffInfo(result) {
   if(result?.lastFlowRecovery===undefined)return undefined;
   const recovery=validateFlowRecovery(result.lastFlowRecovery),outcome=result.lastFlowOutcome;
   if(['resolved','deflected'].includes(outcome?.outcome))return null;
   return {flow:recovery.flow||outcome?.flowName||result.lastTurnDispatch?.fromFlow||'',reason:recovery.reason,kind:outcome?.outcome==='pending'?'yield':'failure',recovery};
}
/** Instructions belong to JSFE; the host only composes this explicit, consume-once note. */
export function renderFlowRecovery(handoff) {
   if(handoff?.recovery===undefined)return undefined;
   const recovery=validateFlowRecovery(handoff.recovery);
   let guidance;
   if(recovery.mode==='hold')guidance='An earlier external action may have taken effect and its result is not confirmed. Do not claim success or failure. Do not offer to restart, repeat the action, or pay again. Explain that its result needs verification or reconciliation, and address the current question without executing an action.';
   else if(recovery.mode==='resume')guidance=handoff.kind==='yield'
      ? 'The user has moved outside the current collection question. The original task is pending and its draft is retained. Answer the current request using available authorized information. Do not describe this as a failed task or say it must start over. Offer to return to the retained task only when helpful.'
      : 'A collection step could not finish, but the task draft and accepted information are retained. Briefly acknowledge the difficulty and offer to resume the task if the user wants. Do not say the whole process must start over or ask for information already collected.';
   else if(recovery.mode==='restart')guidance='The flow explicitly requires a fresh start to complete the task. Explain that briefly and offer to start the original task again if the user wants. Do not claim an external action failed unless its observed result establishes that.';
   else guidance='The flow cannot complete this task with its current data or service. Explain the limitation briefly and address the current request or another supported option. Do not invent a restart or retry instruction.';
   return '\n<flow-handoff>\n'+guidance+'\nDo not collect individual scripted fields yourself. Only the relevant JSFE flow collects them, rechecks authorization, and obtains any required fresh confirmation. Do not read internal flow identifiers or machine reasons to the user.\n</flow-handoff>';
}
