/** Omitted args retain variable extraction and AI fallback; no network/model access. */
import assert from 'node:assert/strict';
const {WorkflowEngine}=await import(process.env.JSFE_TEST_ENGINE_MODULE||'../dist/index.js');
const quiet={debug(){},info(){},warn(){},error(){}};
let checks=0;
const eq=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
const local=(id,parameters)=>({id,name:id,parameters,implementation:{type:'local',function:id,retries:0,timeout:1000}});
async function probe({schema,variables,preceding=false,reply}){
 const calls=[],aiCalls=[];
 const tools=[local('target',schema),local('preceding',{type:'object',properties:{seed:{type:'boolean'}}})];
 const steps=[...Object.entries(variables).map(([variable,value],i)=>({id:'set-'+i,type:'SET',variable,value:JSON.stringify(value)})),...(preceding?[{id:'preceding',type:'CALL-TOOL',tool:'preceding',args:{seed:true},variable:'prior'}]:[]),{id:'target',type:'CALL-TOOL',tool:'target',variable:'result'},{id:'done',type:'SAY',value:'DONE'}];
 const flow={id:'probe',name:'Probe',version:'1.0.0',description:'Hermetic argument inference',steps};
 const ai=async(...args)=>{aiCalls.push(args);return JSON.stringify(reply);};
 const engine=new WorkflowEngine(quiet,reply?ai:null,[flow],tools,{preceding:()=>undefined,target:args=>{calls.push(args);return 'ok';}},{});
 const session=await engine.updateActivity({role:'user',content:'probe',start:{flow:'probe'}},engine.initSession('test','test','en'));
 return {calls,aiCalls,session};
}
for(const preceding of [false,true]){
 const f=await probe({schema:{type:'object',properties:{city:{type:'string'}},required:['city'],additionalProperties:false},variables:{city:'London'},preceding});
 eq(f.calls,[{city:'London'}],`${preceding?'undefined preceding result':'omitted step args'} preserves required city inference from owned flow variable`);
 eq(f.aiCalls.length,0,'known flow variable requires no AI inference');
 eq(String(f.session.response).includes('DONE'),true,'inferred arguments reach adapter and flow completes');
}
{
 // A numeric property without a literal input pattern reaches the existing AI fallback.
 // The callback must see the owned context, and its response must reach the real tool.
 const f=await probe({schema:{type:'object',properties:{quantity:{type:'number'}},required:['quantity'],additionalProperties:false},variables:{inventoryNote:'Seven units are available.'},preceding:true,reply:{quantity:7}});
 eq(f.aiCalls.length,1,'undefined preceding result preserves AI argument fallback');
 eq(f.aiCalls[0][0].includes('tool argument generator'),true,'callback is the argument generation task');
 eq(f.aiCalls[0][1].includes('inventoryNote: Seven units are available.'),true,'AI fallback retains current flow context');
 eq(f.calls,[{quantity:7}],'generated required numeric argument reaches adapter exactly once');
 eq(String(f.session.response).includes('DONE'),true,'AI-inferred argument completes the flow');
}
console.log(`Tool argument inference: all checks passed (${checks})`);
