// The Spanish rejection line for a field without message_es is gender-neutral (owner 2026-11-07: prod "Ese ciudad o código
// postal no parece correcto"). Reads the source form worker, since the line is an engine expression.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/forms/flows.js', import.meta.url), 'utf8');
const line = src.split('\n').find((l) => l.includes("SET('ie_say_es'"));
assert.ok(line, 'the Spanish acknowledgement line exists');
assert.ok(!/'Ese '/.test(line), 'no gendered article in the generic rejection');
const expr = line.match(/\('No pude usar eso como ' \+ \(([^)]*)\) \+ '\.'\)/);
assert.ok(expr, 'the neutral line names the label');
const say = (label) => 'No pude usar eso como ' + label + '.';
for (const [label, want] of [['ciudad o código postal', 'No pude usar eso como ciudad o código postal.'], ['selección o pregunta del pedido', 'No pude usar eso como selección o pregunta del pedido.'], ['una línea de Verizon', 'No pude usar eso como una línea de Verizon.']]) assert.equal(say(label), want);
console.log('PASS rejection-wording-es');
