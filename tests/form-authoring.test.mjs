import assert from 'node:assert/strict';
import {Form,Provider,Performer,Worker,compileExpression,FLOWS,linkFormSchemas,validateFlowContracts} from '../dist/forms/index.js';
import {WorkflowEngine} from '../dist/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
let checks=0;const test=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};
const quiet={debug(){},info(){},warn(){},error(){}};
const make=extra=>Performer({id:'pay',name:'Pay',description:'Make a payment',primary:true,parameters:{subject:'Verified subject'},inputs:[{name:'amount',field:'amount',description:'The explicitly requested amount'}],performs:[{action:'pay',effect:'charge',subject:'cargo.subject',gate:{verified:['cargo.verified']},confirm:{exact:true},outcomes:{ok:'resolved',failed:'unresolved',unknown:'unresolved'}}],prepare:'prepare',present:'present',confirm:{question:'Authorize?'},...extra});
await test('four author concepts derive existing roles without a new protocol',()=>{
 const form=Form({id:'form',name:'Form',description:'Collect one input',inputs:[{name:'x',field:'zip'}]});
 const provider=Provider({id:'provider',name:'Provider',description:'Read a fact',provides:{facts:[{key:'fact',path:'value',gloss:'A fact'}],source:{flow:'load',result:'cargo.data'}}});
 const worker=Worker({id:'worker',name:'Worker',description:'Support a request',steps:[]});
 assert.deepEqual([form,provider,make(),worker].map(f=>f.variables.contract.value.role),['collector','provider','performer','worker']);
 assert.ok(make().variables.contract.value.requires.includes('guardedActions'));
});
await test('parameter defaults and extraction descriptions have one declaration',()=>{
 const f=Worker({id:'support',name:'Support',description:'Support',parameters:{name:'A name',enabled:{type:'boolean',description:'Enabled'},options:{type:'object',description:'Options',default:{a:1}}},steps:[]});
 assert.deepEqual(f.variables.name,{type:'string',value:''});assert.equal(f.variables.enabled.value,false);assert.deepEqual(f.variables.options.value,{a:1});assert.ok(f.parameters.every(p=>!Object.hasOwn(p,'default')));
 const p=make();assert.equal(p.parameters.filter(x=>x.name==='amount').length,1);assert.equal(p.parameters.find(x=>x.name==='amount').description,'The explicitly requested amount');assert.equal(p.variables.amount.value,'');
});
await test('a provider default must name a declared fact or set',()=>assert.throws(()=>Provider({id:'bad',name:'Bad',provides:{default:'invented',facts:[{key:'real',gloss:'A fact'}]}}),/default must name/));
await test('provider setup compiles ordinary default and gate argument steps',()=>{
 const f=Provider({id:'lookup',name:'Lookup',provides:{default:'balance',facts:[{key:'balance',gloss:'Balance'}]},parameters:{account:'Account'},gateParameters:{account:'{{account}}'},before:[{id:'context',type:'SET',variable:'noop',value:'true'}]});
 assert.deepEqual(f.steps.map(s=>s.type),['SET','SET','SET','FLOW']);assert.equal(f.steps.at(-1).parameters.gate_params,'{{provider_gate_arguments}}');assert.match(f.steps.at(-2).value, /account/);assert.equal(f.variables.account.value,'');
});
await test('a calculation uses explicit helpers and a normal SET, without mutating its source',async()=>{
 const fn=function double(value){return value*2;};
 const f=Worker({id:'calc',name:'Calc',parameters:{input:{type:'number',description:'Input',default:3}},calculate:{value:function(input){return {twice:double(input)};},args:['input'],helpers:{double:fn},result:'cargo.calculated'}});
 const e=new WorkflowEngine(quiet,null,[f],[],STANDARD_FUNCTIONS,{});e.disableCommands();const s=e.initSession('synthetic',crypto.randomUUID(),'en');const result=await e.updateActivity({role:'user',content:'calculate',start:{flow:'calc',arguments:{input:4}}},s);assert.deepEqual(result.cargo.calculated,{twice:8});assert.equal(f.steps.at(-1).requireTrue,true);
});
await test('invalid and asynchronous worker declarations fail clearly',()=>{
 assert.throws(()=>Worker({id:'bad',steps:[],call:{flow:'x'}}),/one of/);
 assert.throws(()=>Worker({id:'bad',calculate:{value:async()=>1,result:'cargo.result'}}),/synchronous/);
 assert.throws(()=>Worker({id:'bad',calculate:{value:()=>1,result:'cargo.__proto__.x'}}),/safe cargo path/);
});
await test('performer safeguards stay in the existing compiler',()=>{
 assert.throws(()=>make({confirm:null}),/exact action needs/);
 const f=make();assert.equal(f.variables.performs.value[0].confirm.exact,true);
 const steps=JSON.stringify(f.steps);assert.match(steps,/prepareFormAction/);assert.match(steps,/perform-action/);assert.match(steps,/consumeActionReceipt/);
 assert.throws(()=>make({project:{apply:async()=>true}}),/synchronous/);
});
await test('plain projections compile to the existing validated projection path',()=>{
 const f=make({project:{apply:function(cargo,{result}){cargo.applied=result.status;return true;}}});
 const execute=(flow,cargo)=>new Function('cargo','form','formSnapshot','request','result','key','return '+flow.variables.projection.value[0].value)(cargo,'instance',{}, {},{status:'ok'},'action-key');const cargo={};assert.equal(execute(f,cargo),true);assert.equal(cargo.applied,'ok');assert.throws(()=>execute(make({project:{apply:()=>false}}),{}),/must return true/);
 assert.equal(f.variables.contract.value.projects,'projection');
});
await test('provider catalog questions derive from its facts rather than another declaration',()=>{
 const provides={facts:[{key:'balance',words:['balance'],path:'balance'}]};
 const forms=[make({provides}),Form({id:'collect',description:'Collect with account questions',provides,inputs:[{name:'zip',field:'zip'}]})];
 for(const f of forms){assert.deepEqual(f.variables.questions.value,[{key:'balance',phrases:['balance']}]);assert.deepEqual(f.variables.provides.value,provides);assert.equal(f.variables.contract.value.role,f.id==='collect'?'collector':'performer');}
 assert.deepEqual(provides,{facts:[{key:'balance',words:['balance'],path:'balance'}]});
});
await test('a form or performer catalog is validated like a provider catalog, menu targets included',()=>{
 const good={facts:[{key:'balance',words:['balance'],path:'balance',public:true}],menu:{choices:[{key:'pay',phrases:['pay'],flow:'collect'}]}};
 const collect=provides=>Form({id:'collect',description:'Collect with account questions',provides,inputs:[{name:'zip',field:'zip'}]});
 for(const f of [make({provides:good}),collect(good)])assert.equal(f.variables.contract.value.catalog,'provides');
 assert.equal(Form({id:'plain',description:'No catalog',inputs:[{name:'zip',field:'zip'}]}).variables.contract.value.catalog,undefined);
 const check=provides=>validateFlowContracts([collect(provides)],[],{requireAll:false,externalFlows:FLOWS.map(f=>f.id)});
 assert.ok(check(good));
 assert.throws(()=>check({facts:[{key:'balance',path:'balance',public:true},{key:'balance',path:'other',public:true}]}),/duplicate fact key/);
 assert.throws(()=>check({facts:[{key:'balance',public:true}]}),/needs a source path or worker/);
 assert.throws(()=>check({facts:[{key:'balance',path:'balance'}]}),/explicit gate/);
 assert.throws(()=>check({...good,menu:{choices:[{key:'pay',phrases:['pay'],flow:'no-such-flow'}]}}),/unknown menu worker no-such-flow/);
});
await test('compound calculations share build-time serialization without changing runtime guards',async()=>{
 const value=compileExpression(function (value,offset){return {total:value+offset};},'cargo.values[0]','2');
 const f=Worker({id:'compound',steps:[{id:'sum',type:'SET',variable:'noop',value:`(cargo.total=${value},true)`,requireTrue:true}]});
 const e=new WorkflowEngine(quiet,null,[f],[],STANDARD_FUNCTIONS,{});e.disableCommands();const session=e.initSession('synthetic',crypto.randomUUID(),'en');session.cargo.values=[3];
 const result=await e.updateActivity({role:'user',content:'calculate',start:{flow:'compound',arguments:{}}},session);assert.deepEqual(result.cargo.total,{total:5});
 assert.throws(()=>compileExpression(async()=>1),/synchronous/);assert.throws(()=>compileExpression(()=>1,''),/authored JavaScript/);
 assert.throws(()=>Worker({id:'bad',calculate:{value:()=>1,args:['cargo.values[0]'],result:'cargo.total'}}),/variable paths/);
});
console.log(`Authoring compiler: all checks passed (${checks})`);
