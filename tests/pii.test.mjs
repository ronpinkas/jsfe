// SAY-GET `pii` (jsfe ≥ 1.3.5): the answer is sensitive (a card's security code). While the question waits, its
// frame carries pendingVariablePii so the host can keep the next input out of its logs, and every engine log line of
// the turn that processes the answer has it replaced by •••. Nothing about how the answer is stored or used changes.
//
//   npm run build && node tests/pii.test.mjs
import assert from 'node:assert/strict';
import { WorkflowEngine } from '../dist/index.js';

let checks = 0;
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; console.log(`PASS  ${what}`); };

async function run(step, said, variables) {
  const lines = [];
  const log = (...a) => lines.push(a.map(String).join(' '));
  const logger = { info: log, debug: log, warn: log, error: log };
  const flow = { id: 'F', name: 'F', description: 'f', version: '1.0.0', primary: true, ...(variables ? { variables } : {}),
    steps: [step, { id: 'show', type: 'SAY', value: '[{{x}}]' }] };
  const e = new WorkflowEngine(logger, async () => '{"flowName":"F"}', [flow], [], {}, {}, false, 'en');
  let s = e.initSession('u', `t-${Math.random()}`);
  s = await e.updateActivity({ role: 'user', content: 'F', timestamp: Date.now() }, s);
  const frame = () => (s.flowStacks || []).flat().slice(-1)[0];
  const waiting = frame() ? frame().pendingVariablePii === true : false;
  lines.length = 0;
  s = await e.updateActivity({ role: 'user', content: said, timestamp: Date.now() }, s);
  return { waiting, shown: (String(s.response).match(/\[([^\]]*)\]/) || [])[1], logged: lines.join('\n'), after: frame() ? frame().pendingVariablePii : undefined };
}

{
  const r = await run({ id: 'ask', type: 'SAY-GET', variable: 'x', value: 'Security code?', pii: true }, '646');
  eq(r.waiting, true, 'pii: true — the waiting frame carries pendingVariablePii');
  eq(r.shown, '646', 'the answer is stored and used as usual');
  eq(/Stored sanitized user input in variable 'x': \(pii, not logged\)/.test(r.logged), true, 'the engine logs that it stored it');
  eq(/(?<!\d)646(?!\d)/.test(r.logged), false, 'the answer appears in no engine log line of its turn (it is echoed in a dozen trace lines)');
  eq(/•••/.test(r.logged), true, 'it is replaced by •••');
}
{
  const r = await run({ id: 'ask', type: 'SAY-GET', variable: 'x', value: 'Security code?', pii: 'kind === "cvv"' }, '646', { kind: { type: 'string', value: 'cvv' } });
  eq(r.waiting, true, 'pii as a condition on the flow variables: true');
}
{
  const r = await run({ id: 'ask', type: 'SAY-GET', variable: 'x', value: 'Zip?', pii: 'kind === "cvv"' }, '91304', { kind: { type: 'string', value: 'zip' } });
  eq(r.waiting, false, 'pii as a condition: false');
  eq(/"91304"/.test(r.logged), true, 'no pii: the value is logged as before');
}
{
  const r = await run({ id: 'ask', type: 'SAY-GET', variable: 'x', value: 'Name?' }, 'Ron');
  eq(r.waiting, false, 'no attribute: no flag');
}
console.log(`\npii: ${checks} checks passed`);
