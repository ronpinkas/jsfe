/** Concise author declarations compiled to the existing builders. No additional runtime protocol. */
import {defineForm,defineProvider,definePerformer,defineWorker} from './contracts.js';
import {FIELD_PRESETS} from './flows.js';
import {captureAuthorSpec,rememberExpression} from './declaration-capture.js';
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o || {},k);
const namePattern=/^[A-Za-z_$][\w$]*$/;
const forbidden=new Set(['__proto__','prototype','constructor']);
const safeName=name=>namePattern.test(name)&&!forbidden.has(name);
const fail=message=>{throw new Error('Flow authoring: '+message);};
const descriptor=value=>value&&typeof value==='object'&&!Array.isArray(value)&&typeof value.type==='string'&&['string','boolean','number','integer','object','array'].includes(value.type);
const variable=value=>descriptor(value)?structuredClone(value):{type:Array.isArray(value)?'array':value===null||typeof value==='object'?'object':typeof value,value:structuredClone(value)};

function parametersFor(parameters=[]) {
 const list=Array.isArray(parameters)?parameters:Object.entries(parameters).map(([name,p])=>typeof p==='string'?{name,type:'string',description:p}:{name,...p});
 const variables={},seen=new Set();
 const declarations=list.map(p=>{
  if(!p||!safeName(p.name)||seen.has(p.name))fail('parameter names must be unique safe identifiers');seen.add(p.name);
  const {default:initial,...declaration}=p;
  const type=p.type || 'string';
  if(!['string','boolean','number','integer','object','array'].includes(type))fail('unsupported parameter type '+type);
  const defaultValue=own(p,'default')?initial:type==='object'?null:type==='array'?[]:type==='boolean'?false:type==='number'||type==='integer'?0:'';
  variables[p.name]={type:type==='integer'?'number':type,value:structuredClone(defaultValue)};
  return declaration;
 });
 return {parameters:declarations,variables};
}

function normalize(spec,{form=false}={}) {
 if(!spec || typeof spec.id!=='string' || !spec.id.trim() || spec.id!==spec.id.trim() || forbidden.has(spec.id))fail('a stable flow id is required');
 const normalized=parametersFor(spec.parameters);
 // A field's existing description is also its public extraction declaration. Aliases stay explicit parameters.
 if(form&&spec.primary)for(const field of (spec.inputs || []).flatMap(input=>input.any_of || [input])){
  if(!field.description || normalized.parameters.some(p=>p.name===field.name))continue;
  const profile=field.profile || FIELD_PRESETS[field.field]?.profile;
  if(!profile)continue;
  const parameter={name:field.name,type:'string',description:field.description,...(profile.kind==='choice'&&!profile.accept_other?{enum:[...new Set((profile.choices || []).map(choice=>choice.key))]}:{})};
  const extra=parametersFor([parameter]);normalized.parameters.push(parameter);Object.assign(normalized.variables,extra.variables);
 }
 const rawVariables=form?spec.extraVars:spec.variables;
 const variables={...normalized.variables,...Object.fromEntries(Object.entries(rawVariables || {}).map(([name,v])=>[name,variable(v)]))};
 const contract={summary:spec.description || spec.name || spec.id,...spec.contract};
 return {...spec,name:spec.name || spec.id.split(/[-:]/).map(part=>part.charAt(0).toUpperCase()+part.slice(1)).join(''),parameters:normalized.parameters,contract,...(form?{extraVars:Object.fromEntries(Object.entries(variables).map(([name,v])=>[name,v.value]))}:{variables})};
}

/** Serialize only declared synchronous functions; dependencies must be explicit rather than captured closures. */
function functionSource(fn) {
 if(typeof fn!=='function'||fn.constructor.name!=='Function')fail('calculations and projections require synchronous functions');
 const source=Function.prototype.toString.call(fn);if(source.includes('[native code]'))fail('native functions cannot be compiled');return source;
}
/** Compile an authored synchronous calculation inside an existing SET/CASE expression.
 * Arguments are developer-authored JavaScript source, never caller text or runtime values.
 * This advanced helper does not change Worker.calculate's path-only argument validation.
 */
export function compileExpression(fn,...args) {
 if(args.some(arg=>typeof arg!=='string'||!arg.trim()))fail('expression arguments must be nonempty authored JavaScript expressions');
 return rememberExpression(`(${functionSource(fn)})(${args.join(',')})`,fn,args);
}
function expression(fn,args=[],helpers={}) {
 if(!Array.isArray(args)||args.some(arg=>typeof arg!=='string'||!/^[$A-Z_a-z][$\w]*(?:\.[$A-Z_a-z][$\w]*)*$/.test(arg)))fail('function arguments must be explicit variable paths');
 const bindings=Object.entries(helpers).map(([name,helper])=>{if(!safeName(name)||['cargo','form','formSnapshot','request','result','key'].includes(name))fail('invalid helper binding '+name);return `const ${name}=(${functionSource(helper)});`;}).join('\n');
 return `(function(){${bindings}return (${functionSource(fn)})(${args.join(',')});})()`;
}

const authored=(flow,component,spec)=>captureAuthorSpec({...flow,metadata:{...flow.metadata,authoring:{component}}},component,spec);

export function Worker(spec) {
 const {call,calculate,before=[],...rest}=normalize(spec);
 if([call!==undefined,calculate!==undefined,spec.steps!==undefined].filter(Boolean).length>1)fail('Worker declares one of steps, call or calculate');
 if(call){if(typeof call.flow!=='string'||!call.flow)fail('Worker.call needs a flow');rest.steps=[...before,{id:spec.id+'_call',type:'FLOW',value:call.flow,callType:'call',...(call.parameters?{parameters:call.parameters}:{})}];}
 else if(calculate){
  if(typeof calculate.result!=='string'||!/^cargo(?:\.[A-Za-z_$][\w$]*)+$/.test(calculate.result)||calculate.result.split('.').some(part=>forbidden.has(part)))fail('Worker.calculate.result must be a safe cargo path');
  rest.steps=[...before,{id:spec.id+'_calculate',type:'SET',variable:'noop',value:`(${calculate.result}=${expression(calculate.value,calculate.args,calculate.helpers)},true)`,requireTrue:true}];
  rest.contract={result:{path:calculate.result,type:'object'},...rest.contract};
 }else if(before.length)rest.steps=[...before,...(rest.steps || [])];
 return authored(defineWorker({...rest,contract:{role:'worker',...rest.contract}}),'Worker',spec);
}
export function Provider(spec){return authored(defineProvider(normalize(spec)),'Provider',spec);}
export function Form(spec){return authored(defineForm(normalize(spec,{form:true})),'Form',spec);}
export function Performer(spec){
 const normalized=normalize(spec,{form:true});
 if(spec.provides){normalized.extraVars.provides=spec.provides;}
 if(spec.project&&!Array.isArray(spec.project)){
  const project=spec.project;
  const helpers=Object.entries(project.helpers || {}).map(([name,fn])=>{if(!safeName(name)||['cargo','form','formSnapshot','request','result','key'].includes(name))fail('invalid projection helper');return `const ${name}=(${functionSource(fn)});`;}).join('\n');
  normalized.project=[{id:spec.id+'_project',type:'SET',variable:'noop',value:`(function(){${helpers}if((${functionSource(project.apply)})(cargo,{form:form,formSnapshot:formSnapshot,request:request,result:result,key:key})!==true)throw new Error('Performer projection must return true');return true;})()`}];
 }
 return authored(definePerformer(normalized),'Performer',spec);
}
