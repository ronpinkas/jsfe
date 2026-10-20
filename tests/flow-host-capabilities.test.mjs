/** Host capability admission remains declarative and legacy loading stays unchanged. */
import assert from 'node:assert/strict';
import {assertFlowHostCapabilities,JSFEHostCapabilityError} from '../dist/host/index.js';
import {definePerformer,defineWorker} from '../dist/forms/contracts.js';
let checks=0;const test=(name,run)=>{run();checks++;console.log('PASS '+name);};
const legacy={id:'legacy',name:'Legacy',steps:[{id:'say',type:'SAY',value:'still works'}]};
const build=(contract={})=>definePerformer({id:'native-send',name:'NativeSend',description:'Send a confirmed request',inputs:[],prepare:'prepare-send',present:'present-send',contract:{summary:'Send with durable ownership',...contract},performs:[{action:'send',effect:'send',tool:'send',idempotency:'request-key',outcomes:{sent:{}}}]});
const required=flow=>flow.variables.contract.value.requires;
const rejected=(flow,capabilities,capability='durableActions')=>assert.throws(()=>assertFlowHostCapabilities([flow],capabilities),error=>error instanceof JSFEHostCapabilityError&&error.name==='JSFEHostCapabilityError'&&error.flowId===flow.id&&error.capability===capability&&/explicit boolean true/.test(error.message));
test('legacy flows without declarations load unchanged with missing/false capabilities',()=>{
 const before=JSON.stringify(legacy);assert.equal(assertFlowHostCapabilities([legacy]),true);assert.equal(assertFlowHostCapabilities([legacy],{durableActions:false,sessionEncoding:'plain'}),true);assert.equal(JSON.stringify(legacy),before);
});
test('every performer declares durableActions even without an explicit caller requirement',()=>{
 assert.deepEqual(required(build()),['durableActions']);assert.deepEqual(required(build({requires:[]})),['durableActions']);
});
test('performer requirements retain caller capabilities, normalize duplicates and do not alias input',()=>{
 const requirements=['auditTrail','durableActions','auditTrail'];const flow=build({requires:requirements});requirements.length=0;
 assert.deepEqual(required(flow),['durableActions','auditTrail']);assert.equal(Object.isFrozen(required(flow)),true);
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
 const flow=JSON.parse(JSON.stringify(build()));assert.deepEqual(required(flow),['durableActions']);rejected(flow,{});assert.equal(assertFlowHostCapabilities([flow],{durableActions:true}),true);
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
console.log(`Flow host capabilities: all ${checks} checks passed`);
