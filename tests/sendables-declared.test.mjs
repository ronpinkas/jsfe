// A flow declares `sendable: {key, label, label_es?}`: the caller may ask for it from the first turn (a statement nobody
// produced yet), and that flow is its sender. The engine brings cargo.sendables in line with the declarations each turn.
//
//   npm run build && node tests/sendables-declared.test.mjs
import assert from 'node:assert/strict';
import { WorkflowEngine } from '../dist/index.js';
import { sendables, registerSendable } from '../dist/helpers/index.js';

const quiet = { info() {}, debug() {}, warn() {}, error() {} };
let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };

const statement = { id: 'send-statement', name: 'SendStatement', version: '1.0.0', description: 'The statement.', primary: true,
  sendable: { key: 'statement', label: 'Your latest statement', label_es: 'Su último estado de cuenta', media: ['email'] },
  steps: [{ id: 's', type: 'SAY', value: 'Statement.' }] };
const send = { id: 'send-copy', name: 'SendCopy', version: '1.0.0', description: 'Send something.', primary: true,
  parameters: [{ name: 'item', description: 'What to send.', enum_from: 'sendables' }, { name: 'medium', description: 'How.', enum: ['text', 'email'] }],
  steps: [{ id: 'ask', type: 'SAY-GET', value: 'Sending.', variable: 'x' }] };

async function turn(input, { replies = [], cargo = {}, flows = [statement, send] } = {}) {
  const calls = [];
  const cb = async (...args) => { calls.push(args); return JSON.stringify(replies.shift() ?? { flowName: 'None' }); };
  const engine = new WorkflowEngine(quiet, cb, flows, [], {}, {}, false, 'en', 3000);
  engine.intentDetection = 'two-stage';
  let s = engine.initSession('u1', 'thread-1');
  Object.assign(s.cargo, cargo);
  s = await engine.updateActivity({ role: 'user', content: input, timestamp: Date.now() }, s);
  return { s, calls, engine };
}

// ── 1. Offered from the first turn, its flow as the sender ──────────────────────────────────────────
{
  const { s, calls } = await turn('text me my statement', { replies: [{ flowName: 'SendCopy' }, { parameters: { item: 'statement', medium: 'text' } }] });
  eq(s.cargo.sendables, [{ key: 'statement', label: 'Your latest statement', label_es: 'Su último estado de cuenta', kind: 'document', sender: 'send-statement', args: {}, media: ['email'], declared: true }], 'registered by the engine, before any flow ran');
  eq(calls[1][3].flow.parameters[0].enum, ['statement'], 'stage 2 offers it on the first turn');
  const frame = (s.flowStacks || []).flat().find(f => f?.flowName === 'SendCopy');
  eq(frame.variables.item, 'statement', 'and it can be picked');
}

// ── 2. A run-time registration keeps its key (and its args) ────────────────────────────────────────
{
  const cargo = {};
  registerSendable(cargo, { key: 'statement', label: 'October statement', sender: 'send-statement', args: { month: 10 } });
  const { s } = await turn('hello', { cargo });
  eq(s.cargo.sendables.map(i => [i.key, i.label, !!i.declared]), [['statement', 'October statement', false]], 'the registered entry wins');
}

// ── 3. A declaration no longer in the menu is dropped; replies still follow ────────────────────────
{
  const cargo = { sendables: [{ key: 'old', label: 'Old', kind: 'document', sender: 'gone', args: {}, declared: true }], chatTurns: [{ n: 2, role: 'assistant', text: 'Hi.' }] };
  const { s } = await turn('hello', { cargo });
  eq(sendables(s.cargo).map(i => i.key), ['statement', 'reply-2'], 'stale declaration replaced; declared documents, then replies');
  const none = await turn('hello', { flows: [send] });
  ok(none.s.cargo.sendables === undefined, 'no declaration: cargo is untouched');
}

// ── 4. Validation ─────────────────────────────────────────────────────────────────────────────────
{
  const errorsOf = (sendable) => new WorkflowEngine(quiet, null, [{ ...statement, sendable }], [], {}, {}, false, 'en', 3000).validateFlow('SendStatement').errors.join(' | ');
  eq(errorsOf(statement.sendable), '', 'a valid declaration');
  ok(/sendable.key must be/.test(errorsOf({ key: 'reply-1', label: 'x' })), 'reply- keys are reserved');
  ok(/sendable.label must be/.test(errorsOf({ key: 'k' })), 'a label is required');
  ok(/media must be/.test(errorsOf({ key: 'k', label: 'x', media: ['fax'] })), 'media are text and email only');
  eq(errorsOf({ key: 'k', label: 'x', media: ['email'] }), '', 'email-only is valid');
  ok(/takes only key, label, label_es and media/.test(errorsOf({ key: 'k', label: 'x', sender: 'y' })), 'the sender is the flow itself, never declared');
}

console.log(`sendables-declared: ${checks} checks passed`);
