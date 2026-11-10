import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS, projectForm, parseFormSubmission, formSubmissionReaders} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';

const root = {declarationVersion:2,id:'demo',primary:true,description:'Demo',form:{inputs:[
  {name:'email',field:'email'},
  {name:'service',profile:{kind:'choice',choices:[{key:'a',label:'First',phrases:['first']},{key:'b',label:'Second',phrases:['second']},{key:'restricted',label:'Current only',phrases:['restricted'],current_only:true}]},question:'Which?'},
  {name:'note',profile:{kind:'text'},question:'Note?'},
  {name:'card',form:'collect-credit-card'}
],confirm:{question:'Confirm?',confirmation:'firm'},after:[{id:'effect',type:'SET',variable:'noop',value:'(cargo.completed=Number(cargo.completed || 0)+1,true)'}]}};
const cargoLogs=[];
const quiet={info(message){if (String(message).startsWith('Received Cargo: ')) cargoLogs.push(String(message));},warn(){},debug(){},error(){}};
const engine = new WorkflowEngine(quiet, async()=>'{"option":"new_request","flowName":"None"}', [...FLOWS,root], [], STANDARD_FUNCTIONS, {}, false, 'en');
engine.disableCommands();
let session=engine.initSession('test','forms','en');session.cargo.voice=false;
async function say(content, start) {
  const old={readFormAnswer:engine.APPROVED_FUNCTIONS.readFormAnswer,enrichFormMatches:engine.APPROVED_FUNCTIONS.enrichFormMatches};
  const submission=parseFormSubmission(content,projectForm(session));
  if(submission)Object.assign(engine.APPROVED_FUNCTIONS,formSubmissionReaders(submission,()=>engine.getSessionContext()));
  try{session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'demo'}}:{})},JSON.parse(JSON.stringify(engine.storedSession(session))))));}
  finally{Object.assign(engine.APPROVED_FUNCTIONS,old);}
}
await say('begin',true);
const before=JSON.stringify(session),view=projectForm(session);
assert.equal(JSON.stringify(session),before,'projection has no state mutation');
const stored = JSON.parse(JSON.stringify(engine.storedSession(session)));
assert(stored.cargo.forms[view.form].derived?.specs, 'fixture uses the compact definition');
const storedBefore = JSON.stringify(stored);
assert.deepEqual(projectForm(stored, engine.flowsMenu), view, 'compact sessions project the same nested form');
assert.equal(JSON.stringify(stored), storedBefore, 'compact projection has no state mutation');
assert.equal(view.fields.find(f=>f.name==='card').fields.length,4,'unopened nested schema is projected');
assert.deepEqual(view.fields.find(f=>f.name==='service').choices,[{key:'a',label:'First'},{key:'b',label:'Second'}]);
assert(!JSON.stringify(view).includes('validator'));
const currentPaths=fields=>fields.flatMap(f=>[...(f.current?[f.path]:[]),...(f.fields?currentPaths(f.fields):[])]);
assert.deepEqual(currentPaths(view.fields),['email'],'the asked field alone is current');
const encode=values=>'JSFE_FORM_V1:'+JSON.stringify({form:projectForm(session).form,values});
const note='O\'Brien says "hello"; C:\\docs\\new\nsecond line';
const card={card_number:'4111111111111111',card_expiration:'12/39',card_cvv:'837',card_zip:'90001'};
assert.throws(()=>parseFormSubmission('JSFE_FORM_V1:{',view),/JSON/);
assert.throws(()=>parseFormSubmission('JSFE_FORM_V2:{}',view),/version/);
assert.throws(()=>parseFormSubmission(encode({admin:'yes'}),view),/Unknown/);
assert.throws(()=>parseFormSubmission('JSFE_FORM_V1:{"form":'+JSON.stringify(view.form)+',"values":{"__proto__":{"yes":"x"}}}',view),/Unsafe/);
assert.throws(()=>parseFormSubmission('JSFE_FORM_V1:'+JSON.stringify({form:'other',values:{email:'x'}}),view),/current/);
assert.equal(JSON.stringify(session),before,'preflight errors preserve continuation');
await say(encode({service:'restricted'}));
assert.equal(session.cargo.forms[view.form].values.service,undefined,'current-only enum cannot fill a different question');
assert(session.cargo.forms[view.form].errors.service);
await say(encode({email:'bad',service:'a',note,card}));
let state=session.cargo.forms[view.form];
assert.equal(state.values.email,undefined);
assert.equal(state.values.note,note,'strict values retain escapes, quotes and newlines');
assert.equal(state.values.service,'a','independent enum accepted');
assert.match(session.response, /Got it, your service\./, 'a genuinely out-of-order field is acknowledged');
assert(state.errors.email);
assert.deepEqual(currentPaths(projectForm(session).fields),['email'],'a redrawn form points at the field asked again');
assert(!JSON.stringify(projectForm(session)).includes(card.card_number),'sensitive accepted values omitted');
assert.equal(session.cargo.completed,undefined);
cargoLogs.length=0;
await say(encode({email:'owner@example.com'}));
assert(cargoLogs.length, 'loaded session logged diagnostics');
assert(!cargoLogs.some(message=>message.includes('"837"')), 'retained form batch does not expose a security code');
assert.equal(projectForm(session),null,'confirmation remains conversational');
assert.equal(session.cargo.completed,undefined,'submission is not consent');
assert.match(session.response,/Confirm/);
await say('yes');
assert.equal(session.cargo.completed,1);
assert.equal(projectForm(session),null);
assert.equal(engine.APPROVED_FUNCTIONS.readFormAnswer,STANDARD_FUNCTIONS.readFormAnswer,'ordinary reader restored');
// Ordinary conversation uses unchanged workers, including saved draft reentry.
await say('begin',true);await say('first');
assert.equal(session.cargo.forms[session.cargo.formTasks.demo].values.service,'a');
const savedId=session.cargo.formTasks.demo;
await say('Please help me with a different request');
await say('begin',true);
assert.equal(session.cargo.formTasks.demo,savedId);
assert.equal(session.cargo.forms[savedId].values.service,'a');
console.log('form-client: projection, nested batch, enums, errors, escaping, consent and reentry passed');
// The same child definition used twice retains parent-slot ownership.
const child={declarationVersion:2,id:'child',form:{inputs:[{name:'zip',field:'zip'}]}};
const pair={declarationVersion:2,id:'pair',form:{inputs:[{name:'left',form:'child'},{name:'right',form:'child'}],after:[{id:'pair-result',type:'SET',variable:'noop',value:'(cargo.pair=structuredClone(cargo.forms[form_instance].values),true)'}]}};
const second=new WorkflowEngine(quiet,null,[...FLOWS,child,pair],[],STANDARD_FUNCTIONS,{},false,'en');second.disableCommands();
let s=second.initSession('test','pair','en');s.cargo.voice=false;
s=await second.updateActivity({role:'user',content:'begin',start:{flow:'pair'}},s);
const v=projectForm(s);assert.deepEqual(v.fields.map(f=>f.fields[0].path),['left.zip','right.zip']);
const request=parseFormSubmission('JSFE_FORM_V1:'+JSON.stringify({form:v.form,values:{left:{zip:'90001'},right:{zip:'90002'}}}),v);
Object.assign(second.APPROVED_FUNCTIONS,formSubmissionReaders(request,()=>second.getSessionContext()));
s=await second.updateActivity({role:'user',content:request.prompt},s);
assert.deepEqual(s.cargo.pair,{left:{zip:'90001'},right:{zip:'90002'}});
// Projection resolves prepared enums and applicability without exposing worker or internal fields.
const snapshot={language:'es',cargo:{forms:{root:{id:'root',values:{route:'a'},specs:[
 {name:'route',profile:{kind:'choice',choices:[{key:'a',label:'A',label_es:'Una',current_only:true},{key:'b',label:'B'}]}},
 {name:'optional',required_when:{route:'b'},profile:{kind:'text'}},
 {name:'correction',required_when:{route:'b'},confirm_out_of_order:{word:'change'},profile:{kind:'identifier'}},
 {name:'chatOnly',form_client:false,profile:{kind:'text'}},
 {name:'prepared',choices_from:'options',profile:{kind:'choice',choices:[]}},
 {name:'hidden',when:{route:'b'},profile:{kind:'text'}},
 {name:'internal',internal:true,profile:{kind:'text'}},
 {name:'notReady',choices_from:'missing',profile:{kind:'choice'}},
],data:{options:[{key:'x',label:'Ready',label_es:'Lista'}]}}}},flowStacks:[[{pendingVariable:'answer',variables:{form_context:{form:'root',current:'route'}}}]]};
const frozen=JSON.stringify(snapshot);const p=projectForm(snapshot);
assert.equal(JSON.stringify(snapshot),frozen);
assert.deepEqual(p.fields.map(f=>f.name),['route','optional','prepared']);
assert.equal(p.fields[2].choices[0].label,'Lista');
const context = snapshot.flowStacks[0][0].variables.form_context;
context.current = 'prepared';
const filtered = projectForm(snapshot);
assert.deepEqual(filtered.fields.map(f=>f.name),['optional','prepared']);
for (const field of ['route', 'correction', 'chatOnly']) {
  const prompt = 'JSFE_FORM_V1:' + JSON.stringify({form: filtered.form, values: {[field]: 'a'}});
  assert.throws(() => parseFormSubmission(prompt, filtered), /Unknown form field/);
}
for (const field of ['internal', 'chatOnly', 'notReady']) {
  context.current = field;
  assert.equal(projectForm(snapshot), null, `no card while the asked field (${field}) has no place on it`);
}
context.current = 'prepared';
context.current = 'correction';
assert.deepEqual(projectForm(snapshot).fields.map(f=>f.name),['optional','correction','prepared']);
console.log('form-client: sibling ownership, prepared choices, applicability, localization and visibility passed');
// A shared collector that reads the answer's text (ask-email, the retry menu) reads the submitted value, not the turn's marker.
const asker={id:'email-asker',name:'EmailAsker',primary:true,description:'Ask an email',steps:[{id:'ask',type:'FLOW',value:'ask-email',parameters:{question:'Your email?',question_es:'¿Su correo?'}},{id:'done',type:'SAY',value:'Saved {{cargo.email}}.'}]};
const mail=new WorkflowEngine(quiet,async()=>'{"option":"new_request","flowName":"None"}',[...FLOWS,asker],[],STANDARD_FUNCTIONS,{},false,'en');mail.disableCommands();
let m=mail.initSession('test','email','en');m.cargo.voice=false;
const submit=async values=>{
  const view=projectForm(m),request=parseFormSubmission('JSFE_FORM_V1:'+JSON.stringify({form:view.form,values}),view);
  const old={readFormAnswer:mail.APPROVED_FUNCTIONS.readFormAnswer,enrichFormMatches:mail.APPROVED_FUNCTIONS.enrichFormMatches};
  Object.assign(mail.APPROVED_FUNCTIONS,formSubmissionReaders(request,()=>mail.getSessionContext()));
  try{m=await mail.updateActivity({role:'user',content:request.prompt},m);}finally{Object.assign(mail.APPROVED_FUNCTIONS,old);}
};
m=await mail.updateActivity({role:'user',content:'begin',start:{flow:'email-asker'}},m);
await submit({email_address:'owner@example.com'});
assert.match(m.response,/I have owner@example\.com/,'the submitted email is read back, not refused as no email');
await submit({decision:'yes'});
assert.equal(m.cargo.email,'owner@example.com');
console.log('form-client: a raw-reading collector reads the submitted value');
// The contact form offers "account number" only when the tenant declares an account pattern (Shopify has none).
const fieldNames=v=>JSON.stringify(v).match(/"name":"[a-z_]+"/g).map(s=>s.slice(8,-1));
for (const [pattern,offered] of [['',false],['^\\d{8}$',true]]) {
  const who={id:'who',name:'Who',primary:true,description:'Identify',steps:[{id:'ask',type:'FLOW',value:'get-cell-or-email',parameters:{account_pattern:pattern,account_name:pattern?'account number':''}},{id:'done',type:'SAY',value:'ok'}]};
  const e=new WorkflowEngine(quiet,async()=>'{"option":"new_request","flowName":"None"}',[...FLOWS,who],[],STANDARD_FUNCTIONS,{},false,'en');e.disableCommands();
  let w=e.initSession('test','who','en');w.cargo.voice=false;
  w=await e.updateActivity({role:'user',content:'begin',start:{flow:'who'}},w);
  const names=fieldNames(projectForm(w));
  assert(names.includes('phone') && names.includes('email_address'),names.join());
  assert.equal(names.includes('account'),offered,`account field ${offered?'offered':'absent'} with pattern '${pattern}': ${names.join()}`);
}
console.log('form-client: the contact form offers an account number only with a tenant account pattern');
