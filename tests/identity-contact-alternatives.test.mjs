/** One answer that holds several contacts (owner 2026-11-27): when the one looked up first is not on file, the answer's other
 * phone or email is tried, each at most once and never one already found not on file, before the caller hears that none was
 * found; the first found wins. Prod 11-27: a card with a mistyped account and a right phone, and "email + phone" on WhatsApp
 * where the phone had already been rejected: the other contact was never tried. No network calls. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS, projectForm, parseFormSubmission, formSubmissionReaders} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const quiet={info(){},debug(){},warn(){},error(){}};
let checks=0;const test=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};
const lookup={id:'lookup',name:'Lookup',version:'1',primary:true,description:'Look up an account',steps:[{id:'gce',type:'FLOW',value:'get-cell-or-email',callType:'call',parameters:{retry_flow:'lookup',cancel_flow:'contact-support',validate_flow:'stub-validate'}},{id:'done',type:'SAY',value:'FOUND {{cell_number}}{{email}}'}]};
const support={id:'contact-support',name:'ContactSupport',description:'Support closing',steps:[{id:'cs',type:'SAY',value:'Closing.',value_es:'Cierre.'}]};
// the tenant's validate-contact, stood in: reads cargo.contactKind/contactValue, answers cargo.contactCheck
const validate={id:'stub-validate',name:'StubValidate',description:'Check a contact is on file',steps:[{id:'check',type:'SET',variable:'noop',value:"(cargo.validated=(cargo.validated || []).concat([String(cargo.contactValue)]),cargo.contactCheck=(cargo.onFile || []).indexOf(String(cargo.contactValue).toLowerCase())>=0?'found':'none',true)"}]};
const relookup={...lookup,id:'relookup',name:'Relookup',steps:[{...lookup.steps[0],parameters:{...lookup.steps[0].parameters,retry_flow:'relookup',cell_number:'8185551234'}},lookup.steps[1]]};
function fixture(onFile,language='en'){
 const engine=new WorkflowEngine(quiet,async(s,u,schema,r)=>r && r.task==='rank_reply'?JSON.stringify({option:'answers'}):'{"flowName":"None"}',[...FLOWS,lookup,relookup,support,validate],[],STANDARD_FUNCTIONS,{},false,language);engine.disableCommands();
 let s=engine.initSession('u','alternatives',language);Object.assign(s.cargo,{voice:false,verb:'type',verb_es:'escriba',onFile});
 return {engine,get s(){return s;},set s(v){s=v;},async start(flow='lookup'){s=await engine.updateActivity({role:'user',content:'go',start:{flow,arguments:{}}},JSON.parse(JSON.stringify(s)));return String(s.response||'');},
  async say(content){s=await engine.updateActivity({role:'user',content},JSON.parse(JSON.stringify(s)));return String(s.response||'');}};
}
await test('email and phone typed together: the phone is not on file, the email is, and wins',async()=>{
 const t=fixture(['ana@example.com']);await t.start();
 assert.equal(await t.say('ana@example.com\n818 555 1234'),'FOUND ana@example.com');
 assert.deepEqual(t.s.cargo.validated,['8185551234','ana@example.com']);
 assert.equal(t.s.cargo.gceRejects,0,'trying the answer\'s other contact is not a rejection');
});
await test('the first found wins: the phone is on file, the email is never looked up',async()=>{
 const t=fixture(['8185551234','ana@example.com']);await t.start();
 assert.equal(await t.say('ana@example.com 8185551234'),'FOUND 8185551234');
 assert.deepEqual(t.s.cargo.validated,['8185551234']);
});
await test('neither on file: one rejection, naming both, and the question again',async()=>{
 const t=fixture([]);await t.start();
 assert.match(await t.say('ana@example.com 8185551234'),/^I could not find an account with that phone number or that email\..*phone or email/);
 assert.deepEqual(t.s.cargo.validated,['8185551234','ana@example.com']);assert.equal(t.s.cargo.gceRejects,1);
 const es=fixture([],'es');await es.start();
 assert.match(await es.say('ana@example.com 8185551234'),/^No encontré una cuenta con ese número de teléfono ni con ese correo\./);
});
await test('a contact already found not on file is not looked up again: the email is tried at once (WhatsApp 11-27)',async()=>{
 const t=fixture(['ana@example.com']);await t.start();
 assert.match(await t.say('8185551234'),/^I could not find an account with that phone number\./);
 assert.equal(await t.say('ana@example.com 8185551234'),'FOUND ana@example.com');
 assert.deepEqual(t.s.cargo.validated,['8185551234','ana@example.com'],'the phone was looked up once');
});
await test('one contact alone is unchanged',async()=>{
 const t=fixture([]);await t.start();
 assert.match(await t.say('ana@example.com'),/^I could not find an account with that email\./);
 assert.deepEqual(t.s.cargo.validated,['ana@example.com']);
});
await test('a contact card with phone and email: the phone is not on file, the email is (web 11-27)',async()=>{
 const t=fixture(['ana@example.com']);await t.start();
 const view=projectForm(t.s),boxes=(view && view.fields[0] && view.fields[0].fields || []).map(f=>f.name);assert.ok(boxes.includes('phone') && boxes.includes('email_address'),'the card offers phone and email');
 const request=parseFormSubmission('JSFE_FORM_V1:'+JSON.stringify({form:view.form,values:{phone:'8185551234',email_address:'ana@example.com'}}),view);
 const old={readFormAnswer:t.engine.APPROVED_FUNCTIONS.readFormAnswer,enrichFormMatches:t.engine.APPROVED_FUNCTIONS.enrichFormMatches};
 Object.assign(t.engine.APPROVED_FUNCTIONS,formSubmissionReaders(request,()=>t.engine.getSessionContext()));
 let r;try{r=await t.say(request.prompt);}finally{Object.assign(t.engine.APPROVED_FUNCTIONS,old);}
 assert.equal(r,'FOUND ana@example.com');assert.deepEqual(t.s.cargo.validated,['8185551234','ana@example.com']);
});
await test('a contact handed back from the pending list keeps the rest: the tenant retries the phone, the email is still tried',async()=>{
 const t=fixture(['ana@example.com']);
 t.s.cargo.gceAlternatives=[{kind:'phone',key:'8185551234',value:'8185551234'},{kind:'email',key:'ana@example.com',value:'ana@example.com'}];
 assert.equal(await t.start('relookup'),'FOUND ana@example.com');
 assert.deepEqual(t.s.cargo.validated,['8185551234','ana@example.com']);
});
console.log(`identity-contact-alternatives: all ${checks} checks passed`);
