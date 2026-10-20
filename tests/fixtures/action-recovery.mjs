import {WorkflowEngine} from '../../dist/index.js';
import {FLOWS,definePerformer,linkFormSchemas} from '../../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../../dist/helpers/index.js';
import {createActionJournal,createMemoryActionStorage} from '../../dist/host/index.js';
const set=(id,variable,value)=>({id,type:'SET',variable,value});
const flow=(id,value)=>({id,type:'FLOW',value,callType:'call'});
const quiet={debug(){},info(){},warn(){},error(){}};
export function fixture(namespace,{storage=createMemoryActionStorage(),nested=false,completionTimeout}={}) {
   const effects=[];
   const port=()=>createActionJournal({storage,namespace});
   const performer=label=>definePerformer({id:label+'-task',name:label+'Task',description:'Independent '+label+' effect.',inputs:[],contract:{summary:'Recovery fixture '+label},prepare:'prepare-'+label,present:'present-'+label,
      performs:[{action:label,effect:'write',flow:'effect',idempotency:'journal',outcomes:{saved:'resolved',unknown:'unresolved'}}],
      project:[set(label+'-projection','noop',"(cargo.failProjection ? (function(){throw new Error('fixture projection failed');})() : null,cargo.projected=cargo.projected || [], result.status==='saved' && !cargo.projected.some(item=>item.key===key) ? cargo.projected.push({key,label:request.label,reference:result.reference}) : null, true)")],
      after:[set(label+'-after','noop',`(cargo.${label}After=pf_result,true)`)]});
   const workers=['alpha','beta'].flatMap(label=>[
      {id:'prepare-'+label,name:'Prepare'+label,parameters:[{name:'form',type:'string'}],steps:[set('request-'+label,'noop',`(cargo.actionRequest={label:'${label}'},true)`)]},
      {id:'present-'+label,name:'Present'+label,parameters:[{name:'form',type:'string'},{name:'request',type:'object'},{name:'result',type:'object'}],steps:[...(nested&&label==='alpha'?[flow('present-inner','beta-task')]:[]),{id:'say-'+label,type:'SAY',value:'{{request.label}} {{result.status}} {{result.reference || ""}}'}]}
   ]).concat([{id:'effect',name:'Effect',parameters:[{name:'request',type:'object'}],variables:{reply:{type:'object',value:null}},steps:[{id:'effect-tool',type:'CALL-TOOL',tool:'write',variable:'reply',args:{label:'{{request.label}}'},onFail:set('effect-unknown','reply',"({status:'unknown'})")},set('effect-outcome','noop','(cargo.actionOutcome=reply,true)')]},
      {id:'both-tasks',name:'BothTasks',steps:[flow('alpha','alpha-task'),flow('beta','beta-task')]},
      {id:'both-and-wait',name:'BothAndWait',steps:[flow('alpha','alpha-task'),flow('beta','beta-task'),{id:'review',type:'SAY-GET',value:'Current review?',variable:'answer'}]}]).map(worker=>({version:'1',description:worker.name,scope:'isolated',...worker}));
   const tools=[{id:'write',name:'write',description:'Fixture effect.',parameters:{type:'object',properties:{label:{type:'string'}},required:['label']},implementation:{type:'local',function:'write',retries:0}}];
   function engine(journal=port()) {
      const e=new WorkflowEngine(quiet,async()=>'{"flowName":"None"}',linkFormSchemas([...FLOWS,performer('alpha'),performer('beta'),...workers]),tools,{...STANDARD_FUNCTIONS,write:async({label})=>{effects.push(label);return {status:'saved',reference:label+'-'+effects.length};}},{},false,'en');
      if(completionTimeout!==undefined)e.toolsRegistry=e.toolsRegistry.map(tool=>tool.id==='jsfe:action-complete'?{...tool,implementation:{...tool.implementation,timeout:completionTimeout}}:tool);
      e.disableCommands();e.actionJournal=journal;return e;
   }
   return {engine,port,effects};
}
