// The opt-in engine.logToolFailures diagnostic: a tool that RETURNS a failure is reported once.
//
//   npm run build && node tests/tool-failure-report.test.mjs
//
// A failure a tool returns (success: false, a non-zero error) is not an exception, so before this nothing
// reported it: an HTTP tool that accepts a 4xx as an answer handed the flow a refusal no log ever showed.
// Contract under test: off by default (nothing logged, nothing changed); on, one warning per failed result,
// with digit runs masked; the flow always receives the result unchanged.
//
// Hermetic: aiCallback is null (flows match by name), every tool is a local function.
import assert from 'node:assert/strict';
import { WorkflowEngine } from '../dist/index.js';

let checks = 0;
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };
const ok = (c, what) => { assert.ok(c, what); checks++; };

function recorder() {
  const warns = [];
  return { warns, logger: { info() {}, debug() {}, error() {}, warn: (...a) => warns.push(a.map(String).join(' ')) } };
}
const failureWarnings = (warns) => warns.filter((w) => /answered a failure/.test(w));

let produce = () => ({ success: true });
const APPROVED_FUNCTIONS = { cancelIt: async () => produce() };
const tool = { id: 'cancel-subscription', name: 'Cancel', description: 'Cancel a subscription',
  parameters: { type: 'object', properties: {}, additionalProperties: true },
  implementation: { type: 'local', function: 'cancelIt', timeout: 5000 } };
const flows = [{ id: 'Cancel', name: 'Cancel', description: 'Cancel', version: '1.0.0', steps: [
  { id: 'call', type: 'CALL-TOOL', tool: 'cancel-subscription', variable: 'r' },
  { id: 'say', type: 'SAY-GET', variable: 'x', value: 'RESULT {{JSON.stringify(r)}}' }] }];

async function run(on) {
  const { warns, logger } = recorder();
  const engine = new WorkflowEngine(logger, null, flows, [tool], APPROVED_FUNCTIONS, {}, false, 'en');
  if (on !== undefined) engine.logToolFailures = on;
  let s = engine.initSession('u', `t-${Math.random()}`);
  s = await engine.updateActivity({ role: 'user', content: 'Cancel', timestamp: Date.now() }, s);
  return { response: s.response, warns, engine };
}

const PC99 = { success: false, error: 3, code: 'PC99-C', error_message: "Subscription cancel API error: PC99-C | Account Info is empty for 56035214" };

// 1. Default off: nothing logged, reply identical
{
  produce = () => PC99;
  const r = await run();
  eq(r.engine.logToolFailures, false, 'logToolFailures defaults to false');
  eq(failureWarnings(r.warns), [], 'off: a failed result is not reported');
}
// 2. On: one warning naming the tool, the code and the message, digits masked; the result unchanged
{
  produce = () => PC99;
  const off = await run(false);
  const on = await run(true);
  eq(on.response, off.response, 'on: the flow receives the same result');
  ok(on.response.includes('56035214'), 'the flow still sees the unmasked result');
  const w = failureWarnings(on.warns);
  eq(w.length, 1, 'exactly one warning');
  ok(/cancel-subscription/.test(w[0]) && /PC99-C/.test(w[0]) && /Account Info is empty/.test(w[0]), `it names the tool, code and message: ${w[0]}`);
  ok(!/56035214/.test(w[0]) && /<n>/.test(w[0]), 'digit runs are masked in the log');
}
// 3. On, success: nothing
{
  produce = () => ({ success: true, info: 'cancelled' });
  eq(failureWarnings((await run(true)).warns), [], 'a success is not reported');
  produce = () => ({ ok: 1 });
  eq(failureWarnings((await run(true)).warns), [], 'a result with neither success nor error is not reported');
  produce = () => ({ success: true, error: 0 });
  eq(failureWarnings((await run(true)).warns), [], 'error 0 is not a failure');
}
// 4. On, a non-zero error without success: reported; a string or array result: not
{
  produce = () => ({ error: 99, error_message: 'Request timeout' });
  const w = failureWarnings((await run(true)).warns);
  ok(w.length === 1 && /\(99\)/.test(w[0]) && /Request timeout/.test(w[0]), `a bare error code is reported: ${w[0]}`);
  produce = () => 'plain text';
  eq(failureWarnings((await run(true)).warns), [], 'a string result is not inspected');
  produce = () => [1, 2];
  eq(failureWarnings((await run(true)).warns), [], 'an array result is not inspected');
}

console.log(`tool-failure-report: ${checks} checks passed`);
