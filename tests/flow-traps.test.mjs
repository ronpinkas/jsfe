// The flow-trap check reports real traps only, as errors (owner 2026-11-01). A toParent REPLACE of a replaceTarget flow
// returns to its waiting frame, so restarts do not grow the stack.
//
//   npm run build && node tests/flow-traps.test.mjs
import assert from 'node:assert/strict';
import { WorkflowEngine } from '../dist/index.js';
import { findFlowTraps } from '../dist/forms/flow-traps.js';

const flow = (id, targets = [], extra = {}) => ({ id, name: id, version: '1', description: id, ...extra,
   steps: [...targets.map(([value, callType, more], i) => ({ id: `s${i}`, type: 'FLOW', value, callType, ...more })), { id: 'ask', type: 'SAY-GET', variable: 'a', value: 'q' }] });
const noQuestion = (id, targets) => ({ id, name: id, version: '1', description: id, steps: targets.map(([value, callType], i) => ({ id: `s${i}`, type: 'FLOW', value, callType })) });
const kinds = (flows) => findFlowTraps(flows).map((trap) => `${trap.kind}:${trap.flows.join('+')}`);
const cases = [
   ['diamond', [flow('a', [['b', 'call'], ['c', 'call']]), flow('b'), flow('c', [['b', 'call']])], []],
   ['call cycle', [flow('a', [['b', 'call']]), flow('b', [['a', 'call']])], ['stack_growth:a+b']],
   ['call then replace back', [flow('a', [['b', 'call']]), flow('b', [['a', 'replace']])], ['stack_growth:a+b']],
   ['self call', [flow('a', [['a', 'call']])], ['stack_growth:a']],
   ['self replace with a question', [flow('a', [['a', 'replace']])], []],
   ['self replace with no question', [noQuestion('a', [['a', 'replace']])], ['spin:a']],
   ['replace loop with a question', [flow('a', [['b', 'replace']]), flow('b', [['a', 'replace']])], []],
   ['replace loop with no question', [noQuestion('a', [['b', 'replace']]), noQuestion('b', [['a', 'replace']])], ['spin:a+b']],
   ['reboot clears the stack', [flow('a', [['b', 'call']]), flow('b', [['a', 'reboot']])], []],
   ['toParent REPLACE of a replaceTarget returns to its frame', [flow('a', [['b', 'call']], { replaceTarget: true }), flow('b', [['a', 'replace', { toParent: true }]])], []],
   ['toParent REPLACE of a replaceTarget with no question spins', [{ ...noQuestion('a', [['b', 'call']]), replaceTarget: true }, { ...noQuestion('b', []), steps: [{ id: 's0', type: 'FLOW', value: 'a', callType: 'replace', toParent: true }] }], ['spin:a+b']],
   ['a local REPLACE of a replaceTarget still stacks', [flow('a', [['b', 'call']], { replaceTarget: true }), flow('b', [['a', 'replace']])], ['stack_growth:a+b']],
   ['toParent of an unmarked flow still stacks', [flow('a', [['b', 'call']]), flow('b', [['a', 'replace', { toParent: true }]])], ['stack_growth:a+b']],
   ['a declared bound', [flow('a', [['b', 'call']], { loopBound: 'once per form' }), flow('b', [['a', 'call']])], []],
   ['a callback in a form input', [{ ...flow('a'), inputs: [{ name: 'x', profile: { kind: 'text' }, after: 'b' }] }, flow('b', [['a', 'call']])], ['stack_growth:a+b']],
   ['a shared worker is not a loop', [flow('a', [['run-form', 'call']]), flow('b', [['run-form', 'call']]), flow('run-form', [['a', 'call'], ['b', 'call']])], []],
];
for (const [name, flows, expected] of cases) assert.deepEqual(kinds(flows), expected, name);

// A trap is a validator ERROR, once, whichever primary reaches it; a set with none has no cycle line at all.
const quiet = { debug() {}, info() {}, warn() {}, error() {} };
const engine = new WorkflowEngine(quiet, async () => 'None', [flow('a', [['b', 'call']], { primary: true }), flow('b', [['a', 'call']])], [], {}, {}, false);
const report = engine.validateAllFlows({ deep: true, checkCircularRefs: true, checkVariables: false, validateTools: false });
assert.equal(report.summary.errors.filter((line) => /Flow trap/.test(line)).length, 1);
assert.equal(report.summary.warnings.filter((line) => /ircular/.test(line)).length, 0);

// A chain longer than the old depth limit is not an error.
const chain = Array.from({ length: 30 }, (_, i) => flow(`n${i}`, i < 29 ? [[`n${i + 1}`, 'call']] : [], i ? {} : { primary: true }));
const long = new WorkflowEngine(quiet, async () => 'None', chain, [], {}, {}, false).validateAllFlows({ deep: true, checkCircularRefs: true, checkVariables: false, validateTools: false });
assert.deepEqual(long.summary.errors.filter((line) => /depth|Flow trap/.test(line)), []);

// The engine: both toParent and replaceTarget return to the waiting frame; either alone is a local REPLACE.
async function laps(marked, toParent) {
   const parent = { id: 'parent', name: 'Parent', version: '1', description: 'parent', ...(marked ? { replaceTarget: true } : {}),
      steps: [{ id: 'p_child', type: 'FLOW', value: 'child', callType: 'call' }] };
   const child = { id: 'child', name: 'Child', version: '1', description: 'child',
      steps: [{ id: 'c_ask', type: 'SAY-GET', variable: 'answer', value: 'again?' }, { id: 'c_back', type: 'FLOW', value: 'parent', callType: 'replace', ...(toParent ? { toParent: true } : {}) }] };
   const outer = { id: 'outer', name: 'Outer', version: '1', description: 'outer', steps: [{ id: 'o_parent', type: 'FLOW', value: 'parent', callType: 'call' }] };
   const e = new WorkflowEngine(quiet, async () => JSON.stringify({ flowName: 'None', parameters: {} }), [outer, parent, child], [], {}, {}, false);
   let session = e.initSession('fixture', crypto.randomUUID(), 'en');
   session = await e.updateActivity({ role: 'user', content: 'go', start: { flow: 'outer' } }, session);
   const depths = [];
   for (let i = 0; i < 4; i++) { session = await e.updateActivity({ role: 'user', content: 'x' }, session); depths.push(session.flowStacks.at(-1).map((f) => f.flowId).join('>')); }
   return depths;
}
assert.deepEqual(await laps(true, true), Array(4).fill('outer>parent>child'), 'both: flat');
assert.deepEqual((await laps(true, false)).map((path) => path.split('>').length), [4, 5, 6, 7], 'the parent marks, the step does not ask: a local replace');
assert.deepEqual((await laps(false, true)).map((path) => path.split('>').length), [4, 5, 6, 7], 'the step asks, the parent does not mark: a local replace');
console.log('flow-traps: all checks passed');
process.exit(0);
