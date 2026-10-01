// CALL-TOOL onFail ordering — the contract every onFail kind must keep.
//
//   npm run build && node tests/onfail-order.test.mjs
//
// The defects this pins (jsfe ≤ 0.9.88):
// - A non-FLOW onFail (SET / SAY / RETURN) was unshift()ed onto a step stack read with pop(), so it
//   ran AFTER every remaining step — a turn late behind a SAY-GET, or never when the flow ended first —
//   and meanwhile the CALL-TOOL variable held the error text.
// - A FLOW onFail with callType "call" looked its target up by `name` (a FLOW step names it in
//   `value`), found nothing, and silently continued past the failure.
// FLOW replace / reboot were already correct and must stay so.
//
// Hermetic: aiCallback is null (flows match by name), every tool is a local function.
import assert from 'node:assert/strict';
import { WorkflowEngine } from '../dist/index.js';

let checks = 0;
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };

const quiet = { info() {}, debug() {}, warn() {}, error() {} };
let calls = 0;
const APPROVED_FUNCTIONS = {
  boom: async () => { calls++; throw new Error('upstream down'); },
  fine: async () => { calls++; return { success: true }; },
};
const tool = (id, fn) => ({ id, name: id, description: id,
  parameters: { type: 'object', properties: {}, additionalProperties: true },
  implementation: { type: 'local', function: fn, timeout: 2000 } });
const tools = [tool('boom', 'boom'), tool('fine', 'fine')];
const handler = { id: 'handler-flow', name: 'HandlerFlow', description: 'h', version: '1.0.0',
  steps: [{ id: 'h', type: 'SAY', value: '[handler]' }] };

// Runs flow `steps`, then one more turn; returns the bracketed markers each turn showed.
async function run(steps) {
  const flow = { id: 'F', name: 'F', description: 'f', version: '1.0.0', primary: true, steps };
  const e = new WorkflowEngine(quiet, null, [flow, handler], tools, APPROVED_FUNCTIONS, {}, false, 'en');
  let s = e.initSession('u', `t-${Math.random()}`);
  s = await e.updateActivity({ role: 'user', content: 'F', timestamp: Date.now() }, s);
  const t1 = String(s.response).match(/\[[^\]]+\]/g) || [];
  s = await e.updateActivity({ role: 'user', content: 'ok', timestamp: Date.now() }, s);
  const t2 = String(s.response).match(/\[[^\]]+\]/g) || [];
  return { t1, t2 };
}
const failing = (onFail, variable = 'r') => ({ id: 't', type: 'CALL-TOOL', tool: 'boom', variable, onFail });

// ── SAY onFail: said immediately, then the flow continues ───────────────────────────────────────
{
  const r = await run([
    failing({ id: 'f', type: 'SAY', value: '[onFail]' }),
    { id: 'a', type: 'SAY', value: '[next]' },
    { id: 'b', type: 'SAY-GET', variable: 'y', value: '[last]' },
  ]);
  eq(r.t1, ['[onFail]', '[next]', '[last]'], 'SAY onFail is said first, in the same turn, then the flow continues');
  eq(r.t2, [], 'and nothing is left over for the next turn');
}

// ── RETURN onFail: ends the flow at the failure ─────────────────────────────────────────────────
{
  const r = await run([
    failing({ id: 'f', type: 'RETURN', value: "'[onFail]'" }),
    { id: 'z', type: 'RETURN', value: "'[default]'" },
  ]);
  eq(r.t1, ['[onFail]'], 'RETURN onFail wins over the flow\'s own later RETURN');
}
{
  const r = await run([
    failing({ id: 'f', type: 'RETURN', value: "'[onFail]'" }),
    { id: 'a', type: 'SAY-GET', variable: 'y', value: '[next]' },
  ]);
  eq(r.t1, ['[onFail]'], 'RETURN onFail ends the flow before any later step speaks');
}

// ── SET onFail: the fallback value is in place before the next step reads it ───────────────────
{
  const r = await run([
    failing({ id: 'f', type: 'SET', variable: 'r', value: 'null' }),
    { id: 'c', type: 'CASE', branches: {
      'condition: !r': { id: 'nf', type: 'SAY-GET', variable: 'y', value: '[failure branch]' },
      default: { id: 'ok', type: 'SAY-GET', variable: 'y', value: '[success branch]' } } },
  ]);
  eq(r.t1, ['[failure branch]'], 'SET onFail runs before the CASE that reads the variable');
}
{
  const r = await run([
    failing({ id: 'f', type: 'SET', variable: 'flag', value: 'cargo.failed = true' }),
    { id: 'c', type: 'CASE', branches: {
      'condition: cargo.failed': { id: 'nf', type: 'SAY-GET', variable: 'y', value: '[flag seen]' },
      default: { id: 'ok', type: 'SAY-GET', variable: 'y', value: '[flag missed]' } } },
  ]);
  eq(r.t1, ['[flag seen]'], 'a SET onFail side effect (cargo flag) is visible to the next step');
}

// ── FLOW onFail: call runs the handler then returns; replace / reboot unchanged ────────────────
{
  const r = await run([
    failing({ id: 'f', type: 'FLOW', value: 'handler-flow', callType: 'call' }),
    { id: 'a', type: 'SAY-GET', variable: 'y', value: '[after]' },
  ]);
  eq(r.t1, ['[handler]', '[after]'], 'FLOW call: the handler (found by value = id) runs, then the flow continues');
}
{
  const r = await run([
    failing({ id: 'f', type: 'FLOW', value: 'HandlerFlow', callType: 'call' }),
    { id: 'a', type: 'SAY-GET', variable: 'y', value: '[after]' },
  ]);
  eq(r.t1, ['[handler]', '[after]'], 'FLOW call: the handler is also found by value = name');
}
for (const ct of ['replace', 'reboot']) {
  const r = await run([
    failing({ id: 'f', type: 'FLOW', value: 'handler-flow', callType: ct }),
    { id: 'a', type: 'SAY-GET', variable: 'y', value: '[after]' },
  ]);
  eq(r.t1, ['[handler]'], `FLOW ${ct}: the handler runs and the failed flow does not resume`);
}

// ── A tool that SUCCEEDS never runs its onFail ──────────────────────────────────────────────────
{
  const r = await run([
    { id: 't', type: 'CALL-TOOL', tool: 'fine', variable: 'r', onFail: { id: 'f', type: 'SAY', value: '[onFail]' } },
    { id: 'a', type: 'SAY-GET', variable: 'y', value: '[next]' },
  ]);
  eq(r.t1, ['[next]'], 'success: onFail never runs');
}

console.log(`onfail-order: ${checks} checks passed`);
