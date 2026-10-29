// Two-stage intent detection (engine.intentDetection = 'two-stage'): stage 1 picks the flow from the primaries'
// descriptions, stage 2 extracts the SELECTED flow's parameters; each call carries both executors' instructions
// (llm, systemOne) as aiCallback's 4th argument, and the host replies with the canonical JSON. Plus the decoders.
//
//   npm run build && node tests/intent-two-stage.test.mjs
//
// Hermetic: aiCallback is a stub that records its arguments and answers from a queue.
import assert from 'node:assert/strict';
import { WorkflowEngine } from '../dist/index.js';
import {
  buildFlowStage, buildParameterStage, decodeFlowLlm, decodeFlowSystemOne, decodeParametersLlm, decodeParametersSystemOne,
  isNearMiss, isIntentStageRequest, hasStageParameters,
} from '../dist/host/index.js';

const quiet = { info() {}, debug() {}, warn() {}, error() {} };
let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };

const pay = {
  id: 'make-payment', name: 'MakePayment', description: 'The caller wants to pay their account.', version: '1.0.0', primary: true,
  parameterInstructions: 'A card number given is the card to pay with, never an account number.',
  parameters: [
    { name: 'payment_amount', description: 'The amount to pay, as digits.' },
    { name: 'payment_option', description: 'The payment named.', enum: ['monthly', 'balance'] },
    { name: 'send_link', description: 'True when the caller asks for a payment link.', type: 'boolean' },
    { name: 'resume', description: 'Set by the payment itself.', internal: true },
    { name: 'all_next', description: 'Internal: set by the flow.' },
  ],
  steps: [{ id: 'ask', type: 'SAY-GET', value: 'How much?', variable: 'x' }],
};
const info = {
  id: 'account-info', name: 'AccountInfo', description: 'The caller asks about their account.', version: '1.0.0', primary: true,
  steps: [{ id: 'say', type: 'SAY-GET', value: 'Here it is.', variable: 'y' }],
};
const helper = { id: 'helper', name: 'Helper', description: 'Never offered.', version: '1.0.0', steps: [{ id: 's', type: 'SAY', value: 'hi' }] };
const flowsMenu = [pay, info, helper];

function recorder(replies) {
  const calls = [];
  const cb = async (...args) => {
    calls.push(args);
    const r = replies.shift();
    if (r instanceof Error) throw r;
    return JSON.stringify(r ?? { flowName: 'None' });
  };
  return { cb, calls };
}
async function run(replies, input, mode = 'two-stage') {
  const { cb, calls } = recorder(replies);
  const engine = new WorkflowEngine(quiet, cb, flowsMenu, [], {}, {}, false, 'en', 3000);
  engine.intentDetection = mode;
  let s = engine.initSession('u1', 'thread-1');
  s = await engine.updateActivity({ role: 'user', content: input, timestamp: Date.now() }, s);
  const frame = (s.flowStacks || []).flat().find(f => f?.flowName === 'MakePayment' || f?.flowName === 'AccountInfo');
  return { calls, frame };
}

// ── 1. Stage 1: the primaries' descriptions only, both executors, the canonical reply ──────────────
{
  const { calls, frame } = await run([{ flowName: 'MakePayment' }, { parameters: { payment_amount: '50', payment_option: 'monthly', send_link: null } }], 'I want to pay 50');
  eq(calls.length, 2, 'two calls: the flow, then its parameters');
  const [system1, user1, schema1, req1] = calls[0];
  ok(isIntentStageRequest(req1) && req1.task === 'detect_flow' && req1.stage === 1, 'stage 1 request');
  eq(req1.flows.map(f => f.name), ['MakePayment', 'AccountInfo'], 'only primaries are offered');
  ok(req1.flows.every(f => Object.keys(f).sort().join() === 'description,id,name'), 'stage 1 carries no parameters');
  ok(!/payment_amount|parameterInstructions|card number/.test(system1), 'stage 1 reads no parameter text');
  ok(system1 === req1.llm.system && user1 === req1.llm.user, 'the positional arguments ARE the LLM instructions');
  eq(JSON.parse(schema1).json_schema.schema.properties.flowName.enum, ['MakePayment', 'AccountInfo', 'None'], 'stage 1 schema: the names or None');
  eq(Object.keys(req1.systemOne.questions).sort(), ['any', 'route'], 'System One: one choice among the primaries, one noul whether any starts');
  eq(req1.systemOne.questions.route.type, 'choice', 'route is a choice');
  eq(Object.keys(req1.systemOne.questions.route.criteria), ['MakePayment', 'AccountInfo'], 'route weighs every primary by its description');
  ok(/A question usually asks for information/.test(req1.systemOne.questions.any.criteria.false) && /A question usually asks for information/.test(system1), 'both executors weigh a question before taking it as a trigger');
  ok(/I want to pay 50/.test(user1) && req1.systemOne.state.latest_message === 'I want to pay 50', 'both executors read the same message');

  // ── 2. Stage 2: the selected flow only, internal parameters left out, parameterInstructions read here only ─
  const [system2, , schema2, req2] = calls[1];
  ok(isIntentStageRequest(req2) && req2.task === 'extract_parameters' && req2.flow.name === 'MakePayment', 'stage 2 request for the selected flow');
  eq(req2.flow.parameters.map(p => p.name), ['payment_amount', 'payment_option', 'send_link'], 'internal parameters are never asked');
  ok(system2.includes('A card number given is the card to pay with') && !system2.includes('The caller wants to pay'), 'stage 2 reads parameterInstructions, not the description');
  eq(JSON.parse(schema2).json_schema.schema.required, ['payment_amount', 'payment_option', 'send_link'], 'stage 2 schema: every parameter, null when not given');
  eq(req2.freeText, ['payment_amount'], 'free text is named (only a text model answers it)');
  eq(req2.systemOne.index.map(q => q.id), ['p0v0', 'p0v1', 'p1'], 'System One asks the closed values only');
  eq(frame && { a: frame.variables.payment_amount, o: frame.variables.payment_option }, { a: '50', o: 'monthly' }, 'the values reach the flow');
}

// ── 3. None at stage 1: no stage 2; a flow with no parameters: no stage 2 ────────────────────────────
{
  const none = await run([{ flowName: 'None' }], 'hello');
  eq(none.calls.length, 1, 'None: one call');
  const noParams = await run([{ flowName: 'AccountInfo' }], 'my balance');
  eq(noParams.calls.length, 1, 'a flow without parameters: one call');
  ok(!!noParams.frame, 'and it starts');
}

// ── 4. Stage 2 fails: the flow starts without its parameters ─────────────────────────────────────────
{
  const { calls, frame } = await run([{ flowName: 'MakePayment' }, new Error('both executors failed')], 'pay');
  eq(calls.length, 2, 'stage 2 was attempted');
  ok(!!frame && frame.variables.payment_amount === undefined, 'the flow starts and asks');
}

// ── 5. An unknown or invalid value is dropped by the engine (enum, type) ─────────────────────────────
{
  const { frame } = await run([{ flowName: 'MakePayment' }, { parameters: { payment_option: 'everything', send_link: 'yes', resume: 'true' } }], 'pay');
  ok(frame.variables.payment_option === undefined && frame.variables.send_link === undefined, 'an undeclared enum value and a non-boolean are dropped');
}

// ── 6. The default is unchanged: one call, the original prompt ───────────────────────────────────────
{
  const { calls } = await run([{ flowName: 'MakePayment', parameters: { payment_amount: '50' } }], 'pay 50', 'single-call');
  eq(calls.length, 1, 'single-call: one call');
  ok(calls[0][3].task === 'detect_flow' && calls[0][3].stage === undefined && Array.isArray(calls[0][3].flows[0].parameters), 'the original request shape');
}

// ── 7. Decoders ──────────────────────────────────────────────────────────────────────────────────────
{
  const s1 = buildFlowStage('pay', [], [{ id: 'a', name: 'MakePayment', description: 'd' }, { id: 'b', name: 'AccountInfo', description: 'e' }]);
  eq(decodeFlowLlm('```json\n{"flowName":"makepayment"}\n```', s1), { flowName: 'MakePayment' }, 'LLM: name normalised, fences stripped');
  eq(decodeFlowLlm('{"flowName":"none"}', s1), { flowName: 'None' }, 'LLM: None');
  assert.throws(() => decodeFlowLlm('{"flowName":"Other"}', s1)); checks++;
  const route = (mp, ai) => ({ type: 'choice', choice: mp >= ai ? 'MakePayment' : 'AccountInfo', probabilities: { MakePayment: mp, AccountInfo: ai } });
  const yes = decodeFlowSystemOne({ any: { noul: 0.8 }, route: route(0.9, 0.1) }, s1);
  ok(yes.flowName === 'MakePayment' && yes.any === 0.8 && Math.abs(yes.scores[0].p - 0.72) < 1e-9, 'System One: any above the cut starts the routed flow; score = any x route');
  eq(decodeFlowSystemOne({ any: { noul: 0.6 }, route: route(0.3, 0.7) }, s1).flowName, 'AccountInfo', 'System One: the choice picks among the flows');
  eq(decodeFlowSystemOne({ any: { noul: 0.3 }, route: route(0.95, 0.05) }, s1).flowName, 'None', 'System One: any below the cut is None, however sure the route');
  assert.throws(() => decodeFlowSystemOne({ any: { noul: 0.8 } }, s1)); checks++;
  assert.throws(() => decodeFlowSystemOne({ route: route(0.9, 0.1) }, s1)); checks++;
  assert.throws(() => decodeFlowSystemOne({ any: { noul: 0.8 }, route: { choice: 'Other', probabilities: { Other: 1 } } }, s1)); checks++;
  ok(isNearMiss([{ p: 0.48 }, { p: 0.42 }]) && !isNearMiss([{ p: 0.2 }, { p: 0.1 }]), 'near miss');

  const s2 = buildParameterStage('pay 50', [], pay);
  eq(decodeParametersLlm('{"payment_amount":"50","payment_option":null,"send_link":"none","resume":"true"}', s2), { parameters: { payment_amount: '50' } }, 'LLM: declared, given values only');
  eq(decodeParametersSystemOne({ p0v0: { noul: 0.9 }, p0v1: { noul: 0.2 }, p1: { noul: 0.3 } }, s2), { parameters: { payment_option: 'monthly' } }, 'System One: enum argmax; a boolean below the cut is omitted');
  ok(hasStageParameters(pay.parameters) && !hasStageParameters([{ name: 'x', description: 'Internal: set by the flow.' }]), 'internal-only means no stage 2');
  ok(buildParameterStage('x', [], { id: 'i', name: 'AccountInfo', parameters: [{ name: 'email', description: 'e' }] }).systemOne === null, 'no closed value: no System One stage 2');
}

// ── 8. Only primaries are activated by detection; a host start (ContextEntry.start) starts any flow, no AI asked ────
{
  const { calls, frame } = await run([{ flowName: 'Helper' }], 'help me');
  ok(calls.length === 1 && !frame, 'a non-primary name from the executor is never activated');
  const host = recorder([]);
  const engine = new WorkflowEngine(quiet, host.cb, flowsMenu, [], {}, {}, false, 'en', 3000);
  engine.intentDetection = 'two-stage';
  let s = engine.initSession('u1', 'thread-2');
  s = await engine.updateActivity({ role: 'user', content: 'START MakePayment', timestamp: Date.now(), start: { flow: 'make-payment', arguments: { payment_amount: 50, payment_option: 'everything', resume: 'true' } } }, s);
  const f = (s.flowStacks || []).flat().find(x => x?.flowName === 'MakePayment');
  ok(host.calls.length === 0 && !!f, 'a host start: the flow starts with no AI call');
  ok(f.variables.payment_amount === '50' && f.variables.payment_option === undefined, 'its arguments are typed and enum-checked like detected ones');
  s = await engine.updateActivity({ role: 'user', content: 'helper', timestamp: Date.now() }, s);
  ok(engine.hostStart === null, 'the start is one-shot: a turn without one clears it');
}

console.log(`intent-two-stage: ${checks} checks passed`);
