import assert from 'node:assert/strict';
import { WorkflowEngine } from '../dist/index.js';
const flow = { id:'defaults', name:'Defaults', version:'1', description:'test defaults', scope:'isolated',
   variables:{items:{type:'array',value:[]},nested:{type:'object',value:{items:[]}}},
   steps:[{id:'mutate',type:'SET',variable:'noop',value:'(items.push(1), nested.items.push(1), true)'},
      {id:'show',type:'SAY',value:'{{items.length}}/{{nested.items.length}}'}] };
const quiet={debug(){},info(){},warn(){},error(){}};
const e=new WorkflowEngine(quiet,async()=>'{"flowName":"None"}',[flow],[],{}, {},false,'en',3000);
e.disableCommands();
let checks=0;
const run=async s=>JSON.parse(JSON.stringify(await e.updateActivity({role:'user',content:'start',start:{flow:'defaults'}},s)));
let a=await run(e.initSession('a','a','en')); assert.equal(a.response,'1/1');checks++;
let b=await run(e.initSession('b','b','en')); assert.equal(b.response,'1/1','another session gets fresh nested defaults');checks++;
a=await run(a);assert.equal(a.response,'1/1','another invocation gets fresh nested defaults');checks++;
assert.deepEqual(flow.variables.items.value,[],'runtime mutations do not modify the flow definition');checks++;
assert.deepEqual(flow.variables.nested.value,{items:[]},'nested definition defaults remain immutable');checks++;
const expression={id:'result-name',name:'ResultName',version:'1',description:'result variable collision',variables:{result:{type:'object',value:{ok:true}}},steps:[{id:'expression',type:'SET',variable:'ok',value:'result.ok'},{id:'expression-say',type:'SAY',value:'{{ok}}'}]};
const checkEngine=new WorkflowEngine(quiet,async()=>'{"flowName":"None"}',[expression],[],{}, {},false,'en');checkEngine.disableCommands();
const resultSession=await checkEngine.updateActivity({role:'user',content:'start',start:{flow:'result-name'}},checkEngine.initSession('x','x','en'));
assert.equal(resultSession.response,'true','a declared result variable can be evaluated without lexical collision');checks++;
console.log(`flow-defaults: ${checks} checks passed`);
// Two pending conversations and a resumed JSON snapshot cannot share mutable definition defaults.
const pending={id:'pending-defaults',name:'PendingDefaults',version:'1',description:'Independent pending sessions',
 variables:{items:{type:'array',value:[]},nested:{type:'object',value:{items:[]}}},
 steps:[{id:'initial',type:'SET',variable:'noop',value:'(items.push(String(userInput)),nested.items.push(String(userInput)),true)'},
 {id:'ask',type:'SAY-GET',variable:'answer',value:'Next input?'},
 {id:'complete',type:'SET',variable:'noop',value:'(items.push(String(answer)),nested.items.push(String(answer)),cargo.completed={items:items.slice(),nested:nested.items.slice()},true)'},
 {id:'show',type:'SAY',value:'{{items.length}}/{{nested.items.length}}'}]};
const concurrent=new WorkflowEngine(quiet,async()=>'{"flowName":"None"}',[pending],[],{}, {},false,'en');concurrent.disableCommands();
const begin=async label=>JSON.parse(JSON.stringify(await concurrent.updateActivity({role:'user',content:label,start:{flow:'pending-defaults'}},concurrent.initSession(label,label,'en'))));
const pa=await begin('A'),pb=await begin('B');
const values=s=>s.flowStacks.flat().find(f=>f.flowId==='pending-defaults').variables;
assert.deepEqual(values(pa).items,['A']);assert.deepEqual(values(pb).items,['B']);
assert.deepEqual(values(pa).nested.items,['A']);assert.deepEqual(values(pb).nested.items,['B']);
assert.deepEqual(pending.variables.nested.value,{items:[]});
const restored=new WorkflowEngine(quiet,async()=>'{"flowName":"None"}',[pending],[],{}, {},false,'en');restored.disableCommands();
const resumedA=await restored.updateActivity({role:'user',content:'A-next'},JSON.parse(JSON.stringify(pa)));
assert.deepEqual(resumedA.cargo.completed,{items:['A','A-next'],nested:['A','A-next']});
assert.deepEqual(values(pb).items,['B'],'resuming A cannot mutate B pending state');
const resumedB=await concurrent.updateActivity({role:'user',content:'B-next'},JSON.parse(JSON.stringify(pb)));
assert.deepEqual(resumedB.cargo.completed,{items:['B','B-next'],nested:['B','B-next']});
const pc=await begin('C');assert.deepEqual(values(pc).items,['C']);assert.deepEqual(pending.variables.items.value,[]);
console.log('flow-defaults-concurrent: 10 checks passed');

// Programmatic plain defaults retain callbacks while isolating their mutable containers.
const callback=()=>7;
const callbackFlow={id:'callback-defaults',name:'CallbackDefaults',version:'1',description:'Callback defaults',
 variables:{state:{type:'object',value:{callback,counter:0}}},
 steps:[{id:'use',type:'SET',variable:'value',value:'(state.counter++, state.callback()+state.counter)'},
 {id:'show',type:'SAY',value:'{{value}}'},
 {id:'pending',type:'SAY-GET',variable:'answer',value:'Continue?'}]};
const callbackEngine=new WorkflowEngine(quiet,async()=>'{}',[callbackFlow],[],{}, {},false,'en');callbackEngine.disableCommands();
const activate=async id=>callbackEngine.updateActivity({role:'user',content:'start',start:{flow:'callback-defaults'}},callbackEngine.initSession(id,id,'en'));
const ca=await activate('callback-a'),cb=await activate('callback-b');
const stateOf=s=>s.flowStacks.flat().find(f=>f.flowId==='callback-defaults').variables.state;
assert.equal(stateOf(ca).callback,callback);assert.equal(stateOf(cb).callback,callback);
assert.equal(stateOf(ca).counter,1);assert.equal(stateOf(cb).counter,1);
assert.notEqual(stateOf(ca),stateOf(cb));assert.equal(callbackFlow.variables.state.value.counter,0);
console.log('flow-defaults-callbacks: 6 checks passed');

// The editable source view is detached without rejecting existing programmatic callbacks.
const authored=callbackEngine.getFlowDeclarations();
assert.equal(authored[0].variables.state.value.callback,callback);
authored[0].variables.state.value.counter=99;
assert.equal(callbackEngine.getFlowDeclarations()[0].variables.state.value.counter,0);
assert.equal(callbackFlow.variables.state.value.counter,0);
const cc=await activate('callback-c');assert.equal(stateOf(cc).counter,1);
assert.equal(stateOf(cc).callback,callback);
console.log('flow-defaults-source-callbacks: 5 checks passed');
