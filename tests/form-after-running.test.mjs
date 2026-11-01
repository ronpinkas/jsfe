// While a field's `after` runs, a reply cannot fill that form's `after` fields (owner 2026-11-01; prod 2026-10-31
// CAb8305a56a6: "pago" at the phone question inside the gate re-filled the case and ran the gate on top of itself, +9 frames).
//
//   npm run build && node tests/form-after-running.test.mjs
import assert from 'node:assert/strict';
import { WorkflowEngine } from '../dist/index.js';
import { formFlow, FLOWS, linkFormSchemas } from '../dist/forms/index.js';
import { STANDARD_FUNCTIONS } from '../dist/helpers/index.js';

const choice = (...keys) => ({ kind: 'choice', choices: keys.map((key) => ({ key, phrases: [key] })) });
const SET = (id, value) => ({ id, type: 'SET', variable: 'noop', value });
function fixture(rank = 'answers') {
   const owner = formFlow({ id: 'owner', name: 'Owner', version: '1', description: 'Owner', inputs: [
      { name: 'kind', label: 'kind', after: 'gate', profile: choice('refund', 'delivery'), question: 'Which kind?' },
      { name: 'plain', label: 'plain', profile: choice('blue', 'green'), question: 'Which color?' },
   ] });
   const child = formFlow({ id: 'child', name: 'Child', version: '1', description: 'Child', parameters: [{ name: 'parent_form', type: 'string' }], inputs: [
      { name: 'code', label: 'code', profile: choice('alpha', 'beta'), question: 'Which code?' },
   ] });
   const gate = { id: 'gate', name: 'Gate', version: '1', description: 'Asks inside a callback', parameters: [{ name: 'form', type: 'string' }, { name: 'input', type: 'string' }, { name: 'value', type: 'string' }],
      steps: [SET('gate_runs', '(cargo.gateRuns = (cargo.gateRuns || 0) + 1, true)'), { id: 'gate_child', type: 'FLOW', value: 'child', callType: 'call', parameters: { parent_form: '{{form}}' } }] };
   const note = { id: 'note', name: 'Note', version: '1', description: 'A callback that only records', parameters: [{ name: 'form', type: 'string' }, { name: 'input', type: 'string' }, { name: 'value', type: 'string' }], steps: [SET('note_runs', '(cargo.noteRuns = (cargo.noteRuns || 0) + 1, true)')] };
   // A callback that only records finishes in its own turn, so its field stays readable from a child's question.
   const closed = formFlow({ id: 'closed', name: 'Closed', version: '1', description: 'Closed', inputs: [
      { name: 'mode', label: 'mode', after: 'note', profile: choice('fast', 'slow'), question: 'Which mode?' },
      { name: 'sub', label: 'sub', form: 'child', question: 'Sub?' },
   ] });
   const flows = linkFormSchemas([...FLOWS, owner, child, gate, note, closed]);
   const engine = new WorkflowEngine({ debug() {}, info() {}, warn() {}, error() {} }, async (...args) => (JSON.stringify(args).includes('rank_reply') ? JSON.stringify({ option: rank, ...(rank === 'answers' ? { fallback: true } : {}) }) : JSON.stringify({ flowName: 'None', parameters: {} })), flows, [], STANDARD_FUNCTIONS, {}, false, 'en');
   let session = engine.initSession('fixture', crypto.randomUUID(), 'en');
   return {
      get session() { return session; },
      depth: () => (session.flowStacks.at(-1) || []).length,
      owner: () => session.cargo.forms[session.cargo.formTasks.owner],
      async say(content, start) { session = JSON.parse(JSON.stringify(await engine.updateActivity({ role: 'user', content, ...(start ? { start: { flow: start === true ? 'owner' : start } } : {}) }, session))); return String(session.lastResponse ?? ''); },
   };
}

const t = fixture();
await t.say('begin', true);
await t.say('refund');
assert.equal(t.session.cargo.gateRuns, 1, 'the answer ran the callback');
assert.equal(t.owner().values.kind, 'refund');
assert.equal(t.owner().afterRunning, true, 'the callback is waiting on its question');
const depth = t.depth();

await t.say('delivery');
assert.equal(t.session.cargo.gateRuns, 1, 'a reply at the callback\'s question does not run the callback again');
assert.equal(t.owner().values.kind, 'refund', 'nor does it change the field that started it');
assert.ok(t.depth() <= depth, `the stack does not grow (${t.depth()} after ${depth})`);

await t.say('blue');
assert.equal(t.owner().values.plain, 'blue', 'a field with no callback is still read out of order');
assert.equal(t.session.cargo.gateRuns, 1);

await t.say('alpha');
assert.equal(t.owner()?.afterRunning, undefined, 'the flag ends with the callback');

// A new request leaves through DISPATCH; the form resumes on re-entry with its field readable again.
const d = fixture('new_request');
await d.say('begin', true);
await d.say('refund');
assert.equal(d.owner().afterRunning, true);
await d.say('delivery');
assert.equal((d.session.flowStacks.at(-1) || []).length, 0, 'DISPATCH unwound the stack');
assert.equal(d.session.cargo.gateRuns, 1);
await d.say('begin', true);
assert.equal(d.owner().afterRunning, undefined, 're-entry clears a flag the unwind left');
assert.equal(d.owner().values.kind, 'refund', 'the form resumes with what it had');

// A callback that finished is not blocked.
const c = fixture();
await c.say('begin', 'closed');
await c.say('fast');
assert.equal(c.session.cargo.noteRuns, 1);
await c.say('slow');
assert.equal(c.session.cargo.noteRuns, 2, 'a finished callback\'s field is still read out of order');
console.log('form-after-running: all checks passed');
process.exit(0);
