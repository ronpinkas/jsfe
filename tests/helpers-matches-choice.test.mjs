// jsfe/helpers matches-choice.js — flow CASE option matching.
//   node tests/helpers-matches-choice.test.mjs
import assert from 'node:assert/strict';
import { matchesChoice } from '../dist/helpers/matches-choice.js';

let checks = 0;
const is = (input, choices, expected, what) => { assert.equal(matchesChoice(input, choices), expected, `${what}: ${JSON.stringify(input)}`); checks++; };
const YES = ['yes', 'sure', 'ok', 'okay', 'si', 'sí', 'por favor', 'correo electrónico', 'correo'];

// The original contract: whole words and consecutive runs, never substrings.
is('yes', YES, true, 'a single word');
is('Sí, por favor.', YES, true, 'punctuation separates words');
is('esto es imposible', YES, false, "'si' inside 'imposible' is not 'si'");
is('así', YES, false, "'si' inside 'así' is not 'si'");
is('mi correo electrónico', YES, true, 'a multi-word option as a run');
is('electrónico correo', ['correo electrónico'], false, 'a multi-word option out of order');
is('', YES, false, 'empty input');
is('yes', 'yes', false, 'choices must be an array');

// Elongation is forgiven (2026-10-01): a repeated vowel, or any letter typed 3+ times.
is('Sii', YES, true, 'a doubled vowel — the prod dead end');
is('siiiii', YES, true, 'a long vowel run');
is('yesss', YES, true, 'a letter typed 3+ times');
is('No me ayudó en nadaaaa', ['nada', 'nothing'], true, 'inside a sentence');
is('okk', YES, false, 'a doubled consonant is spelling, not elongation');

// …and never creates a match the measurement found wrong.
is('servicio al cliente', ['all', 'todas', 'todo'], false, "'al' never becomes 'all'");
is("I'm waiting for the code", ['um', 'mm', 'hmm'], false, "\"I'm\" never becomes a filler");
is('a mess', ['2', 'month', 'mes'], false, "\"mess\" never becomes Spanish 'mes'");
is('Meadows Mall', ['no', 'wrong', 'mal'], false, "\"Mall\" never becomes 'mal'");
is('correo', YES, true, 'an option with a doubled letter still matches itself');
is('coreo', YES, false, 'an option with a doubled letter needs it typed');

// A keypad key (one digit, * or #) is the WHOLE answer or nothing (owner rule): dev 2026-10-14, "I made payments by 1,"
// at "press 1 to pay" charged the full amount due.
is('1', ['1'], true, 'a bare key');
is(' 1. ', ['1'], true, 'a key with the punctuation ASR adds');
is('#', ['#'], true, 'the pound key');
is('*', ['*'], true, 'the star key');
is('I made payments by 1,', ['1'], false, 'a digit inside a sentence is never the key');
is('press 1', ['1'], false, '"press 1" is not the key press');
is('No, 1', ['1'], false, 'a key after other words is not the key');
is('11', ['1'], false, 'two digits are not the key 1');
is('I want #', ['#'], false, 'a key inside a sentence');
is('my card 4242', ['4242'], true, 'a longer number still matches as a word');

console.log(`matches-choice: ${checks} checks passed`);
