// Tool `returns` (the output contract) and the opt-in engine.validateToolReturns diagnostic.
//
//   npm run build && node tests/tool-returns.test.mjs
//
// The contract under test is BACKWARD COMPATIBILITY: `returns` is documentation plus an opt-in
// warning. With the option off — the default — a tool with `returns` must behave exactly like the
// same tool without it; with the option on, a mismatch may only ever add a log line. No case here
// may change what the flow receives, says or does next.
//
// Hermetic: aiCallback is null (flows match by name), every tool is a local function.
import assert from 'node:assert/strict';
import { WorkflowEngine } from '../dist/index.js';

let checks = 0;
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };
const ok = (c, what) => { assert.ok(c, what); checks++; };

// A logger that records warnings so the test can assert what was, and was not, reported.
function recorder() {
  const warns = [];
  return { warns, logger: { info() {}, debug() {}, error() {}, warn: (...a) => warns.push(a.map(String).join(' ')) } };
}
const returnsWarnings = (warns) => warns.filter((w) => /returns/.test(w));

// The tool hands back what `produce` returns; the flow stores it and reads a nested path.
let produce = () => ({ success: true, order: { orderNumber: '#1042', fulfillmentStatus: 'FULFILLED' } });
const APPROVED_FUNCTIONS = {
  getOrder: async () => produce(),
  failingTool: async () => { throw new Error('upstream down'); },
};

const RETURNS = {
  type: 'object',
  required: ['success'],
  properties: {
    success: { type: 'boolean' },
    order: {
      type: 'object',
      required: ['orderNumber', 'fulfillmentStatus'],
      properties: { orderNumber: { type: 'string' }, fulfillmentStatus: { type: 'string' } },
    },
  },
};

const tool = (extra = {}) => ({
  id: 'get-order', name: 'Get Order', description: 'Order status',
  parameters: { type: 'object', properties: {}, additionalProperties: true },
  implementation: { type: 'local', function: 'getOrder', timeout: 5000 },
  ...extra,
});

const flows = [
  {
    id: 'ShowOrder', name: 'ShowOrder', description: 'Show an order', version: '1.0.0',
    steps: [
      { id: 'get', type: 'CALL-TOOL', tool: 'get-order', variable: 'order_result' },
      { id: 'say', type: 'SAY-GET', variable: 'next',
        value: 'Order {{order_result.order ? order_result.order.orderNumber : "?"}} is {{order_result.order ? order_result.order.fulfillmentStatus : "?"}} ({{JSON.stringify(order_result)}})' },
    ],
  },
  {
    id: 'ShowFailing', name: 'ShowFailing', description: 'A tool that throws', version: '1.0.0',
    steps: [
      { id: 'get', type: 'CALL-TOOL', tool: 'failing-tool', variable: 'r',
        onFail: { id: 'handled', type: 'SAY-GET', variable: 'x', value: 'The lookup failed, handled.' } },
    ],
  },
];

const failingTool = (extra = {}) => ({
  id: 'failing-tool', name: 'Failing Tool', description: 'Always throws',
  parameters: { type: 'object', properties: {}, additionalProperties: true },
  implementation: { type: 'local', function: 'failingTool', timeout: 5000 },
  ...extra,
});

// Runs `flowName` once and returns what the caller would see plus every warning logged.
async function run({ getOrderTool, failTool = failingTool(), validate, flowName = 'ShowOrder', validateOnInit = false }) {
  const { warns, logger } = recorder();
  const engine = new WorkflowEngine(logger, null, flows, [getOrderTool, failTool], APPROVED_FUNCTIONS, {}, validateOnInit, 'en');
  if (validate !== undefined) engine.validateToolReturns = validate;
  let s = engine.initSession('u', `t-${Math.random()}`);
  s = await engine.updateActivity({ role: 'user', content: flowName, timestamp: Date.now() }, s);
  return { response: s.response, warns, engine };
}

// ── 1. Default is OFF, and a tool WITH returns behaves exactly like one without ────────────────
{
  const without = await run({ getOrderTool: tool() });
  const withReturns = await run({ getOrderTool: tool({ returns: RETURNS }) });
  eq(withReturns.engine.validateToolReturns, false, 'validateToolReturns defaults to false');
  eq(withReturns.response, without.response, 'identical reply with and without returns (option off)');
  ok(/Order #1042 is FULFILLED/.test(withReturns.response), 'the flow read the nested result path');
  eq(returnsWarnings(withReturns.warns), [], 'option off: nothing about returns is logged');
  eq(withReturns.warns, without.warns, 'option off: the full warning log is identical too');
}

// ── 2. Option off, NON-conforming result: still no work, no warning ───────────────────────────
{
  produce = () => ({ success: 'yes', orders: [] });
  const r = await run({ getOrderTool: tool({ returns: RETURNS }) });
  eq(returnsWarnings(r.warns), [], 'option off: a mismatching result is not even checked');
  produce = () => ({ success: true, order: { orderNumber: '#1042', fulfillmentStatus: 'FULFILLED' } });
}

// ── 3. Option on, conforming result: no warning, reply unchanged ──────────────────────────────
{
  const off = await run({ getOrderTool: tool({ returns: RETURNS }) });
  const on = await run({ getOrderTool: tool({ returns: RETURNS }), validate: true });
  eq(on.response, off.response, 'option on + conforming result: identical reply');
  eq(returnsWarnings(on.warns), [], 'option on + conforming result: no warning');
}

// ── 4. Option on, NON-conforming result: one warning, the flow sees the result unchanged ──────
{
  const bad = { success: 'yes', order: { orderNumber: 1042 } };
  produce = () => bad;
  const off = await run({ getOrderTool: tool({ returns: RETURNS }) });
  const on = await run({ getOrderTool: tool({ returns: RETURNS }), validate: true });
  eq(on.response, off.response, 'option on + mismatch: identical reply — the result is never altered');
  ok(on.response.includes(JSON.stringify(bad)), 'the flow received the raw result, byte for byte');
  const w = returnsWarnings(on.warns);
  eq(w.length, 1, 'exactly one returns warning');
  ok(/get-order/.test(w[0]) && /does not match/.test(w[0]), 'it names the tool and says it does not match');
  ok(/\/success/.test(w[0]) && /fulfillmentStatus/.test(w[0]), 'it names the offending paths');
  produce = () => ({ success: true, order: { orderNumber: '#1042', fulfillmentStatus: 'FULFILLED' } });
}

// ── 5. Option on, returns schema that does not compile: warned ONCE, never thrown ─────────────
{
  const broken = tool({ returns: { type: 'not-a-type' } });
  const { warns, logger } = recorder();
  const engine = new WorkflowEngine(logger, null, flows, [broken, failingTool()], APPROVED_FUNCTIONS, {}, false, 'en');
  engine.validateToolReturns = true;
  const replies = [];
  for (let i = 0; i < 2; i++) {
    let s = engine.initSession('u', `t-broken-${i}`);
    s = await engine.updateActivity({ role: 'user', content: 'ShowOrder', timestamp: Date.now() }, s);
    replies.push(s.response);
  }
  const reference = (await run({ getOrderTool: tool() })).response;
  eq(replies, [reference, reference], 'a broken returns schema changes nothing the caller sees');
  const w = returnsWarnings(warns);
  eq(w.length, 1, 'the compile failure is reported once, not on every call');
  ok(/does not compile/.test(w[0]), 'and says the schema does not compile');
}

// ── 6. Option on, tool WITHOUT returns: nothing checked, nothing logged ───────────────────────
{
  const on = await run({ getOrderTool: tool(), validate: true });
  const off = await run({ getOrderTool: tool() });
  eq(on.response, off.response, 'no returns + option on: identical reply');
  eq(returnsWarnings(on.warns), [], 'no returns + option on: no returns warning');
}

// ── 7. A tool that THROWS: onFail runs exactly as before, with or without returns / option ─────
{
  const plain = await run({ getOrderTool: tool(), flowName: 'ShowFailing' });
  const withAll = await run({ getOrderTool: tool(), failTool: failingTool({ returns: RETURNS }), validate: true, flowName: 'ShowFailing' });
  eq(withAll.response, plain.response, 'a failing tool reaches the same onFail with returns + option on');
  ok(/handled/.test(withAll.response), 'onFail ran');
  eq(returnsWarnings(withAll.warns), [], 'a thrown tool is never checked against returns');
}

// ── 8. Flow validation on init is unaffected by a returns field ────────────────────────────────
{
  const without = await run({ getOrderTool: tool(), validateOnInit: true });
  const withReturns = await run({ getOrderTool: tool({ returns: RETURNS }), validateOnInit: true });
  eq(withReturns.warns, without.warns, 'init validation logs exactly the same with a returns field');
  eq(withReturns.response, without.response, 'and the flow runs identically');
}

console.log(`tool-returns: ${checks} checks passed`);
