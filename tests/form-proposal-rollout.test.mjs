/** Proposal consent is versioned engine support; older/misconfigured helpers fail before tenant steps. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,formFlow,defineForm,defineWorker,linkFormSchemas} from '../dist/forms/index.js';
import * as helpers from '../dist/helpers/index.js';
import {assertFlowHostCapabilities,JSFEHostCapabilityError} from '../dist/host/index.js';
const VERSION='jsfe:input-proposals:v1',FUTURE='jsfe:input-proposals:v2';
const S=(id,value)=>({id,type:'SET',variable:'noop',value});
const spec={name:'kind',profile:{kind:'choice',choices:[{key:'lost',words:['lost']}]},question:'Which condition?',proposal:{question:'Confirm lost?',origins:['activation']}};
const required=flow=>flow.variables?.contract?.value?.requires||[];
const guarded=flow=>flow.steps[0]?.type==='SET'&&flow.steps[0]?.requireTrue===true&&/\bformProposalProtocol\s*\(/.test(flow.steps[0].value);
const contract={summary:'Versioned proposal fixture'};
const makeForm=(extra={})=>defineForm({id:'guarded-form',name:'GuardedForm',description:'Guard before tenant hooks',contract,inputs:[spec],before:[S('tenant-before','(cargo.tenantEffects=Number(cargo.tenantEffects||0)+1,true)')],...extra});
const makeWorker=(requires=[VERSION])=>defineWorker({id:'dynamic',name:'Dynamic',description:'Worker returning dynamic input proposal decisions',contract:{role:'worker',summary:'Explicit versioned dynamic proposal user',requires},steps:[S('tenant-effect','(cargo.tenantEffects=Number(cargo.tenantEffects||0)+1,true)'),{id:'message',type:'SAY',value:'TENANT WORKER RAN'}]});
const clone=value=>JSON.parse(JSON.stringify(value));
let checks=0;const failures=[];
async function test(name,run){try{await run();checks++;console.log('PASS '+name);}catch(error){failures.push({name,error});console.error('FAIL '+name+'\n'+error.stack);}}
await test('the current protocol is available as an explicit approved helper',()=>{
 assert.equal(typeof helpers.formProposalProtocol,'function');assert.equal(helpers.formProposalProtocol(),1);assert.equal(helpers.STANDARD_FUNCTIONS.formProposalProtocol,helpers.formProposalProtocol);
});
await test('static native proposal inputs declare intrinsic support and guard entry',()=>{
 const flow=makeForm();assert.ok(required(flow).includes(VERSION));assert.ok(guarded(flow),'guard precedes all opens, hooks and tenant expressions');
 const raw=formFlow({id:'raw',name:'Raw',inputs:[spec]});assert.ok(guarded(raw),'the raw FORM builder is guarded without requiring a declared contract');assert.equal(raw.variables.contract,undefined,'raw formFlow retains its historical shape');
});
await test('grouped proposal members receive the same rollout protection',()=>{
 const flow=makeForm({inputs:[{name:'selection',any_of:[spec,{name:'other',profile:{kind:'choice',choices:[{key:'other',words:['other']}]},question:'Other?'}]}]});assert.ok(required(flow).includes(VERSION));assert.ok(guarded(flow));
});
await test('linked nested proposal schemas protect the owning form before its tenant hooks',()=>{
 const child=makeForm({id:'child',name:'Child'}),parent=makeForm({id:'parent',name:'Parent',inputs:[{name:'details',form:'child'}]});
 const linked=linkFormSchemas([parent,child]);const root=linked.find(flow=>flow.id==='parent');assert.ok(root.variables.inputs.value[0].schema.inputs[0].proposal);assert.ok(required(root).includes(VERSION));assert.ok(guarded(root));
});
await test('existing host policies admit intrinsic support without a new configuration flag',()=>{
 const flow=clone(makeForm());for(const policy of [{},{durableActions:false,sessionEncoding:'plain'},{durableActions:true,sessionEncoding:'br-v1'},{actionPersistence:'session-only'}])assert.equal(assertFlowHostCapabilities([flow],policy),true);
});
await test('future intrinsic versions cannot be admitted by a caller-supplied boolean',()=>{
 const future=makeWorker([FUTURE]);for(const policy of [{},{[FUTURE]:true},{[VERSION]:true,[FUTURE]:true},Object.create({[FUTURE]:true})])assert.throws(()=>assertFlowHostCapabilities([future],policy),error=>error instanceof JSFEHostCapabilityError&&error.capability===FUTURE);
});
await test('engine intrinsic support does not satisfy unrelated host permissions',()=>{
 const worker=makeWorker([VERSION,'auditTrail']);assert.throws(()=>assertFlowHostCapabilities([worker],{}),error=>error instanceof JSFEHostCapabilityError&&error.capability==='auditTrail');assert.equal(assertFlowHostCapabilities([worker],{auditTrail:true}),true);
});
await test('an explicitly declared dynamic worker is guarded once and keeps its immutable requirement',()=>{
 const worker=makeWorker([VERSION,VERSION]);assert.deepEqual(required(worker),[VERSION]);assert.ok(Object.isFrozen(required(worker)));assert.ok(guarded(worker));assert.equal(worker.steps.filter(step=>/\bformProposalProtocol\s*\(/.test(step.value||'')).length,1);assert.equal(assertFlowHostCapabilities([clone(worker)],{}),true);
});
await test('ordinary native forms and legacy JSON do not acquire proposal requirements or guards',()=>{
 const ordinary=makeForm({inputs:[{name:'kind',profile:spec.profile,question:'Condition?'}]});assert.equal(required(ordinary).includes(VERSION),false);assert.equal(guarded(ordinary),false);
 const worker=makeWorker([]);assert.equal(guarded(worker),false);assert.deepEqual(required(worker),[]);
 const legacy={id:'legacy',name:'Legacy',steps:[{id:'say',type:'SAY',value:'Unchanged'}]};const before=JSON.stringify(legacy);assert.equal(assertFlowHostCapabilities([legacy]),true);assert.equal(JSON.stringify(legacy),before);
});
async function run(flow,functions){
 const quiet={debug(){},info(){},warn(){},error(){}};const engine=new WorkflowEngine(quiet,async()=>' {"flowName":"None","parameters":{}}',linkFormSchemas([...FLOWS,flow]),[],functions,{},false,'en');engine.disableCommands();const session=engine.initSession('fixture',crypto.randomUUID(),'en');let error;try{await engine.updateActivity({role:'user',content:'begin',start:{flow:flow.id}},session);}catch(caught){error=caught;}return {session,error};
}
await test('a direct worker cannot run tenant effects when the protocol helper is missing or incompatible',async()=>{
 for(const helper of [undefined,()=>0,()=>2,()=>true,()=> '1']){
  const functions={...helpers.STANDARD_FUNCTIONS};if(helper===undefined)delete functions.formProposalProtocol;else functions.formProposalProtocol=helper;
  const {session,error}=await run(clone(makeWorker()),functions);assert.ok(error,'incompatible protocol fails closed');assert.match(error.message,/Required SET step .*proposal_protocol did not complete successfully/i);assert.equal(session.cargo.tenantEffects,undefined,'guard fails before first tenant SET');
 }
});
await test('an authored SAY that resembles the protocol expression cannot suppress the real SET guard',async()=>{
 const authored=defineWorker({id:'spoofed-entry',name:'SpoofedEntry',description:'Authored first step is not an executable guard',contract:{role:'worker',summary:'Must fail before output or effects',requires:[VERSION]},steps:[{id:'not-a-guard',type:'SAY',value:'formProposalProtocol() === 1',requireTrue:true},S('tenant-effect','(cargo.tenantEffects=Number(cargo.tenantEffects||0)+1,true)')]});
 assert.ok(guarded(authored));assert.equal(authored.steps[1].type,'SAY');const functions={...helpers.STANDARD_FUNCTIONS};delete functions.formProposalProtocol;
 const {session,error}=await run(clone(authored),functions);assert.ok(error);assert.match(error.message,/Required SET step .*proposal_protocol did not complete successfully/i);assert.equal(session.cargo.tenantEffects,undefined);assert.equal(session.response,null);assert.ok(!(session.globalAccumulatedMessages||[]).some(message=>String(message).includes('formProposalProtocol() === 1')),'the authored SAY cannot run before the real protocol guard');
});
await test('a direct static proposal form fails before its before-hook when the helper is absent',async()=>{
 const functions={...helpers.STANDARD_FUNCTIONS};delete functions.formProposalProtocol;const {session,error}=await run(clone(makeForm()),functions);assert.ok(error);assert.equal(session.cargo.tenantEffects,undefined);assert.equal(session.cargo.forms,undefined,'no form opened before the entry guard');
});
await test('current native helper permits the declared worker without host flags or durable storage',async()=>{
 const {session,error}=await run(makeWorker(),helpers.STANDARD_FUNCTIONS);assert.equal(error,undefined);assert.equal(session.cargo.tenantEffects,1);assert.match(session.response,/TENANT WORKER RAN/);assert.equal(session.actionPersistence,undefined);
});
await test('a legacy direct worker still runs without the new helper or metadata',async()=>{
 const functions={...helpers.STANDARD_FUNCTIONS};delete functions.formProposalProtocol;const {session,error}=await run(makeWorker([]),functions);assert.equal(error,undefined);assert.equal(session.cargo.tenantEffects,1);assert.equal(session.lastFlowRecovery,undefined);
});
console.log(`FORM proposal rollout: ${checks} passed, ${failures.length} failed`);
if(failures.length)process.exitCode=1;else console.log('FORM proposal rollout: all checks passed');
