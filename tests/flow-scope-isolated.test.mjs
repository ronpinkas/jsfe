// FlowDefinition.scope 'isolated': a called flow starts with only its declared variables and the parameters actually
// passed (an omitted parameter is undefined — never the caller's or a previous call's value), its variables never reach
// the caller, and both hold across a turn boundary (the session is serialized and restored between turns). The default
// 'shared' scope is unchanged.
//
//   npm run build && node tests/flow-scope-isolated.test.mjs
import assert from 'node:assert/strict';
import { WorkflowEngine } from '../dist/index.js';

let checks = 0;
const quiet = { debug() {}, info() {}, warn() {}, error() {} };
const child = (id, scope) => ({ id, name: id, version: '1', description: 'worker', ...(scope ? { scope } : {}),
   parameters: [{ name: 'opt', type: 'string', description: 'optional' }], variables: { mine: { type: 'string', value: 'fresh' } },
   steps: [
      { id: `${id}_read`, type: 'SET', variable: 'mine', value: "typeof opt !== 'undefined' ? opt : 'UNDEF'" },
      { id: `${id}_ask`, type: 'SAY-GET', variable: 'answer', value: `${id} opt={{mine}}` },
      { id: `${id}_say`, type: 'SAY', value: `${id} answered {{answer}}` },
   ] });
const parent = (id, target) => ({ id, name: id, version: '1', description: 'caller', variables: { opt: { type: 'string', value: 'PARENT' } }, steps: [
   { id: `${id}_1`, type: 'FLOW', value: target, callType: 'call', parameters: { opt: 'first' } },
   { id: `${id}_2`, type: 'FLOW', value: target, callType: 'call' },
   { id: `${id}_3`, type: 'SAY', value: "caller opt={{opt}} mine={{typeof mine !== 'undefined' ? mine : 'UNDEF'}} answer={{typeof answer !== 'undefined' ? answer : 'UNDEF'}}" },
] });
const flows = [child('iso', 'isolated'), child('shared'), parent('UsesIso', 'iso'), parent('UsesShared', 'shared')];
const engine = new WorkflowEngine(quiet, async (s, u, schema) => (schema ? JSON.stringify({ flowName: 'None', parameters: {} }) : u), flows, [], {}, {}, false, 'en', 3000);
engine.disableCommands();
const turn = async (session, text) => JSON.parse(JSON.stringify(await engine.updateActivity({ role: 'user', content: text }, JSON.parse(JSON.stringify(session)))));

let s = engine.initSession('u', 's1', 'en');
s = await turn(s, 'UsesIso');
assert.match(s.response, /iso opt=first/); checks++;
s = await turn(s, 'one');
assert.match(s.response, /iso opt=UNDEF/, 'second call, no opt passed: undefined (not the first call\'s value), across a turn boundary'); checks++;
s = await turn(s, 'two');
assert.match(s.response, /caller opt=PARENT mine=UNDEF answer=UNDEF/, 'the worker\'s parameters and variables never reach the caller'); checks++;

s = engine.initSession('u', 's2', 'en');
s = await turn(s, 'UsesShared');
s = await turn(s, 'one');
assert.match(s.response, /shared opt=first/, 'default scope unchanged: an omitted parameter still inherits'); checks++;
s = await turn(s, 'two');
assert.match(s.response, /caller opt=first mine=first answer=two/, 'default scope unchanged: variables are shared with the caller'); checks++;

const errors = (engine.validateAllFlows({}).flowResults || []).flatMap((r) => r.errors || []);
assert.equal(errors.filter((e) => /scope/.test(e)).length, 0, `the validator accepts scope (${JSON.stringify(errors)})`); checks++;
console.log(`flow-scope-isolated: ${checks} checks passed`);
