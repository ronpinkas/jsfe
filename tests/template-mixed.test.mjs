// A template that starts with '{{' and ends with '}}' but holds several expressions and text between them is rendered
// piece by piece — not evaluated as one expression (which produced "[error: …]"). A true single expression still keeps
// its type, and an IIFE's own '}}' does not split it.
//
//   npm run build && node tests/template-mixed.test.mjs
import assert from 'node:assert/strict';
import { WorkflowEngine } from '../dist/index.js';

let checks = 0;
const quiet = { debug() {}, info() {}, warn() {}, error() {} };
const say = async (value, cargo = {}) => {
   const flows = [{ id: 'p', name: 'P', version: '1', description: 'probe', steps: [{ id: 's', type: 'SAY', value }] }];
   const e = new WorkflowEngine(quiet, async () => JSON.stringify({ flowName: 'P', parameters: {} }), flows, [], {}, {}, false, 'en', 3000);
   e.disableCommands();
   let s = e.initSession('u', 's', 'en');
   Object.assign(s.cargo, cargo);
   s = await e.updateActivity({ role: 'user', content: 'P' }, s);
   return String(s.response);
};
assert.equal(await say("{{cargo.n ? 'Hi ' + cargo.n : 'Hi'}}, your total is {{cargo.t}}.{{cargo.x ? ' Extra.' : ''}}", { n: 'Ron', t: 5, x: true }), 'Hi Ron, your total is 5. Extra.'); checks++;
assert.equal(await say('{{cargo.street}}, {{cargo.city}}', { street: '1 Main', city: 'LA' }), '1 Main, LA'); checks++;
assert.equal(await say("{{(function() { var o = { a: { b: 2 }}; return o.a.b; })()}}"), '2', 'an IIFE with its own }} is still one expression'); checks++;
console.log(`template-mixed: ${checks} checks passed`);
