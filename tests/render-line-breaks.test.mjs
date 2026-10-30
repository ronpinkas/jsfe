/** The sentence renderer tidies the gaps a dropped value leaves, horizontally only: a flow's own line breaks are layout and pass through (prod 2026-10-29: a product list's blank lines became spaces). */
import assert from 'node:assert/strict';
import {FLOWS} from '../dist/forms/index.js';

const step = FLOWS.flatMap((f) => f.steps || []).find((s) => s.id === 'af_say_en');
assert.ok(step, 'answer-facts renders through RENDER_JS');
const source = /^\(function \(\) \{ ([\s\S]*?) var src = /.exec(step.value)[1];
const fill = new Function('amountToSpeech', 'cargo', `${source}; return fill;`)((v) => String(v), {});

assert.equal(fill('Your balance is {b}. [Due {d}.]', { b: '$10' }, null, 'en', {}), 'Your balance is $10.', 'a dropped part leaves no gap');
assert.equal(fill('Hello  [{n}] , welcome', {}, null, 'en', {}), 'Hello, welcome', 'doubled spaces and a space before punctuation are tidied');
assert.equal(fill('Found 2.\n1. A\nhttps://a\n\n2. B', {}, null, 'en', {}), 'Found 2.\n1. A\nhttps://a\n\n2. B', 'line breaks and blank lines are kept');
assert.equal(fill('List:{x}\n\n{y}', { x: ' one', y: 'two' }, null, 'en', {}), 'List: one\n\ntwo', 'a blank line between filled values is kept');
console.log('render line breaks: ok');
