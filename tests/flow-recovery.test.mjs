/** Recovery declarations are explicit, validated, independent of business outcomes and opt-in. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {validateFlowRecovery,flowHandoffInfo,renderFlowRecovery} from '../dist/host/index.js';
let count=0;const test=async(name,run)=>{await run();count++;console.log('PASS '+name);};
const descriptor=(mode,extra={})=>({version:1,mode,reason:'fixture_reason',...extra});
await test('legacy unannotated outcomes and notes do not acquire new policy',()=>{
 for(const outcome of ['unresolved','resolved','deflected',undefined])assert.equal(flowHandoffInfo({lastFlowOutcome:{outcome}}),undefined);
 assert.equal(renderFlowRecovery({flow:'legacy',reason:'old'}),undefined);
});
await test('malformed, inherited and incomplete declarations fail closed',()=>{
 for(const d of [null,[],{},descriptor('unknown'),{...descriptor('none'),version:2},{...descriptor('none'),reason:''},{...descriptor('none'),reason:' bad'},descriptor('resume'),descriptor('resume',{form:'owner'}),descriptor('none',{form:'',flow:''}),{...descriptor('none'),extra:true},Object.create(descriptor('restart'))])assert.throws(()=>validateFlowRecovery(d),/recovery|Recovery/);
});
await test('recovery preserves data without aliasing the caller declaration',()=>{
 const d=descriptor('resume',{form:'owner:1',flow:'owner'}),copy=validateFlowRecovery(d);assert.deepEqual(copy,d);assert.notEqual(copy,d);d.mode='restart';assert.equal(copy.mode,'resume');
});
await test('business completion clears optional handoff regardless of declared recovery',()=>{
 for(const outcome of ['resolved','deflected'])assert.equal(flowHandoffInfo({lastFlowRecovery:descriptor('none'),lastFlowOutcome:{outcome}}),null);
});
await test('pending yields and true failures carry different guidance with the same retained draft',()=>{
 const recovery=descriptor('resume',{form:'owner:1',flow:'owner'});
 const pending=flowHandoffInfo({lastFlowRecovery:recovery,lastFlowOutcome:{outcome:'pending'}}),failed=flowHandoffInfo({lastFlowRecovery:recovery,lastFlowOutcome:{outcome:'unresolved'}});
 assert.equal(pending.kind,'yield');assert.equal(failed.kind,'failure');assert.match(renderFlowRecovery(pending),/pending.*draft is retained/);assert.match(renderFlowRecovery(failed),/collection step could not finish/);
 assert.match(renderFlowRecovery(pending),/Do not describe this as a failed task/);assert.match(renderFlowRecovery(failed),/Do not say the whole process must start over/);
});
await test('only explicit restart permits restart guidance; held effects forbid repeats',()=>{
 const hold=renderFlowRecovery({kind:'failure',recovery:descriptor('hold')});assert.match(hold,/Do not offer to restart, repeat the action, or pay again/);assert.match(hold,/Do not claim success or failure/);
 const none=renderFlowRecovery({kind:'failure',recovery:descriptor('none')});assert.match(none,/Do not invent a restart or retry/);
 assert.match(renderFlowRecovery({kind:'failure',recovery:descriptor('restart')}),/explicitly requires a fresh start/);
});
await test('runtime rejects invented resume ownership before executing the annotated step',async()=>{
 const flows=[{id:'bad',name:'Bad',steps:[{id:'effect',type:'SET',variable:'noop',value:'(cargo.effect=true,true)',recovery:descriptor('resume',{form:'foreign',flow:'foreign'})}]}];
 const quiet={info(){},debug(){},warn(){},error(){}};const e=new WorkflowEngine(quiet,async()=>'{"flowName":"None"}',flows,[],{}, {},false,'en');e.disableCommands();const s=e.initSession('user','ownership','en');
 await assert.rejects(e.updateActivity({role:'user',content:'start',start:{flow:'bad'}},s),/Recovery form ownership mismatch/);assert.equal(s.cargo.effect,undefined);
});
console.log(`Flow recovery protocol: all ${count} checks passed`);
