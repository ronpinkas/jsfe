#!/usr/bin/env node
/**
 * jsfe/host — detect_flow request ⇄ System One mapping, no network.
 *   npm run build && node tests/host-systemone-intent.test.mjs
 */
import assert from 'node:assert/strict';
import { isDetectFlowRequest, freeTextParameters, toFlowRequest, fromFlowAnswers, hasJevParameters, toParameterRequest, fromParameterAnswers, mergeTextParameters, INTENT_YES_THRESHOLD }
   from '../dist/host/index.js';

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };

const request = {
   task: 'detect_flow',
   input: 'quiero cancelar una compra',
   conversation: [{ role: 'user', content: 'hola' }, { role: 'assistant', content: '¿En qué puedo ayudarle?' }],
   flows: [
      { id: 'Pay', name: 'StartPayment', description: 'Make a payment', parameters: [
         { name: 'acct_number', description: 'Account number', type: 'string' },
         { name: 'send_link', description: 'Text a link', type: 'boolean' },
      ] },
      { id: 'SC', name: 'CreateServiceCase', description: 'Open a case', parameters: [
         { name: 'ticket_type', description: 'type rules', type: 'string', enum: ['Fraud', 'Cancellation'] },
         { name: 'ticket_reason', description: 'reason rules', enum: ['Cancel Delivery', 'Place Alert'] },
      ] },
      { id: 'Agent', name: 'RequestLiveAgent', description: 'Talk to a person', parameters: [] },
   ],
};

// ── recognising the request ──
ok(isDetectFlowRequest(request), 'a detect_flow request is recognised');
ok(!isDetectFlowRequest(undefined), 'no 4th argument → not ours');
ok(!isDetectFlowRequest({ ...request, task: 'other' }), 'another task → not ours');
ok(!isDetectFlowRequest({ ...request, flows: [] }), 'no flows → not ours');

// ── free text is whatever is neither enum nor boolean ──
eq(freeTextParameters(request.flows[0]), ['acct_number'], 'string without enum is free text; boolean is not');
eq(freeTextParameters(request.flows[1]), [], 'enum parameters (typed or untyped) are not free text');
eq(freeTextParameters(null), [], 'no flow → nothing');

// ── stage 1: which flow ──
const opts = { model: 'jev-1.13.0', assistantInstructions: 'RULES' };
const s1 = toFlowRequest(request, opts);
eq(s1.body.model, 'jev-1.13.0', 'model');
eq(s1.body.state, { assistant_instructions: 'RULES', conversation: request.conversation, latest_message: request.input }, 'state');
eq(Object.keys(s1.body.questions).length, 3, 'stage 1 asks one question per flow and nothing else');
ok(Object.values(s1.body.questions).every(q => q.type === 'noul'), 'every question is a noul');
const flowAnswers = (fn) => Object.fromEntries(s1.index.map(q => [q.id, { noul: fn(q.flow) }]));
{
   const r = fromFlowAnswers(flowAnswers(f => (f === 1 ? 0.9 : 0.2)), s1.index, request);
   eq(r.flow.name, 'CreateServiceCase', 'argmax flow');
   eq(r.scores[0], { name: 'CreateServiceCase', p: 0.9 }, 'scores lead with the winner');
   eq(r.scores.length, 3, 'top three scores');
   eq(fromFlowAnswers(flowAnswers(() => INTENT_YES_THRESHOLD - 0.01), s1.index, request).flow, null, 'nothing clears the cut → None');
   eq(fromFlowAnswers(flowAnswers(f => (f === 2 ? INTENT_YES_THRESHOLD : 0.1)), s1.index, request).flow.name, 'RequestLiveAgent', 'exactly the cut is a yes');
   const a = flowAnswers(() => 0.9); delete a.f2;
   assert.throws(() => fromFlowAnswers(a, s1.index, request), /unanswered/); checks++;
   a.f2 = { noul: 'x' };
   assert.throws(() => fromFlowAnswers(a, s1.index, request), /unanswered/); checks++;
}

// ── stage 2: the chosen flow's enum and boolean parameters ──
ok(hasJevParameters(request.flows[0]) && hasJevParameters(request.flows[1]), 'boolean or enum → stage 2');
ok(!hasJevParameters(request.flows[2]) && !hasJevParameters(null), 'none declared, or None → no stage 2');
ok(!hasJevParameters({ parameters: [{ name: 'city', description: 'x' }] }), 'free text only → no stage 2');
{
   const s2 = toParameterRequest(request, request.flows[1], opts);
   eq(Object.keys(s2.body.questions).length, 4, 'one question per enum value');
   eq(s2.body.questions[s2.index.find(q => q.value === 'Cancel Delivery').id].instructions.candidate_value, 'Cancel Delivery', 'names its value');
   ok(s2.body.state.assistant_instructions.includes('RULES') && s2.body.state.assistant_instructions.includes('"reason rules"'), 'jsfe rules and each parameter rule, once, in state');
   ok(!JSON.stringify(s2.body.questions).includes('reason rules'), 'questions do not repeat the rule');
   const ans = (fn) => Object.fromEntries(s2.index.map(q => [q.id, { noul: fn(q) }]));
   eq(fromParameterAnswers(ans(q => ({ Cancellation: 0.8, Fraud: 0.3, 'Cancel Delivery': 0.7 })[q.value] ?? 0.1), s2.index),
      { ticket_type: 'Cancellation', ticket_reason: 'Cancel Delivery' }, 'argmax value per enum');
   eq(fromParameterAnswers(ans(q => (q.value === 'Fraud' ? 0.49 : 0.2)), s2.index), {}, 'best value under the cut → omitted, the flow asks');
   const a = ans(() => 0.9); delete a[s2.index[0].id];
   assert.throws(() => fromParameterAnswers(a, s2.index), /unanswered/); checks++;
}
{
   const s2 = toParameterRequest(request, request.flows[0], opts);
   eq(s2.index.map(q => q.param), ['send_link'], 'free text is not asked');
   eq(fromParameterAnswers({ [s2.index[0].id]: { noul: 0.9 } }, s2.index), { send_link: true }, 'boolean over the cut → true');
   eq(fromParameterAnswers({ [s2.index[0].id]: { noul: 0.2 } }, s2.index), {}, 'boolean under the cut → omitted (flow default), never false');
}

// ── merging the text path ──
{
   const pay = request.flows[0];
   const jev = { flowName: 'StartPayment', parameters: { send_link: true } };
   eq(mergeTextParameters(jev, pay, { flowName: 'startpayment', parameters: { acct_number: '5123456', send_link: false, bogus: 1 } }),
      { flowName: 'StartPayment', parameters: { acct_number: '5123456', send_link: true } },
      'same flow: free text taken, Jev keeps its boolean, undeclared dropped');
   eq(mergeTextParameters(jev, pay, { flowName: 'LocateAccount', parameters: { acct_number: '5123456' } }), jev, 'different flow: nothing taken');
   eq(mergeTextParameters(jev, pay, null), jev, 'text path failed: Jev reply as is');
}

console.log(`systemone-intent: ${checks} checks passed`);
