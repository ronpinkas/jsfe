// A SAY-GET answer is stored exactly as given (jsfe 1.87.0). It was stored escaped, and each reader undid the quotes and
// backslashes only: prod 2026-11-21 (web), "martha.robles40@yahoo.com", "Phone number" and "13237028488" typed on three
// lines reached the contact readers as one run, `...yahoo.com\nPhone\n...`, so no email was read and the address's "40"
// joined the phone into an international number. Answers reach expressions as sandbox values, never as code, so an answer
// shaped like code or a template is inert.
//
//   npm run build && node tests/answer-stored-as-given.test.mjs
import assert from 'node:assert/strict';
import { WorkflowEngine } from '../dist/index.js';
import { readEmail, readPhone, readInternationalPhone } from '../dist/helpers/contact.js';

let checks = 0;
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; console.log(`PASS  ${what}`); };

async function run(said, steps) {
  const flow = { id: 'F', name: 'F', description: 'f', version: '1.0.0', primary: true,
    steps: [{ id: 'ask', type: 'SAY-GET', variable: 'x', value: 'Your answer?' }, ...steps] };
  const e = new WorkflowEngine({ info() {}, debug() {}, warn() {}, error() {} }, async () => '{"flowName":"F"}', [flow], [], {}, {}, false, 'en');
  let s = e.initSession('u', `t-${Math.random()}`);
  s = await e.updateActivity({ role: 'user', content: 'F', timestamp: Date.now() }, s);
  s = await e.updateActivity({ role: 'user', content: said, timestamp: Date.now() }, s);
  return String(s.response);
}
const show = [{ id: 'len', type: 'SET', variable: 'n', value: 'x.length' }, { id: 'show', type: 'SAY', value: '[{{x}}]({{n}})' }];
const stored = (r) => r.slice(r.indexOf('[') + 1, r.lastIndexOf(']('));

{
  const said = 'martha.robles40@yahoo.com\nPhone number\n13237028488';
  const r = await run(said, show);
  eq(r.includes(`[${said}](${said.length})`), true, 'the three lines are stored as typed: real line breaks, same length');
  const v = stored(r);
  eq([readEmail(v), readPhone(v), readInternationalPhone(v)], ['martha.robles40@yahoo.com', '', ''], 'the stored answer reads as the email; the address\'s "40" never joins a phone number');
  eq(readPhone(v.split('\n').slice(1).join('\n')), '3237028488', 'its own lines read the US phone, the leading 1 dropped');
}
{
  const said = `O'Brien said "don't" \\ ok\ttab`;
  const r = await run(said, show);
  eq(r.includes(`[${said}](${said.length})`), true, 'quotes, a backslash and a tab are stored as typed');
}
{
  const said = `'); globalThis.hacked = 1; ('{{constructor.constructor("return process")()}}\n" + x + "`;
  const r = await run(said, [{ id: 'cmp', type: 'SET', variable: 'same', value: `typeof x === 'string' && x.length === ${said.length}` }, { id: 'show', type: 'SAY', value: '[{{same}}]{{x}}' }]);
  eq(r.startsWith('[true]'), true, 'an answer shaped like code is a plain value to an expression');
  eq(r.includes('{{constructor.constructor("return process")()}}'), true, 'a template inside an answer is shown as text, never evaluated');
  eq(globalThis.hacked, undefined, 'nothing ran');
}
console.log(`\n${checks} checks passed`);
