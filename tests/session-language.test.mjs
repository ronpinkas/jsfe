// `language` in a flow expression is the SESSION's language — the one that chooses value_<lang>.
//
//   npm run build && node tests/session-language.test.mjs
//
// The defect this pins (jsfe ≤ 0.9.92): expressions read engine.language, which is shared by every
// session an engine serves and never restored from a saved session. A Spanish conversation saw its
// value_es prompts, then an English RETURN built with `language === 'es' ? … : …`.
//
// Hermetic: aiCallback is null (flows match by name).
import assert from 'node:assert/strict';
import { WorkflowEngine } from '../dist/index.js';

let checks = 0;
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };
const quiet = { info() {}, debug() {}, warn() {}, error() {} };
const flow = { id: 'F', name: 'F', description: 'f', version: '1.0.0', primary: true, steps: [
  { id: 'ask', type: 'SAY-GET', variable: 'x', value: '[prompt-en]', value_es: '[prompt-es]' },
  { id: 'ret', type: 'RETURN', value: "language === 'es' ? '[expr-es]' : '[expr-en]'" },
] };
const engine = new WorkflowEngine(quiet, null, [flow], [], {}, {}, false, 'en');
const turn = async (lang) => {
  let s = engine.initSession('u', `t-${Math.random()}`);
  if (lang) s.language = lang;
  s = await engine.updateActivity({ role: 'user', content: 'F', timestamp: Date.now() }, s);
  const first = String(s.response).match(/\[[^\]]+\]/g) || [];
  s = await engine.updateActivity({ role: 'user', content: 'ok', timestamp: Date.now() }, s);
  return [...first, ...(String(s.response).match(/\[[^\]]+\]/g) || [])];
};

eq(await turn('es'), ['[prompt-es]', '[expr-es]'], 'a Spanish session: the expression agrees with the value_es prompt');
eq(await turn(null), ['[prompt-en]', '[expr-en]'], 'a session with no language: the engine default');
eq(await turn('es'), ['[prompt-es]', '[expr-es]'], 'and again after it — nothing leaks between sessions');
console.log(`session-language: ${checks} checks passed`);
