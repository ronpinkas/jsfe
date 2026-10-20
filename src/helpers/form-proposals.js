/** Owned input proposals. Candidates and their consent remain separate from canonical values and action proposals. */
import {formInputApplies,formValuesEqual,hasFormValue} from './form-state.js';
import {formSignature,actionConfirmationValid} from './form-actions.js';
import {validateFormProposalPolicy,validateFormProposalDescriptor,validateProposalData} from './proposal-contract.js';
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value||{},key);
const statuses=new Set(['pending','confirmed','declined','superseded']);
const fail=message=>{throw new Error('FORM input proposal '+message);};
const text=value=>typeof value==='string'&&!!value.trim();
function data(value){
   const seen=new Set();
   const inspect=item=>{if(!item||typeof item!=='object')return;
      if(seen.has(item))fail('requires acyclic JSON data');seen.add(item);
      if(Object.getOwnPropertySymbols(item).length)fail('requires JSON data without symbols');
      for(const [key,property] of Object.entries(Object.getOwnPropertyDescriptors(item))){
         if(Array.isArray(item)&&key==='length')continue;
         if(Array.isArray(item)&&(!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=item.length))fail('requires JSON arrays without extra properties');
         if(property.get||property.set||!property.enumerable)fail('requires enumerable JSON data properties');
         inspect(property.value);
      }
      seen.delete(item);
   };inspect(value);validateProposalData(value);return structuredClone(value);
}
function inputOwner(cargo,id,name){
   const state=cargo?.forms?.[id],spec=state?.specs?.flatMap(input=>input.any_of||[input]).find(input=>input.name===name);
   if(!state||state.id!==id||!spec||['__proto__','prototype','constructor'].includes(name))fail('requires a live owning input');
   if(!Number.isSafeInteger(state.revision)||state.revision<0||!text(state.definition)||!text(state.task))fail('has invalid owner identity or revision');
   return {state,spec};
}
function candidate(cargo,reading){
   if(!reading||reading.ok!==true||!hasFormValue(reading.value))fail('requires a validated nonempty candidate');
   const owner=inputOwner(cargo,reading.form,reading.name);data(reading.value);return owner;
}
const identity=state=>({id:state.id,definition:state.definition,task:state.task});
const signature=(owner,input,value,revision,descriptor)=>formSignature({owner,input,value,revision,binding:descriptor.binding??null,descriptor});
const token=(value,record)=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>['id','signature'].includes(key))&&value.id===record?.id&&value.signature===record?.signature;
const sourceReading=reading=>Object.fromEntries(['raw','utterance','origin','current','asked'].filter(key=>reading[key]!==undefined).map(key=>[key,data(reading[key])]));
function recordFor(cargo,state,name){
   const record=state.inputProposals?.[name];if(!record)return null;
   if(!text(record.id)||record.form!==state.id||record.input!==name||!statuses.has(record.status)||typeof record.committed!=='boolean'||!Number.isSafeInteger(record.owner_revision)||record.owner_revision<0||!Number.isSafeInteger(record.revision)||record.revision<1||typeof record.child!=='string'||!hasFormValue(record.value)||!record.reading||typeof record.reading!=='object'||Array.isArray(record.reading))fail('has invalid retained state');
   data(record.value);data(record.reading);const descriptor=validateFormProposalDescriptor(record.descriptor);
   if(!formValuesEqual(record.owner,identity(state))||!formValuesEqual(record.binding,descriptor.binding??null)||record.signature!==signature(record.owner,name,record.value,record.owner_revision,descriptor))fail('retained identity or binding changed');
   return record;
}
const active=record=>!!record&&!record.committed&&['pending','confirmed'].includes(record.status);
function contextChild(cargo,state,id){
   const child=cargo.forms?.[id];
   return child&&child.id===id&&child.context_only===true&&child.parent===state.id&&child.task===state.task&&state.contexts?.[child.definition]===id?child:null;
}
function withdraw(cargo,state,record){
   const child=contextChild(cargo,state,record.child);
   if(child&&child.proposalPrompt?.id===record.id&&child.proposalPrompt?.signature===record.signature&&child.proposalPrompt?.input===record.input){child.confirmation=null;delete child.proposalPrompt;}
   delete record.approval;
}
const current=(state,record)=>record.owner_revision===state.revision&&record.signature===signature(identity(state),record.input,record.value,state.revision,record.descriptor);
function proofValid(cargo,state,record){
   if(!record||record.status!=='confirmed'||record.committed||record.deferred||!current(state,record)||!record.approval)return false;
   const proof=record.approval;
   if(proof.id!==record.id||proof.signature!==record.signature||proof.child!==record.child||!Number.isSafeInteger(proof.revision)||proof.confirmation?.revision!==proof.revision)return false;
   const child=cargo.forms?.[record.child];
   return !child||!!contextChild(cargo,state,record.child)&&child.proposalPrompt?.id===record.id&&child.proposalPrompt?.signature===record.signature&&child.revision===proof.revision&&formValuesEqual(child.confirmation,proof.confirmation)&&actionConfirmationValid(cargo,child.id,{signature:child.proposal?.signature||null});
}
function approved(cargo,state,record,reading){
   return token(reading.proposalResume,record)&&token(reading.proposalApproval,record)&&formValuesEqual(reading.value,record.value)&&proofValid(cargo,state,record);
}
/** Static policy selectors use this batch's proposed values; a validator's explicit descriptor independently applies. */
export function formProposalPolicy(cargo,reading,check,accepted=[]){
   const {state,spec}=inputOwner(cargo,reading.form,reading.name);
   const declared=spec.proposal===undefined?null:validateFormProposalPolicy(spec.proposal);
   const dynamic=check&&own(check,'proposal')&&check.proposal!==undefined?validateFormProposalDescriptor(check.proposal):null;
   if(check?.ok===false)return null;
   const record=recordFor(cargo,state,reading.name),values={...state.values,...Object.fromEntries(accepted.filter(hit=>hit.form===state.id&&hit.ok===true).map(hit=>[hit.name,hit.value])),[reading.name]:reading.value};
   const origin=reading.origin||'answer';
   const matches=declared&&formInputApplies(declared,values,cargo,state)&&(!declared.origins||declared.origins.includes(origin)||active(record));
   return matches||dynamic?{...(matches?declared:{}),...(dynamic||{})}:null;
}
/** A null descriptor admits ordinary input, but cannot silently waive the same retained candidate's consent. */
export function stageFormProposal(cargo,reading,descriptor){
   const {state}=candidate(cargo,reading),decision=descriptor===null?null:validateFormProposalDescriptor(descriptor);
   let old=recordFor(cargo,state,reading.name);
   const resumed=own(reading,'proposalResume');
   if(resumed&&!token(reading.proposalResume,old))return false;
   if(old?.committed&&resumed)return false;
   if(decision===null){
      if(!old||old.status==='superseded'||old.committed)return !own(reading,'proposalApproval');
      if(old.status==='declined'){
         if(!resumed&&!own(reading,'proposalApproval')){withdraw(cargo,state,old);old.status='superseded';return true;}
         return false;
      }
      if(formValuesEqual(old.value,reading.value)){
         if(approved(cargo,state,old,reading))return true;
         withdraw(cargo,state,old);old.status='superseded';return false;
      }
      if(resumed)return false;
      withdraw(cargo,state,old);old.status='superseded';return !own(reading,'proposalApproval');
   }
   const binding=data(decision.binding??null),value=data(reading.value),nextSignature=signature(identity(state),reading.name,value,state.revision,decision);
   const same=old&&!old.committed&&['pending','confirmed','declined'].includes(old.status)&&formValuesEqual(old.value,value)&&formValuesEqual(old.binding,binding);
   if(same&&old.status==='declined'&&resumed)return false;
   if(!same||old.status==='declined'){
      if(old){withdraw(cargo,state,old);old.status='superseded';}
      const sequence=state.inputProposalSequence??0;
      if(!Number.isSafeInteger(sequence)||sequence<0||!Number.isSafeInteger(sequence+1))fail('has an invalid proposal sequence');
      state.inputProposalSequence=sequence+1;
      old={id:`${state.id}:proposal:${state.inputProposalSequence}`,form:state.id,input:reading.name,owner:identity(state),value,reading:sourceReading(reading),descriptor:decision,binding,signature:nextSignature,owner_revision:state.revision,revision:1,status:'pending',committed:false,deferred:false,child:''};
      state.inputProposals||={};state.inputProposals[reading.name]=old;
   }else if(old.signature!==nextSignature){
      withdraw(cargo,state,old);Object.assign(old,{value,descriptor:decision,binding,signature:nextSignature,owner_revision:state.revision,revision:old.revision+1,status:'pending'});
   }
   old.deferred=false;
   return approved(cargo,state,old,reading);
}
/** Only actionable records enter the confirmation worker; dependency-deferred records await the normal batch. */
export function nextFormProposal(cargo,owner){
   const state=cargo.forms?.[owner];if(!state)return null;
   for(const spec of state.specs.flatMap(input=>input.any_of||[input])){
      const record=recordFor(cargo,state,spec.name);
      if(active(record)&&!record.deferred&&formInputApplies(spec,{...state.values,[spec.name]:record.value},cargo,state))return record;
   }
   return null;
}
/** Owner replay issues approval only for confirmed records; named child refresh never invents approval. */
export function formProposalReadings(cargo,owner,input='',approve=true){
   const state=cargo.forms?.[owner];if(!state)return [];
   const names=input?[input]:Object.keys(state.inputProposals||{}),out=[];
   for(const name of names){
      const {spec}=inputOwner(cargo,owner,name),record=recordFor(cargo,state,name);
      if(!record||record.committed||record.status==='superseded'||record.deferred||approve&&record.status!=='confirmed'||!input&&record.status==='declined')continue;
      const hit={...spec,...data(record.reading),form:owner,name,value:data(record.value),revalidate:true,proposalResume:{id:record.id,signature:record.signature}};
      delete hit.proposalApproval;
      if(approve&&proofValid(cargo,state,record))hit.proposalApproval={id:record.id,signature:record.signature};
      out.push(hit);
   }
   return out;
}
/** Bind only a real context child; ordinary child slots and unrelated owners cannot collect consent. */
export function bindFormProposal(cargo,owner,input,childId){
   const {state}=inputOwner(cargo,owner,input),record=recordFor(cargo,state,input),child=contextChild(cargo,state,childId);
   if(!active(record)||record.deferred||!current(state,record)||!child)fail('cannot bind a stale proposal or foreign confirmation child');
   if(record.child&&record.child!==childId)withdraw(cargo,state,record);
   if(child.proposalPrompt?.id!==record.id||child.proposalPrompt?.signature!==record.signature)child.confirmation=null;
   record.child=childId;child.proposalPrompt={id:record.id,signature:record.signature,input};return record;
}
/** Exact YES must have passed the ordinary confirm-form revision check; NO never admits the candidate. */
export function decideFormProposal(cargo,owner,input,childId,decision){
   if(!['confirmed','declined'].includes(decision))fail('has an invalid decision');
   const {state}=inputOwner(cargo,owner,input),record=recordFor(cargo,state,input),child=contextChild(cargo,state,childId);
   if(!active(record)||record.deferred||!current(state,record)||!child||record.child!==childId||child.proposalPrompt?.id!==record.id||child.proposalPrompt?.signature!==record.signature||child.proposalPrompt?.input!==input)return false;
   if(decision==='confirmed'&&!actionConfirmationValid(cargo,childId,{signature:child.proposal?.signature||null}))return false;
   record.status=decision;
   if(decision==='confirmed')record.approval={id:record.id,signature:record.signature,child:childId,revision:child.revision,confirmation:data(child.confirmation)};
   else {withdraw(cargo,state,record);child.confirmation=null;}
   return true;
}
/** Validate the entire final batch before consuming any proof; invoke immediately before acceptFormReadings. */
export function commitFormProposals(cargo,accepted=[]){
   const changes=[],readings=[];
   for(const hit of accepted){
      const {state}=candidate(cargo,hit);readings.push({state,hit});
      const record=recordFor(cargo,state,hit.name);if(!record){if(own(hit,'proposalResume')||own(hit,'proposalApproval'))fail('approval has no live record');continue;}
      const tagged=own(hit,'proposalResume')||own(hit,'proposalApproval');
      if(tagged){if(!approved(cargo,state,record,hit))fail('requires current unconsumed approval before commitment');if(changes.some(change=>change.record===record))fail('approval cannot be consumed twice in one batch');changes.push({state,record,commit:true});}
      else if(!record.committed&&record.status!=='superseded'&&formValuesEqual(record.value,hit.value))fail('cannot commit a retained candidate without approval');
      else if(!formValuesEqual(record.value,hit.value)&&record.status!=='superseded')changes.push({state,record,commit:false});
   }
   // Canonical exclusive selection also replaces uncommitted peer candidates, even if this input has no proposal.
   // Plan every withdrawal after validation, so an invalid later reading cannot partially consume consent.
   for(const {state,hit} of readings)for(const group of state.specs.filter(spec=>spec.exclusive===true&&spec.any_of?.some(member=>member.name===hit.name))){
      const peers=group.any_of.filter(member=>member.name!==hit.name);
      if(readings.some(other=>other.state.id===state.id&&peers.some(peer=>peer.name===other.hit.name)))fail('exclusive alternatives require clarification before commitment');
      for(const peer of peers){const record=recordFor(cargo,state,peer.name);if(active(record)&&!changes.some(change=>change.record===record))changes.push({state,record,commit:false});}
   }
   for(const {state,record,commit} of changes){if(commit){record.committed=true;record.deferred=false;}else record.status='superseded';withdraw(cargo,state,record);}
   return true;
}
/** Failed validation withdraws the candidate; unmet prerequisites wait for the normal dependency replay. */
export function settleFormProposalValidation(cargo,batch={}){
   for(const hit of [...(batch.rejected||[]),...(batch.ignored||[])]){const state=cargo.forms?.[hit.form];if(!state)continue;const record=recordFor(cargo,state,hit.name);if(active(record)){withdraw(cargo,state,record);record.status='superseded';}}
   for(const hit of batch.pending||[]){const state=cargo.forms?.[hit.form];if(!state)continue;const record=recordFor(cargo,state,hit.name);if(active(record))record.deferred=true;}
   return batch;
}
