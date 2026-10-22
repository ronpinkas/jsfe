import {nextFormInput,formValuesEqual} from '../helpers/form-state.js';
import {actionConfirmationValid} from '../helpers/form-actions.js';

const components={collector:'Form',provider:'Provider',performer:'Performer',worker:'Worker',gate:'Worker',router:'Worker'};
const object=value=>value && typeof value==='object' && !Array.isArray(value);
const framesOf=session=>(Array.isArray(session?.flowStacks)?session.flowStacks:[]).flat().filter(object);

/** Explain existing state; this neither authorizes an action nor records an event history.
 * Values, request bodies, caller words and rendered questions are intentionally omitted.
 * `previous` adds only observable field changes and invalidated confirmations; it cannot
 * reconstruct intermediate events between the two snapshots.
 */
export function explainSession(session,{flows=[],previous}={}) {
 if(!object(session))throw new TypeError('explainSession requires a session snapshot');
 if(!Array.isArray(flows))throw new TypeError('explainSession flows must be an array');
 const registry=new Map(flows.filter(object).map(flow=>[flow.id,flow]));
 const cargo=object(session.cargo)?session.cargo:{};
 const forms=object(cargo.forms)?cargo.forms:{};
 const frames=framesOf(session),entries=[];
 const activeIds=new Set(frames.flatMap(frame=>[frame.variables?.form_instance,frame.variables?.form,frame.variables?.rf_form]).filter(id=>typeof id==='string'));
 let held=!!session.continuationSafetyHold,uncertain=false,collecting=false,confirming=false;
 const entry=(kind,message,source={})=>entries.push({kind,message,component:components[registry.get(source.flowId)?.variables?.contract?.value?.role] || 'Unknown',...source});
 const actions=new Map();
 const action=(record,source)=>{
  if(!object(record))return;
  const identity=record.key || record;
  const priority=['attempted','unknown'].includes(record.status) || record.result?.status==='unknown'?3:record.status==='completed'?2:record.status==='prepared'?1:0;
  if(priority===3)held=true;
  const previous=actions.get(identity);
  // A duplicate key is not proof that both sources agree. Keep its most conservative
  // evidence independently of traversal order, including journal/form contradictions.
  if(priority && (!previous || priority>previous.priority))actions.set(identity,{priority,source:source.flowId?source:previous?.source || source});
 };
 if(session.continuationSafetyHold)entry('continuation_held','An earlier action or incompatible continuation requires review before continuing.');
 for(const [id,state] of Object.entries(forms)){
  if(!object(state)) {uncertain=true;entry('unavailable','This form state cannot be inspected.',{form:id});continue;}
  const source={flowId:state.definition,form:id},active=activeIds.has(id),before=previous?.cargo?.forms?.[id];
  if(object(before)){
   const names=new Set([...Object.keys(before.values || {}),...Object.keys(state.values || {})]);
   for(const input of names)if(!formValuesEqual(before.values?.[input],state.values?.[input]))entry('input_changed','The field changed; its current value is withheld from the explanation.',{...source,input});
   if(before.confirmation && !formValuesEqual(before.confirmation,state.confirmation))entry(state.confirmation?'confirmation_changed':'confirmation_invalidated',state.confirmation?'A different confirmation is now recorded; it must match the current proposal.':'The earlier confirmation no longer applies. A fresh confirmation is required for the revised proposal.',source);
  }
  let next;
  try{
   if(!Array.isArray(state.specs)||!object(state.values))throw new TypeError('Incomplete snapshot');
   next=nextFormInput(state,cargo);
  }catch{
   uncertain=true;entry('unavailable','Required input state cannot be determined from this snapshot.',source);
  }
  if(next){
   const blocked=next==='__blocked__';
   entry(blocked?'input_blocked':'input_missing',blocked?'Required inputs are waiting on their prerequisites.':active?'Collecting this required input.':'This saved form still needs this input.',{...source,...(!blocked?{input:next}:{}),active});
   if(active)collecting=true;
  }
  const proposal=state.proposal;
  if(proposal?.status==='prepared' && next===''){
   const valid=actionConfirmationValid(cargo,id,proposal);
   entry(valid?'confirmation_recorded':'confirmation_needed',valid?'Confirmation matches the current proposal; other execution guards still apply.':'Waiting for confirmation of the current proposal.',{...source,active});
   if(active && !valid)confirming=true;
  }else if(state.confirmation && next){
   entry('confirmation_stale','A recorded confirmation cannot authorize an incomplete form.',source);
  }
  action(state.proposal,source);
  for(const record of Object.values(state.actions || {}))action(record,source);
  for(const [input,proposal] of Object.entries(state.inputProposals || {}))if(proposal && !proposal.committed && proposal.status==='pending'){
   entry('input_confirmation_needed','A proposed field value is waiting for confirmation.',{...source,input,active});
   if(active)confirming=true;
  }
 }
 for(const record of Object.values(cargo.actionJournal || {}))action(record,{});
 for(const {priority,source} of actions.values()){
  if(priority===3)entry('action_held','An action has been attempted and its result is not confirmed. Automatic repetition is blocked.',source);
  else if(priority===2)entry('action_completed','An action attempt has a recorded result. This does not authorize another attempt.',source);
  else entry('action_prepared','An action proposal is prepared; execution still requires its guards.',source);
 }

 // Completed forms may already be cleared. The generic last result remains evidence of
 // its recorded outcome, but carries no authority or reliable component identity by itself.
 const lastResult=cargo.actionResult;
 const resultMessages={ok:'The most recent action result is recorded as successful.',failed:'The most recent action result is recorded as failed.',unknown:'The most recent action result is unconfirmed; consult the current action hold.',not_applicable:'The most recent performer recorded that no action was applicable.'};
 if(object(lastResult)&&Object.hasOwn(resultMessages,lastResult.status))entry('action_result',resultMessages[lastResult.status]);
 const handoff=session.lastTurnDispatch;
 const handedOff=handoff?.matchedFlow===null && frames.length===0;
 if(handedOff)entry('handoff','DISPATCH yielded this turn to the host for contextual interpretation.',{flowId:registry.has(handoff.fromFlow)?handoff.fromFlow:[...registry.values()].find(flow=>flow.name===handoff.fromFlow)?.id});
 const current=frames.at(-1);
 if(current){
  const step=current.flowStepsStack?.at(-1);
  const reversed=[...frames].reverse();
  const author=reversed.find(frame=>['Form','Provider','Performer'].includes(registry.get(frame.flowId)?.metadata?.authoring?.component))
   || reversed.find(frame=>registry.get(frame.flowId)?.metadata?.authoring?.component)
   || reversed.find(frame=>{const definition=registry.get(frame.flowId);const role=definition?.variables?.contract?.value?.role;return ['provider','performer'].includes(role)||role==='collector'&&(definition?.primary||definition?.metadata?.formProtocol===2);}) || current;
  entry('current_step','Current execution location.',{flowId:author.flowId,...(current.flowId!==author.flowId?{workerFlowId:current.flowId}:{}),...(step?.id?{step:step.id}:{})});
 }
 return {status:held?'held':uncertain?'unknown':handedOff?'handed_off':confirming?'confirmation':collecting?'collecting':frames.length?'active':'idle',entries};
}
