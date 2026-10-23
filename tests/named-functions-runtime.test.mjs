/** JSON-declared functions execute ordinary JS while sessions and action ownership stay data-only. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,compileFlowDeclarations} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS,compileNamedFunctions} from '../dist/helpers/index.js';
import {createActionJournal,createMemoryActionStorage} from '../dist/host/index.js';
const clone=value=>JSON.parse(JSON.stringify(value));
const set=(id,variable,value,extra={})=>({id,type:'SET',variable,value,...extra});
const fn=(parameters,body,name)=>({parameters:parameters.map(parameter=>typeof parameter==='string'?{name:parameter}:parameter),body,...(name?{name}:{})});
const simple=(id,options={})=>({declarationVersion:1,id,name:id,version:'1',description:'Runtime fixture '+id,scope:'isolated',...options});
let checks=0;const test=async(name,run)=>{await run();checks++;console.log('PASS '+name);};
const warnings=[];const quiet={debug(){},info(){},warn(...args){warnings.push(args.join(' '));},error(...args){warnings.push(args.join(' '));}};
function engine(flows,{tools=[],approved={},journal=null,mode='session-only'}={}){
 const e=new WorkflowEngine(quiet,async()=>'{"flowName":"None"}',[...FLOWS,{id:'give-up',name:'GiveUp',version:'1',description:'Fixture terminal handoff.',steps:[{id:'done',type:'END'}]},...flows],tools,{...STANDARD_FUNCTIONS,...approved},{},false,'en');
 e.disableCommands();e.actionPersistence=mode;if(journal)e.actionJournal=journal;return e;
}
const start=(e,s,id,args={})=>e.updateActivity({role:'user',content:'begin',start:{flow:id,arguments:args}},s);
const answer=(e,s,text)=>e.updateActivity({role:'user',content:text},clone(s));
await test('ordinary loops, callbacks, nested functions, sibling aliases and real argument values execute',async()=>{
 const definitions={
  twice:fn(['value'],['return value * 2;']),
  total:fn(['rows'],['let result = 0;','function add(value) { result += value; }','rows.map(row => twice(row.amount)).forEach(add);','return result;']),
  factorial:fn(['n'],['return n <= 1 ? 1 : n * originalFactorial(n - 1);'],'originalFactorial'),
  restSum:fn([{name:'values',rest:true}],['return values.reduce((a,b) => a+b, 0);']),
  echo:fn(['value'],['return value;']),
  platform:fn(['value'],['return approvedLabel(value);'])
 };
 const flow=simple('ordinary-js',{parameters:[{name:'payload',type:'object'},{name:'text',type:'string'}],functions:definitions,steps:[
  set('total','noop','(cargo.total=fn.total(payload.rows),cargo.factorial=fn.factorial(5),cargo.restSum=fn.restSum(1,2,3),cargo.literal=fn.echo(text),true)',{requireTrue:true}),
  {id:'branch',type:'CASE',branches:{'condition: fn.twice(3) === 6':{id:'say',type:'SAY',value:'{{fn.platform(cargo.total)}} / {{cargo.factorial}}'},default:{id:'wrong',type:'SAY',value:'wrong branch'}}}
 ]});
 const raw=clone(flow),e=engine([flow],{approved:{approvedLabel:value=>'total='+value}});
 assert.deepEqual(flow,raw,'constructor must not annotate authoring input');
 const copy=e.getFlowDeclarations();copy.at(-1).functions.total.body=['return 0;'];assert.deepEqual(e.getFlowDeclarations().at(-1),raw,'editor copies are detached');
 const attack='"; cargo.executed = true; //';
 const s=await start(e,e.initSession('user','ordinary-js','en'),flow.id,{payload:{rows:[{amount:2},{amount:3}]},text:attack});
 assert.equal(s.cargo.total,10);assert.equal(s.cargo.factorial,120);assert.equal(s.cargo.restSum,6);assert.equal(s.cargo.literal,attack);assert.equal(s.cargo.executed,undefined);assert.equal(s.response,'total=10 / 120');
 assert.equal(s.flowStacks.flat().length,0);assert.doesNotThrow(()=>JSON.stringify(s));
 const compiled=compileNamedFunctions(definitions,{approvedFunctions:{approvedLabel:value=>'total='+value}});assert.equal(compiled.total([{amount:4}]),8);
});
function form(id,prefix){return simple(id,{functions:{label:fn(['value'],[`return ${JSON.stringify(prefix)}+value;`]),save:fn(['cargo','value'],[`cargo[${JSON.stringify(id)}] = value; return true;`])},form:{inputs:[{name:'value',profile:{kind:'text'},question:'{{fn.label(cargo.tag)}}'}],after:[set('save','noop',"fn.save(cargo, cargo.forms[form_instance].values.value)",{requireTrue:true})]}});}
await test('generic form workers use their owning namespace across JSON round trips and interleaved sessions',async()=>{
 const e=engine([form('A','A:'),form('B','B:')]);let a=e.initSession('a','a','en'),b=e.initSession('b','b','en');a.cargo.tag='one';b.cargo.tag='two';
 a=await start(e,a,'A');assert.equal(a.response,'A:one');b=await start(e,b,'B');assert.equal(b.response,'B:two');
 const snapshot=JSON.stringify(a);assert.equal(snapshot.includes('namedFunctionNamespaces'),false);assert.equal(snapshot.includes('function label'),false);assert.equal(a.flowStacks.flat().some(frame=>Object.hasOwn(frame.variables,'fn')),false);
 a=await answer(e,a,'alpha');assert.equal(a.cargo.A,'alpha');assert.equal(a.cargo.B,undefined);
 b=await answer(e,b,'beta');assert.equal(b.cargo.B,'beta');assert.equal(b.cargo.A,undefined);
 const other=engine([form('A','OTHER:')]);let c=other.initSession('c','c','en');c.cargo.tag='three';c=await start(other,c,'A');assert.equal(c.response,'OTHER:three');
});
await test('a foreign or retired explicit form owner never borrows another live function namespace',async()=>{
 const owner=form('owner','OWNER:');owner.form.before=[{id:'probe',type:'FLOW',value:'scope-probe',callType:'call',parameters:{form:'retired'}}];
 const probe={id:'scope-probe',name:'ScopeProbe',version:'1',description:'Explicit missing owner.',scope:'isolated',parameters:[{name:'form',type:'string'}],steps:[set('check','noop',"(cargo.foreignNamespaceVisible=typeof fn !== 'undefined',true)")]};
 const e=engine([owner,probe]);let s=e.initSession('u','scope','en');s.cargo.tag='x';s=await start(e,s,'owner');assert.equal(s.cargo.foreignNamespaceVisible,false);assert.equal(s.response,'OWNER:x');
});
await test('required SET failures still fail before subsequent effects',async()=>{
 const flow=simple('required',{functions:{accept:fn([],['return false;'])},steps:[set('must','noop','fn.accept()',{requireTrue:true}),set('later','noop','(cargo.later=true,true)')]});
 const e=engine([flow]),s=e.initSession('u','required','en');await assert.rejects(start(e,s,flow.id),/Required SET/);assert.equal(s.cargo.later,undefined);
});
function actionFixture({outcome={status:'saved',reference:'R1'},durable=false}={}){
 const effects=[],storage=createMemoryActionStorage();const journal=()=>createActionJournal({storage,namespace:'named-functions-runtime'});
 const performer=simple('named-action',{form:{inputs:[]},prepare:'named-prepare',present:'named-present',performs:[{action:'save',effect:'charge',idempotency:'journal',flow:'named-effect',subject:'cargo.account',gate:{verified:'cargo.verified'},confirm:{exact:true,question:'Confirm named action?'},outcomes:{saved:'resolved',unknown:'unresolved'}}],project:[set('project','noop','fn.project(cargo,request,result,key)',{requireTrue:true})],functions:{
  request:fn(['cargo'],['return {account:cargo.account,amount:25};']),
  project:fn(['cargo','request','result','key'],["cargo.projected ||= [];","if (result.status === 'saved' && !cargo.projected.some(row=>row.key===key)) cargo.projected.push({key,reference:result.reference,account:request.account});","return true;"]),
  present:fn(['result'],['return "own:"+result.status+":"+(result.reference || "");'])
 }});
 const workers=[{id:'named-prepare',name:'NamedPrepare',steps:[set('prepare','noop','(cargo.actionRequest=fn.request(cargo),true)')]},
  {id:'named-present',name:'NamedPresent',parameters:[{name:'form',type:'string'},{name:'result',type:'object'}],steps:[{id:'say',type:'SAY',value:'{{fn.present(result)}}'},{id:'wait',type:'SAY-GET',value:'Receipt?',variable:'answer'}]},
  {id:'named-effect',name:'NamedEffect',parameters:[{name:'request',type:'object'}],steps:[{id:'write',type:'CALL-TOOL',tool:'write',variable:'result',args:{request:'{{request}}'}},set('outcome','noop','(cargo.actionOutcome=result,true)')]}].map(worker=>({version:'1',description:worker.name,scope:'isolated',...worker}));
 const tools=[{id:'write',name:'Write',description:'Local fixture write.',parameters:{type:'object',properties:{request:{type:'object'}}},implementation:{type:'local',function:'write',retries:0}}];
 const make=()=>engine([performer,...workers],{tools,approved:{write:async({request})=>{effects.push(clone(request));return clone(outcome);}},mode:durable?'durable':'session-only',journal:durable?journal():null});
 const session=e=>{const s=e.initSession('u','action-session','en');Object.assign(s.cargo,{account:'A',verified:true});return s;};
 return {make,session,effects,journal,performer};
}
await test('exact confirmation and saved unknown action holds remain intact with named prepare/present/project functions',async()=>{
 const f=actionFixture({outcome:{status:'unknown'}});let e=f.make(),s=f.session(e);s=await start(e,s,'named-action');assert.match(s.response,/Confirm named action/);assert.equal(f.effects.length,0);
 s=await answer(e,s,'maybe');assert.equal(f.effects.length,0);s=await answer(e,s,'yes');assert.equal(f.effects.length,1);assert.match(s.response,/own:unknown/);
 e=f.make();s=await start(e,clone(s),'named-action');s=await answer(e,s,'yes');assert.equal(f.effects.length,1,'unknown action is not retried after reentry');assert.equal((s.cargo.projected||[]).length,0);
});
await test('a function edit cannot release a saved unknown action into a changed request',async()=>{
 const f=actionFixture({outcome:{status:'unknown'}});let e=f.make(),s=f.session(e);s=await start(e,s,'named-action');s=await answer(e,s,'yes');assert.equal(f.effects.length,1);
 f.performer.functions.request.body=['return {account:cargo.account,amount:30};'];
 e=f.make();s=await start(e,clone(s),'named-action');s=await answer(e,s,'yes');assert.equal(f.effects.length,1,'function edits cannot retry an unresolved earlier charge');
});
await test('detached late recovery projects using its original declared namespace without replaying the write or current caller',async()=>{
 const f=actionFixture({durable:true});let e=f.make(),s=f.session(e);s=await start(e,s,'named-action');const before=clone(s);await answer(e,s,'yes');assert.equal(f.effects.length,1);
 // The successful host save was lost. A newer current task/authentication snapshot must survive.
 const current=clone(before);current.flowStacks=[[]];current.cargo.currentDraft={value:17};current.cargo.verified=false;
 const {retainRecoveryState}=await import('../dist/host/index.js');retainRecoveryState(current,['cargo.verified','cargo.currentDraft']);
 e=f.make();s=await answer(e,current,'status');assert.equal(f.effects.length,1);assert.equal(s.cargo.verified,false);assert.deepEqual(s.cargo.currentDraft,{value:17});assert.equal(s.cargo.projected.length,1);assert.equal(s.cargo.projected[0].reference,'R1');assert.equal(s.lastTurnRecovery.projection,true);assert.match(s.response,/recovered a result/);
});
await test('ordinary executable flows remain ordinary and function edits retire saved declaration continuations',async()=>{
 const ordinary={id:'ordinary',name:'Ordinary',version:'1',description:'Existing flow.',variables:{fn:{type:'string',value:'legacy'}},steps:[{id:'say',type:'SAY',value:'{{fn}}'}]};let e=engine([ordinary]),s=e.initSession('u','ordinary','en');s=await start(e,s,'ordinary');assert.equal(s.response,'legacy');
 const first=form('edit','OLD:');e=engine([first]);s=e.initSession('u','edit','en');s.cargo.tag='x';s=await start(e,s,'edit');assert.equal(s.response,'OLD:x');
 const changed=form('edit','NEW:');const next=engine([changed]);s=await answer(next,s,'old answer');assert.equal(s.cargo.edit,undefined,'an answer to the retired function declaration cannot resume stale steps');
});
assert.deepEqual(warnings.filter(message=>/expression.*failed|not defined|evaluation failed/i.test(message)),[]);
console.log(`Named function runtime: all ${checks} checks passed`);
