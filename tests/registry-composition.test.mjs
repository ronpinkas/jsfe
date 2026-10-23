/** Explicit native registry composition. Pure declarations, actual shared adapter generation and recovery identity. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
import {composeRegistries,JSFERegistryCompositionError,createActionRecoveryIdentity} from '../dist/host/index.js';
import {operationWorkers} from '../dist/forms/index.js';
const flow=(id='one',name='One')=>({id,name,steps:[{id:'say',type:'SAY',value:'one'}]});
const tool=(id='read',name='Read')=>({id,name,parameters:{type:'object',properties:{subject:{type:'string'}}},implementation:{type:'local',function:'read',args:['subject']}});
const copy=x=>structuredClone(x);let checks=0;
const test=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};
await test('independent native operation modules dedup their identical failure worker before actual recovery identity',async()=>{
 const a=tool('first','First'),b=tool('second','Second');
 const inputs={flows:[operationWorkers([a]),operationWorkers([b])],tools:[[a],[b]]};
 const before=copy(inputs);const result=composeRegistries(inputs);
 assert.equal(result.flows.filter(f=>f.id==='operation-failed').length,1);assert.deepEqual(result.flows.map(f=>f.id),['operation:first','operation-failed','operation:second']);
 const identity=await createActionRecoveryIdentity(result);assert.match(identity.definitions,/^[a-f0-9]{64}$/);assert.deepEqual(inputs,before);
 assert.deepEqual(identity,await createActionRecoveryIdentity({flows:[...operationWorkers([a]),operationWorkers([b])[0]],tools:[a,b]}));
});
await test('all nested output declarations are cloned, including data defaults and tool argument order',()=>{
 const a=flow();a.variables={data:{type:'object',value:{rows:[{x:1}]}}};const b=tool();const inputs={flows:[[a,a]],tools:[[b],[copy(b)]]};const before=copy(inputs);
 const result=composeRegistries(inputs);assert.equal(result.flows.length,1);assert.equal(result.tools.length,1);
 result.flows[0].variables.data.value.rows[0].x=9;result.flows[0].steps[0].value='changed';result.tools[0].implementation.args.push('changed');assert.deepEqual(inputs,before);
 a.variables.data.value.rows.push({x:2});assert.equal(result.flows[0].variables.data.value.rows.length,1);
});
await test('same-ID content changes fail without overriding or mutating either registry',()=>{
 for(const key of ['flows','tools']){const first=key==='flows'?flow():tool(),second=copy(first);second.description='different';const input={flows:[],tools:[],[key]:[[first],[second]]},before=copy(input);assert.throws(()=>composeRegistries(input),error=>error instanceof JSFERegistryCompositionError&&/conflicting/.test(error.message));assert.deepEqual(input,before);}
});
await test('ID and name aliases reject across case and cross ID/name references within each namespace',()=>{
 for(const key of ['flows','tools'])for(const [a,b] of [['same-id','SAME-ID'],['same-name','SAME-NAME'],['cross','CROSS']]){
  const make=key==='flows'?flow:tool,first=make(a,'Alias'),second=a==='same-id'?make(b,'Other'):a==='same-name'?make('second','aLIAS'):make('second',b);
  assert.throws(()=>composeRegistries({flows:[],tools:[],[key]:[[first],[second]]}),/ambiguous/);
 }
});
await test('flow/tool namespaces remain separate and equivalent aliases inside one declaration remain valid',()=>{
 const result=composeRegistries({flows:[[flow('same','SAME')]],tools:[[tool('same','SAME')]]});assert.equal(result.flows.length,1);assert.equal(result.tools.length,1);
});
await test('execution order is preserved and different CASE branch order is never silently normalized',()=>{
 const first=flow();first.steps=[{id:'choice',type:'CASE',branches:{'condition: true':{id:'a',type:'END'},default:{id:'b',type:'END'}}}];const second=copy(first);second.steps[0].branches=Object.fromEntries(Object.entries(second.steps[0].branches).reverse());
 assert.throws(()=>composeRegistries({flows:[[first],[second]],tools:[]}),/conflicting/);const result=composeRegistries({flows:[[first]],tools:[]});assert.deepEqual(Object.keys(result.flows[0].steps[0].branches),Object.keys(first.steps[0].branches));
});
await test('positional tool schemas and every property/array order remain conservative definition differences',()=>{
 const first=tool();first.parameters.properties={a:{type:'string'},b:{type:'string'}};const second=copy(first);second.parameters.properties={b:{type:'string'},a:{type:'string'}};
 assert.throws(()=>composeRegistries({flows:[],tools:[[first],[second]]}),/conflicting/);
 const a=flow(),b={name:a.name,id:a.id,steps:a.steps};assert.throws(()=>composeRegistries({flows:[[a],[b]],tools:[]}),/conflicting/);
 const c=flow(),d=copy(c);c.variables={v:{type:'array',value:[1,2]}};d.variables={v:{type:'array',value:[2,1]}};assert.throws(()=>composeRegistries({flows:[[c],[d]],tools:[]}),/conflicting/);
});
await test('negative zero cannot silently share an executable default with positive zero',()=>{
 const a=flow(),b=copy(a);a.variables={x:{type:'number',value:-0}};b.variables={x:{type:'number',value:0}};assert.throws(()=>composeRegistries({flows:[[a],[b]],tools:[]}),/conflicting/);
 assert(Object.is(composeRegistries({flows:[[a]],tools:[]}).flows[0].variables.x.value,-0));
});
await test('malformed registry containers and definition identities fail closed',()=>{
 for(const input of [undefined,null,[],{}, {flows:[]},{flows:[],tools:[],override:true},{flows:[{}],tools:[]},{flows:[[null]],tools:[]},{flows:[[{id:'x',name:'X'}]],tools:[]},{flows:[[flow(' padded ')]],tools:[]},{flows:[],tools:[[{id:'x',name:''}]]}])assert.throws(()=>composeRegistries(input),JSFERegistryCompositionError);
 assert.deepEqual(composeRegistries({flows:[],tools:[]}),{flows:[],tools:[]});
});
await test('non-JSON values, cycles, sparse arrays and symbol metadata are rejected without coercion',()=>{
 for(const value of [undefined,()=>true,Infinity,NaN,1n,Symbol('bad'),new Date(),new Map(),new Set(),/x/]){const a=flow();a.invalid=value;assert.throws(()=>composeRegistries({flows:[[a]],tools:[]}),JSFERegistryCompositionError);}
 const cyclic=flow();cyclic.self=cyclic;assert.throws(()=>composeRegistries({flows:[[cyclic]],tools:[]}),/acyclic/);
 const sparse=flow();sparse.values=new Array(2);assert.throws(()=>composeRegistries({flows:[[sparse]],tools:[]}),/sparse/);
 const symbol=flow();symbol[Symbol('hidden')]='bad';assert.throws(()=>composeRegistries({flows:[[symbol]],tools:[]}),/JSON/);
});
await test('accessors and custom conversion/iteration hooks never execute',()=>{
 let executions=0;const a=flow();Object.defineProperty(a,'getter',{enumerable:true,get(){executions++;return 'bad';}});assert.throws(()=>composeRegistries({flows:[[a]],tools:[]}),/data properties/);
 const options={tools:[]};Object.defineProperty(options,'flows',{enumerable:true,get(){executions++;return [];}});assert.throws(()=>composeRegistries(options),JSFERegistryCompositionError);
 const registry=[flow()];registry[Symbol.iterator]=()=>{executions++;return [].values();};assert.throws(()=>composeRegistries({flows:[registry],tools:[]}),/JSON/);
 const converted=flow();converted.toJSON=()=>{executions++;return {};};assert.throws(()=>composeRegistries({flows:[[converted]],tools:[]}),/JSON/);assert.equal(executions,0);
});
await test('shared references are cloned independently without being misclassified as cycles',()=>{
 const shared={x:1};const a=flow();a.defaults={one:shared,two:shared};const result=composeRegistries({flows:[[a]],tools:[]});result.flows[0].defaults.one.x=7;assert.equal(result.flows[0].defaults.two.x,1);assert.equal(shared.x,1);
});
await test('raw JSON declarations compose with shared flows without compiling or mutating author data',()=>{
 const json={declarationVersion:1,id:'collect-callback',form:{inputs:[{name:'phone',field:'phone'}]}};
 const inputs={flows:[[json],[flow('shared','Shared')]],tools:[]},before=copy(inputs);
 const result=composeRegistries(inputs);assert.deepEqual(result.flows[0],json);assert.equal(result.flows[0].steps,undefined);
 result.flows[0].form.inputs[0].name='changed';assert.deepEqual(inputs,before);
 assert.throws(()=>composeRegistries({flows:[[json],[flow('other','CollectCallback')]],tools:[]}),/ambiguous/);
});
await test('raw JSON functions and declaration differences retain conservative conflict checks',()=>{
 const first={declarationVersion:1,id:'math',functions:{total:{parameters:[{name:'rows',type:'array'}],body:['return rows.reduce((sum,row)=>sum+row.amount,0);']}},steps:[]};
 const second=copy(first);second.functions.total.body=['return 0;'];
 assert.equal(composeRegistries({flows:[[first],[copy(first)]],tools:[]}).flows.length,1);
 assert.throws(()=>composeRegistries({flows:[[first],[second]],tools:[]}),/conflicting/);
 assert.throws(()=>composeRegistries({flows:[[{...first,declarationVersion:2}]],tools:[]}),/unsupported declarationVersion/);
 assert.throws(()=>composeRegistries({flows:[[{declarationVersion:1,id:'incomplete'}]],tools:[]}),/needs steps/);
});
await test('raw call and before-only workers compose and actually execute through the engine',async()=>{
 const caller={declarationVersion:1,id:'account-gate',call:{flow:'gate-target'}};
 const beforeOnly={declarationVersion:1,id:'before-only',before:[{id:'before',type:'SET',variable:'noop',value:'(cargo.before=true,true)'}]};
 const target={id:'gate-target',name:'GateTarget',steps:[{id:'mark',type:'SET',variable:'noop',value:'(cargo.called=true,true)'},{id:'last',type:'FLOW',value:'before-only',callType:'call'}]};
 const inputs={flows:[[caller,beforeOnly],[target]],tools:[]},before=copy(inputs),composed=composeRegistries(inputs);
 assert.deepEqual(inputs,before);assert.equal(composed.flows[0].steps,undefined);
 const logger={info(){},debug(){},warn(){},error(){}},engine=new WorkflowEngine(logger,async()=>'{}',composed.flows,composed.tools,STANDARD_FUNCTIONS, {},false,'en');engine.disableCommands();
 const session=await engine.updateActivity({role:'user',content:'start',start:{flow:'account-gate'}},engine.initSession('worker','worker','en'));
 assert.equal(session.cargo.called,true);assert.equal(session.cargo.before,true);assert.deepEqual(inputs,before);
 const invalid=composeRegistries({flows:[[{declarationVersion:1,id:'bad-call',call:{flow:42}}]],tools:[]});
 assert.throws(()=>new WorkflowEngine(logger,async()=>'{}',invalid.flows,[],STANDARD_FUNCTIONS, {},false,'en'),/call needs a flow/);
});
console.log(`Registry composition: all ${checks} checks passed`);
