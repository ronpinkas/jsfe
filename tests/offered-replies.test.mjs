// offeredReplies: the words the question asked now offers, so a host that answers some messages itself (a request to
// repeat: "again", "otra vez") lets an offered answer reach the flow. Prod 2026-11-11 18:22: a payment-link failure
// menu offered AGAIN and the host replayed the menu instead of retrying the link.
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS, offeredReplies} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';

const menu = {declarationVersion:2,id:'link-recovery',primary:true,description:'Demo recovery menu',form:{inputs:[
  {name:'next',question:'Type PAY, AGAIN or AGENT.',question_es:'Escriba PAGAR, OTRA VEZ o AGENTE.',profile:{kind:'choice',choices:[
    {key:'pay',label:'Pay',phrases:['1','pay','pagar']},
    {key:'again',phrases:['2','again','otra vez','try again']},
    {key:'done',phrases:['no','no gracias'],current_only:true}]}}],
  after:[{id:'done',type:'SET',variable:'noop',value:'true'}]}};
const quiet = {info(){},warn(){},debug(){},error(){}};
const engine = new WorkflowEngine(quiet, async()=>'{"option":"new_request","flowName":"None"}', [...FLOWS,menu], [], STANDARD_FUNCTIONS, {}, false, 'en');
engine.disableCommands();
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('PASS', name); };

let session = engine.initSession('test','offered','en'); session.cargo.voice = true;
check('no question pending: nothing offered', () => assert.deepEqual(offeredReplies(session), []));
check('a missing session: nothing offered', () => assert.deepEqual(offeredReplies(undefined), []));

session = await engine.updateActivity({role:'user',content:'menu',start:{flow:'link-recovery',arguments:{}}}, session);
const offered = offeredReplies(session);
check('a form choice input: every choice phrase and label is offered', () => {
  for (const word of ['again','otra vez','try again','pay','pagar','Pay','1','2','no']) assert.ok(offered.includes(word), word);
});
check('nothing outside the pending question', () => assert.ok(!offered.includes('AGENT') && !offered.includes('agent')));

session.continuationSafetyHold = true;
check('a continuation safety hold offers nothing', () => assert.deepEqual(offeredReplies(session), []));
delete session.continuationSafetyHold;

// A choice taken out at runtime before the question is asked (as linkRecoveryChoices removes AGAIN for a line with no
// cell phone) is not offered: the question's frame carries the choices it actually asks.
const trimmed = {declarationVersion:2,id:'trimmed-menu',primary:true,description:'Demo trimmed menu',form:{inputs:[
  {name:'next',question:'Type PAY or AGENT.',profile:{kind:'choice',choices:[{key:'pay',phrases:['pay']},{key:'again',phrases:['again','otra vez']}]}}],
  before:[{id:'trim',type:'SET',variable:'noop',value:"(cargo.forms[form_instance].specs.find(s=>s.name==='next').profile.choices=cargo.forms[form_instance].specs.find(s=>s.name==='next').profile.choices.filter(c=>c.key!=='again'),true)"}],
  after:[{id:'done',type:'SET',variable:'noop',value:'true'}]}};
const engine2 = new WorkflowEngine(quiet, async()=>'{"option":"new_request","flowName":"None"}', [...FLOWS,trimmed], [], STANDARD_FUNCTIONS, {}, false, 'en');
engine2.disableCommands();
let s2 = engine2.initSession('test','trimmed','en');
s2 = await engine2.updateActivity({role:'user',content:'menu',start:{flow:'trimmed-menu',arguments:{}}}, s2);
check('a choice removed before the question is asked is not offered', () => {
  const words = offeredReplies(s2);
  assert.ok(words.includes('pay') && !words.includes('again') && !words.includes('otra vez'), JSON.stringify(words));
});

// An ask-choice question offers its choices (event keys are not answers).
const ask = {flowStacks:[[{flowId:'ask-choice',pendingVariable:'choice',variables:{choices:[
  {key:'yes',label:'Yes',label_es:'Sí',phrases:['yes','sí']},{key:'event:timeout',phrases:['timeout']}]}}]],cargo:{}};
check('an ask-choice question offers its phrases and both labels, never an event key', () => {
  const words = offeredReplies(ask);
  assert.ok(words.includes('yes') && words.includes('sí') && words.includes('Yes') && words.includes('Sí') && !words.includes('timeout'));
});

console.log(`offered-replies: ${checks} checks passed`);
