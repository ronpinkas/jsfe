/** Host capability admission remains declarative and legacy loading stays unchanged. */
import assert from 'node:assert/strict';
import {assertFlowHostCapabilities,JSFEHostCapabilityError} from '../dist/host/index.js';
import {definePerformer,defineWorker} from '../dist/forms/contracts.js';
let checks=0;const test=(name,run)=>{run();checks++;console.log('PASS '+name);};
const legacy={id:'legacy',name:'Legacy',steps:[{id:'say',type:'SAY',value:'still works'}]};
const build=(contract={})=>definePerformer({id:'native-send',name:'NativeSend',description:'Send a confirmed request',inputs:[],prepare:'prepare-send',present:'present-send',contract:{summary:'Send with durable ownership',...contract},performs:[{action:'send',effect:'send',tool:'send',idempotency:'request-key',outcomes:{sent:{}}}]});
const required=flow=>flow.variables.contract.value.requires;
const rejected=(flow,capabilities,capability='guardedActions')=>assert.throws(()=>assertFlowHostCapabilities([flow],capabilities),error=>error instanceof JSFEHostCapabilityError&&error.name==='JSFEHostCapabilityError'&&error.flowId===flow.id&&error.capability===capability&&/explicit boolean true/.test(error.message));
test('legacy flows without declarations load unchanged with missing/false capabilities',()=>{
 const before=JSON.stringify(legacy);assert.equal(assertFlowHostCapabilities([legacy]),true);assert.equal(assertFlowHostCapabilities([legacy],{durableActions:false,sessionEncoding:'plain'}),true);assert.equal(JSON.stringify(legacy),before);
});
test('every performer declares guardedActions even without an explicit caller requirement',()=>{
 assert.deepEqual(required(build()),['guardedActions']);assert.deepEqual(required(build({requires:[]})),['guardedActions']);
});
test('performer requirements retain caller capabilities, normalize duplicates and do not alias input',()=>{
 const requirements=['auditTrail','durableActions','auditTrail'];const flow=build({requires:requirements});requirements.length=0;
 assert.deepEqual(required(flow),['guardedActions','auditTrail','durableActions']);assert.equal(Object.isFrozen(required(flow)),true);
 assert.throws(()=>required(flow).push('other'),TypeError);assert.throws(()=>{flow.variables.contract.value.requires=[];},TypeError);
});
test('ordinary worker explicit requirements follow the same generic immutable declaration',()=>{
 const flow=defineWorker({id:'custom',name:'Custom',steps:[],contract:{role:'worker',summary:'Custom operation',requires:['auditTrail']}});
 assert.deepEqual(required(flow),['auditTrail']);assert.equal(assertFlowHostCapabilities([flow],{auditTrail:true}),true);rejected(flow,{},'auditTrail');
});
test('native requirements reject missing false and mistyped capabilities',()=>{
 const flow=build();for(const capabilities of [undefined,{}, {durableActions:false},{durableActions:'true'},{durableActions:1},{durableActions:null},{durableActions:undefined}])rejected(flow,capabilities);
});
test('inherited capability values are not explicit host admission',()=>{
 rejected(build(),Object.create({durableActions:true}));
});
test('native admission requires all requirements while unrelated storage encoding is independent',()=>{
 const flow=build({requires:['auditTrail']});rejected(flow,{durableActions:true},'auditTrail');
 assert.equal(assertFlowHostCapabilities([flow],{durableActions:true,auditTrail:true,sessionEncoding:'plain'}),true);
 rejected(build(),{sessionEncoding:'br-v1'});assert.equal(assertFlowHostCapabilities([build()],{durableActions:true}),true);
});
test('JSON serialized native declarations retain their required admission contract',()=>{
 const flow=JSON.parse(JSON.stringify(build()));assert.deepEqual(required(flow),['guardedActions']);rejected(flow,{});assert.equal(assertFlowHostCapabilities([flow],{durableActions:true}),true);
});
test('malformed required capability declarations fail closed',()=>{
 for(const requires of [null,'durableActions',{},[null],[true],[''],[' durableActions'],['durableActions ']]){
  assert.throws(()=>build({requires}),JSFEHostCapabilityError);
  assert.throws(()=>assertFlowHostCapabilities([{id:'bad',variables:{contract:{value:{requires}}}}],{}),JSFEHostCapabilityError);
 }
});
test('admission failure occurs before an engine journal or effect can be created',()=>{
 const counts={engine:0,journal:0,effect:0};const activate=(flow,capabilities)=>{assertFlowHostCapabilities([flow],capabilities);counts.engine++;counts.journal++;counts.effect++;};
 for(const capabilities of [{},{durableActions:false},{durableActions:'true'}])assert.throws(()=>activate(build(),capabilities),JSFEHostCapabilityError);
 assert.deepEqual(counts,{engine:0,journal:0,effect:0});
});
test('session-only is an explicit alternative, never a bare boolean capability bypass',()=>{
 const flow=JSON.parse(JSON.stringify(build()));
 assert.equal(assertFlowHostCapabilities([flow],{actionPersistence:'session-only'}),true);
 rejected(flow,{guardedActions:true});
 rejected(flow,Object.create({actionPersistence:'session-only'}));
 for(const mode of [null,false,true,'session','SESSION-ONLY'])assert.throws(()=>assertFlowHostCapabilities([flow],{actionPersistence:mode}),JSFEHostCapabilityError);
 assert.throws(()=>assertFlowHostCapabilities([flow],{durableActions:true,actionPersistence:'session-only'}),/conflicts/);
});
test('explicit durable-only requirements are never weakened by the session-only policy',()=>{
 const strict=build({requires:['durableActions']});
 rejected(strict,{actionPersistence:'session-only'},'durableActions');
 assert.equal(assertFlowHostCapabilities([strict],{durableActions:true}),true);
 const old={id:'old-native',variables:{contract:{value:{role:'performer',requires:['durableActions']}}}};
 rejected(old,{actionPersistence:'session-only'},'durableActions');
});
test('raw JSON performers require the same policy before compilation and do not mutate authored data',()=>{
 const flow={declarationVersion:1,id:'json-payment',form:{inputs:[]},performs:[{action:'payment',effect:'charge'}],prepare:'prepare',present:'present'};
 const before=JSON.stringify(flow);
 for(const policy of [undefined,{}, {durableActions:false},{guardedActions:true},{durableActions:'true'}])rejected(flow,policy);
 assert.equal(assertFlowHostCapabilities([flow],{actionPersistence:'session-only'}),true);
 assert.equal(assertFlowHostCapabilities([flow],{durableActions:true}),true);
 assert.equal(JSON.stringify(flow),before);
});
test('raw declarations preserve explicit requirements and reject unsupported declaration versions',()=>{
 const flow={declarationVersion:1,id:'json-worker',contract:{requires:['auditTrail']},steps:[]};
 rejected(flow,{},'auditTrail');assert.equal(assertFlowHostCapabilities([flow],{auditTrail:true}),true);
 assert.throws(()=>assertFlowHostCapabilities([{...flow,declarationVersion:2}],{auditTrail:true}),/unsupported declarationVersion/);
 assert.throws(()=>assertFlowHostCapabilities([{...flow,contract:{requires:'auditTrail'}}],{auditTrail:true}),JSFEHostCapabilityError);
});
console.log(`Flow host capabilities: all ${checks} checks passed`);
