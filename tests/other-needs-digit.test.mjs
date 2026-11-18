// other_needs_digit (owner 2026-11-18; prod 11-18 12:51 "Omitr" at "write your account number ... or OMITIR" was answered
// "no le entendí"): a choice that also takes a number takes other text only when it carries a digit, so a word that is no
// offered choice goes to the reply ranker, which reads it against the choices. A number is still taken as the answer.
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';

const quiet = {info(){}, warn(){}, debug(){}, error(){}};
const input = (digit) => ({name: 'account_offer', label: 'account number', label_es: 'número de cuenta',
  question: 'Type your account number, or SKIP.', question_es: 'Escriba su número de cuenta, o OMITIR.',
  profile: {kind: 'choice', whole_phrases: true, choices: [{key: 'skip', phrases: ['skip', 'omitir'], exact: true}], accept_other: true, ...(digit ? {other_needs_digit: true} : {})}});
const flow = (digit) => ({declarationVersion: 2, id: 'offer', primary: true, description: 'Offer the account', form: {inputs: [input(digit)],
  after: [{id: 'keep', type: 'SET', variable: 'noop', value: '(cargo.offer=cargo.forms[form_instance].values.account_offer,true)'}]}});
let ranked = 0;
const ai = async (system, user, schema, request) => request?.task === 'rank_reply' ? (ranked++, JSON.stringify({option: 'choice:skip'})) : '{"flowName":"None"}';
const run = async (digit, said) => {
  const engine = new WorkflowEngine(quiet, ai, [...FLOWS, flow(digit)], [], STANDARD_FUNCTIONS, {}, false, 'es'); engine.disableCommands();
  let s = engine.initSession('t', crypto.randomUUID(), 'es'); s.cargo.voice = false;
  s = JSON.parse(JSON.stringify(await engine.updateActivity({role: 'user', content: 'start', start: {flow: 'offer'}}, s)));
  ranked = 0;
  s = JSON.parse(JSON.stringify(await engine.updateActivity({role: 'user', content: said}, s)));
  return {offer: s.cargo.offer, ranked};
};
let checks = 0, r;
r = await run(true, 'Omitr'); assert.equal(r.ranked, 1, 'the misspelling reaches the ranker'); assert.equal(r.offer, 'skip', JSON.stringify(r)); checks++;
r = await run(true, '12345678'); assert.equal(r.ranked, 0); assert.equal(r.offer, '12345678'); checks++;
r = await run(true, 'mi cuenta es 12345678'); assert.equal(r.ranked, 0); assert.equal(r.offer, 'mi cuenta es 12345678'); checks++;
r = await run(true, 'omitir'); assert.equal(r.ranked, 0); assert.equal(r.offer, 'skip'); checks++;
// Without the flag, as before: any text is the answer and the ranker is not asked.
r = await run(false, 'Omitr'); assert.equal(r.ranked, 0); assert.equal(r.offer, 'Omitr'); checks++;
console.log(`other-needs-digit: ${checks} checks passed`);
