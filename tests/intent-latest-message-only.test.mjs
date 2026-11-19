/**
 * Argument extraction reads the latest message and the assistant's last message only, never the user's earlier words
 * (owner 2026-11-18). Stage 1, which flow, still reads the whole last exchange: only extraction was narrowed. Prod CA957394 (2026-11-18 20:15 PT): a caller gave ZIP code "9 2 0 2 0." at
 * the store question, then said "Need help with my account."; the extractor read the ZIP from the previous exchange as
 * the account flow's phone number and the caller heard "the phone number you provided isn't valid". No network.
 */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const quiet={info(){},debug(){},warn(){},error(){}};
const ZIP='9 2 0 2 0.';
const stores={id:'Stores',name:'Stores',description:'Store stock for a product',primary:true,version:'1.0.0',variables:{response:{type:'object',value:{}},answer:{type:'string',value:''}},steps:[
 {id:'zip',type:'SAY-GET',variable:'answer',value:'What city and state, or ZIP code, are you near?',as_spoken:true},
 {id:'zip_read',type:'DISPATCH',onResponse:'continue',responseContext:'The ZIP code or city the caller is near.',responseParameters:[{name:'zip',type:'string',description:'ZIP code'}],responseVariable:'response'},
 {id:'shown',type:'SAY-GET',variable:'answer',value:'Available for pickup at Curacao Chino. Ask about another product, or say DONE.',as_spoken:true},
 {id:'shown_read',type:'DISPATCH',onResponse:'continue',responseContext:'Store results were shown.',responseParameters:[{name:'asked',type:'string',enum:['price','stock'],description:'Fact'}],responseVariable:'response'},
 {id:'end',type:'SAY',value:'[stores end]'}]};
const account={id:'Account',name:'Account',description:'Account information',primary:true,version:'1.0.0',parameters:[{name:'cell_number',type:'string',description:'Phone number in the message.'},{name:'asked',type:'string',enum:['balance','other'],description:'Fact asked'}],steps:[{id:'a',type:'SAY',value:'[account]'}]};
function setup(rank){
 const calls=[];
 const callback=async(system,user,schema,request)=>{
  calls.push({system,user,request:structuredClone(request)});
  if(request?.task==='rank_reply')return JSON.stringify({option:rank(request.input)});
  if(request?.stage===1)return JSON.stringify({flowName:'Account'});
  return JSON.stringify({parameters:{}});
 };
 const engine=new WorkflowEngine(quiet,callback,[stores,account],[],{...STANDARD_FUNCTIONS},{},false,'en');engine.disableCommands();engine.intentDetection='two-stage';
 let session=engine.initSession('test',crypto.randomUUID(),'en');
 return {calls,get session(){return session;},set session(s){session=s;},async say(content,start){session=await engine.updateActivity({role:'user',content,...(start?{start:{flow:start}}:{})},JSON.parse(JSON.stringify(session)));return session.response;}};
}
const seen=(call)=>JSON.stringify([call.system,call.user,call.request?.conversation,call.request?.systemOne?.state]);
let checks=0;async function test(name,fn){await fn();checks++;console.log('PASS '+name);}

await test('CA957394: a ZIP code said in a flow never reaches the account request\'s arguments',async()=>{
 const t=setup(input=>/account/i.test(input)?'new_request':'answers');
 await t.say('stores','Stores');
 assert.match(await t.say(ZIP),/Curacao Chino/);
 t.calls.length=0;
 assert.match(await t.say('Need help with my account.'),/\[account\]/);
 const stage1=t.calls.find(c=>c.request?.stage===1),stage2=t.calls.find(c=>c.request?.stage===2);
 assert.ok(stage1&&stage2,'both stages ran');
 assert.deepEqual(stage2.request.conversation.map(c=>c.role),['assistant'],'stage 2: the assistant\'s last message only');
 assert.match(stage2.request.conversation[0].content,/Curacao Chino/,'stage 2: the flow\'s last message');
 assert.ok(!seen(stage2).includes(ZIP)&&!seen(stage2).includes('9 2 0 2 0'),'stage 2: the ZIP code is in no part of the request');
 assert.equal(stage2.request.input,'Need help with my account.','stage 2: the latest message');
 assert.deepEqual(stage1.request.conversation.map(c=>c.role),['user','assistant'],'stage 1 unchanged: the flow\'s last exchange (owner 2026-11-15)');
});

await test('a typed reply is extracted with the question it answers and nothing earlier',async()=>{
 const t=setup(()=>'answers');
 await t.say('stores','Stores');
 t.session.lastChatTurn={user:{role:'user',content:'my phone is 818 555 0142'},assistant:{role:'assistant',content:'earlier assistant'}};
 t.calls.length=0;
 await t.say(ZIP);
 const stage2=t.calls.find(c=>c.request?.stage===2);
 assert.ok(stage2,'the reply was extracted');
 assert.deepEqual(stage2.request.conversation,[{role:'assistant',content:stage2.request.conversation[0]?.content}],'one assistant turn: the question');
 assert.match(stage2.request.conversation[0].content,/ZIP code/,'the question it answers');assert.ok(!seen(stage2).includes('818 555 0142')&&!seen(stage2).includes('earlier assistant'),'no earlier exchange');
});

await test('outside a flow: the arguments never read the user\'s earlier words; stage 1 reads the exchange as before',async()=>{
 const t=setup(()=>'answers');
 t.session.lastChatTurn={user:{role:'user',content:'my ZIP is 92020'},assistant:{role:'assistant',content:'Do you want secure access to your account information?'}};
 assert.match(await t.say('yes'),/\[account\]/);
 const stage1=t.calls.find(c=>c.request?.stage===1),stage2=t.calls.find(c=>c.request?.stage===2);
 assert.deepEqual(stage2.request.conversation,[{role:'assistant',content:'Do you want secure access to your account information?'}],'stage 2: the offer only');
 assert.ok(!seen(stage2).includes('92020'),'stage 2: the earlier user words are in no part of the request');
 assert.deepEqual(stage1.request.conversation.map(c=>c.role),['user','assistant'],'stage 1 unchanged: the last exchange');
});

await test('the extraction rule names the latest message only, and keeps the yes to the assistant\'s last message',async()=>{
 const t=setup(()=>'answers');
 t.session.lastChatTurn={assistant:{role:'assistant',content:'Account?'}};
 await t.say('yes');
 const stage2=t.calls.find(c=>c.request?.stage===2);
 const text=stage2.system+JSON.stringify(stage2.request.systemOne?.state??'');
 assert.ok(!/earlier in the conversation/.test(text),'no rule sends the extractor to earlier messages');
 assert.match(text,/only when the user gave it in the latest message/,'the latest message');
 assert.match(text,/A plain yes to the assistant/,'the confirmed-values rule stays');
 assert.match(text,/A short answer to the assistant/,'the short-answer rule stays');
});
console.log(`latest message only: all ${checks} checks passed`);
