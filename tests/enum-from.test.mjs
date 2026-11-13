// enum_from: a parameter whose enum is read from the session when the flow is selected (two-stage only). Only the
// selected flow's stage 2 changes; each value carries its label to both executors; the flow file is unchanged.
//
//   npm run build && node tests/enum-from.test.mjs
import assert from 'node:assert/strict';
import { WorkflowEngine } from '../dist/index.js';
import { buildParameterStage, decodeParametersSystemOne } from '../dist/host/index.js';
import { resolveEnumSources } from '../dist/helpers/enum-sources.js';

const quiet = { info() {}, debug() {}, warn() {}, error() {} };
let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };

const send = {
  id: 'send-copy', name: 'SendCopy', description: 'The caller asks to be sent something.', version: '1.0.0', primary: true,
  parameters: [
    { name: 'item', description: 'What to send.', enum_from: 'sendables' },
    { name: 'medium', description: 'How to send it.', enum: ['text', 'email'] },
  ],
  steps: [{ id: 'ask', type: 'SAY-GET', value: 'Sending.', variable: 'x' }],
};
const pay = {
  id: 'make-payment', name: 'MakePayment', description: 'The caller wants to pay.', version: '1.0.0', primary: true,
  parameters: [{ name: 'payment_option', description: 'The payment named.', enum: ['monthly', 'balance'] }],
  steps: [{ id: 'ask', type: 'SAY-GET', value: 'How much?', variable: 'y' }],
};
const turns = [
  { n: 1, role: 'user', text: 'what is my balance' },
  { n: 2, role: 'assistant', text: 'Your balance is $1.92.' },
  { n: 3, role: 'user', text: 'and my due date' },
  { n: 4, role: 'assistant', text: 'Your next payment is due on December 5.' },
];

async function run(replies, input, chatTurns, flows = [send, pay]) {
  const calls = [];
  const cb = async (...args) => { calls.push(args); const r = replies.shift(); if (r instanceof Error) throw r; return JSON.stringify(r ?? { flowName: 'None' }); };
  const engine = new WorkflowEngine(quiet, cb, flows, [], {}, {}, false, 'en', 3000);
  engine.intentDetection = 'two-stage';
  let s = engine.initSession('u1', 'thread-1');
  if (chatTurns) s.cargo.chatTurns = chatTurns; else { /* no conversation yet */ }
  s = await engine.updateActivity({ role: 'user', content: input, timestamp: Date.now() }, s);
  const frame = (s.flowStacks || []).flat().find(f => f?.flowName === 'SendCopy' || f?.flowName === 'MakePayment');
  return { calls, frame, engine };
}

// ── 1. The selected flow's enum is the session's sendables, labelled, for both executors ─────────────
{
  const { calls, frame } = await run([{ flowName: 'SendCopy' }, { parameters: { item: 'reply-4', medium: 'text' } }], 'text me that', turns);
  const [system2, , schema2, req2] = calls[1];
  eq(req2.flow.parameters[0].enum, ['conversation', 'reply-2', 'reply-4'], 'item takes the session\'s keys: the conversation, then the replies');
  ok(system2.includes('reply-4 = "Reply 4: Your next payment is due on December 5."'), 'the LLM reads each value with its label');
  eq(JSON.parse(schema2).json_schema.schema.properties.item.enum, ['conversation', 'reply-2', 'reply-4', null], 'the schema allows only those keys');
  const q = Object.values(req2.systemOne.questions).find(x => x.instructions.candidate_value === 'reply-4');
  ok(q.instructions.candidate_label === 'Reply 4: Your next payment is due on December 5.' && q.criteria.true.includes('(Reply 4:'), 'Jev reads the label too');
  eq(req2.systemOne.index.filter(x => x.param === 'item').length, 3, 'one Jev question per sendable');
  eq({ item: frame.variables.item, medium: frame.variables.medium }, { item: 'reply-4', medium: 'text' }, 'the pick reaches the flow');
  ok(!('enumLabels' in req2.flow.parameters[1]), 'a static enum carries no labels');
}

// ── 2. A value outside the session's list is dropped (the flow asks) ────────────────────────────────
{
  const { frame } = await run([{ flowName: 'SendCopy' }, { parameters: { item: 'reply-9', medium: 'email' } }], 'email me that', turns);
  ok(frame.variables.item === undefined && frame.variables.medium === 'email', 'an unknown key is dropped, the rest kept');
}

// ── 3. Nothing to send: item is not asked; only medium is ───────────────────────────────────────────
{
  const { calls, frame } = await run([{ flowName: 'SendCopy' }, { parameters: { medium: 'text' } }], 'text me that', []);
  const req2 = calls[1][3];
  eq(req2.flow.parameters.map(p => p.name), ['medium'], 'an empty source leaves the parameter out this turn');
  ok(frame.variables.medium === 'text' && frame.variables.item === undefined, 'the flow starts and asks for the item');
}

// ── 4. Registered documents are offered before replies ─────────────────────────────────────────────
{
  const cargo = { chatTurns: turns, sendables: [{ key: 'statement', label: 'Your latest statement', kind: 'document', sender: 'send-statement', args: {} }] };
  const resolved = resolveEnumSources(send, cargo);
  eq(resolved.parameters[0].enum, ['statement', 'conversation', 'reply-2', 'reply-4'], 'documents first, the conversation, then replies');
  ok(!('enum_from' in resolved.parameters[0]) && send.parameters[0].enum_from === 'sendables', 'the flow definition is not changed');
  ok(resolveEnumSources(pay, cargo) === pay, 'a flow without enum_from is returned as is');
  const s2 = buildParameterStage('send my statement', [], resolved);
  const ids = s2.systemOne.index.filter(x => x.param === 'item').map(x => x.id);
  const answers = Object.fromEntries(s2.systemOne.index.map(x => [x.id, { noul: x.id === ids[0] ? 0.9 : 0.1 }]));
  eq(decodeParametersSystemOne(answers, s2).parameters.item, 'statement', 'Jev picks a document by key');
}

// ── 5. Another flow's stage 2 is byte-identical to before ──────────────────────────────────────────
{
  const { calls } = await run([{ flowName: 'MakePayment' }, { parameters: { payment_option: 'monthly' } }], 'pay monthly', turns);
  const req2 = calls[1][3];
  eq(req2, buildParameterStage(req2.input, req2.conversation, pay), 'MakePayment\'s request does not depend on the session');
}

// ── 6. Validation ─────────────────────────────────────────────────────────────────────────────────
{
  const errorsOf = (parameters) => new WorkflowEngine(quiet, null, [{ ...send, id: 'v', name: 'V', parameters }], [], {}, {}, false, 'en', 3000)
    .validateFlow('V').errors.join(' | ');
  eq(errorsOf(send.parameters), '', 'enum_from: sendables is valid');
  ok(/enum_from "nope" is not one of sendables/.test(errorsOf([{ name: 'item', description: 'd', enum_from: 'nope' }])), 'an unknown source is refused');
  ok(/enum or enum_from, not both/.test(errorsOf([{ name: 'item', description: 'd', enum_from: 'sendables', enum: ['a'] }])), 'not both');
  ok(/only on a string parameter/.test(errorsOf([{ name: 'item', description: 'd', enum_from: 'sendables', type: 'boolean' }])), 'string only');
  ok(/enumLabels is set by enum_from/.test(errorsOf([{ name: 'item', description: 'd', enum: ['a'], enumLabels: { a: 'A' } }])), 'enumLabels is never declared');
}

console.log(`enum-from: ${checks} checks passed`);
