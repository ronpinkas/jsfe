// A SAY-GET's `digits` may take values from the flow's variables: a string holding a {{path}} is filled like a FLOW
// parameter, so a generic step can take e.g. the `complete` shapes its caller passed. A step without templates is
// passed to cargo.digits exactly as before (the same object).
//
//   npm run build && node tests/digits-templates.test.mjs
//
// Hermetic: aiCallback is null (flows match by name).
import assert from 'node:assert/strict';
import { WorkflowEngine } from '../dist/index.js';

let checks = 0;
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };
const quiet = { info() {}, debug() {}, warn() {}, error() {} };
const SHAPES = [{ first: '5', lengths: [7, 8] }, { first: '23456789', lengths: [10] }];

async function digitsAtQuestion(digits, variables) {
  const flow = { id: 'F', name: 'F', description: 'f', version: '1.0.0', primary: true, variables,
    steps: [{ id: 'ask', type: 'SAY-GET', variable: 'x', value: 'Number?', digits }] };
  const e = new WorkflowEngine(quiet, null, [flow], [], {}, {}, false, 'en');
  let s = e.initSession('u', `t-${Math.random()}`);
  s = await e.updateActivity({ role: 'user', content: 'F', timestamp: Date.now() }, s);
  return s.cargo.digits;
}

// 1. a template is filled from the flow's variables, keeping the value's type (an array, not a string)
{
  const d = await digitsAtQuestion({ min: 7, max: 12, complete: '{{shapes}}' }, { shapes: { type: 'array', value: SHAPES } });
  eq(d.complete, SHAPES, 'complete is the variable\'s array');
  eq([d.min, d.max], [7, 12], 'the numbers are untouched');
}
// 2. no template: exactly what the step declared
{
  const declared = { min: 6, max: 6, autoSubmitChars: ['1'], autoSubmitMs: 2500 };
  eq(await digitsAtQuestion(declared, undefined), declared, 'a step without templates is passed as declared');
}
// 3. a template naming nothing gives '' (as FLOW parameters do), never the literal braces
{
  const d = await digitsAtQuestion({ min: 7, max: 12, complete: '{{nothing_here}}' }, {});
  eq(d.complete, '', 'an unknown path is empty');
}

console.log(`digits-templates: ${checks} checks passed`);
