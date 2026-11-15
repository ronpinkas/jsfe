/** A reply the ranker sends on as a new request reaches intent detection with the exchange it answered (owner 2026-11-15). No network. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const quiet={info(){},debug(){},warn(){},error(){}};
const owner={id:'Owner',name:'Owner',description:'Product inquiry',primary:true,version:'1.0.0',variables:{response:{type:'object',value:{}},answer:{type:'string',value:''}},steps:[
 {id:'ask',type:'SAY-GET',variable:'answer',value:'1. Speaker A 2. Speaker B. Ask about a price or say DONE.',as_spoken:true},
 {id:'classify',type:'DISPATCH',onResponse:'continue',responseContext:'Shown products; their price or stock is a response.',responseParameters:[{name:'asked',type:'string',enum:['price','stock'],description:'Fact'}],responseVariable:'response'},
 {id:'next',type:'SAY-GET',variable:'answer',value:'[next]'}]};
const other={id:'Other',name:'Other',description:'Account balance',primary:true,version:'1.0.0',steps:[{id:'o',type:'SAY',value:'[other]'}]};
function setup(){
 const calls=[];
 const callback=async(system,user,schema,request)=>{
  calls.push(structuredClone(request));
  if(request?.task==='rank_reply')return JSON.stringify({option:'new_request'});
  if(request?.stage===1)return JSON.stringify({flowName:'Other'});
  return JSON.stringify({parameters:{}});
 };
 const engine=new WorkflowEngine(quiet,callback,[owner,other],[],{...STANDARD_FUNCTIONS},{},false,'en');engine.disableCommands();engine.intentDetection='two-stage';
 let session=engine.initSession('test',crypto.randomUUID(),'en');
 return {calls,get session(){return session;},async say(content,start){session=await engine.updateActivity({role:'user',content,...(start?{start:{flow:start}}:{})},JSON.parse(JSON.stringify(session)));return session.response;}};
}
let checks=0;async function test(name,fn){await fn();checks++;console.log('PASS '+name);}
await test('stage 1 sees the flow question the reply answered, never the reply itself',async()=>{
 const t=setup();await t.say('show me speakers','Owner');t.calls.length=0;
 assert.match(t.session.lastFlowTurn?.assistant?.content||'',/Speaker A/,'the turn answered in the flow is recorded on the session');
 assert.match(await t.say('and the bullrel, how much?'),/\[other\]/);
 const stage1=t.calls.find(c=>c?.stage===1);assert.ok(stage1,'intent detection ran');
 assert.equal(stage1.input,'and the bullrel, how much?');
 const said=stage1.conversation.filter(c=>c.role==='assistant').map(c=>c.content).join(' ');
 assert.match(said,/Speaker A/,'the question the caller heard');
 assert.ok(!stage1.conversation.some(c=>c.content==='and the bullrel, how much?'),'the reply is the input, not history');
});
await test('a turn with no flow left records no flow turn',async()=>{const t=setup();await t.say('show me speakers','Owner');await t.say('and the bullrel, how much?');assert.equal(t.session.lastFlowTurn,undefined);});
console.log(`new request context: all ${checks} checks passed`);
