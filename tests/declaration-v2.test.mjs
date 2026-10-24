/** declarationVersion 2: one parameter contract, shared functions, declared call arguments; and the option clarification. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,formFlow,linkFormSchemas,validateFlowContracts} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
import {compileFlowDeclarations} from '../dist/forms/declarations.js';
import {composeRegistries} from '../dist/host/index.js';
let count=0;const test=async(name,body)=>{await body();console.log('PASS '+name);count++;};
const compile=flows=>compileFlowDeclarations(flows,{validate:false});
const SERVICE={name:'service',label:'service',description:'service to cancel',question:'Which service?',question_es:'¿Qué servicio?',
   profile:{kind:'choice',choices:[{key:'club',label:'Gold Club',label_es:'Gold Club',description:'Gold Club membership',phrases:['club','membership']},{key:'bc',label:'Member Benefits',label_es:'Beneficios de Socio',description:'Member Benefits, including the benefits card',phrases:['benefits','membership']}]}};
const CARD={declarationVersion:2,id:'card-details',form:{inputs:[{name:'card_number',label:'card number',description:'the card number',profile:{kind:'digits',min:13,max:19},question:'Card number?',question_es:'¿Número?'}]}};
const cancel=(extra={})=>({declarationVersion:2,id:'cancel-it',description:'The caller wants to cancel a service.',primary:true,form:{inputs:[SERVICE,{name:'card',form:'card-details'}]},...extra});
const worker=(extra={})=>({declarationVersion:2,id:'say-it',parameters:[{name:'text',type:'string',description:'What to say'}],steps:[{id:'say',type:'SAY',value:'{{text}}'}],...extra});

await test('a generated parameter cannot also be authored, at the top level or nested',()=>{
   assert.throws(()=>compile([CARD,cancel({parameters:[{name:'service',type:'string',description:'copy'}]})]),/parameter service is generated from its form/);
   assert.throws(()=>compile([CARD,cancel({parameters:[{name:'card_number',type:'string',description:'flat copy'}]})]),/parameter card_number is generated from its form/);
   assert.throws(()=>compile([CARD,cancel({parameters:[{name:'form_instance',type:'string'}]})]),/parameter form_instance is generated/);
   const flow=compile([CARD,cancel({parameters:[{name:'cell_number',type:'string',description:'An identifier said up front'}]})]).find(f=>f.id==='cancel-it');
   assert.ok(flow.parameters.some(p=>p.name==='cell_number'));assert.ok(flow.parameters.some(p=>p.name==='card'&&p.jsonSchema.properties.card_number));
   // Version 1 keeps its behavior: the authored copy is accepted and wins.
   const v1=compile([{...CARD,declarationVersion:1},{...cancel({parameters:[{name:'service',type:'string',description:'copy'}]}),declarationVersion:1}]).find(f=>f.id==='cancel-it');
   assert.equal(v1.parameters.find(p=>p.name==='service').description,'copy');
});
await test('choice meanings are declared once on the choices and read into the generated parameter',()=>{
   const flow=compile([CARD,cancel()]).find(f=>f.id==='cancel-it');const p=flow.parameters.find(x=>x.name==='service');
   assert.deepEqual(flow.variables.service,{type:'string',value:''},'a generated parameter is a variable expressions can read');assert.deepEqual(flow.variables.card,{type:'object',value:null});
   assert.deepEqual(p.enum,['club','bc']);assert.equal(p.description,'service to cancel: club: Gold Club membership; bc: Member Benefits, including the benefits card');
   // A value the form offers but extraction must not set is declared on its choice; an input callers set but extraction never fills is internal.
   const narrowed={...SERVICE,description:'The service named.',profile:{kind:'choice',choices:[...SERVICE.profile.choices,{key:'decline',phrases:['none'],extract:false},{key:'club',phrases:['the club']}]}};
   const kind={name:'kind',internal:true,description:'Internal programmatic input: kind',profile:{kind:'choice',choices:[{key:'a',phrases:['a']},{key:'b',phrases:['b']}]}};
   const n=compile([CARD,cancel({form:{inputs:[narrowed,kind]}})]).find(f=>f.id==='cancel-it');
   const q=n.parameters.find(x=>x.name==='service');assert.deepEqual(q.enum,['club','bc']);assert.match(q.description,/^The service named\. club: /);
   assert.equal(n.parameters.find(x=>x.name==='kind').internal,true);
   assert.deepEqual(p.enumDescriptions,{club:'Gold Club membership',bc:'Member Benefits, including the benefits card'});
   const nested=compile([{...CARD,form:{inputs:[SERVICE]}},{declarationVersion:2,id:'wrap',description:'Cancel through a nested form.',primary:true,form:{inputs:[{name:'task',form:'card-details'}]}}]).find(f=>f.id==='wrap');
   const leaf=nested.parameters.find(x=>x.name==='task').jsonSchema.properties.service.anyOf[0];assert.match(leaf.description,/club: Gold Club membership; bc: Member Benefits/);
   const v1=compile([{...CARD,declarationVersion:1},{...cancel(),declarationVersion:1}]).find(f=>f.id==='cancel-it').parameters.find(x=>x.name==='service');
   assert.equal(v1.enumDescriptions,undefined);
});
await test('a call passes only arguments its version 2 target declares',()=>{
   const caller=args=>({declarationVersion:2,id:'caller',steps:[{id:'go',type:'FLOW',value:'say-it',callType:'call',parameters:args}]});
   assert.ok(compile([worker(),caller({text:'hi'})]));
   assert.throws(()=>compile([worker(),caller({text:'hi',tone:'warm'})]),/caller step go passes tone, which say-it does not declare/);
   const branched={declarationVersion:2,id:'caller',steps:[{id:'pick',type:'CASE',branches:{'condition: true':{id:'go',type:'FLOW',value:'SayIt',callType:'call',parameters:{volume:1}}}}]};
   assert.throws(()=>compile([worker({name:'SayIt'}),branched]),/passes volume, which say-it does not declare/);
   assert.ok(compile([{...worker(),declarationVersion:1},caller({text:'hi',tone:'warm'})]),'a version 1 target keeps its behavior');
});
await test('shared functions are declared once and reach every version 2 flow',async()=>{
   const library={id:'set-functions',library:'functions',declarationVersion:2,functions:{greet:{parameters:[{name:'who'}],body:["return 'Hello '+who;"]}}};
   const flows=[library,worker({steps:[{id:'say',type:'SAY',value:'{{fn.greet(text)}}'}]})];
   const compiled=compile(flows);assert.equal(compiled.length,1);assert.ok(compiled[0].functions.greet);
   assert.throws(()=>compile([library,worker({functions:{greet:{parameters:[],body:['return 1;']}}})]),/say-it redefines shared function greet/);
   assert.throws(()=>compile([library,{...library,id:'other'},worker()]),/shared function greet is declared twice/);
   assert.throws(()=>compile([{...library,declarationVersion:1},worker()]),/require declarationVersion 2/);
   assert.throws(()=>compile([{...library,steps:[]},worker()]),/cannot declare steps/);
   assert.throws(()=>compile([library,{id:'plain',steps:[]}]),/shared functions need declarationVersion 2 flows/);
   const composed=composeRegistries({flows:[flows],tools:[]});assert.equal(composed.flows.length,2);
   const quiet={info(){},debug(){},warn(){},error(){}};
   const e=new WorkflowEngine(quiet,async()=>'{"flowName":"None"}',composed.flows,[],STANDARD_FUNCTIONS,{},false,'en');e.disableCommands();
   let s=e.initSession('user',crypto.randomUUID(),'en');
   s=JSON.parse(JSON.stringify(await e.updateActivity({role:'user',content:'go',start:{flow:'say-it',arguments:{text:'Ana'}}},s)));
   assert.equal(s.response,'Hello Ana');
});
await test('functions on an undeclared flow fail instead of being silently ignored',()=>{
   assert.throws(()=>compile([{id:'plain',steps:[],functions:{x:{parameters:[],body:['return 1;']}}}]),/plain declares functions without declarationVersion/);
   const compiled=compile([worker({functions:{x:{parameters:[],body:['return 1;']}}})]);assert.ok(compile(compiled),'compiled declarations may be compiled again');
   const library={id:'set-functions',library:'functions',declarationVersion:2,functions:{one:{parameters:[],body:['return 1;']}}};
   const formAndCaller=[CARD,{declarationVersion:2,id:'again',steps:[{id:'go',type:'FLOW',value:'card-details',callType:'call',parameters:{parent_form:'x'}}]}];
   const once=compile([library,...formAndCaller]);assert.ok(compile([library,...once]),'a compiled set with its shared entry and form-protocol calls compiles again');
});
await test('a primary thin wrapper may inherit its description',()=>{
   const target={id:'target-flow',name:'TargetFlow',version:'1',description:'Target does the thing',primary:true,steps:[{id:'s',type:'SAY',value:'hi'}]};
   const wrapper={declarationVersion:2,id:'wrapper-flow',version:'1',wraps:'target-flow',primary:true,steps:[{id:'w',type:'FLOW',value:'target-flow',callType:'call'}]};
   const compiled=compileFlowDeclarations([wrapper],{tools:[],externalFlows:[target]});
   assert.ok(validateFlowContracts(compiled,[],{externalFlows:['target-flow'],requireAll:true}));
   assert.throws(()=>validateFlowContracts([{...compiled[0],wraps:undefined}],[],{externalFlows:['target-flow'],requireAll:true}),/primary requires trigger description/);
});
await test('a phrase two options of one input share is asked by their names',async()=>{
   const form=formFlow({id:'pick-service',name:'PickService',inputs:[SERVICE],after:[{id:'effect',type:'SET',variable:'noop',value:'(cargo.picked=cargo.forms[form_instance].values.service,true)'}]});
   const quiet={info(){},debug(){},warn(){},error(){}};
   for(const [language,question,answer] of [['en',/^Do you mean Gold Club or Member Benefits\? /,'benefits'],['es',/^¿Se refiere a Gold Club o a Beneficios de Socio\? /,'beneficios de socio']]){
      const e=new WorkflowEngine(quiet,async()=>'{"flowName":"None"}',linkFormSchemas([...FLOWS,form]),[],STANDARD_FUNCTIONS,{},false,language);e.disableCommands();
      let s=e.initSession('user',crypto.randomUUID(),language);s.cargo.voice=false;
      const say=async(content,start)=>{s=JSON.parse(JSON.stringify(await e.updateActivity({role:'user',content,...(start?{start:{flow:'pick-service'}}:{})},JSON.parse(JSON.stringify(s)))));return s.response||'';};
      await say('start',true);const r=await say('membership');assert.match(r,question,r);
      await say(answer);assert.equal(s.cargo.picked,'bc');
   }
});
console.log(`Declaration version 2: all ${count} checks passed`);
