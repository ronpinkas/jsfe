/** JSON declarations lower through the same authoring builders as programmatic declarations. */
import {Form,Provider,Performer,Worker} from './authoring.js';
import {linkFormSchemas,validateFlowContracts} from './contracts.js';
import {compileFormPrompts} from './prompt-compiler.js';
import {withSafetyRevision} from './continuation-safety.js';
import {capturedAuthorSpec,copyAuthorSpec,authoredExpressions} from './declaration-capture.js';
const formKeys=new Set(['inputs','before','after','confirm','before_confirm','declined','stop','close_on_stop','resume_on_parent_change','done','validator','confirmation_condition','prompt','prompt_es','incomplete_outcome','on_exhausted']);
const sharedKeys=['id','name','description','version','scope','primary','parameters','contract','parameterInstructions'];
const safe=/^[A-Za-z_$][\w$]*$/;
const fail=message=>{throw new Error('Flow declaration: '+message);};
// Trusted-author change detection, not an authentication signature. Stable in browsers and Node.
function sourceRevision(source){const text=JSON.stringify(source);const hashes=[2166136261,2246822507,3266489909,668265263];for(let i=0;i<text.length;i++)for(let lane=0;lane<hashes.length;lane++)hashes[lane]=Math.imul(hashes[lane]^text.charCodeAt(i),16777619+lane*2)>>>0;return hashes.map(n=>n.toString(16).padStart(8,'0')).join('');}
const variableDeclaration=value=>value&&typeof value==='object'&&!Array.isArray(value)&&['string','number','integer','boolean','object','array'].includes(value.type)?value:{type:Array.isArray(value)?'array':value===null||typeof value==='object'?'object':typeof value,value};

const DECLARATION_VERSIONS=new Set([1,2]);
/** A flow set's shared functions: one reserved entry, {id, library:'functions', declarationVersion:2, functions}. */
const isLibrary=flow=>!!flow&&typeof flow==='object'&&flow.library!==undefined;
function sharedFunctions(libraries){
 const shared={};
 for(const library of libraries){
  if(library.library!=='functions')fail('unsupported library '+String(library.library)+' on '+library.id);
  if(typeof library.id!=='string'||!library.id)fail('a shared functions entry needs an id');
  if(library.declarationVersion!==2)fail('shared functions '+library.id+' require declarationVersion 2');
  const extra=Object.keys(library).filter(key=>!['id','name','library','declarationVersion','description','functions'].includes(key));
  if(extra.length)fail('shared functions '+library.id+' cannot declare '+extra.join(', '));
  if(!library.functions||typeof library.functions!=='object'||Array.isArray(library.functions)||!Object.keys(library.functions).length)fail('shared functions '+library.id+' must declare a nonempty functions map');
  for(const [name,definition]of Object.entries(library.functions)){if(Object.hasOwn(shared,name))fail('shared function '+name+' is declared twice');shared[name]=structuredClone(definition);}
 }
 return shared;
}
const inputFields=inputs=>(inputs||[]).flatMap(input=>input.any_of||[input]);
/** Names a primary form generates: each input with a profile or a sub-form schema, and every field nested in one. */
const generatedFieldNames=inputs=>inputFields(inputs).flatMap(input=>[...(input.profile||input.schema?[input.name]:[]),...(input.schema?generatedFieldNames(input.schema.inputs):[])]);
/** Version 2 extraction values: a choice input's keys once each, minus choices declared `extract:false`. */
const extractableChoices=input=>{
 if(input?.profile?.kind!=='choice'||input.profile.accept_other)return null;
 const seen=new Set();return (input.profile.choices||[]).filter(choice=>choice.extract!==false&&!seen.has(choice.key)&&seen.add(choice.key));
};
const meaningText=choices=>choices.map(choice=>choice.key+': '+(choice.description||choice.label||choice.key)).join('; ');
/** A generated leaf read from its input: the enum it may take, each value's meaning (declared once, on its choice)
 * after the input's own rule, and `internal` for an input callers set but extraction never fills. */
function describeLeaf(input,leaf,{top=false}={}){
 if(!input)return leaf;
 const out={...leaf},choices=extractableChoices(input),rule=input.response?.description||input.description||'';
 if(choices&&Array.isArray(out.enum)){
  out.enum=choices.map(choice=>choice.key);
  if(choices.some(choice=>choice.description)){
   out.description=rule?rule+(/[.:;]$/.test(rule.trim())?' ':': ')+meaningText(choices):meaningText(choices);
   if(top)out.enumDescriptions=Object.fromEntries(choices.map(choice=>[choice.key,choice.description||choice.label||choice.key]));
  }
 }
 if(top&&input.internal===true)out.internal=true;
 return out;
}
function describeChoiceValues(flow){
 const inputs=inputFields(flow.variables?.inputs?.value);
 const describeSchema=(schema,owners)=>{
  if(!schema||schema.type!=='object'||!schema.properties)return schema;
  const properties=Object.fromEntries(Object.entries(schema.properties).map(([name,property])=>{
   const input=inputFields(owners).find(candidate=>candidate.name===name);const variants=property.anyOf||[property];
   const described=variants.map(variant=>variant.type==='object'?describeSchema(variant,input?.schema?.inputs):describeLeaf(input,variant));
   return [name,property.anyOf?{...property,anyOf:described}:described[0]];
  }));
  return {...schema,properties};
 };
 const parameters=(flow.parameters||[]).map(parameter=>{
  const input=inputs.find(candidate=>candidate.name===parameter.name);
  if(parameter.jsonSchema&&input?.schema)return {...describeLeaf(input,parameter,{top:true}),jsonSchema:describeSchema(parameter.jsonSchema,input.schema.inputs)};
  return describeLeaf(input,parameter,{top:true});
 });
 // Every generated parameter is a variable of the flow, as an authored one is (Form's parametersFor): the flow's
 // expressions read it by name whether or not it was supplied.
 const variables={...(flow.variables||{})};
 for(const parameter of parameters)if(!Object.hasOwn(variables,parameter.name)){
  const type=parameter.type||'string';
  variables[parameter.name]={type:type==='integer'?'number':type,value:type==='object'?null:type==='array'?[]:type==='boolean'?false:type==='number'||type==='integer'?0:''};
 }
 return {...flow,parameters,variables};
}
const callSteps=steps=>(steps||[]).flatMap(step=>[step,...callSteps(Object.values(step.branches||{})),...(step.onFail?callSteps([step.onFail]):[])]);
/** Version 2's single parameter contract: a parameter is generated from an input or authored, never both; a call
 * passes only what its target declares. */
function enforceParameterContract(flows,authored,builder,protocol=new Map()){
 const byId=new Map(flows.map(flow=>[flow.id,flow])),byName=new Map(flows.map(flow=>[flow.name,flow]));
 for(const [id,names]of authored){
  const flow=byId.get(id);
  const generated=new Set([...(builder.get(id)||[]),...(flow.primary?generatedFieldNames(flow.variables?.inputs?.value):[])]);
  for(const name of names)if(generated.has(name))fail(id+' parameter '+name+' is generated from its form; remove it from parameters');
 }
 for(const flow of flows)for(const step of callSteps(flow.steps)){
  if(step.type!=='FLOW'||typeof step.value!=='string'||step.value.includes('{{'))continue;
  const target=byId.get(step.value)||byName.get(step.value);
  if(!target||target.metadata?.declaration?.version!==2)continue;
  // A target compiled earlier (not authored in this call) keeps its protocol variables only as variables.
  const declared=new Set([...(target.parameters||[]).map(parameter=>parameter.name),...(protocol.get(target.id)||(target.variables?.form_instance!==undefined?Object.keys(target.variables):[]))]);
  for(const name of Object.keys(step.parameters||{}))if(!declared.has(name))fail(flow.id+' step '+step.id+' passes '+name+', which '+target.id+' does not declare');
 }
}

/** Compile only explicitly versioned declarations. Ordinary executable JSON is unchanged.
 * @param {any[]} flows
 * @param {{tools?: any[], externalFlows?: any[], validate?: boolean}} options
 * @returns {any[]}
 */
export function compileFlowDeclarations(flows,{tools,externalFlows=[],validate=true}={}){
 if(!Array.isArray(flows))fail('flows must be an array');
 // Functions compile only on declared flows (authored, or already compiled from a declaration); on any other flow they
 // would be silently ignored at run time.
 for(const flow of flows)if(flow&&flow.declarationVersion===undefined&&flow.library===undefined&&!flow.metadata?.declaration&&flow.functions!==undefined)fail((flow.id||'a flow')+' declares functions without declarationVersion');
 const libraries=flows.filter(isLibrary),shared=sharedFunctions(libraries);
 if(libraries.length)flows=flows.filter(flow=>!isLibrary(flow));
 if(!flows.some(flow=>flow?.declarationVersion!==undefined)){
  // Already compiled version 2 flows carry the shared functions merged in; the entry adds nothing to them.
  if(Object.keys(shared).length&&!flows.some(flow=>flow?.metadata?.declaration?.version===2))fail('shared functions need declarationVersion 2 flows');
  return flows;
 }
 const ids=new Set();for(const flow of flows){if(ids.has(flow.id))fail('duplicate flow id '+flow.id);ids.add(flow.id);}
 const authoredParameters=new Map(),builderParameters=new Map(),protocolVariables=new Map();
 const compiled=flows.map(source=>{
  if(source.declarationVersion===undefined)return source;
  if(!DECLARATION_VERSIONS.has(source.declarationVersion))fail('unsupported declarationVersion on '+source.id);
  const {declarationVersion,form,functions:ownFunctions,safetyRevision,...rest}=structuredClone(source);
  // Version 2: a flow's own functions plus the set's shared ones; a flow cannot redefine a shared name.
  if(declarationVersion===2&&ownFunctions&&typeof ownFunctions==='object')for(const name of Object.keys(ownFunctions))if(Object.hasOwn(shared,name))fail(source.id+' redefines shared function '+name);
  const functions=declarationVersion===2&&Object.keys(shared).length?{...structuredClone(shared),...(ownFunctions||{})}:ownFunctions;
  if(Object.hasOwn(source,'form')&&(!form||typeof form!=='object'||!Array.isArray(form.inputs)))fail(source.id+' form requires inputs');
  if(form&&[...formKeys].some(key=>Object.hasOwn(rest,key)))fail(source.id+' form options must be inside form');
  if(form&&rest.steps)fail(source.id+' cannot combine form and executable steps');
  if(rest.performs&&!form)fail(source.id+' performs requires form');
  if(functions!==undefined&&(!functions||Array.isArray(functions)||typeof functions!=='object'))fail(source.id+' functions must be a map');
  const spec=form?{...rest,...form,extraVars:Object.fromEntries(Object.entries(rest.variables||{}).map(([name,value])=>[name,value&&typeof value==='object'&&Object.hasOwn(value,'value')?value.value:value]))}:rest;
  if(form)delete spec.variables;
  const build=value=>rest.performs?Performer(value):form?Form(value):rest.provides?Provider(value):Worker(value);
  let flow=build(spec);
  if(declarationVersion===2&&form){
   const named=list=>(Array.isArray(list)?list:Object.keys(list||{}).map(name=>({name}))).map(p=>p.name);
   authoredParameters.set(source.id,named(rest.parameters));
   // What the builder adds on its own (form_instance, an input with a description) is generated, never authored.
   builderParameters.set(source.id,named(build({...spec,parameters:[]}).parameters));
  }
  // The form protocol's own variables (parent_form, result_input, …) are JSFE's to pass, never an author's.
  if(declarationVersion===2&&form)protocolVariables.set(source.id,Object.keys(flow.variables||{}).filter(name=>!Object.hasOwn(rest.variables||{},name)));
  const parameterNames=new Set();
  flow={...flow,parameters:(flow.parameters||[]).filter(parameter=>{if(parameterNames.has(parameter.name))return false;parameterNames.add(parameter.name);return true;}),...(rest.parameterInstructions!==undefined?{parameterInstructions:rest.parameterInstructions}:{}),...(functions?{functions}:{}),metadata:{...flow.metadata,declaration:{version:declarationVersion,source:source.id}}};
  // Revisions are engine bookkeeping; a stale authored token cannot override source change detection.
  const {safetyRevision:ignoredRevision,...revisionSource}=source;
  return withSafetyRevision(flow,'declaration-v'+declarationVersion+':'+sourceRevision(declarationVersion===2&&Object.keys(shared).length?{...revisionSource,sharedFunctions:shared}:revisionSource));
 });
 const externalObjects=externalFlows.filter(flow=>flow&&typeof flow==='object');
 const formIds=new Set(flows.filter(flow=>flow.declarationVersion!==undefined&&flow.form).map(flow=>flow.id));
 const prompted=compileFormPrompts(compiled.filter(flow=>formIds.has(flow.id)));
 const promptOwners=new Map(prompted.filter(flow=>formIds.has(flow.id)).map(flow=>[flow.id,flow]));
 const generated=prompted.filter(flow=>!formIds.has(flow.id));
 const installedIds=new Set([...ids,...externalFlows.map(flow=>typeof flow==='string'?flow:flow.id)]);
 for(const worker of generated){if(installedIds.has(worker.id))fail('generated question worker id collision '+worker.id);installedIds.add(worker.id);}
 const linked=linkFormSchemas([...compiled.map(flow=>promptOwners.get(flow.id)||flow),...generated],{externalFlows:externalObjects}).map(flow=>authoredParameters.has(flow.id)?describeChoiceValues(flow):flow);
 enforceParameterContract(linked,authoredParameters,builderParameters,protocolVariables);
 if(validate){
  const declaredIds=new Set([...flows.filter(flow=>flow.declarationVersion!==undefined).map(flow=>flow.id),...generated.map(flow=>flow.id)]);
  // Loading a declaration must not opt unrelated executable host/shared flows into authoring contracts.
  const declared=linked.filter(flow=>declaredIds.has(flow.id));
  const installed=[...externalFlows.map(flow=>typeof flow==='string'?flow:flow.id),...linked.filter(flow=>!declaredIds.has(flow.id)).map(flow=>flow.id)];
  validateFlowContracts(declared,tools||[],{externalFlows:[...new Set(installed)]});
 }
 return linked;
}

/** Return the original programmatic declaration, even after ordinary spread/clone transformations. */
export function captureOriginalDeclaration(flow){const saved=capturedAuthorSpec(flow);return saved?{component:saved.component,spec:copyAuthorSpec(saved.spec)}:null;}

function splitParameters(text){
 const parts=[];let start=0,depth=0,quote='',escape=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}if('"\'`'.includes(c)){quote=c;continue;}if('([{'.includes(c))depth++;if(')]}'.includes(c))depth--;if(c===','&&!depth){parts.push(text.slice(start,i).trim());start=i+1;}}
 if(text.slice(start).trim())parts.push(text.slice(start).trim());return parts;
}
/** Ordinary synchronous JavaScript source becomes named parameters and body lines, not a new language. */
function functionDefinition(fn){
 if(typeof fn!=='function'&&!(fn&&typeof fn.source==='string'))fail('only synchronous JavaScript functions can be serialized');
 if(typeof fn==='function'&&fn.constructor.name!=='Function')fail('only synchronous JavaScript functions can be serialized');
 const source=(typeof fn==='function'?Function.prototype.toString.call(fn):fn.source).trim();let parameters,body;
 if(/^(?:function\b|[A-Za-z_$][\w$]*\s*\()/.test(source)){
  const start=source.indexOf('(');let depth=1,end=start+1,quote='';for(;end<source.length;end++){const c=source[end];if(quote){if(c===quote&&source[end-1]!=='\\')quote='';continue;}if('"\'`'.includes(c)){quote=c;continue;}if(c==='(')depth++;if(c===')'&&!--depth)break;}
  parameters=splitParameters(source.slice(start+1,end));const open=source.indexOf('{',end);body=source.slice(open+1,source.lastIndexOf('}'));
 }else{
  const arrow=source.indexOf('=>');if(arrow<0)fail('unsupported function source');let head=source.slice(0,arrow).trim();if(head.startsWith('('))head=head.slice(1,-1);parameters=splitParameters(head);const tail=source.slice(arrow+2).trim();body=tail.startsWith('{')?tail.slice(1,-1):'return ('+tail+');';
 }
 const prelude=[];const used=new Set(parameters.filter(p=>safe.test(p)));
 const args=parameters.map((raw,i)=>{if(safe.test(raw))return {name:raw};let name='argument'+i;while(used.has(name))name+='_';used.add(name);if(raw.startsWith('...')){const target=raw.slice(3);prelude.push('const '+target+' = '+name+';');return {name,rest:true};}let depth=0,equals=-1;for(let j=0;j<raw.length;j++){if('([{'.includes(raw[j]))depth++;else if(')]}'.includes(raw[j]))depth--;else if(raw[j]==='='&&!depth){equals=j;break;}}if(equals>=0){const binding=raw.slice(0,equals).trim();prelude.push('let '+binding+' = '+name+' === undefined ? ('+raw.slice(equals+1)+') : '+name+';');}else prelude.push('const '+raw+' = '+name+';');return {name};});
 return {...(fn.name&&safe.test(fn.name)?{name:fn.name}:{}),parameters:args,body:[...prelude,...body.trim().split('\n')]};
}

/** One-time migration of an authored builder to the editable, self-contained JSON format. */
export function serializeFlowDeclaration(flow,{resolvedFlow=flow}={}){
 const saved=capturedAuthorSpec(flow);if(!saved)return structuredClone(resolvedFlow);
 const spec=copyAuthorSpec(saved.spec),registry={},sources=new Map();
 const register=(fn,preferred)=>{
  const source=typeof fn==='function'?Function.prototype.toString.call(fn):fn.source;let name=preferred||fn.name||'calculation';if(!safe.test(name))name='calculation';let suffix=2;while(registry[name]&&sources.get(name)!==source)name=(preferred||fn.name||'calculation')+'_'+suffix++;
  if(!registry[name]){registry[name]=functionDefinition(fn);sources.set(name,source);}return name;
 };
 const helpers=items=>{for(const [name,fn]of Object.entries(items||{}))register(fn,name);};
 const rewrite=value=>{
  if(typeof value==='string'){
   // Outer expressions first: their arguments can themselves contain authored expressions.
   for(const [source,entry]of [...authoredExpressions()].sort((a,b)=>b[0].length-a[0].length))if(value.includes(source)){const name=register(entry);value=value.split(source).join('fn.'+name+'('+entry.args.map(rewrite).join(',')+')');}
   return value;
  }
  if(typeof value==='function')fail('a function must be a declared calculation, projection or helper');
  if(Array.isArray(value))return value.map(rewrite);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,rewrite(item)]));
  return value;
 };
 helpers(spec.helpers);
 if(spec.calculate){const c=spec.calculate;helpers(c.helpers);const name=register(c.value);spec.steps=[...(spec.before||[]),{id:spec.id+'_calculate',type:'SET',variable:'noop',value:`(${c.result}=fn.${name}(${(c.args||[]).join(',')}),true)`,requireTrue:true}];spec.contract={result:{path:c.result,type:'object'},...spec.contract};delete spec.calculate;delete spec.before;}
 if(spec.project&&!Array.isArray(spec.project)){helpers(spec.project.helpers);const name=register(spec.project.apply);spec.project=[{id:spec.id+'_project',type:'SET',variable:'noop',value:`(function(){if(fn.${name}(cargo,{form:form,formSnapshot:formSnapshot,request:request,result:result,key:key})!==true)throw new Error('Performer projection must return true');return true;})()`}];}
 const result={declarationVersion:1};for(const key of sharedKeys)if(spec[key]!==undefined)result[key]=spec[key];
 for(const key of ['name','description','parameters','primary','scope','parameterInstructions'])if(resolvedFlow[key]!==undefined)result[key]=structuredClone(resolvedFlow[key]);
 const originalParameters=Array.isArray(spec.parameters)?spec.parameters:Object.entries(spec.parameters||{}).map(([name,value])=>({name,...(typeof value==='object'?value:{})}));
 const serializedParameterNames=new Set();
 if(result.parameters)result.parameters=result.parameters.filter(parameter=>{if(serializedParameterNames.has(parameter.name))return false;serializedParameterNames.add(parameter.name);return true;}).filter(parameter=>parameter.name!=='form_instance'||originalParameters.some(original=>original.name==='form_instance')).map(parameter=>{const original=originalParameters.find(p=>p.name===parameter.name);return original&&Object.hasOwn(original,'default')?{...parameter,default:original.default}:parameter;});
 const isForm=saved.component==='Form'||saved.component==='Performer';
 if(isForm){result.form={};for(const key of formKeys)if(spec[key]!==undefined)result.form[key]=spec[key];
  // Captured inputs are the authoring source; schema linking and question workers are derived on activation.
  for(const key of ['prompt','prompt_es'])if(resolvedFlow[key]!==undefined)result.form[key]=resolvedFlow[key];
  result.variables=Object.fromEntries(Object.entries(spec.extraVars||{}).map(([name,value])=>[name,variableDeclaration(value)]));
 }else if(spec.variables)result.variables=spec.variables;
 for(const [key,value]of Object.entries(spec))if(!sharedKeys.includes(key)&&!['extraVars','variables','helpers','safetyRevision'].includes(key)&&!(isForm&&formKeys.has(key)))result[key]=value;
 const out=rewrite(result);
 // Helpers and bodies can reference other explicitly authored expressions as well.
 for(const definition of Object.values(registry))definition.body=definition.body.map(rewrite);
 if(Object.keys(registry).length)out.functions=registry;
 JSON.stringify(out);return out;
}
