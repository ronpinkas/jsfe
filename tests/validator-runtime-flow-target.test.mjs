// A FLOW step whose target is templated ("{{retry_flow}}") is chosen at run time — the engine interpolates it — so
// the validator must not report it as a missing flow, while a literal target that does not exist still is.
//
//   npm run build && node tests/validator-runtime-flow-target.test.mjs
import assert from 'node:assert/strict';
import { WorkflowEngine } from '../dist/index.js';

const quiet = { debug() {}, info() {}, warn() {}, error() {} };
const flows = [
   { id: 'worker', name: 'Worker', version: '1.0.0', description: 'returns into its caller\'s flow',
     parameters: [{ name: 'retry_flow', type: 'string', description: 'where to return', required: false }],
     steps: [{ id: 'back', type: 'FLOW', value: '{{retry_flow}}', callType: 'replace' }] },
   { id: 'caller', name: 'Caller', version: '1.0.0', description: 'uses the worker',
     steps: [{ id: 'go', type: 'FLOW', value: 'worker', callType: 'call', parameters: { retry_flow: 'caller' } },
             { id: 'typo', type: 'FLOW', value: 'no-such-flow', callType: 'call' }] },
];
const engine = new WorkflowEngine(quiet, async () => '{}', flows, [], {}, {});
const errors = (engine.validateAllFlows({}).flowResults || []).flatMap((r) => r.errors || []).filter((e) => /Flow not found/.test(e));
assert.deepEqual([...new Set(errors)], ['Flow not found: no-such-flow'], JSON.stringify(errors));
console.log('validator-runtime-flow-target: 1 check passed');
