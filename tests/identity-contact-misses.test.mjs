/** The contact question and its retry menu never fail silently (owner 2026-11-11): an answer that is no contact asks the
 * question again (three attempts) before the retry menu; a parent form the caller has since closed is not the menu's owner;
 * the menu's give-up takes its declared exit; and a step whose expression throws fails the turn to the host, which tells the caller.
 * No network calls. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const quiet={info(){},debug(){},warn(){},error(){}};
let checks=0;const test=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};
const lookup={id:'lookup',name:'Lookup',version:'1',primary:true,description:'Look up an account',steps:[{id:'gce',type:'FLOW',value:'get-cell-or-email',callType:'call',parameters:{retry_flow:'lookup',cancel_flow:'contact-support'}},{id:'done',type:'SAY',value:'FOUND {{cell_number}}{{email}}'}]};
const support={id:'contact-support',name:'ContactSupport',description:'Support closing',steps:[{id:'cs',type:'SAY',value:'Closing.',value_es:'Cierre.'}]};
const relookup={id:'relookup',name:'Relookup',version:'1',primary:true,description:'Retry a lookup',steps:[{id:'gce',type:'FLOW',value:'get-cell-or-email',callType:'call',parameters:{retrying:true}},{id:'done',type:'SAY',value:'FOUND {{cell_number}}{{email}}'}]};
const verify={id:'verify',name:'Verify',version:'1',primary:true,description:'Verify a caller',steps:[{id:'auth',type:'FLOW',value:'authenticate-user',callType:'call',parameters:{retry_flow:'verify',cancel_flow:'contact-support',cell_number:'8185551234'}},{id:'done',type:'SAY',value:'VERIFIED'}]};
const outer={id:'outer',name:'Outer',version:'1',primary:true,description:'Calls boom',steps:[{id:'call_boom',type:'FLOW',value:'boom',callType:'call'},{id:'outer_after',type:'SAY',value:'OUTER NEVER'}]};
const outerReq={id:'outer-req',name:'OuterReq',version:'1',primary:true,description:'Calls a required step',steps:[{id:'call_req',type:'FLOW',value:'boom-req',callType:'call'},{id:'outer_req_after',type:'SAY',value:'OUTER NEVER'}]};
const boomReq={id:'boom-req',name:'BoomReq',version:'1',primary:true,description:'A required step that fails',steps:[{id:'ask',type:'SAY-GET',variable:'a',value:'Say something',value_es:'Diga algo'},{id:'must',type:'SET',variable:'v',value:'false',requireTrue:true},{id:'after',type:'SAY',value:'NEVER'}]};
const boom={id:'boom',name:'Boom',version:'1',primary:true,description:'A step that throws',steps:[{id:'ask',type:'SAY-GET',variable:'a',value:'Say something',value_es:'Diga algo'},{id:'bad',type:'SET',variable:'v',value:'openFormInstance(cargo, "collect-service-answer", [], { parent: "closed-task:1" })'},{id:'after',type:'SAY',value:'NEVER'}]};
// the stand-in ranker answers from this table, never from understanding (what the real model picks is measured live)
const RANKED={"Don't know it.":'choice:no_identifier','No lo sé.':'choice:no_identifier','I have different phone number, different email.':'choice:other_contact',"I'd rather stop here":'choice:exit','Talk to someone please':'choice:__agent','Check my order status':'new_request'};
const rankedSeen=[];
function fixture(cargo={},language='en'){
 const engine=new WorkflowEngine(quiet,async(s,u,schema,r)=>r && r.task==='rank_reply'?(rankedSeen.push(r),JSON.stringify({option:RANKED[r.input] || 'answers'})):'{"flowName":"None"}',[...FLOWS,lookup,relookup,verify,support,outer,boom,outerReq,boomReq],[],STANDARD_FUNCTIONS,{},false,language);engine.disableCommands();
 let s=engine.initSession('u','misses',language);Object.assign(s.cargo,{voice:false,verb:'type',verb_es:'escriba'},cargo);
 return {get s(){return s;},async start(flow){s=await engine.updateActivity({role:'user',content:'go',start:{flow,arguments:{}}},JSON.parse(JSON.stringify(s)));return String(s.response||'');},
  attempted:null,async say(content){const next=JSON.parse(JSON.stringify(s));this.attempted=next;s=await engine.updateActivity({role:'user',content},next);return s.response;}};
}
const flows=s=>(s.flowStacks||[]).flat().map(f=>f.flowName);
await test('two answers that are no contact ask the question again; the third offers the retry menu',async()=>{
 const t=fixture();assert.match(await t.start('lookup'),/phone or email/);
 for(const said of ['the small account please','my little account']){const r=await t.say(said);assert.match(r,/^Sorry, I do need the phone or email.*Please type the phone or email/,said);assert.ok(flows(t.s).includes('GetCellOrEmail'));}
 assert.match(await t.say('no idea which account'),/Would you like to try again\?/);assert.ok(flows(t.s).includes('GenericRetryWithOptions'));
});
await test('a reply with no identifier is ranked against the question\'s options; the first not-knowing pick is answered, the second counts (owner 2026-11-18)',async()=>{
 let t=fixture();await t.start('lookup');rankedSeen.length=0;
 let r=await t.say("Don't know it.");
 assert.deepEqual(rankedSeen.at(-1).options.filter(o=>o.startsWith('choice:')).sort(),['choice:__agent','choice:exit','choice:no_identifier','choice:other_contact']);
 assert.match(r,/^No problem\. Any phone number or email on your account works\. If you don't have any of them, type AGENT to speak with a person\. Please type the phone or email/);
 assert.equal(t.s.cargo.gceMisses,0);
 r=await t.say("Don't know it.");assert.match(r,/^No problem\. Any phone number.*Please type the phone or email/);assert.equal(t.s.cargo.gceMisses,1);
 assert.equal(await t.say('8185551234'),'FOUND 8185551234');
 t=fixture({},'es');await t.start('lookup');
 assert.match(await t.say('No lo sé.'),/^No hay problema\. Sirve cualquier teléfono o correo electrónico de su cuenta\. Si no tiene ninguno, escriba AGENTE/);
 t=fixture();await t.start('lookup');
 assert.match(await t.say('I have different phone number, different email.'),/^Sure, type that phone number or email\. Please type the phone or email/);
 assert.equal(await t.say('ana@example.com'),'FOUND ana@example.com');
});
await test('a short reply with no identifier reaches the ranker too; an identifier anywhere in the reply is read, never ranked',async()=>{
 let t=fixture();await t.start('lookup');rankedSeen.length=0;
 assert.match(await t.say('Maria Lopez?'),/^Sorry, I do need the phone or email/);assert.equal(rankedSeen.length,1);
 t=fixture();await t.start('lookup');rankedSeen.length=0;
 assert.equal(await t.say("I don't know, maybe it's 818 555 1234 I think"),'FOUND 8185551234');assert.equal(rankedSeen.length,0);
});
await test('ranked exit, person and new request leave the question',async()=>{
 let t=fixture();await t.start('lookup');
 assert.equal(await t.say("I'd rather stop here"),'Closing.');
 t=fixture();await t.start('lookup');await t.say('Talk to someone please');assert.ok(!flows(t.s).includes('GetCellOrEmail'));
 t=fixture();await t.start('lookup');await t.say('Check my order status');assert.ok(!flows(t.s).includes('GetCellOrEmail'));
});
await test('an email with no ending is read, and one that cannot be read is asked as an email, never an invalid phone (prod 2026-11-17)',async()=>{
 let t=fixture();await t.start('lookup');
 assert.equal(await t.say('Juana Perez 12 34 at gmail.'),'FOUND juanaperez1234@gmail.com');
 t=fixture();await t.start('lookup');
 // a known provider without its ending asks only the ending, and the ending alone completes it (owner 2026-11-18)
 const r=await t.say('J d o e 7 7 at Yahoo');assert.equal(r,'What comes after yahoo? For example, dot com.');assert.equal(await t.say('dot com'),'FOUND jdoe77@yahoo.com');
 t=fixture({},'es');await t.start('lookup');
 assert.match(await t.say('Lucia Gómez número 5 arroba punto com.'),/^Lo siento, no entendí el correo electrónico completo/);
});
await test('a new contact question starts a new count',async()=>{
 const t=fixture();await t.start('lookup');await t.say('the small account please');await t.say('my little account');await t.say('no idea which account');
 assert.match(await t.say('yes'),/^Please type the phone or email/);
 assert.match(await t.say('the small account please'),/^Sorry, I do need the phone or email.*Please type/);
});
await test('a parent form the caller has since closed is not the retry menu owner (the menu opens)',async()=>{
 const t=fixture({authOptions:{parent_form:'closed-task:14'},forms:{}});await t.start('lookup');
 for(const said of ['the small account please','my little account'])await t.say(said);
 const r=await t.say('no idea which account');assert.match(String(r),/Would you like to try again\?/);assert.ok(flows(t.s).includes('GenericRetryWithOptions'));
});
await test('a retried contact question never opens under a task the caller has since closed',async()=>{
 const t=fixture({contactOptions:{retry_flow:'lookup',cancel_flow:'contact-support',parent_form:'closed-task:3'},forms:{}});
 assert.match(await t.start('relookup'),/phone or email/);assert.equal(await t.say('8185551234'),'FOUND 8185551234');
});
await test('joining a live code never opens under the earlier verification\'s closed task',async()=>{
 const t=fixture({authOptions:{retry_flow:'verify',cancel_flow:'contact-support',parent_form:'closed-task:5'},forms:{},otpHash:'x',otpTimestamp:Date.now(),otp_cell_number:'8185551234'});
 assert.match(await t.start('verify'),/code/i);assert.equal(t.s.cargo.authOptions.parent_form,'');
});
await test("the retry menu's give-up takes its declared exit, never a silent hand-off",async()=>{
 const t=fixture();await t.start('lookup');for(const said of ['the small account please','my little account','no idea which account'])await t.say(said);
 assert.match(await t.say('still no idea'),/didn't catch that/);
 assert.equal(await t.say('whatever really'),'Closing.');assert.equal(flows(t.s).length,0);
});
await test('a step whose expression throws fails the turn to the host (JSFEExecutionError) and ends every flow, never a silent empty turn',async()=>{
 const t=fixture();await t.start('outer');assert.deepEqual(flows(t.s),['Outer','Boom']);
 await assert.rejects(t.say('hello'),e=>e.name==='JSFEExecutionError' && e.cause?.name==='JSFEStepExpressionFailed' && /SET step bad in Boom: .*FORM parent does not exist/.test(e.message));
 assert.equal(t.attempted.flowStacks.flat().length,0,'no frame is left to resume mid-task');
});
await test('a required SET that fails also ends every flow, so the next turn cannot resume the broken frame (prod 2026-11-11 CA6619feed)',async()=>{
 const t=fixture();await t.start('outer-req');assert.deepEqual(flows(t.s),['OuterReq','BoomReq']);
 await assert.rejects(t.say('hello'),e=>e.name==='JSFEExecutionError' && e.cause?.name==='JSFERequiredSetFailed');
 assert.equal(t.attempted.flowStacks.flat().length,0,'no frame is left to resume mid-task');
});
console.log(`identity contact misses: all ${checks} checks passed`);
