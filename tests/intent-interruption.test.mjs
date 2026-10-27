// Interruption (a flow with `interruptable: true`): a reply is checked with the same intent detection as a new request
// (two-stage here): a detected primary interrupts on a new stack, started with the arguments stage 2 extracted;
// None leaves the flow to read the reply. Hermetic: aiCallback answers from a queue.
//
//   npm run build && node tests/intent-interruption.test.mjs
import assert from 'node:assert/strict';
import { WorkflowEngine } from '../dist/index.js';

const quiet = { info() {}, debug() {}, warn() {}, error() {} };
let checks = 0;
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };

const survey = {
  id: 'survey', name: 'Survey', description: 'The caller answers a short survey.', version: '1.0.0', primary: true, interruptable: true,
  steps: [{ id: 'ask', type: 'SAY-GET', value: 'How was your visit?', variable: 'rating' }, { id: 'thanks', type: 'SAY', value: 'Thanks: {{rating}}' }],
};
const pay = {
  id: 'make-payment', name: 'MakePayment', description: 'The caller wants to pay their account.', version: '1.0.0', primary: true,
  parameters: [{ name: 'payment_amount', description: 'The amount to pay, as digits.' }],
  steps: [{ id: 'ask', type: 'SAY-GET', value: 'Paying {{payment_amount}}. Confirm?', variable: 'ok' }],
};

async function run(replies, reply) {
  const calls = [];
  const cb = async (...args) => { calls.push(args[3]?.task || 'text'); return JSON.stringify(replies.shift() ?? { flowName: 'None' }); };
  const engine = new WorkflowEngine(quiet, cb, [survey, pay], [], {}, {}, false, 'en', 3000);
  engine.intentDetection = 'two-stage';
  let s = engine.initSession('u1', 'thread-1');
  s.language = 'en';
  s = await engine.updateActivity({ role: 'user', content: 'Survey', timestamp: Date.now() }, s); // direct name match starts it
  s = await engine.updateActivity({ role: 'user', content: reply, timestamp: Date.now() }, s);
  return { calls, s };
}

{
  const { calls, s } = await run([{ flowName: 'MakePayment' }, { parameters: { payment_amount: '50' } }], 'actually I want to pay 50 dollars');
  eq(calls, ['detect_flow', 'extract_parameters'], 'the interruption check is the two-stage detection');
  eq(s.flowStacks.length, 2, 'the interrupting flow runs on a new stack; the survey is kept to resume');
  eq(s.flowStacks[1][0].flowName, 'MakePayment', 'the detected flow interrupts');
  eq(s.flowStacks[1][0].variables.payment_amount, '50', 'started with the extracted arguments');
  assert.match(s.response, /Paying 50\. Confirm\?/); checks++;
}
{
  const { calls, s } = await run([{ flowName: 'None' }], 'it was great');
  eq(calls, ['detect_flow'], 'None: one stage-1 call');
  eq(s.flowStacks.flat().length, 0, 'the survey read the reply and finished');
  assert.match(s.response, /Thanks: it was great/); checks++;
}
console.log(`Intent interruption: all checks passed (${checks})`);
