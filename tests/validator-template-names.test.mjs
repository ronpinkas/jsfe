// The validator's undefined-variable check reads template expressions — `{{ ... }}` — correctly.
//
//   npm run build && node tests/validator-template-names.test.mjs
//
// Before this, an expression containing `||` was split on `||` and `.` only, so `String(cargo.x || '')` reported a
// variable named "String(cargo"; words inside string literals ('…/forgot-password', '\n2.') were variables; only
// Math., JSON., Date. and Object. were known built-ins; and a flow's own declared parameters were not in scope.
// On Curacao's flows (system + make-payment) that was 44 of 115 distinct findings, every one false. Pinned here:
// what templateExpressionNames returns, and that a flow using these forms validates clean while a real undefined
// variable is still reported.
import assert from 'node:assert/strict';
import { WorkflowEngine, templateExpressionNames } from '../dist/index.js';

let checks = 0;
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };

// ── templateExpressionNames ─────────────────────────────────────────────────────────────────────────────────────
eq(templateExpressionNames("String(cargo.accountNumber || '').slice(-4).split('').join(', ')"), ['cargo'], 'a built-in wrapping a path');
eq(templateExpressionNames("typeof note !== 'undefined' && note === 'x' ? 'a: b. ' : (cargo.v ? 'p' : 'e')"), ['note', 'cargo'], 'typeof guard, ternaries, punctuation inside strings');
eq(templateExpressionNames("x === 'u' ? 'see https://myaccount.icuracao.com/forgot-username' : '\\n2. Connect me'"), ['x'], 'words inside string literals are not variables');
eq(templateExpressionNames("amountToSpeech(parseFloat(cargo.total || '0'), 'en', cargo.voice)"), ['amountToSpeech', 'cargo'], 'functions in scope are names; JS globals are not');
eq(templateExpressionNames("(cargo.subs || []).reduce(function(a, s) { return a + s.balance; }, 0)"), ['cargo'], 'a function\'s own parameters are local');
eq(templateExpressionNames("cargo.list.map(x => x.id).join(', ')"), ['cargo'], 'an arrow function\'s parameter is local');
eq(templateExpressionNames("(function() { var n = cargo.a; return n + b; })()"), ['cargo', 'b'], 'var declarations are local');
eq(templateExpressionNames("{ dob: x, ssn: '' }"), ['x'], 'object keys are not variables');
eq(templateExpressionNames("cargo.a ? b : c"), ['cargo', 'b', 'c'], 'ternary branches ARE variables');
eq(templateExpressionNames("/^5\\d{6,7}$/.test(d) ? d : ''"), ['d'], 'regex literals are not read as code');
eq(templateExpressionNames("Math.max(a, b) + Number(c)"), ['a', 'b', 'c'], 'Math / Number are built-ins');

// ── a flow using those forms validates clean; a real undefined name is still reported ──────────────────────────
const quiet = { debug() {}, info() {}, warn() {}, error() {} };
const flows = [{
   id: 'probe', name: 'Probe', version: '1.0.0', description: 'validator probe',
   parameters: [{ name: 'note', type: 'string', description: 'optional', required: false }],
   variables: { v: { type: 'string', value: '' } },
   steps: [
      { id: 's1', type: 'SAY', value: "Ending in {{String(cargo.accountNumber || '').slice(-4)}}." },
      { id: 's2', type: 'SAY', value: "{{typeof note !== 'undefined' && note === 'x' ? 'Noted. ' : ''}}Go to https://example.com/a-b" },
      { id: 's3', type: 'SAY', value: "{{language === 'es' ? 'Hola' : 'Hi'}}" },
      { id: 's4', type: 'SAY', value: '{{v || nowhere}}' },
   ],
}];
const engine = new WorkflowEngine(quiet, async () => '{}', flows, [], {}, {});
const errors = (engine.validateAllFlows({}).flowResults || []).flatMap((r) => r.errors || []).filter((e) => /undefined variable/.test(e));
eq(errors.length, 1, `only the real undefined name is reported (${JSON.stringify(errors)})`);
eq(/: nowhere \(/.test(errors[0]), true, 'and it is `nowhere`');

console.log(`validator-template-names: ${checks} checks passed`);
