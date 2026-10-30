// A declaration's continuation revision is its version major (plus the majors of the shared entries it uses): a minor
// or patch change keeps a saved session going, a major bump retires it, and a session saved under the earlier
// fingerprint revision continues while its declaration is unchanged. continuationBreaks lists removed names that need a
// major bump. Synthetic flows.
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,linkFormSchemas,continuationBreaks} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
import {compileFlowDeclarations} from '../dist/forms/declarations.js';

const quiet={debug(){},info(){},warn(){},error(){}}, clone=x=>JSON.parse(JSON.stringify(x));
let checks=0;const ok=(cond,msg)=>{assert.ok(cond,msg);checks++;};
const request=(version,ask='Confirm?')=>({declarationVersion:1,id:'request',name:'Request',version,description:'test request',
   variables:{answer:{type:'string',value:''}},
   steps:[{id:'ask',type:'SAY-GET',variable:'answer',value:ask},{id:'effect',type:'SET',variable:'answer',value:'(cargo.effects=(cargo.effects||0)+1,true)'},{id:'done',type:'SAY',value:'Done.'}]});
const compile=flows=>compileFlowDeclarations(flows,{validate:false});
const engine=flows=>{const e=new WorkflowEngine(quiet,async()=>'{"flowName":"None"}',linkFormSchemas([...FLOWS,...flows]),[],STANDARD_FUNCTIONS,{},false,'en');e.disableCommands();return e;};
const begin=async(flows,id)=>{const e=engine(flows);const s=e.initSession('synthetic','major-'+Math.random(),'en');return clone(await e.updateActivity({role:'user',content:'start',start:{flow:id}},s));};
const answer=async(flows,saved,content)=>clone(await engine(flows).updateActivity({role:'user',content},saved));

// A minor change (new wording) keeps the saved session on its saved steps.
{
   const saved=await begin(compile([request('1.0.0')]),'request');
   const s=await answer(compile([request('1.1.0','Please confirm.')]),saved,'yes');
   ok(s.cargo.effects===1&&!s.lastFlowOutcome?.reason?.startsWith('obsolete'),'a minor change keeps the saved session');
}
// A major bump retires it before the answer is read; nothing runs.
{
   const saved=await begin(compile([request('1.0.0')]),'request');
   const s=await answer(compile([request('2.0.0')]),saved,'yes');
   ok(s.cargo.effects===undefined&&s.lastFlowOutcome.reason==='obsolete_continuation'&&s.flowStacks.flat().length===0,'a major bump retires the saved session');
   ok(/I cannot safely continue it/.test(s.response),'the caller hears why');
}
// A session saved under the earlier fingerprint revision: continues while the declaration is unchanged, and takes the
// major revision; a changed declaration retires it.
{
   const flows=compile([request('1.0.0')]),saved=await begin(flows,'request');
   const frame=saved.flowStacks.flat().find(f=>f.flowId==='request');
   ok(frame.safetyRevision==='declaration-v1:major:1'&&/^declaration-v1:[0-9a-f]{32}$/.test(flows[0].safetyRevisionCompat),'a frame carries the major revision; the fingerprint is kept for saved sessions');
   frame.safetyRevision=flows[0].safetyRevisionCompat;saved.continuationSafetyRevisions={request:flows[0].safetyRevisionCompat};
   const s=await answer(flows,clone(saved),'yes');
   ok(s.cargo.effects===1,'a saved fingerprint of an unchanged declaration continues');
   ok(s.continuationSafetyRevisions.request==='declaration-v1:major:1','and is re-stamped with the major revision');
   const changed=await answer(compile([request('1.0.0','Please confirm.')]),clone(saved),'yes');
   ok(changed.cargo.effects===undefined&&changed.lastFlowOutcome.reason==='obsolete_continuation','a saved fingerprint of a changed declaration is retired');
}
// A form saved under the earlier fingerprint revision continues while its declaration is unchanged.
{
   const form={declarationVersion:1,id:'zip-form',name:'ZipForm',version:'1.0.0',description:'Collect a postal code.',form:{inputs:[{name:'zip',field:'zip'}]}};
   const flows=compile([form]),saved=await begin(flows,'zip-form');
   ok(Object.values(saved.cargo.forms||{}).some(f=>f.definition==='zip-form'),'the form is open');
   for(const f of saved.flowStacks.flat())if(f.flowId==='zip-form')f.safetyRevision=flows.find(x=>x.id==='zip-form').safetyRevisionCompat;
   saved.continuationSafetyRevisions={...saved.continuationSafetyRevisions,'zip-form':flows.find(x=>x.id==='zip-form').safetyRevisionCompat};
   const s=await answer(flows,saved,'90044');
   ok(!s.lastFlowOutcome?.reason?.startsWith('obsolete')&&!/cannot safely continue/.test(s.response||''),'a form saved under the fingerprint continues');
}
// Shared entries: a flow's revision carries the major of the entries it uses, and only those.
{
   const data=v=>({id:'set-data',library:'data',declarationVersion:2,version:v,data:{label:'Gold'}});
   const fns=v=>({id:'set-functions',library:'functions',declarationVersion:2,version:v,functions:{hi:{parameters:[],body:["return 'hi';"]}}});
   const uses={declarationVersion:2,id:'uses-data',version:'3.0.0',description:'x',steps:[{id:'s',type:'SAY',value:'{{$data.label}}'}]};
   const callsFn={declarationVersion:2,id:'uses-fn',version:'1.2.0',description:'x',steps:[{id:'s',type:'SAY',value:'{{fn.hi()}}'}]};
   const plain={declarationVersion:2,id:'plain',version:'1.0.0',description:'x',steps:[{id:'s',type:'SAY',value:'x'}]};
   const rev=(set,id)=>compile(set).find(f=>f.id===id).safetyRevision;
   ok(rev([data('1.0.0'),fns('1.0.0'),uses,callsFn,plain],'uses-data')==='declaration-v2:major:3/data@set-data:1','a $data reader carries the data major');
   ok(rev([data('1.0.0'),fns('1.0.0'),uses,callsFn,plain],'uses-fn')==='declaration-v2:major:1/functions@set-functions:1','an fn. caller carries the functions major');
   ok(rev([data('2.0.0'),fns('1.0.0'),uses,callsFn,plain],'uses-data').endsWith('data@set-data:2'),'a data major bump changes its readers');
   ok(rev([data('2.0.0'),fns('2.0.0'),uses,callsFn,plain],'plain')==='declaration-v2:major:1','a flow that uses no shared entry is untouched');
   ok(rev([data('1.4.0'),fns('1.0.0'),uses,callsFn,plain],'uses-data')===rev([data('1.0.0'),fns('1.0.0'),uses,callsFn,plain],'uses-data'),'a data minor change changes nothing');
   ok(rev([{...plain,version:undefined}],'plain')==='declaration-v2:major:0','no version is major 0');
}
// continuationBreaks: removed names without a major bump.
{
   const form=(v,inputs,parameters=[{name:'owner'}])=>({declarationVersion:2,id:'pay',version:v,description:'x',parameters,form:{inputs}});
   const before=[form('1.0.0',[{name:'amount',field:'amount'},{name:'method',any_of:[{name:'card',field:'card_number'},{name:'link',field:'phone'}]}]),{id:'set-data',library:'data',declarationVersion:2,version:'1.0.0',data:{a:1,b:2}},{declarationVersion:1,id:'gone',steps:[]}];
   assert.deepEqual(continuationBreaks(before,[form('1.1.0',[{name:'amount',field:'amount'},{name:'method',any_of:[{name:'card',field:'card_number'}]}],[]),{...before[1],data:{a:1}}]),
      [{id:'pay',removed:{parameters:['owner'],inputs:['link']}},{id:'set-data',removed:{data:['b']}}]);checks++;
   assert.deepEqual(continuationBreaks(before,[form('2.0.0',[{name:'amount',field:'amount'}],[]),{...before[1],version:'2.0.0',data:{a:1}}]),[],'a major bump declares the break');checks++;
   assert.deepEqual(continuationBreaks(before,[before[0],before[1]]),[],'a removed flow needs no bump');checks++;
   assert.deepEqual(continuationBreaks(before,[form('1.2.0',[{name:'amount',field:'amount'},{name:'method',any_of:[{name:'card',field:'card_number'},{name:'link',field:'phone'}]},{name:'note',field:'phone'}]),before[1]]),[],'an added input is not a break');checks++;
}
console.log(`continuation major version: ${checks} checks passed`);
