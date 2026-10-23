import {inheritFlowDeclaration} from './declaration-capture.js';
/** Opt in deliberately when a safety fix makes old serialized steps unsafe to resume. */
export const continuationSafetyProtocol=()=>1;
export const CONTINUATION_SAFETY_REQUIREMENT='jsfe:continuation-safety:v1';
export function withSafetyRevision(flow,revision) {
 if(typeof revision!=='string'||!revision.trim()||revision!==revision.trim())throw new Error('safetyRevision requires a nonempty unpadded string');
 const guard={id:flow.id+'_continuation_safety_protocol',type:'SET',variable:'noop',value:'continuationSafetyProtocol() === 1',requireTrue:true};
 const steps=flow.steps.filter(step=>step.id!==guard.id),original=flow.variables?.contract;
 const variables={noop:{type:'boolean',scope:'flow',value:false},...flow.variables};
 // A safety upgrade does not invent a partial declarative FORM contract for legacy workers.
 if(original)variables.contract={...original,value:{...original.value,requires:[...new Set([...(original.value?.requires || []),CONTINUATION_SAFETY_REQUIREMENT])]}};
 return inheritFlowDeclaration(flow,{...flow,safetyRevision:revision,steps:[guard,...steps],variables});
}
