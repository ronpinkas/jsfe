// `wraps` — a tenant's thin entry point over a shared flow (applyWraps; owner 2026-10-18).
//
//   npm run build && node tests/wraps.test.mjs
//
// The contract pinned here:
// - The wrapped flow is no longer primary (intent detection does not offer it) and stays callable as a worker.
// - The wrapper takes the wrapped flow's description, parameters, prompts and primary flag unless it declares its own.
// - The host's flow objects are not changed; a menu without `wraps` is returned as given.
// - A `wraps` naming no flow is logged and ignored.
// - At runtime the wrapper runs first and can call the wrapped flow with arguments of its own.
//
// Hermetic: aiCallback is null, so intent detection matches a flow by its exact name or id.
import assert from 'node:assert/strict';
import { WorkflowEngine, applyWraps } from '../dist/index.js';

let checks = 0;
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };
const ok = (v, what) => { assert.ok(v, what); checks++; };
const warns = [];
const quiet = { info() {}, debug() {}, warn(...a) { warns.push(a.join(' ')); }, error() {} };

const shared = { id: 'shared-track', name: 'SharedTrack', version: '1.0.0', primary: true, prompt: 'track order', prompt_es: 'rastrear pedido',
  description: 'Customer asks about an order.', parameters: [{ name: 'order_number', type: 'string', description: 'An order number.' }, { name: 'caller_name', type: 'string', description: 'Internal: the name for the opening.' }],
  steps: [{ id: 'sh_say', type: 'SAY', value: "{{typeof caller_name !== 'undefined' && caller_name ? caller_name + ', h' : 'H'}}ere is order {{typeof order_number !== 'undefined' && order_number ? order_number : '(none)'}}." }] };
const wrapper = { id: 'tenant-track', name: 'TenantTrack', version: '1.0.0', wraps: 'shared-track',
  steps: [{ id: 'tw_call', type: 'FLOW', value: 'shared-track', callType: 'call', parameters: { caller_name: 'Sahara', order_number: '{{order_number}}' } }] };
const other = { id: 'other', name: 'Other', version: '1.0.0', primary: true, description: 'Something else.', steps: [{ id: 'o', type: 'SAY', value: 'other' }] };

// ── the menu ──
{
  const menu = [shared, wrapper, other];
  const out = applyWraps(menu);
  const by = (id) => out.find((f) => f.id === id);
  eq(by('shared-track').primary, false, 'the wrapped flow is no longer primary');
  eq(by('tenant-track').primary, true, 'the wrapper takes its primary flag');
  eq(by('tenant-track').description, shared.description, 'and its description');
  eq(by('tenant-track').parameters, shared.parameters, 'and its parameters');
  eq([by('tenant-track').prompt, by('tenant-track').prompt_es], ['track order', 'rastrear pedido'], 'and its prompts');
  eq(by('other').primary, true, 'other flows are untouched');
  eq([shared.primary, wrapper.description], [true, undefined], 'the host\'s objects are not changed');
  const plain = [shared, other];
  ok(applyWraps(plain) === plain, 'a menu without wraps is returned as given');
  const own = applyWraps([shared, { ...wrapper, description: 'Own words.', primary: true }]).find((f) => f.id === 'tenant-track');
  eq(own.description, 'Own words.', 'a wrapper\'s own description stands');
  const dangling = applyWraps([other, { ...wrapper, wraps: 'missing' }]);
  eq(dangling.find((f) => f.id === 'other').primary, true, 'a wraps naming no flow changes nothing');
}

// ── at runtime ──
{
  warns.length = 0;
  const e = new WorkflowEngine(quiet, null, [shared, wrapper, other], [], {}, {}, false, 'en');
  eq(e.flowsMenu.filter((f) => f.primary === true).map((f) => f.id).sort(), ['other', 'tenant-track'], 'intent detection is offered the wrapper, not the wrapped flow');
  let s = e.initSession('u', `t-${Math.random()}`);
  s = await e.updateActivity({ role: 'user', content: 'TenantTrack', timestamp: Date.now() }, s);
  eq(String(s.response || '').trim(), 'Sahara, here is order (none).', 'the wrapper runs and calls the wrapped flow with its own argument');
  s = e.initSession('u', `t-${Math.random()}`);
  s = await e.updateActivity({ role: 'user', content: 'SharedTrack', timestamp: Date.now() }, s);
  eq(String(s.response || '').trim(), 'Here is order (none).', 'the wrapped flow is still callable by name, as a worker');
  new WorkflowEngine(quiet, null, [other, { ...wrapper, wraps: 'missing' }], [], {}, {}, false, 'en');
  ok(warns.some((w) => /wraps "missing", which is not in the flows menu/.test(w)), 'a dangling wraps is logged');
}

console.log(`wraps: ${checks} checks passed`);
