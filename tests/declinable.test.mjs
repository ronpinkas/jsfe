// A declinable input: "there is none" answers it with no value (an explicit null), by phone or text, through the reply
// ranker's "none", and on the card by leaving the field blank. Definition-time checks, condition and re-answer.
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS, projectForm, parseFormSubmission, formSubmissionReaders} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS, saysNoValue} from '../dist/helpers/index.js';

const quiet = {info(){}, warn(){}, debug(){}, error(){}};
const UNIT = {kind: 'pattern', regex: '(?:\\bunit|\\bapt\\.?|#)\\s*([\\w-]+)', group: 1, accept_other: true};
const inputs = () => [
  {name: 'unit', label: 'unit', label_es: 'unidad', declinable: true, question: 'Unit number, or NONE?', question_es: '¿Número de unidad, o NINGUNO?', profile: UNIT},
  {name: 'zip', label: 'ZIP code', question: 'Your ZIP code?', profile: {kind: 'digits', min: 5, max: 5}},
];
const flow = (list = inputs()) => ({declarationVersion: 2, id: 'place', primary: true, description: 'Collect a place', form: {inputs: list,
  after: [{id: 'keep', type: 'SET', variable: 'noop', value: '(cargo.place=structuredClone(cargo.forms[form_instance].values),true)'}]}});
let rankOption = '', offers = [];
const ai = async (system, user, schema, request) => request?.task === 'rank_reply' ? (offers.push(request.options), JSON.stringify({option: rankOption})) : '{"flowName":"None"}';
const load = (f = flow()) => { const e = new WorkflowEngine(quiet, ai, [...FLOWS, f], [], STANDARD_FUNCTIONS, {}, false, 'en'); e.disableCommands(); return e; };
let checks = 0;

// Definition time: only a readable leaf input, never a choice, confirmation, proposal, group or subform.
for (const [change, why] of [
  [list => { list[0].declinable = 'yes'; }, 'not true'],
  [list => { list[0].profile = {kind: 'choice', choices: [{key: 'a', label: 'A'}]}; }, 'a choice'],
  [list => { list[0].proposal = {}; }, 'a proposal'],
  [list => { list[0] = {name: 'unit', declinable: true, any_of: [{name: 'a', profile: UNIT}, {name: 'b', profile: UNIT}]}; }, 'a group'],
]) {
  const list = inputs(); change(list);
  assert.throws(() => load(flow(list)), /declinable/, `rejects ${why}`); checks++;
}

// The lexicon: whole answers in either language; a digit or a longer sentence is never one.
for (const said of ['none', 'No.', 'n/a', "I don't have an apartment", 'we dont have one', 'there is no unit', 'no unit', 'ninguno', 'No tengo apartamento', 'no hay', 'sin unidad', 'no aplica'])
  assert.equal(saysNoValue(said), true, said), checks++;
for (const said of ['4B', 'no, 4B', 'unit 12', 'I live in a two story house downtown', ''])
  assert.equal(saysNoValue(said), false, said), checks++;

const start = async (engine, language = 'en') => {
  let s = engine.initSession('test', crypto.randomUUID(), language); s.cargo.voice = false;
  return engine.updateActivity({role: 'user', content: 'start', start: {flow: 'place'}}, s);
};
const formOf = s => Object.values(s.cargo.forms || {})[0];

// Phone and text: "none" in either language answers with an explicit null, and the form moves on.
for (const [language, said] of [['en', "I don't have one"], ['es', 'No tengo unidad'], ['en', 'none']]) {
  const engine = load();
  let s = await start(engine, language);
  s = await engine.updateActivity({role: 'user', content: said}, s);
  const state = formOf(s);
  assert.ok(Object.hasOwn(state.values, 'unit') && state.values.unit === null, `${said}: unit answered with no value`);
  assert.match(String(s.response || s.lastResponse || JSON.stringify(s)), /ZIP|postal/i, `${said}: the next question is asked`);
  s = await engine.updateActivity({role: 'user', content: '90001'}, s);
  assert.deepEqual(s.cargo.place, {unit: null, zip: '90001'}, `${said}: the form completes`);
  checks++;
}

// A value is still a value; a later value replaces the "none".
{
  const engine = load();
  let s = await start(engine);
  s = await engine.updateActivity({role: 'user', content: 'unit 4B'}, s);
  assert.equal(formOf(s).values.unit, '4B'); checks++;
}

// The reply ranker is offered "none" for a declinable input, and its pick answers with no value.
{
  const list = inputs(); list[0].profile = {kind: 'pattern', regex: '(?:\\bunit|\\bapt\\.?|#)\\s*([\\w-]+)', group: 1};   // no free text: the ranker reads the rest
  const engine = load(flow(list));
  let s = await start(engine);
  rankOption = 'choice:__none'; offers = [];
  s = await engine.updateActivity({role: 'user', content: 'it is a house so there is not really one'}, s);
  assert.ok(offers.length && offers[0].includes('choice:__none'), 'the ranker is offered none');
  assert.ok(Object.hasOwn(formOf(s).values, 'unit') && formOf(s).values.unit === null, 'the ranker\'s none answers with no value');
  checks++;
}

// The card: the field is projected declinable; a blank declinable field submits as declined; only declinable paths may.
{
  const engine = load();
  let s = await start(engine);
  const view = projectForm(s);
  const unit = view.fields.find(field => field.name === 'unit'), zip = view.fields.find(field => field.name === 'zip');
  assert.equal(unit.declinable, true); assert.equal(zip.declinable, undefined); checks++;
  assert.throws(() => parseFormSubmission('JSFE_FORM_V1:' + JSON.stringify({form: view.form, values: {zip: ''}, declined: ['zip']}), view), /cannot be left without a value/); checks++;
  assert.throws(() => parseFormSubmission('JSFE_FORM_V1:' + JSON.stringify({form: view.form, values: {unit: '4B'}, declined: ['unit']}), view), /declined field has a value/); checks++;
  const request = parseFormSubmission('JSFE_FORM_V1:' + JSON.stringify({form: view.form, values: {unit: '', zip: '90001'}, declined: ['unit']}), view);
  assert.deepEqual(request.values, {unit: null, zip: '90001'}); checks++;
  const old = {readFormAnswer: engine.APPROVED_FUNCTIONS.readFormAnswer, enrichFormMatches: engine.APPROVED_FUNCTIONS.enrichFormMatches};
  Object.assign(engine.APPROVED_FUNCTIONS, formSubmissionReaders(request, () => engine.getSessionContext()));
  try { s = await engine.updateActivity({role: 'user', content: request.prompt}, s); }
  finally { Object.assign(engine.APPROVED_FUNCTIONS, old); }
  assert.deepEqual(s.cargo.place, {unit: null, zip: '90001'}, 'the card\'s declined field completes the form'); checks++;
}

// A drawn card shows a declined field as answered.
{
  const engine = load();
  let s = await start(engine);
  s = await engine.updateActivity({role: 'user', content: 'none'}, s);
  const unit = projectForm(s)?.fields.find(field => field.name === 'unit');
  assert.ok(unit && unit.filled === true && unit.declined === true && unit.value === undefined, 'declined is shown as answered with no value'); checks++;
}

console.log(`declinable: all ${checks} checks passed`);
