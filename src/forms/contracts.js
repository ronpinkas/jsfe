/** Build-time contracts for conversational flows. Transport operations remain registered tools. */
import {ACTION_TOOLS} from './action-tools.js';
import {normalizeHostRequirements} from '../host/capabilities.js';
import {validateActionProjection,actionProjectionExpression} from './action-projection.js';
import { formFlow, FIELD_PRESETS } from './flows.js';
import { resolveFormInputs } from '../helpers/form-state.js';

const ROLES = new Set(['provider','performer','collector','gate','router','worker']);
const EFFECTS = new Set(['read','send','write','charge','cancel','handoff']);
const value = v => ({type:Array.isArray(v)?'array':v!==null&&typeof v==='object'?'object':typeof v,value:v});
const fail = (id, message) => { throw new Error(`Flow contract ${id}: ${message}`); };
const stepList = steps => (steps || []).flatMap(step => [step,...stepList(Object.values(step.branches || {})),...(step.onFail ? stepList([step.onFail]) : [])]);

export function providerQuestions(provides) {
   return [...(provides.facts || []),...(provides.sets || [])].filter(f => (f.words || f.asks || []).length)
      .map(f => ({key:f.key,words:f.words || f.asks}));
}
export function providerParameter(provides) {
   const entries=[...(provides.facts || []).filter(f=>f.gloss || f.asks?.length),...(provides.sets || [])];
   return {name:'asked',type:'string',enum:entries.map(f=>f.key),description:entries.map(f=>`${f.key}: ${f.gloss || (f.asks || []).join('; ') || f.label || f.key}`).join('. ')};
}
/** Link declarative sub-forms before runtime so any descendant field can receive an early answer. */
export function linkFormSchemas(flows,{externalFlows=[]}={}) {
   const registry=new Map([...externalFlows,...flows].map(flow=>[flow.id,flow])),memo=new Map();
   const inputsFor=(id,active=new Set())=>{
      if(memo.has(id))return memo.get(id);
      if(active.has(id))fail(id,'recursive sub-form definitions need an explicit repeated-group protocol');
      const flow=registry.get(id);if(!flow||flow.metadata?.formProtocol!==2)return null;
      active=new Set(active);active.add(id);
      const inputs=flow.variables.inputs.value.map(input=>{
         if(!input.form)return input;
         const target=registry.get(input.form);if(!target)fail(id,`unknown sub-form or worker ${input.form}`);
         const child=inputsFor(input.form,active);
         return child?{...input,schema:{definition:target.id,version:target.version,inputs:child,provides:target.variables?.provides?.value || null,questions:target.variables?.questions?.value || [],on_exhausted:target.variables?.form_on_exhausted?.value || null}}:input;
      });
      resolveFormInputs(inputs,FIELD_PRESETS);
      memo.set(id,inputs);return inputs;
   };
   const leafSchema=input=>{
      if(input.schema)return objectSchema(input.schema.inputs);
      if(input.profile?.kind==='choice'&&!input.profile.accept_other)return {type:'string',enum:(input.profile.choices||[]).map(c=>c.key),description:input.description || input.label || input.name};
      return {type:'string',description:input.description || input.label || input.name};
   };
   const objectSchema=inputs=>{
      const fields=inputs.flatMap(input=>input.any_of || [input]).filter(input=>input.schema || input.profile);
      return {type:'object',additionalProperties:false,required:fields.map(i=>i.name),properties:Object.fromEntries(fields.map(input=>[input.name,{anyOf:[leafSchema(input),{type:'null'}]}]))};
   };
   return flows.map(flow=>{
      const inputs=inputsFor(flow.id);if(!inputs)return flow;
      const parameters=[...(flow.parameters || [])];
      if(flow.primary)for(const input of inputs.flatMap(input=>input.any_of || [input])){
         if(parameters.some(p=>p.name===input.name)||!input.profile&&!input.schema)continue;
         parameters.push(input.schema?{name:input.name,type:'object',jsonSchema:objectSchema(input.schema.inputs),description:input.description || input.label || input.name}
            :{name:input.name,type:'string',...(input.profile.kind==='choice'&&!input.profile.accept_other?{enum:input.profile.choices.map(c=>c.key)}:{}),description:input.description || input.label || input.name});
      }
      return {...flow,parameters,variables:{...flow.variables,inputs:{...flow.variables.inputs,value:inputs}}};
   });
}
function declared(flow, contract) {
   if (!ROLES.has(contract.role)) fail(flow.id,'unknown role');
   if (!contract.summary) fail(flow.id,'summary is required');
   // Native declarations opt in explicitly; loading legacy flow JSON never changes its steps.
   const replacementDefaults=step=>({...step,
      ...(step.type==='FLOW'&&step.callType==='replace'?{initializeDefaults:step.initializeDefaults ?? true}:{}),
      ...(step.branches?{branches:Object.fromEntries(Object.entries(step.branches).map(([key,branch])=>[key,replacementDefaults(branch)]))}:{}),
      ...(step.onFail?{onFail:replacementDefaults(step.onFail)}:{})});
   const metadata={version:1,...contract,parametersFrom:'parameters'};
   if(contract.requires!==undefined)Object.defineProperty(metadata,'requires',{
      value:normalizeHostRequirements(contract.requires,flow.id),enumerable:true,writable:false,configurable:false,
   });
   return {...flow,steps:flow.steps.map(replacementDefaults),variables:{...flow.variables,contract:value(metadata)}};
}
export function defineWorker({contract,...flow}) {
   return declared({scope:'isolated',version:'1.0.0',...flow},contract);
}
export function defineProvider({provides,contract,parameters=[],variables={},steps,...flow}) {
   const asked=providerParameter(provides);
   return declared({scope:'isolated',version:'1.0.0',primary:true,...flow,
      parameters:[...parameters,asked],variables:{...variables,asked:value(''),provides:value(provides)},
      steps:steps || [{id:`${flow.id}_provide`,type:'FLOW',value:'provide-data',callType:'call',parameters:{provides:'{{provides}}',asked:'{{asked}}'}}]},
      {role:'provider',...contract,catalog:'provides'});
}
export function defineForm({contract,...spec}) {
   const flow=formFlow(spec);
   return declared(flow,{role:'collector',...contract,form:{inputs:'inputs'}});
}
export function definePerformer({performs,contract,prepare,present,project=[],...spec}) {
   validateActionProjection(project,spec.id);
   if(!Array.isArray(performs)||!performs.length||!prepare||!present)fail(spec.id,'performer needs actions, request preparation and outcome presentation');
   const confirm=spec.confirm || (performs.length===1&&performs[0].confirm?.question ? performs[0].confirm : null);
   if(performs.some(action=>action.confirm?.exact)&&!confirm)fail(spec.id,'exact action needs a declared form confirmation');
   const set=(id,variable,expression)=>({id:`${spec.id}_${id}`,type:'SET',variable,value:expression});
   const call=(id,target,parameters)=>({id:`${spec.id}_${id}`,type:'FLOW',value:target,callType:'call',parameters});
   const when=(id,condition,step)=>({id:`${spec.id}_${id}`,type:'CASE',branches:{[`condition: ${condition}`]:step,default:set(`${id}_skip`,'noop','true')}});
   const prepareSteps=[
      set('request_reset','noop','(cargo.actionRequest = null, true)'),
      call('prepare',prepare,{form:'{{form_instance}}'}),
      set('request','pf_request','cargo.actionRequest'),
      set('select','pf_action','selectFormAction(cargo, form_instance, performs)'),
      when('bad_request',"!(pf_action === null || pf_action && typeof pf_action === 'object' && pf_action.action) || pf_action !== null && (!pf_request || typeof pf_request !== 'object')",
         {id:`${spec.id}_prepare_failed`,type:'FLOW',value:'give-up',callType:'reboot',parameters:{context:'{{exit_context}}',context_es:'{{exit_context_es}}'}}),
      set('proposal','pf_record',"pf_action ? prepareFormAction(cargo, form_instance, pf_action, pf_request) : null"),
   ];
   const flow=formFlow({...spec,confirm,confirmation_condition:"pf_action !== null && pf_action && typeof pf_action === 'object'",
      extraVars:{...spec.extraVars,performs,projection:project,pf_action:null,pf_request:null,pf_record:null,pf_result:null,pf_receipt:null},
      before_confirm:confirm?[...prepareSteps,...(spec.before_confirm || [])]:spec.before_confirm || [],
      after:[...(confirm?[]:prepareSteps),
         when('perform','pf_action && typeof pf_action === \'object\'',call('execute','perform-action',{form:'{{form_instance}}',action:'{{pf_action}}',request:'{{pf_request}}',defer_receipt:true})),
         when('no_action','pf_action === null',set('not_applicable','noop',"(cargo.actionResult = {status:'not_applicable'}, cargo.actionReceipt=null, true)")),
         set('result','pf_result','cargo.actionResult'),
         set('receipt','pf_receipt','cargo.actionReceipt'),
         {...set('project','pf_projected',actionProjectionExpression(project,{form:'form_instance',formSnapshot:'cargo.forms[form_instance]',request:'pf_request',result:'pf_result',key:"pf_record ? (pf_record.durableKey || pf_record.key) : ''"})),requireTrue:true},
         {...set('receipt_applied','noop','pf_receipt ? consumeActionReceipt(cargo,pf_receipt) : true'),requireTrue:true},
         call('present',present,{form:'{{form_instance}}',request:'{{pf_request}}',result:'{{pf_result}}'}),
         ...(spec.after || [])]});
   return declared(flow,{role:'performer',...contract,requires:['durableActions',...normalizeHostRequirements(contract?.requires,spec.id)],actions:'performs',form:{inputs:'inputs'},prepares:prepare,presents:present,projects:'projection'});
}

/** A registered tool gets one generated adapter with explicit args; no dynamic tool-name interpreter is needed. */
export function operationWorkers(tools) {
   const workers=tools.map(tool=> {
      const schema=tool.schema || tool.parameters || tool;
      const names=Array.isArray(schema)?schema.map(p=>p.name):Object.keys(schema?.properties || schema || {}).filter(name => schema?.properties || schema[name] && typeof schema[name] === 'object' && !Array.isArray(schema[name]));
      const id=`operation:${tool.id}`;
      return defineWorker({id,name:`Operation ${tool.id}`,description:`Execute registered tool ${tool.id}; return its transport outcome.`,
         parameters:[{name:'request',type:'object',description:'Explicit tool arguments'}],variables:{request:value({}),operation_result:value(null)},
         contract:{role:'worker',summary:`Transport adapter for ${tool.id}`,tools:[tool.id],result:{path:'cargo.operationResult',type:'object'}},
         steps:[{id:`${id}_call`,type:'CALL-TOOL',tool:tool.id,variable:'operation_result',args:Object.fromEntries(names.map(name=>[name,`{{request.${name}}}`])),
            onFail:{id:`${id}_fail`,type:'FLOW',value:'operation-failed',callType:'replace',parameters:{error:'{{operation_result}}'}}},
            {id:`${id}_result`,type:'SET',variable:'noop',value:"(cargo.operationResult = { transport: 'ok', value: operation_result }, true)"}]});
   });
   workers.push(defineWorker({id:'operation-failed',name:'OperationFailed',description:'Return an explicit transport failure to the invoking performer or provider.',
      parameters:[{name:'error',type:'string',description:'Transport failure'}],contract:{role:'worker',summary:'Transport failure result',result:{path:'cargo.operationResult',type:'object'}},
      steps:[{id:'operation_failed_result',type:'SET',variable:'noop',value:"(cargo.operationResult = {transport:'failed',error:String(error || '')}, true)"}]}));
   return workers;
}

/** Validate compiled declarations and all static references against the actual combined flow/tool registry. */
export function validateFlowContracts(flows, tools=[], {externalFlows=[],requireAll=true,presets=FIELD_PRESETS}={}) {
   const ids=new Set(externalFlows),names=new Set(),toolIds=new Set([...tools,...ACTION_TOOLS].map(t=>t.id));
   for (const flow of flows) {
      if (ids.has(flow.id)) fail(flow.id,'duplicate id');
      if (names.has(flow.name)) fail(flow.id,'duplicate name');
      ids.add(flow.id);names.add(flow.name);
   }
   const missing=[];
   for (const flow of flows) {
      const contract=flow.variables?.contract?.value;
      if (!contract) {missing.push(flow.id);continue;}
      if (contract.version!==1 || !ROLES.has(contract.role) || !contract.summary) fail(flow.id,'invalid contract header');
      normalizeHostRequirements(contract.requires,flow.id);
      if(contract.projects)validateActionProjection(flow.variables?.[contract.projects]?.value,flow.id);
      const exhaustion=flow.variables?.form_on_exhausted?.value;
      if(exhaustion&&!ids.has(exhaustion))fail(flow.id,`unknown on_exhausted worker ${exhaustion}`);
      if (flow.primary && !flow.description) fail(flow.id,'primary requires trigger description');
      const inputSpecs=contract.inputs || flow.variables?.inputs?.value;
      if (inputSpecs) {
         // Already resolved field specs are valid without their original preset registry.
         const specs=resolveFormInputs(inputSpecs,presets), fieldNames=new Set(specs.flatMap(i=>[i.name,...(i.any_of || []).map(m=>m.name)]));
         const graph=new Map();
         for (const spec of specs.flatMap(i=>[i,...(i.any_of || [])])) {
            const deps=[...(spec.reset_on || []),...(spec.depends_on || []),...Object.keys({...spec.when,...spec.required_when}).filter(k=>!k.startsWith('cargo.')&&!k.startsWith('form.'))];
            for (const name of deps) if(!name.startsWith('cargo.')&&!name.startsWith('form.')&&!fieldNames.has(name)) fail(flow.id,`unknown dependency ${name}`);
            graph.set(spec.name,deps);
            for (const key of ['form','validator','prepare','refresh','after','answer_precheck','answer_validator','on_exhausted']) if(spec[key]&&!ids.has(spec[key])) fail(flow.id,`unknown ${key} worker ${spec[key]}`);
         }
         const visited=new Set(),active=new Set();
         const visit=name=>{if(active.has(name)) fail(flow.id,`cyclic input dependency ${name}`);if(visited.has(name))return;active.add(name);for(const dep of graph.get(name)||[])visit(dep);active.delete(name);visited.add(name);};
         for(const name of graph.keys())visit(name);
      }
      const provides=contract.provides || (contract.catalog ? flow.variables?.[contract.catalog]?.value : null);
      if(contract.role==='provider'&&!provides)fail(flow.id,'provider needs a catalog');
      if (provides) {
         if (!Array.isArray(provides.facts)||!provides.facts.length) fail(flow.id,'provider needs facts');
         const keys=new Set();
         for(const fact of provides.facts){if(!fact.key||keys.has(fact.key))fail(flow.id,'invalid or duplicate fact key');keys.add(fact.key);if(!fact.path&&!fact.flow)fail(flow.id,`fact ${fact.key} needs a source path or worker`);if(fact.flow&&!ids.has(fact.flow))fail(flow.id,`unknown fact worker ${fact.flow}`);}
         for(const set of provides.sets||[]){if(!set.key||keys.has(set.key))fail(flow.id,'invalid or duplicate fact set');for(const key of set.facts||[])if(!keys.has(key))fail(flow.id,`unknown fact ${key}`);keys.add(set.key);}
         if(provides.facts.some(f=>!f.public)&&(!provides.gate?.flow||![].concat(provides.gate.verified||[]).filter(Boolean).length))fail(flow.id,'private provider needs an explicit gate and verification condition');
         for(const reference of [provides.gate?.flow,provides.source?.flow])if(reference&&!ids.has(reference))fail(flow.id,`unknown provider worker ${reference}`);
      }
      for (const action of contract.performs || flow.variables?.[contract.actions]?.value || []) {
         if(action.retry?.unknown&&!(action.effect==='send'&&action.retry.unknown==='explicit'))fail(flow.id,'unknown effects may be explicitly repeated only for declared send actions');
         if(!action.action||!EFFECTS.has(action.effect))fail(flow.id,'action needs a name and effect');
         if(!action.tool&&!action.flow)fail(flow.id,`action ${action.action} needs a tool or execution worker`);
         if(action.tool&&!toolIds.has(action.tool))fail(flow.id,`unknown action tool ${action.tool}`);
         if(action.flow&&!ids.has(action.flow))fail(flow.id,`unknown action worker ${action.flow}`);
         if(!action.outcomes||!Object.keys(action.outcomes).length)fail(flow.id,`action ${action.action} needs outcomes`);
         if(['charge','write','send','cancel'].includes(action.effect)&&!action.idempotency&&!action.reconcile)fail(flow.id,`action ${action.action} needs idempotency or reconciliation`);
         if((action.effect==='charge'||action.effect==='cancel'||action.reversible===false)&&action.confirm?.exact!==true)fail(flow.id,`action ${action.action} needs exact confirmation`);
      }
      for(const tool of contract.tools || [])if(!toolIds.has(tool))fail(flow.id,`unknown tool ${tool}`);
      for(const step of stepList(flow.steps)) {
         if(step.type==='FLOW'||step.type==='CALL-TOOL'){
            const inspect=value=>{
               if(typeof value==='string')for(const match of value.matchAll(/\{\{(.*?)\}\}/g)){
                  if(!/^[\w$]+(?:\.[\w$]+)*$/.test(match[1].trim()))fail(flow.id,`step ${step.id} arguments support dotted paths, not expressions`);
               } else if(value&&typeof value==='object')Object.values(value).forEach(inspect);
            };
            inspect(step.parameters || step.args);
         }

         if(step.type==='FLOW'&&typeof step.value==='string'&&!step.value.includes('{{')&&!ids.has(step.value))fail(flow.id,`unknown flow ${step.value}`);
         if(step.type==='CALL-TOOL'&&(!toolIds.has(step.tool)||!step.onFail))fail(flow.id,`tool call ${step.id} needs a registered tool and onFail`);
         if(step.type==='SAY-GET'&&contract.role!=='collector')fail(flow.id,'input collection must use a collector');
      }
   }
   if(requireAll&&missing.length)throw new Error(`Missing flow contracts: ${missing.join(', ')}`);
   return {total:flows.length,declared:flows.length-missing.length,missing};
}
