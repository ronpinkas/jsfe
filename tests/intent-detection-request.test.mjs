// Host contract test: the structured 4th aiCallback argument (intent detection only), and
// parameter enums — prompt rendering, enforcement on the reply, and flow validation.
//
//   npm run build && node tests/intent-detection-request.test.mjs
//
// Hermetic: aiCallback is a stub that records its arguments and returns a scripted reply.
import assert from 'node:assert/strict';
import { WorkflowEngine } from '../dist/index.js';

const quiet = { info() {}, debug() {}, warn() {}, error() {} };

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };

const serviceCase = {
  id: 'CreateServiceCase',
  name: 'CreateServiceCase',
  description: 'Open a service case',
  version: '1.0.0',
  primary: true,
  parameters: [
    { name: 'ticket_type', description: 'The case type', enum: ['Fraud', 'Cancellation', 'Account Issue'] },
    { name: 'send_link', description: 'Whether to text a link', type: 'boolean' },
    { name: 'ticket_detail', description: 'Free-text detail' },
  ],
  steps: [{ id: 'ask', type: 'SAY-GET', value: 'Tell me more.', variable: 'more' }],
};
const helper = {
  id: 'Helper', name: 'Helper', description: 'Not primary, never offered', version: '1.0.0',
  steps: [{ id: 'say', type: 'SAY', value: 'hi' }],
};
const flowsMenu = [serviceCase, helper];

const user = (content) => ({ role: 'user', content, timestamp: Date.now() });
const assistant = (content) => ({ role: 'assistant', content, timestamp: Date.now() });

// A callback that records every call and answers from a queue.
function recorder(replies) {
  const calls = [];
  const cb = async (...args) => { calls.push(args); return JSON.stringify(replies.shift() ?? { flowName: 'None', parameters: {} }); };
  return { cb, calls };
}

// Runs one fresh session: a non-flow exchange, then the input under test.
async function run(reply, input = 'I want to cancel my order') {
  const { cb, calls } = recorder([{ flowName: 'None', parameters: {} }, reply]);
  const engine = new WorkflowEngine(quiet, cb, flowsMenu, [], {}, {}, false, 'en', 3000);
  let s = engine.initSession('u1', 'thread-1');
  s = await engine.updateActivity(user('hello'), s);
  s = await engine.updateActivity(assistant('Hi, how can I help?'), s);
  s = await engine.updateActivity(user(input), s);
  const frame = (s.flowStacks || []).flat().find(f => f?.flowName === 'CreateServiceCase');
  return { calls, frame };
}

// ── 1. The 4th argument: present on detect_flow, and exactly what the prompt says ─────────
{
  const { calls, frame } = await run({ flowName: 'CreateServiceCase', parameters: {} }, '  I want to cancel my order  ');
  const [system, message, schema, request] = calls[1];
  eq(calls[1].length, 4, 'detect_flow passes four arguments');
  eq(JSON.parse(schema).json_schema.name, 'detect_flow', 'the schema is still named detect_flow');
  eq(request.task, 'detect_flow', 'request.task names the call');
  eq(request.input, 'I want to cancel my order', 'request.input is the sanitized input the prompt carries');
  ok(message.includes(`<user-input>\n${request.input}\n</user-input>`), 'request.input matches <user-input> exactly');
  eq(request.conversation, [
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'Hi, how can I help?' },
  ], 'request.conversation is lastChatTurn, oldest first');
  eq(request.flows.map(f => f.name), ['CreateServiceCase'], 'request.flows holds the same (primary) flows the prompt lists');
  eq(request.flows[0].parameters, [
    { name: 'ticket_type', description: 'The case type', enum: ['Fraud', 'Cancellation', 'Account Issue'] },
    { name: 'send_link', description: 'Whether to text a link', type: 'boolean' },
    { name: 'ticket_detail', description: 'Free-text detail' },
  ], 'parameters are copied with type and enum only where declared');
  ok(request.flows[0].parameters[0].enum !== serviceCase.parameters[0].enum, 'the enum is a copy, not the flow definition');
  ok(typeof system === 'string' && system.includes('<task>'), 'systemInstruction is still the full text prompt');
  ok(frame, 'the flow activates from a structured-path reply the same way');

  // The first turn ran with no chat history.
  eq(calls[0][3].conversation, [], 'no lastChatTurn → an empty conversation');
}

// ── 2. The enum reaches the text prompt ─────────────────────────────────────────────────────
{
  const { calls } = await run({ flowName: 'None', parameters: {} });
  const message = calls[1][1];
  ok(message.includes('ticket_type (string, one of: "Fraud" | "Cancellation" | "Account Issue"): The case type'), 'enum rendered as allowed values');
  ok(message.includes('send_link (boolean): Whether to text a link'), 'non-enum parameters render as before');
  ok(message.includes('ticket_detail (string): Free-text detail'), 'untyped parameters render as string, as before');
}

// ── 3. Enforcement on the reply ─────────────────────────────────────────────────────────────
{
  const { frame } = await run({ flowName: 'CreateServiceCase', parameters: { ticket_type: '  cancellation ', send_link: true, ticket_detail: 'order 123' } });
  eq(frame.variables.ticket_type, 'Cancellation', 'case/whitespace variant normalised to the declared spelling');
  eq(frame.variables.send_link, true, 'boolean passes through');
  eq(frame.variables.ticket_detail, 'order 123', 'free text passes through');
}
{
  const { frame } = await run({ flowName: 'CreateServiceCase', parameters: { ticket_type: 'Refund', ticket_detail: 'x' } });
  ok(!('ticket_type' in frame.variables) || frame.variables.ticket_type === undefined, 'an out-of-enum value is dropped, so the flow asks');
  eq(frame.variables.ticket_detail, 'x', 'dropping one parameter keeps the others');
}
{
  const { frame } = await run({ flowName: 'CreateServiceCase', parameters: { ticket_type: ['Fraud'] } });
  ok(!('ticket_type' in frame.variables) || frame.variables.ticket_type === undefined, 'a non-string value for an enum is dropped');
}

// ── 4. Backward compatible: a three-argument callback is unaffected ─────────────────────────
{
  let seen;
  const legacy = async (systemInstruction, userMessage, jsonSchema) => { seen = [systemInstruction, userMessage, jsonSchema]; return JSON.stringify({ flowName: 'CreateServiceCase', parameters: {} }); };
  const engine = new WorkflowEngine(quiet, legacy, flowsMenu, [], {}, {}, false, 'en', 3000);
  let s = engine.initSession('u2', 'thread-2');
  s = await engine.updateActivity(user('cancel my order'), s);
  ok(seen && seen.length === 3, 'a three-argument callback receives its three arguments');
  ok((s.flowStacks || []).flat().some(f => f?.flowName === 'CreateServiceCase'), 'and still activates the flow');
}

// ── 5. Validation ───────────────────────────────────────────────────────────────────────────
function errorsFor(parameters) {
  const flow = { ...serviceCase, id: 'F', name: 'F', parameters };
  const engine = new WorkflowEngine(quiet, null, [flow], [], {}, {}, false, 'en');
  return engine.validateFlow('F').errors.filter(e => /parameter/i.test(e));
}
eq(errorsFor(serviceCase.parameters), [], 'a well-formed enum validates clean');
eq(errorsFor(undefined), [], 'no parameters validates clean');
ok(errorsFor({}).some(e => e.includes('must be an array')), 'parameters must be an array');
ok(errorsFor([{ description: 'x' }]).some(e => e.includes('without a name')), 'a parameter needs a name');
ok(errorsFor([{ name: 'a', description: 'x' }, { name: 'a', description: 'y' }]).some(e => e.includes('more than once')), 'duplicate parameter names');
ok(errorsFor([{ name: 'b', type: 'boolean', description: 'x', enum: ['yes'] }]).some(e => e.includes('only on a string parameter')), 'enum on a non-string type');
ok(errorsFor([{ name: 'e', description: 'x', enum: [] }]).some(e => e.includes('non-empty array')), 'empty enum');
ok(errorsFor([{ name: 'e', description: 'x', enum: 'Fraud' }]).some(e => e.includes('non-empty array')), 'enum that is not an array');
ok(errorsFor([{ name: 'e', description: 'x', enum: ['A', ''] }]).some(e => e.includes('not a non-empty string')), 'empty enum value');
ok(errorsFor([{ name: 'e', description: 'x', enum: ['A', 3] }]).some(e => e.includes('not a non-empty string')), 'non-string enum value');
ok(errorsFor([{ name: 'e', description: 'x', enum: ['A', ' B'] }]).some(e => e.includes('whitespace')), 'padded enum value');
ok(errorsFor([{ name: 'e', description: 'x', enum: ['Fraud', 'fraud'] }]).some(e => e.includes('ignoring case')), 'case-insensitive duplicate');
eq(errorsFor([{ name: 'e', type: 'string', description: 'x', enum: ['A'] }]), [], 'explicit type string with an enum is fine');

console.log(`intent-detection-request: ${checks} checks passed`);
