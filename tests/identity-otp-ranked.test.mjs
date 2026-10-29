/** An answer at the code question that no branch of validate-otp-code reads goes to the reply ranker, offered the step's
 * offers (owner 2026-10-29): an offer said in other words is taken, a new request leaves through intent detection, a
 * withdrawal ends, anything else is explained again. The code is asked first; the answer comes in the next turn. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const quiet={info(){},debug(){},warn(){},error(){}};
const variable=value=>({type:typeof value,value});
const probe={id:'otp-probe',name:'OtpProbe',version:'1',description:'Ask for the code, then enter the actual OTP validator.',variables:{answer:variable(''),otp_code:variable(''),normalized_otp_code:variable(''),user_choice:variable('')},steps:[{id:'ask',type:'SAY-GET',variable:'answer',value:'Code?'},{id:'raw',type:'SET',variable:'user_choice',value:'answer.trim().toLowerCase()'},{id:'otp',type:'SET',variable:'otp_code',value:'answer'},{id:'validate',type:'FLOW',value:'validate-otp-code',callType:'replace',initializeDefaults:true}]};
const resend={id:'resend-otp-code',name:'ResendOtpCode',version:'1',description:'Count resends.',steps:[{id:'record',type:'SET',variable:'noop',value:'(cargo.testResends=Number(cargo.testResends||0)+1,true)'}]};
const other={id:'balance',name:'Balance',primary:true,description:'Account balance',steps:[{id:'ran',type:'SET',variable:'noop',value:'(cargo.balanceRan=true,true)'},{id:'said',type:'SAY',value:'TEST balance'}]};
// a primary behind authentication (a use case) and the set's declared exit from it
const pay={id:'pay',name:'Pay',declarationVersion:2,version:'1',primary:true,description:'The caller wants to make a payment. Not: a payment link.',steps:[{id:'auth',type:'FLOW',value:'authenticate-user',callType:'call'}]};
const data={id:'test-data',library:'data',declarationVersion:2,data:{gate_exits:{'authenticate-user':[{key:'payment_link',label:'get a payment link instead (no code needed)'}]}}};
const agent={id:'live-agent-requested',name:'LiveAgentRequested',version:'1',description:'A person',steps:[{id:'ran',type:'SET',variable:'noop',value:'(cargo.agent=true,true)'},{id:'said',type:'SAY',value:'TEST agent'}]};
let checks=0;
async function at(answer,option,detected='Balance'){
 const calls=[],offered={};
 const ai=async(system,user,schema,r)=>{calls.push(r?.task);if(r?.task==='rank_reply'){offered.options=r.options;offered.choices=r.choices;return JSON.stringify({option});}if(r?.task==='detect_flow')return JSON.stringify({flowName:detected});return '{"flowName":"None"}';};
 const engine=new WorkflowEngine(quiet,ai,[...FLOWS,probe,resend,other,agent,pay,data],[],STANDARD_FUNCTIONS,{},false,'en');engine.disableCommands();
 let s=engine.initSession('u','otp-ranked','en');Object.assign(s.cargo,{voice:false,verb:'type',verb_es:'escriba',authOptions:{parent_form:''},authCancelFlow:'contact-support',otpVerified:false,otp_cell_number:'8185550000',otpSentOn:'cell'});
 s=await engine.updateActivity({role:'user',content:'start',start:{flow:'otp-probe',arguments:{}}},JSON.parse(JSON.stringify(s)));
 assert.match(s.response,/Code\?/);
 s=await engine.updateActivity({role:'user',content:answer},JSON.parse(JSON.stringify(s)));
 assert.ok(calls.includes('rank_reply'),answer+': ranked '+JSON.stringify(calls)+' '+s.response);checks++;
 return {s,offered,calls};
}
let r=await at('my code never showed up','choice:resend');
assert.equal(r.s.cargo.testResends,1);assert.doesNotMatch(r.s.response,/Let me explain/);
assert.deepEqual(r.offered.options.filter(o=>o.startsWith('choice:')),['choice:email','choice:resend','choice:no_phone','choice:__agent','choice:usecase:pay','choice:exit:payment_link'],'the step offers (another account only after a caller-ID preselection), the use cases, the declared exits');
assert.match(r.offered.choices.find(c=>c.key==='usecase:pay').label,/^states the reason for the call: The caller wants to make a payment\.$/,'a use case is labelled by its description, without its Not: list');
console.log('PASS a resend said in other words resends');
r=await at('I would rather sort this out with your staff','choice:__agent');
assert.equal(r.s.cargo.agent,true);console.log('PASS a person said in other words');
r=await at('what is my balance','new_request');
assert.equal(r.s.cargo.balanceRan,true);assert.doesNotMatch(r.s.response,/Let me explain/);console.log('PASS a new request leaves the code step');
r=await at('forget the whole thing','abort');
assert.doesNotMatch(r.s.response,/Let me explain/);assert.notEqual(r.s.cargo.otpVerified,true);console.log('PASS a withdrawal ends');
r=await at('blue sky','answers');
assert.match(r.s.response,/Let me explain\. I sent you a message with a six-digit code/);console.log('PASS anything else is explained again');
r=await at('I just want to pay my bill','choice:usecase:pay');
assert.match(r.s.response,/Let me explain\. I sent you a message with a six-digit code/);assert.equal(r.s.cargo.balanceRan,undefined);console.log('PASS a use case authentication serves is explained again, never routed');
r=await at('just text me the link to pay','choice:exit:payment_link');
assert.ok(r.calls.includes('detect_flow'),'a declared exit goes to intent detection');assert.equal(r.s.cargo.balanceRan,true);assert.doesNotMatch(r.s.response,/Let me explain/);console.log('PASS a declared exit leaves as a new request');
r=await at('quiere comer ya','new_request','None');
assert.ok(r.calls.includes('detect_flow'));assert.match(r.s.response,/Let me explain\. I sent you a message with a six-digit code/);assert.equal(r.s.cargo.balanceRan,undefined);console.log('PASS a new request no flow serves stays at the code step and is explained (onNoIntent: stay)');
assert.equal(r.calls.filter(t=>t==='detect_flow').length,1,'intent detection asked once');
r=await at('what is my balance','new_request');
assert.equal(r.calls.filter(t=>t==='detect_flow').length,1,'a served request: intent detection asked once, its decision reused');
{ // the code question asked again in the same frame offers each choice once (the offers are rebuilt, never appended)
 const offers=[];
 const ai=async(system,user,schema,q)=>{if(q?.task==='rank_reply'){offers.push(q.options);return JSON.stringify({option:'answers'});}return '{"flowName":"None"}';};
 const engine=new WorkflowEngine(quiet,ai,[...FLOWS,probe,resend,other,agent,pay,data],[],STANDARD_FUNCTIONS,{},false,'en');engine.disableCommands();
 let s=engine.initSession('u','otp-twice','en');Object.assign(s.cargo,{voice:false,verb:'type',verb_es:'escriba',authOptions:{parent_form:''},authCancelFlow:'contact-support',otpVerified:false,otp_cell_number:'8185550000',otpSentOn:'cell'});
 s=await engine.updateActivity({role:'user',content:'start',start:{flow:'otp-probe',arguments:{}}},JSON.parse(JSON.stringify(s)));
 for(const answer of ['blue sky','green grass','red sun'])s=await engine.updateActivity({role:'user',content:answer},JSON.parse(JSON.stringify(s)));
 assert.ok(offers.length>=2,'ranked more than once: '+offers.length);
 for(const o of offers)assert.equal(new Set(o).size,o.length,'unique options '+JSON.stringify(o));
 assert.deepEqual(offers[1],offers[0]);checks++;console.log('PASS asked again, each choice is offered once');
}
console.log(`OTP ranked: ${checks} ranked answers, every case passed`);
