import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {defineWorker,defineForm} from '../dist/forms/index.js';
const quiet={debug(){},info(){},warn(){},error(){}};
const set=(id,variable,value)=>({id,type:'SET',variable,value});
const worker=(id,steps,variables={},extra={})=>({id,name:id,version:'1',description:'Replacement initialization contract',variables,steps,...extra});
const engine=flows=>{const e=new WorkflowEngine(quiet,async()=>'{"flowName":"None"}',flows,[],{}, {},false,'en');e.disableCommands();return e;};
let n=0;const check=(label,fn)=>{fn();n++;};
async function run(initializeDefaults,{scope,parameters}={}){
 const replace={id:'replace',type:'FLOW',value:'target',callType:'replace',...(initializeDefaults===undefined?{}:{initializeDefaults}),...(parameters?{parameters}:{})};
 const flows=[worker('entry',[set('own_undefined','unset','undefined'),replace],{zero:{value:0},no:{value:false},empty:{value:''},nil:{value:null},count:{value:3}}),
  worker('target',[set('observe','noop',"(cargo.observed={added:typeof added==='undefined'?'UNDEFINED':added,unset:typeof unset==='undefined'?'UNDEFINED':unset,zero:zero,no:no,empty:empty,nil:nil,count:count},true)"),{id:'done',type:'SAY',value:'done'}],{added:{value:'DEFAULT'},unset:{value:'UNSET_DEFAULT'},zero:{value:99},no:{value:true},empty:{value:'nonempty'},nil:{value:'not null'},count:{value:0}},scope?{scope}:{})];
 const e=engine(flows);const s=await e.updateActivity({role:'user',content:'start',start:{flow:'entry'}},e.initSession('replace-'+n,'synthetic','en'));return s.cargo.observed;
}
for(const flag of [undefined,false,'true']){
 const r=await run(flag);check('legacy shared replacement requires literal opt-in '+flag,()=>{assert.equal(r.added,'UNDEFINED');assert.equal(r.unset,'UNDEFINED');assert.deepEqual([r.zero,r.no,r.empty,r.nil,r.count],[0,false,'',null,3]);});
}
let r=await run(true);check('opt-in fills only absent/undefined defaults',()=>{assert.equal(r.added,'DEFAULT');assert.equal(r.unset,'UNSET_DEFAULT');assert.deepEqual([r.zero,r.no,r.empty,r.nil,r.count],[0,false,'',null,3]);});
r=await run(true,{parameters:{added:'EXPLICIT',unset:'ARG'}});check('explicit replacement parameters take priority over defaults',()=>{assert.equal(r.added,'EXPLICIT');assert.equal(r.unset,'ARG');});
r=await run(undefined,{parameters:{added:'EXPLICIT'}});check('legacy replacement still injects explicit parameters',()=>{assert.equal(r.added,'EXPLICIT');assert.equal(r.unset,'UNDEFINED');});
r=await run(undefined,{scope:'isolated'});check('isolated replacement still initializes its own defaults without opt-in',()=>{assert.deepEqual(r,{added:'DEFAULT',unset:'UNSET_DEFAULT',zero:99,no:true,empty:'nonempty',nil:'not null',count:0});});
const child=worker('shared-child',[set('append','noop','(entries.push(n),true)'),set('next','n','n+1'),{id:'loop',type:'CASE',branches:{'condition: n<4':{id:'replace-self',type:'FLOW',value:'shared-child',callType:'replace',initializeDefaults:true},default:{id:'done',type:'END'}}}],{entries:{value:[]},n:{value:1}});
const parent=worker('shared-parent',[{id:'child',type:'FLOW',value:'shared-child'},{id:'show',type:'SAY',value:'{{entries.join(",")}}/{{n}}'}]);
const e=engine([parent,child]);const s=await e.updateActivity({role:'user',content:'start',start:{flow:'shared-parent'}},e.initSession('self','synthetic','en'));
check('opt-in self replacement preserves progress and the caller variable container',()=>assert.equal(s.response,'1,2,3/4'));
const declared=defineWorker({id:'native',name:'native',contract:{role:'worker',summary:'Native replacement initialization'},steps:[{id:'branch',type:'CASE',branches:{default:{id:'replace',type:'FLOW',value:'target',callType:'replace'}}},{id:'tool',type:'CALL-TOOL',tool:'example',onFail:{id:'retry',type:'FLOW',value:'native',callType:'replace'}},{id:'explicit-old',type:'FLOW',value:'target',callType:'replace',initializeDefaults:false}]});
check('new native declarations explicitly mark nested and failure replacements',()=>{assert.equal(declared.steps[0].branches.default.initializeDefaults,true);assert.equal(declared.steps[1].onFail.initializeDefaults,true);assert.equal(declared.steps[2].initializeDefaults,false);});
const form=defineForm({id:'native-form',name:'native-form',contract:{summary:'Reentrant native form'},inputs:[],confirm:{question:'Confirm?'}});
check('native form reentry explicitly carries replacement initialization',()=>{const walk=x=>!x||typeof x!=='object'?[]:[...(x.type==='FLOW'&&x.callType==='replace'?[x]:[]),...Object.values(x).flatMap(walk)];const replacements=walk(form);assert.ok(replacements.length);assert.ok(replacements.every(s=>s.initializeDefaults===true));});
console.log(`replace-defaults-opt-in: ${n} checks passed`);
