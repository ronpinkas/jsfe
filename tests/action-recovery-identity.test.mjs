/** Retained immutable recovery-contract evidence. No host credentials or external requests. */
import assert from 'node:assert/strict';
import {createActionRecoveryIdentity,assertActionRecoveryIdentity,actionRecoveryIdentityMatches} from '../dist/host/index.js';
import {JSFE_RUNTIME_FINGERPRINT} from '../dist/runtime-identity.js';
const clone=value=>JSON.parse(JSON.stringify(value));
let checks=0;const test=async(name,run)=>{await run();checks++;console.log('PASS '+name);};
const declarations={flows:[{id:'two',name:'Two',version:'1',steps:[{id:'say',type:'SAY',value:'two'}]},{id:'one',name:'One',version:'1',variables:{state:{type:'object',value:{b:2,a:1}}},parameters:[{name:'subject',type:'string'}],steps:[{id:'save',type:'SET',variable:'answer',value:'42'}]}],tools:[{id:'write',name:'Write',description:'Fixture tool',parameters:{type:'object',properties:{item:{type:'string'}}},returns:{type:'object'},implementation:{type:'http',url:'http://127.0.0.1:9999/write',method:'POST',timeout:500,retries:0,responseMapping:{path:'result'},headers:{Authorization:'old'},authentication:{apiKey:'old'}},apiKey:'old',security:{secret:'old'}}]};
await test('identity binds the verified build stamp and valid immutable declaration digest',async()=>{
 const identity=await createActionRecoveryIdentity(declarations);assert.equal(identity.protocol,1);assert.equal(identity.runtime,JSFE_RUNTIME_FINGERPRINT);assert.match(identity.runtime,/^sha256:[a-f0-9]{64}$/);assert.match(identity.definitions,/^[a-f0-9]{64}$/);assert.ok(Object.isFrozen(identity));assert.deepEqual(assertActionRecoveryIdentity(identity),identity);
});
await test('registry order and object key order do not change the canonical identity',async()=>{
 const reordered=clone(declarations);reordered.flows.reverse();reordered.flows[0].variables.state.value={a:1,b:2};reordered.tools[0].parameters={properties:{item:{type:'string'}},type:'object'};assert.deepEqual(await createActionRecoveryIdentity(declarations),await createActionRecoveryIdentity(reordered));
});
await test('step ordering and executable/default/parameter changes change the identity',async()=>{
 const original=await createActionRecoveryIdentity(declarations);
 for(const change of [copy=>copy.flows[1].steps[0].value='43',copy=>copy.flows[1].variables.state.value.a=9,copy=>copy.flows[1].parameters[0].type='number',copy=>copy.flows[1].version='2']){const updated=clone(declarations);change(updated);assert.equal(actionRecoveryIdentityMatches(original,await createActionRecoveryIdentity(updated)),false);}
});
await test('meaningful transport and tool contracts cannot silently share a recovery identity',async()=>{
 const original=await createActionRecoveryIdentity(declarations);
 for(const change of [tool=>tool.implementation.url='http://127.0.0.1:9998/write',tool=>tool.implementation.method='PUT',tool=>tool.implementation.function='otherFunction',tool=>tool.implementation.responseMapping.path='other',tool=>tool.implementation.acceptStatus=[409],tool=>tool.parameters.properties.item.type='number',tool=>tool.returns={type:'string'}]){const updated=clone(declarations);change(updated.tools[0]);assert.equal(actionRecoveryIdentityMatches(original,await createActionRecoveryIdentity(updated)),false);}
});
await test('separately declared credential rotation does not alter execution-contract identity',async()=>{
 const updated=clone(declarations);updated.tools[0].apiKey='new';updated.tools[0].implementation.headers={Authorization:'new'};updated.tools[0].implementation.authentication={apiKey:'new'};updated.tools[0].security={secret:'new'};assert.deepEqual(await createActionRecoveryIdentity(updated),await createActionRecoveryIdentity(declarations));
});
await test('opaque URL changes remain conservative mismatches without new URL policy',async()=>{
 const old=clone(declarations),updated=clone(declarations);old.tools[0].implementation.url+='?token=old';updated.tools[0].implementation.url+='?token=new';assert.equal(actionRecoveryIdentityMatches(await createActionRecoveryIdentity(old),await createActionRecoveryIdentity(updated)),false);
});
await test('missing, malformed and unsupported identities never match',async()=>{
 const valid=await createActionRecoveryIdentity(declarations);
 for(const stored of [undefined,null,{}, {...valid,protocol:2},{...valid,runtime:'1.7.0'},{...valid,definitions:'bad'},{...valid,extra:true},{...valid,runtime:'sha256:'+'0'.repeat(64)},{...valid,definitions:'0'.repeat(64)}])assert.equal(actionRecoveryIdentityMatches(valid,stored),false);
});
await test('ambiguous registry identities and non-JSON executable declarations fail closed',async()=>{
 for(const input of [{flows:[declarations.flows[0],declarations.flows[0]],tools:[]},{flows:[],tools:[declarations.tools[0],declarations.tools[0]]}])await assert.rejects(createActionRecoveryIdentity(input),/unique/);
 for(const value of [()=>true,Infinity,1n,new Date()]){const input=clone(declarations);input.flows[0].invalid=value;await assert.rejects(createActionRecoveryIdentity(input),/JSON|finite/);}
 const input=clone(declarations);input.flows[0].self=input.flows[0];await assert.rejects(createActionRecoveryIdentity(input),/acyclic/);
});
await test('snapshot helpers require exact identities before mutating any current session',async()=>{
 const {resumableActionSession,restoreActionSession,projectActionRecoverySession}=await import('../dist/forms/action-recovery.js');
 const identity=await createActionRecoveryIdentity(declarations),session={sessionId:'snapshot',userId:'user',cargo:{current:'kept'},flowStacks:[[{flowId:'perform-action',flowStepsStack:[],inputStack:[],variables:{}}]]};
 const flows=[{id:'perform-action',steps:[]}],before=clone(session);
 const snapshot=resumableActionSession(session,flows,identity);assert.deepEqual(snapshot.actionRecoveryIdentity,identity);assert.deepEqual(session,before);
 assert.throws(()=>resumableActionSession(session,flows),/identity/);
 const recovery={session:snapshot,key:'pending',sequence:1};
 for(const bad of [undefined,{...identity,definitions:'0'.repeat(64)}]){
    assert.throws(()=>restoreActionSession(session,recovery,{role:'user',content:'new'},bad),/compatible/);
    assert.throws(()=>projectActionRecoverySession(session,recovery,{role:'user',content:'new'},flows,bad),/compatible/);
    assert.deepEqual(session,before);
 }
});
console.log(`Recovery identity: all ${checks} checks passed`);
