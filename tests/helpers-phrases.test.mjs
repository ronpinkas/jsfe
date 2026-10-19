// jsfe/helpers phrases.js — the shared sentences, with the customer's name when known.   node tests/helpers-phrases.test.mjs
import assert from 'node:assert/strict';
import { anythingElse, goodbye, sayName } from '../dist/helpers/phrases.js';

let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, what); checks++; };
eq(anythingElse('en'), 'Is there anything else I can help you with?', 'English, no name');
eq(anythingElse('es', ''), '¿Hay algo más en lo que pueda ayudarle?', 'Spanish, no name');
eq(anythingElse('en', 'RON'), 'Is there anything else I can help you with, Ron?', 'an all-capitals name in title case');
eq(anythingElse('es', 'MARIA JOSÉ'), '¿Hay algo más en lo que pueda ayudarle, Maria José?', 'Spanish, two names, accents');
eq(anythingElse('pt', 'Ron'), 'Is there anything else I can help you with, Ron?', 'a language without one: English');
eq(goodbye('es', 'ANA'), '¡Que tenga un buen día, Ana!', 'goodbye, Spanish');
eq(goodbye('en'), 'Have a great day!', 'goodbye, no name');
eq(sayName("  o'BRIEN  "), "  o'BRIEN  ".trim(), 'mixed case is kept as written');
eq(sayName("O'BRIEN-SMITH"), "O'Brien-Smith", 'apostrophes and hyphens');
eq(sayName(undefined), '', 'no name');
console.log(`phrases: ${checks} checks passed`);
