/** A reason question (owner 2026-10-31; prod 2026-10-30: "No, la uso", "No necesito más" at a membership cancellation's
 * reason were ranked `abort` and the request ended as withdrawn). A form field whose response names what the caller does
 * not want (`reason_for` / `reason_for_from`) has its reply ranked as the reason for not wanting it: the ranker's request
 * carries `reasonFor`, offers only answers / new_request (no abort) to both executors; without it the ranking is generic. Fixture decisions only. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,defineForm,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
import {buildReplyRank} from '../dist/host/index.js';
const quiet={info(){},debug(){},warn(){},error(){}};
let checks=0;
const test=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};
const description='The stated reason for cancelling, in the caller’s own words.';
function fixture(response){
 const form=defineForm({id:'cancel',name:'Cancel',primary:true,description:'Cancel a membership',contract:{summary:'Cancel a membership'},
  before:[{id:'what',type:'SET',variable:'noop',value:"(cargo.forms[form_instance].data=Object.assign(cargo.forms[form_instance].data || {},{unwanted:'your membership'}),true)"}],
  inputs:[{name:'reason',profile:{kind:'text',narrative:true},response,question:'Why do you want to cancel your membership?'}],
  after:[{id:'filed',type:'SET',variable:'noop',value:'(cargo.filed=cargo.forms[form_instance].values.reason,true)'}]});
 const calls=[];
 // a stand-in ranker that withdraws on a leading "no" unless it is told the question asks for a reason
 const ai=async(system,user,schema,r)=>{
  calls.push(r);
  if(r.task==='rank_reply')return JSON.stringify({option:r.reasonFor ? 'answers' : 'abort'});
  return JSON.stringify(r.task==='detect_flow'?{flowName:'None'}:{parameters:{answer:r.input}});
 };
 const engine=new WorkflowEngine(quiet,ai,linkFormSchemas([...FLOWS,form]),[],STANDARD_FUNCTIONS,{},false,'en');engine.disableCommands();engine.intentDetection='two-stage';
 let session=engine.initSession('synthetic',crypto.randomUUID(),'en');session.cargo.voice=false;
 return {calls,get session(){return session;},async say(content,start){session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'cancel',arguments:{}}}:{})},session)));return String(session.response||'');}};
}
const ranked=t=>t.calls.filter(r=>r.task==='rank_reply');

await test('reason_for_from: the ranker is told what the caller does not want, and the reason is filed',async()=>{
 const t=fixture({description,reason_for_from:'unwanted'});
 assert.match(await t.say('start',true),/Why do you want to cancel/);
 await t.say("No, I don't use it.");
 const [r]=ranked(t);
 assert.equal(r.reasonFor,'your membership');
 assert.match(r.llm.system,/does not want \(your membership\), and asked for the reason/);
 assert.deepEqual(r.options,['answers','new_request'],'a reason question offers no abort');
 assert.ok(!/abort/.test(r.llm.system)&&r.systemOne.index.every(q=>q.option!=='abort'),'neither executor is asked about a withdrawal');
 assert.match(JSON.stringify(r.systemOne.questions),/ya no la necesito, I no longer need it/);
 assert.match(r.systemOne.state.assistant_instructions,/does not want \(your membership\)/);
 assert.equal(t.session.cargo.filed,"No, I don't use it.");
});
await test('reason_for: literal words work the same',async()=>{
 const t=fixture({description,reason_for:'the service'});await t.say('start',true);await t.say('No necesito más.');
 assert.equal(ranked(t)[0].reasonFor,'the service');assert.equal(t.session.cargo.filed,'No necesito más.');
});
await test('without it the ranking is generic (today\'s behaviour)',async()=>{
 const t=fixture({description});await t.say('start',true);await t.say('No necesito más.');
 const [r]=ranked(t);assert.equal(r.reasonFor,undefined);assert.match(r.llm.system,/I no longer want it/);assert.ok(r.options.includes('abort'));
 assert.equal(t.session.cargo.filed,undefined,'the stand-in withdrew it');
});
await test('declarations are checked',()=>{
 assert.throws(()=>fixture({description,reason_for:''}),/reason_for/);
 assert.throws(()=>fixture({description,reason_for_from:'a.b'}),/reason_for_from/);
 assert.throws(()=>fixture({description,reason_for:'x',reason_for_from:'y'}),/not both/);
 assert.throws(()=>buildReplyRank('no',[],'q',[{key:'yes',label:'Yes'}],{reasonFor:'x'}),/declares no choices/);
});
console.log(`Reply rank reason: ${checks} checks passed`);
