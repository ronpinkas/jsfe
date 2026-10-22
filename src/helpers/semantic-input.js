import {INPUT_ASSESSMENT_SYSTEM} from './semantic-input-prompt.js';
/** Optional semantic completeness checks. They validate data, never infer consent or rewrite caller words. */
export const SEMANTIC_INPUT_REQUIREMENT = 'jsfe:semantic-input-validation:v1';
export const semanticInputValidationProtocol = () => 1;
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o || {},k);
const fail=message=>{throw new Error('Semantic input: '+message);};
export function validateInputMeaning(meaning) {
 if(!meaning || typeof meaning!=='object' || Array.isArray(meaning) || Object.keys(meaning).some(k=>!['purpose','acceptance'].includes(k)) || ['purpose','acceptance'].some(k=>typeof meaning[k]!=='string'||!meaning[k].trim()))fail('meaning requires nonempty purpose and acceptance strings only');
 return structuredClone(meaning);
}
export const hasInputMeaning=inputs=>(inputs || []).some(input=>input.meaning!==undefined || hasInputMeaning(input.any_of) || hasInputMeaning(input.schema?.inputs));
export function validateSemanticInputStep(step,flow) {
 const allowed=['id','type','value','question','purpose','acceptance','variable'];
 if(!step || step.type!=='ASSESS-INPUT'||Object.keys(step).some(k=>!allowed.includes(k)))fail('invalid ASSESS-INPUT declaration');
 if(['value','question','purpose','acceptance'].some(k=>typeof step[k]!=='string'||!step[k].trim()))fail('assessment needs nonempty value, question, purpose and acceptance strings');
 if(typeof step.variable!=='string'||!/^[$A-Z_a-z][$\w]*$/.test(step.variable)||['__proto__','prototype','constructor','cargo','currentContext','userInput','language','globalVariables'].includes(step.variable)||!own(flow?.variables,step.variable)||flow.variables[step.variable]?.type!=='object')fail('variable must name a declared object variable');
 return {variable:step.variable};
}
export function buildInputAssessment({value,question,purpose,acceptance}) {
 const system=INPUT_ASSESSMENT_SYSTEM;
 const user=JSON.stringify({question,purpose,acceptance,candidate:value});
 const schema=JSON.stringify({type:'json_schema',json_schema:{name:'input_assessment',strict:true,schema:{type:'object',properties:{ok:{type:'boolean'},disposition:{type:'string',enum:['accept','retry','cancel','redirect']}},required:['ok','disposition'],additionalProperties:false}}});
 return {system,user,schema};
}
export function normalizeInputAssessment(text) {
 const rejected={ok:false,disposition:'retry',unavailable:true};
 let value;try{value=typeof text==='string'?JSON.parse(text):text;}catch{return rejected;}
 if(!value || typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==2||!own(value,'ok')||!own(value,'disposition')||typeof value.ok!=='boolean'||!['accept','retry','cancel','redirect'].includes(value.disposition)||value.ok!==(value.disposition==='accept'))return rejected;
 return {ok:value.ok,disposition:value.disposition};
}
export function semanticInputRuntimeSteps(id,steps,requirements=[]) {
 if(!requirements.includes(SEMANTIC_INPUT_REQUIREMENT))return steps;
 const guard={id:id+'_semantic_input_protocol',type:'SET',variable:'noop',value:'semanticInputValidationProtocol() === 1',requireTrue:true};
 return steps[0]?.type==='SET'&&steps[0]?.value===guard.value&&steps[0]?.requireTrue===true?steps:[guard,...steps];
}
