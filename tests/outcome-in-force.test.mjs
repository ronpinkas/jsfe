/** $outcome: a flow reads the declared outcome in force on its stack (its own, else its nearest caller's). */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
const quiet={debug(){},info(){},warn(){},error(){}};
let count=0;
async function test(name,run){await run();count++;console.log('PASS '+name);}
const say=(id,value,extra={})=>({id,type:'SAY',value,...extra});
const ask=(id,value)=>({id,type:'SAY-GET',variable:'reply',value});
const read=id=>say(id,"read {{$outcome ? $outcome.outcome + ':' + ($outcome.reason || '') + ':' + $outcome.flowName : 'none'}}");
const call=(id,value,callType='call',parameters)=>({id,type:'FLOW',value,callType,...(parameters?{parameters}:{})});
const flow=(id,steps,extra={})=>({id,name:id,version:'1',steps,...extra});
function fixture(flows){
 const engine=new WorkflowEngine(quiet,async()=>JSON.stringify({flowName:'None'}),flows,[],{},{},false,'en');engine.disableCommands();
 let session=engine.initSession('user',crypto.randomUUID(),'en');
 return {async say(content,start){const r=await engine.updateActivity({role:'user',content,...(start?{start}:{})},session);session=JSON.parse(JSON.stringify(r));return String(r.response||'');}};
}
const reads=text=>[...text.matchAll(/read (\S+)/g)].map(m=>m[1]);

await test('a flow reads its own declaration from the step that made it on, across a turn',async()=>{
 const t=fixture([flow('menu',[read('before'),say('answered','Your balance is $0.',{outcome:'resolved',reason:'fact'}),read('same_turn'),ask('more','Anything else?'),read('after')])]);
 assert.deepEqual(reads(await t.say('start',{flow:'menu'})),['none','resolved:fact:menu']);
 assert.deepEqual(reads(await t.say('no')),['resolved:fact:menu']);
});
await test("a called flow reads its caller's declaration; its own ends with it",async()=>{
 const t=fixture([
  flow('parent',[say('done','Paid.',{outcome:'resolved'}),call('exit','child'),read('parent_after')]),
  flow('child',[read('child_before'),say('child_declares','Child.',{outcome:'unresolved',reason:'child'}),read('child_after')]),
 ]);
 assert.deepEqual(reads(await t.say('start',{flow:'parent'})),['resolved::parent','unresolved:child:child','resolved::parent']);
});
await test('a caller that declared nothing reads none after its child ends',async()=>{
 const t=fixture([flow('parent',[call('go','child'),read('after')]),flow('child',[say('c','Child.',{outcome:'resolved'})])]);
 assert.deepEqual(reads(await t.say('start',{flow:'parent'})),['none']);
});
await test('an outcome on a FLOW call declares it for the caller, and a replace of the same frame keeps it',async()=>{
 const t=fixture([
  flow('menu',[ask('pick','Pick one.'),call('answer','facts','call'),{id:'again',type:'CASE',branches:{"condition: reply !== 'exit'":call('menu_again','menu','replace'),default:read('exit_read')}}].map((s,i)=>i===1?{...s,outcome:'resolved',reason:'fact_answered'}:s)),
  flow('facts',[say('fact','Your balance is $0.')]),
 ]);
 await t.say('start',{flow:'menu'});
 await t.say('balance');
 assert.deepEqual(reads(await t.say('exit')),['resolved:fact_answered:menu']);
});
await test('a reboot starts a flow with none; the exiting flow hands the outcome over as a parameter (a path)',async()=>{
 const t=fixture([
  flow('menu',[say('fact','Your balance is $0.',{outcome:'resolved'}),call('exit','support','reboot',{exit_outcome:'{{$outcome.outcome}}'})]),
  flow('support',[read('support_read'),say('handed',"handed {{exit_outcome || 'nothing'}}")],{variables:{exit_outcome:{type:'string',value:''}}}),
 ]);
 const text=await t.say('start',{flow:'menu'});
 assert.deepEqual(reads(text),['none']);
 assert.match(text,/handed resolved/);
 const none=fixture([flow('menu',[call('exit','support','reboot',{exit_outcome:'{{$outcome.outcome}}'})]),flow('support',[say('handed',"handed {{exit_outcome || 'nothing'}}")],{variables:{exit_outcome:{type:'string',value:''}}})]);
 assert.match(await none.say('start',{flow:'menu'}),/handed nothing/,'no declaration: the parameter is empty');
});
console.log('$outcome: all '+count+' checks passed');
