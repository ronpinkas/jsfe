/** Explicit typed contextual responses. No engine state, transport, or host permissions. */
export const CONTEXTUAL_RESPONSES_REQUIREMENT = 'jsfe:contextual-responses:v1';
export const contextualResponseProtocol = () => 1;
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o || {},k);
const safeName=value=>typeof value==='string'&&/^[A-Za-z_$][\w$]*$/.test(value)&&!['__proto__','prototype','constructor'].includes(value);
const fail=message=>{throw new Error('Contextual response: '+message);};
/** Return an isolated declaration copy; unknown response fields cannot silently become legacy dispatch. */
export function validateContextualResponseStep(step,flow) {
 const typed=own(step,'responseParameters')||own(step,'responseVariable')||own(step,'responseChoices');
 if(!typed)return null;
 if(step.type!=='DISPATCH'||step.onResponse!=='continue'||typeof step.responseContext!=='string'||!step.responseContext.trim())fail('typed responses require DISPATCH onResponse:continue and nonempty responseContext');
 if(!safeName(step.responseVariable)||['cargo','currentContext','userInput','language','globalVariables'].includes(step.responseVariable)||!own(flow?.variables,step.responseVariable)||flow.variables[step.responseVariable]?.type!=='object')fail('responseVariable must name a declared object variable in this flow');
 const choices=own(step,'responseChoices');
 if(choices&&(!safeName(step.responseChoices)||step.responseChoices===step.responseVariable||!own(flow?.variables,step.responseChoices)||flow.variables[step.responseChoices]?.type!=='array'))fail('responseChoices must name a declared array variable in this flow');
 // responseParameters may name a declared array variable (a form reader's question declares them: rank_parameters); it
 // is read when the reply is ranked, and an empty list there declares none. Only beside responseChoices.
 const dynamic=typeof step.responseParameters==='string';
 if(dynamic&&(!choices||!safeName(step.responseParameters)||[step.responseVariable,step.responseChoices].includes(step.responseParameters)||!own(flow?.variables,step.responseParameters)||flow.variables[step.responseParameters]?.type!=='array'))fail('responseParameters naming a variable needs responseChoices and a declared array variable in this flow');
 // With choices, extraction is optional: a reply that picks none of them is { key: '' } unless parameters are declared.
 if(!dynamic&&!(choices&&!own(step,'responseParameters'))&&(!Array.isArray(step.responseParameters)||!step.responseParameters.length))fail('responseParameters must be a nonempty canonical parameter array');
 if(!dynamic)validateResponseParameters(step.responseParameters || []);
 else { /* validated when the reply is ranked */ }
 // responseStay: names a frame variable; while it is true a new request is not taken and the flow continues (must_complete); a withdrawal still ends the flows.
 if(own(step,'responseStay')&&(typeof step.responseStay!=='string'||!step.responseStay.trim()))fail('responseStay names a variable');
 // responseReasonFor: what the caller does not want; the reply is ranked as the reason for not wanting it (owner 2026-10-31).
 if(own(step,'responseReasonFor')&&(typeof step.responseReasonFor!=='string'||choices))fail('responseReasonFor is a string, on a question without responseChoices');
 // responseConcern: what the process does (a form's user_description); the ranker may read the reply as a concern about it.
 if(own(step,'responseConcern')&&typeof step.responseConcern!=='string')fail('responseConcern is a string');
 // responseConcernForm: a form instance; the nearest form in its chain declaring user_description, rendered by the engine.
 if(own(step,'responseConcernForm')&&typeof step.responseConcernForm!=='string')fail('responseConcernForm is a string');
 try{return structuredClone({parameters:dynamic?[]:step.responseParameters || [],...(dynamic?{parametersFrom:step.responseParameters}:{}),variable:step.responseVariable,...(choices?{choices:step.responseChoices}:{}),...(own(step,'responseReasonFor')?{reasonFor:step.responseReasonFor}:{}),...(own(step,'responseConcern')?{concern:step.responseConcern}:{}),...(own(step,'responseConcernForm')?{concernForm:step.responseConcernForm}:{})});}catch{fail('response parameters must be cloneable declaration data');}
}
/** The canonical response parameter list: a declared array (a step's own, or the variable it names when ranked). */
export function validateResponseParameters(list) {
 if(!Array.isArray(list))fail('response parameters must be an array');
 const names=new Set();
 for(const p of list){
  if(!p||typeof p!=='object'||Array.isArray(p)||!safeName(p.name)||names.has(p.name))fail('response parameter names must be unique safe identifiers');names.add(p.name);
  if(typeof p.description!=='string'||!p.description.trim())fail('response parameters need a description');
  if(p.type!==undefined&&!['string','boolean','number','integer'].includes(p.type))fail('unsupported response parameter type');
  if(p.enum!==undefined&&(!Array.isArray(p.enum)||!p.enum.length||p.enum.some(v=>typeof v!=='string')||p.type!==undefined&&p.type!=='string'))fail('response parameter enum must contain strings for a string parameter');
  if(p.internal!==undefined&&p.internal!==false)fail('response parameters must be public extraction parameters');
  if(own(p,'jsonSchema'))fail('response parameters support primitive types only; jsonSchema is not supported');
  if(p.verbatim!==undefined&&(p.verbatim!==true||p.type!==undefined&&p.type!=='string'||p.enum!==undefined))fail('verbatim is true on an open string parameter only');
  if(Object.keys(p).some(k=>!['name','description','type','enum','internal','verbatim'].includes(k)))fail('responseParameters accepts only canonical parameter descriptors');
 }
 try{return structuredClone(list);}catch{fail('response parameters must be cloneable declaration data');}
}
export function contextualResponseRuntimeSteps(id,steps,requirements=[]) {
 if(!requirements.includes(CONTEXTUAL_RESPONSES_REQUIREMENT))return steps;
 const guard={id:id+'_contextual_response_protocol',type:'SET',variable:'noop',value:'contextualResponseProtocol() === 1',requireTrue:true};
 return steps[0]?.type==='SET'&&steps[0]?.value===guard.value&&steps[0]?.requireTrue===true?steps:[guard,...steps];
}

/**
 * A normal extraction description for an open-ended FORM answer, using contextual DISPATCH. A reason question also names
 * what the caller does not want: `reason_for` (the words) or `reason_for_from` (the form data key holding them).
 */
export function validateFormResponse(response) {
 if(!response || typeof response!=='object' || Array.isArray(response) || Object.keys(response).some(k=>!['description','reason_for','reason_for_from'].includes(k)) || typeof response.description!=='string' || !response.description.trim())fail('FORM response requires a nonempty description (and optionally reason_for or reason_for_from)');
 if(response.reason_for!==undefined&&(typeof response.reason_for!=='string'||!response.reason_for.trim()))fail('FORM response reason_for must be nonempty text');
 if(response.reason_for_from!==undefined&&!safeName(response.reason_for_from))fail('FORM response reason_for_from must name a form data key');
 if(response.reason_for!==undefined&&response.reason_for_from!==undefined)fail('FORM response declares reason_for or reason_for_from, not both');
 return structuredClone(response);
}
export const hasFormResponse=inputs=>(inputs || []).some(input=>input.response!==undefined || hasFormResponse(input.any_of) || hasFormResponse(input.schema?.inputs));
