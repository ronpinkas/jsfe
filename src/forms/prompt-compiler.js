import {inheritFlowDeclaration} from './declaration-capture.js';
/** Compile contextual field prompts into workers; source declarations stay immutable. */
export function compileFormPrompts(forms) {
   const workers=[];
   const flows=forms.map(source=>{
      const flow=inheritFlowDeclaration(source,structuredClone(source));
      const visit=input=>{
         if(input.any_of){input.any_of.forEach(visit);return;}
         if(input.question_from)return;
         if(!String(input.question || '').includes('{{')&&!String(input.question_es || '').includes('{{'))return;
         const id=flow.id+'-'+input.name+'-question';
         const set=(suffix,variable,value)=>({id:id+'_'+suffix,type:'SET',variable,value});
         const literal=text=>String(text).includes('{{')?String(text):JSON.stringify(String(text));
         const steps=[...(input.prepare?[{id:id+'_prepare',type:'FLOW',value:input.prepare,callType:'call',parameters:{form:'{{form}}',input:'{{input}}'}}]:[]),
            set('data','data','cargo.forms[form].data || {}'),
            set('en','en',literal(input.question || '')),set('es','es',literal(input.question_es || input.question || '')),
            set('store','noop',`(cargo.forms[form].data=Object.assign({},cargo.forms[form].data,{${JSON.stringify(input.name+'_question')}:en,${JSON.stringify(input.name+'_question_es')}:es}),true)`)];
         workers.push({id,name:flow.name+input.name+'Question',version:'1.0.0',scope:'isolated',description:'Render the declared field question in its owning form context.',
            ...(flow.metadata?.declaration?{metadata:{declaration:{...flow.metadata.declaration}}}:{}),
            parameters:[{name:'form',type:'string'},{name:'input',type:'string'}],
            variables:{data:{type:'object',value:null},en:{type:'string',value:''},es:{type:'string',value:''},contract:{type:'object',value:{version:1,role:'worker',summary:'Render a contextual form prompt',parametersFrom:'parameters',result:{path:'cargo.forms[form].data',type:'object'}}}},steps});
         input.prepare=id;input.question_from=input.name+'_question';
      };
      flow.variables.inputs.value.forEach(visit);
      return flow;
   });
   return [...flows,...workers];
}
