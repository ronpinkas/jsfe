// A voice answer to a digit step (SAY-GET `digits`) that is only digits is taken as heard — never
// sent to the AI voice cleaner.
//
//   npm run build && node tests/voice-digits.test.mjs
//
// The defect this pins (jsfe ≤ 0.9.94; widened in 0.9.96 to any answer whose digit count fits the step): every voice answer went through cleanVoiceInput, whose
// "remove duplication" rule dropped digits from 11 of 40 card numbers spoken in pairs on gpt-4o-mini.
// Prod 2026-10-09: a caller said a valid 16-digit card three times; each was refused as invalid.
//
// Hermetic: the aiCallback is a stub that mangles whatever it is given and counts its calls.
import assert from 'node:assert/strict';
import { WorkflowEngine } from '../dist/index.js';

let checks = 0;
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };

const quiet = { info() {}, debug() {}, warn() {}, error() {} };

async function answer(step, said, voice = true, variables = undefined) {
  let cleanerCalls = 0;
  const aiCallback = async (systemInstruction) => {
    if (/voice input cleaner/.test(systemInstruction)) {
      cleanerCalls++;
      return 'MANGLED';
    } else {
      return '{"flowName":"F"}';
    }
  };
  const flow = { id: 'F', name: 'F', description: 'f', version: '1.0.0', primary: true,
    ...(variables ? { variables } : {}),
    steps: [step, { id: 'show', type: 'SAY', value: '[{{x}}]' }] };
  const e = new WorkflowEngine(quiet, aiCallback, [flow], [], {}, {}, false, 'en');
  let s = e.initSession('u', `t-${Math.random()}`);
  s.cargo = { ...(s.cargo || {}), voice };
  s = await e.updateActivity({ role: 'user', content: 'F', timestamp: Date.now() }, s);
  s = await e.updateActivity({ role: 'user', content: said, timestamp: Date.now() }, s);
  const shown = (String(s.response).match(/\[([^\]]*)\]/) || [])[1];
  return { shown, cleanerCalls };
}

const digitStep = { id: 'ask', type: 'SAY-GET', variable: 'x', value: 'Your card number?', digits: { min: 13, max: 19 } };

// ── digits spoken in groups: taken as heard, separators removed, no AI call ──
{
  const r = await answer(digitStep, '41 34 18 73 33 57 41 80');
  eq(r.shown, '4134187333574180', 'the digits as heard, groups joined');
  eq(r.cleanerCalls, 0, 'the AI cleaner is not called for a digits-only answer');
}
{
  const r = await answer(digitStep, '4134-1873 3357.4180');
  eq(r.shown, '4134187333574180', 'dashes, dots and spaces between groups are removed');
}

// ── words around digits whose count fits the step: still taken as heard (prod 2026-10-09: "es 4…") ──
{
  const r = await answer(digitStep, 'es 41 34 18 73 33 57 41 80');
  eq(r.shown, '4134187333574180', 'a lead-in word does not send a fitting number to the cleaner');
  eq(r.cleanerCalls, 0, 'no AI call for "es" + a 16-digit card');
}
{
  const r = await answer({ id: 'ask', type: 'SAY-GET', variable: 'x', value: 'Your code?', digits: { min: 6, max: 6 } }, 'mi código es 1 2 3 4 5 6');
  eq(r.shown, '123456', 'a code said digit by digit after a phrase is taken as heard');
  eq(r.cleanerCalls, 0, 'no AI call for a fitting code');
}

// ── a digit count outside the range goes to the cleaner (a number said twice is its job) ──
{
  const r = await answer(digitStep, '4134 1873 3357 4180, 4134 1873 3357 4180');
  eq(r.cleanerCalls, 1, '32 digits on a 13-19 step: the cleaner judges it');
}
{
  const r = await answer({ id: 'ask', type: 'SAY-GET', variable: 'x', value: 'Phone or email?', digits: { min: 7, max: 12 } }, 'maria 1985 garcia at yahoo dot com');
  eq(r.cleanerCalls, 1, 'an email whose 4 digits do not fit a 7-12 step goes to the cleaner');
}

// ── a one-key menu step ──
{
  const menu = { id: 'ask', type: 'SAY-GET', variable: 'x', value: 'Press 1 or say NEW CARD', digits: { min: 1, max: 1 } };
  const r = await answer(menu, 'option 2');
  eq(r.shown, '2', 'a spoken key is taken as heard');
  eq(r.cleanerCalls, 0, 'no AI call for it');
  eq((await answer(menu, 'nueva tarjeta')).cleanerCalls, 1, 'a menu word still goes to the cleaner');
}

// ── a word on a digit step still goes to the cleaner (the flow matches "agent", "back", …) ──
{
  const r = await answer(digitStep, 'agent please');
  eq(r.cleanerCalls, 1, 'a non-digit answer is still cleaned');
}

// ── a step without `digits` is unchanged: the cleaner still runs on digits ──
{
  const r = await answer({ id: 'ask', type: 'SAY-GET', variable: 'x', value: 'Anything else?' }, '12 34');
  eq(r.cleanerCalls, 1, 'a step without digits still uses the cleaner');
}

// ── text channel: no cleanup at all, as before ──
{
  const r = await answer(digitStep, '41 34 18 73 33 57 41 80', false);
  eq(r.cleanerCalls, 0, 'no cleanup off voice');
}

// ── asSpoken (opt-in, any SAY-GET): the answer is kept as heard; the default is unchanged ──
{
  // with a digit range: an amount keeps its unit and decimals instead of being reduced to its digits
  const amount = { id: 'ask', type: 'SAY-GET', variable: 'x', value: 'Say the amount', digits: { min: 1, max: 7 }, asSpoken: true };
  for (const said of ['$1.', '1 dollar', '$12.50', '235.90']) {
    const r = await answer(amount, said);
    eq(r.shown, said, `asSpoken: "${said}" kept as spoken`);
    eq(r.cleanerCalls, 0, `asSpoken: "${said}" never sent to the AI cleaner`);
  }
  const plain = { id: 'ask', type: 'SAY-GET', variable: 'x', value: 'Say the amount', digits: { min: 1, max: 7 } };
  eq((await answer(plain, '$12.50')).shown, '1250', 'without asSpoken a fitting answer is still reduced to its digits (default unchanged)');
  eq((await answer(amount, '$1.', false)).shown, '$1.', 'text: kept as typed, as always');

  // without a digit range: any input is kept as heard, never cleaned
  const free = { id: 'ask', type: 'SAY-GET', variable: 'x', value: 'Your name?', asSpoken: true };
  let r = await answer(free, 'um it is Ron');
  eq([r.shown, r.cleanerCalls], ['um it is Ron', 0], 'asSpoken on a free answer: kept as heard, no AI cleanup');
  r = await answer({ ...free, asSpoken: undefined }, 'um it is Ron');
  eq([r.shown, r.cleanerCalls], ['MANGLED', 1], 'without asSpoken a free answer is still cleaned (default unchanged)');

  // a condition on the flow's variables: a worker switches it with a parameter
  const cond = { ...amount, asSpoken: 'wantSpoken === true' };
  r = await answer(cond, '$1.', true, { wantSpoken: { type: 'boolean', value: true } });
  eq([r.shown, r.cleanerCalls], ['$1.', 0], 'asSpoken condition true: kept as spoken');
  r = await answer(cond, '$1.', true, { wantSpoken: { type: 'boolean', value: false } });
  eq(r.shown, '1', 'asSpoken condition false: reduced to its digits as before');
  r = await answer({ ...amount, asSpoken: false }, '$1.');
  eq(r.shown, '1', 'asSpoken: false is the default');
}

console.log(`voice-digits: ${checks} checks passed`);
