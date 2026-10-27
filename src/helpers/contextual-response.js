/** Explicit typed contextual responses. No engine state, transport, or host permissions. */
export const CONTEXTUAL_RESPONSES_REQUIREMENT = 'jsfe:contextual-responses:v1';
export const contextualResponseProtocol = () => 1;
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o || {},k);
const safeName=value=>typeof value==='string'&&/^[A-Za-z_$][\w$]*$/.test(value)&&!['__proto__','prototype','constructor'].includes(value);
const fail=message=>{throw new Error('Contextual response: '+message);};
/** Return an isolated declaration copy; unknown response fields cannot silently become legacy dispatch. */
export function validateContextualResponseStep(step,flow) {
 const typed=own(step,'responseParameters')||own(step,'responseVariable');
 if(!typed)return null;
 if(step.type!=='DISPATCH'||step.onResponse!=='continue'||typeof step.responseContext!=='string'||!step.responseContext.trim())fail('typed responses require DISPATCH onResponse:continue and nonempty responseContext');
 if(!safeName(step.responseVariable)||['cargo','currentContext','userInput','language','globalVariables'].includes(step.responseVariable)||!own(flow?.variables,step.responseVariable)||flow.variables[step.responseVariable]?.type!=='object')fail('responseVariable must name a declared object variable in this flow');
 if(!Array.isArray(step.responseParameters)||!step.responseParameters.length)fail('responseParameters must be a nonempty canonical parameter array');
 const names=new Set();
 for(const p of step.responseParameters){
  if(!p||typeof p!=='object'||Array.isArray(p)||!safeName(p.name)||names.has(p.name))fail('response parameter names must be unique safe identifiers');names.add(p.name);
  if(typeof p.description!=='string'||!p.description.trim())fail('response parameters need a description');
  if(p.type!==undefined&&!['string','boolean','number','integer'].includes(p.type))fail('unsupported response parameter type');
  if(p.enum!==undefined&&(!Array.isArray(p.enum)||!p.enum.length||p.enum.some(v=>typeof v!=='string')||p.type!==undefined&&p.type!=='string'))fail('response parameter enum must contain strings for a string parameter');
  if(p.internal!==undefined&&p.internal!==false)fail('response parameters must be public extraction parameters');
  if(own(p,'jsonSchema'))fail('response parameters support primitive types only; jsonSchema is not supported');
  if(p.verbatim!==undefined&&(p.verbatim!==true||p.type!==undefined&&p.type!=='string'||p.enum!==undefined))fail('verbatim is true on an open string parameter only');
  if(Object.keys(p).some(k=>!['name','description','type','enum','internal','verbatim'].includes(k)))fail('responseParameters accepts only canonical parameter descriptors');
 }
 try{return structuredClone({parameters:step.responseParameters,variable:step.responseVariable});}catch{fail('response parameters must be cloneable declaration data');}
}
export function contextualResponseRuntimeSteps(id,steps,requirements=[]) {
 if(!requirements.includes(CONTEXTUAL_RESPONSES_REQUIREMENT))return steps;
 const guard={id:id+'_contextual_response_protocol',type:'SET',variable:'noop',value:'contextualResponseProtocol() === 1',requireTrue:true};
 return steps[0]?.type==='SET'&&steps[0]?.value===guard.value&&steps[0]?.requireTrue===true?steps:[guard,...steps];
}

/** A normal extraction description for an open-ended FORM answer, using contextual DISPATCH. */
export function validateFormResponse(response) {
 if(!response || typeof response!=='object' || Array.isArray(response) || Object.keys(response).some(k=>k!=='description') || typeof response.description!=='string' || !response.description.trim())fail('FORM response requires a nonempty description only');
 return structuredClone(response);
}
export const hasFormResponse=inputs=>(inputs || []).some(input=>input.response!==undefined || hasFormResponse(input.any_of) || hasFormResponse(input.schema?.inputs));
