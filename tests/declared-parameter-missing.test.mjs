/** A declared parameter the caller never passed reads as undefined in a later turn, after the host's JSON save of the
 *  session dropped it; an undeclared name still throws. Prod 2026-11-26 web 5cec7320: 'done_by_ai' is not defined. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {formFlow,FLOWS,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
let checks=0;const test=async(name,run)=>{await run();checks++;console.log('PASS '+name);};
const S=(id,value)=>({id,type:'SET',variable:'noop',value});
function fixture(read,passed){
 const errors=[];
 const form=formFlow({id:'ticket',name:'Ticket',parameters:[{name:'done_by_ai',type:'string',description:'Who filed it.'}],
  inputs:[{name:'full_name',profile:{kind:'text'},question:'Your name?',question_es:'¿Su nombre?'}],
  after:[S('read',read)]});
 const starter={id:'starter',name:'Starter',version:'1',steps:[{id:'go',type:'FLOW',value:'ticket',callType:'call',...(passed?{parameters:passed}:{})}]};
 let last='';
 const log={debug(){},info(){},warn(){},error(...a){errors.push(a.join(' '));}};
 const engine=new WorkflowEngine(log,async()=>last,linkFormSchemas([...FLOWS,form,starter]),[],STANDARD_FUNCTIONS,{},false,'en');engine.disableCommands();
 let session=engine.initSession('fixture',crypto.randomUUID(),'en');
 return {errors,get session(){return session;},async say(content,start){last=content;session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'starter'}}:{})},session)));return String(session.response||'');}};
}
const notDefined=(t)=>t.errors.filter(e=>/not defined|Expression evaluation failed/.test(e));
await test('an unpassed declared parameter reads as undefined after a turn boundary',async()=>{
 const t=fixture("(cargo.seen = String(done_by_ai) + ':' + (done_by_ai === 'true'), true)");
 assert.match(await t.say('begin',true),/Your name\?/);
 await t.say('Julia Rivera');
 assert.deepEqual(notDefined(t),[]);assert.equal(t.session.cargo.seen,'undefined:false');
});
await test('a passed parameter keeps its value',async()=>{
 const t=fixture("(cargo.seen = done_by_ai, true)",{done_by_ai:'true'});
 await t.say('begin',true);await t.say('Julia Rivera');
 assert.deepEqual(notDefined(t),[]);assert.equal(t.session.cargo.seen,'true');
});
await test('an undeclared name still fails',async()=>{
 const t=fixture("(cargo.seen = not_a_parameter, true)");
 await t.say('begin',true);
 await assert.rejects(t.say('Julia Rivera'),/'not_a_parameter' is not defined/,'a typo must still fail');
});
console.log(`Declared parameter missing: all checks passed (${checks})`);
