// jsfe/helpers answer.js — the answer vocabulary every flow set shares.
//   node tests/helpers-answer.test.mjs
import assert from 'node:assert/strict';
import { isAnswer, isAgentRequest, pickChoice, isOtherRequest, isSpelledFragment, isAmountAnswer, amountInAnswer } from '../dist/helpers/answer.js';

let checks = 0;
const eq = (got, want, what) => { assert.equal(got, want, what); checks++; };

// Whole words, never substrings (the Shopify search misroute, review 2026-10-13).
eq(isAnswer('olive oil', 'agent'), false, '"olive" is not "live"');
eq(isAnswer('delivery', 'agent'), false, '"delivery" is not "live"');
eq(isAnswer('televisor inteligente', 'agent'), false, '"inteligente" is not "gente"');
eq(isAgentRequest('olive oil'), false, 'a product search is not an agent request');
eq(isAgentRequest('customer service hours'), false, 'a question about service is not an agent request');
// prod 10-17 17:38: "Operator." at the continue question re-read the account (the period normalize() keeps for emails)
for (const said of ['Operator.', 'Representative.', 'Agent.', 'Agente.', 'Operadora.']) { eq(isAgentRequest(said), true, `"${said}" (a period at the end) is an agent request`); }
eq(isAgentRequest('No agent.'), false, '"No agent." is not');
eq(isAgentRequest('I want to talk to a representative'), true, 'a whole agent request');
eq(isAgentRequest('quiero hablar con un agente'), true, 'Spanish');
eq(isAgentRequest('0'), true, '0 is an agent');
for (const said of ['agente en vivo','quiero hablar con un agente en vivo']) eq(isAgentRequest(said),true,'advertised Spanish live-agent choice');
for (const said of ['no quiero hablar con un agente en vivo','presiona 7','hacer un pago']) eq(isAgentRequest(said),false,'task, unknown and negated transfer are not consent');
eq(isAgentRequest("I don't want an agent"), false, 'negated');

// Kinds and keypad conventions
eq(isAnswer('agente', 'agent'), true, 'agente');
eq(isAnswer('0', 'agent'), true, '0 is AGENT');
eq(isAnswer('*', 'exit'), true, '* is EXIT');
eq(isAnswer('Salir', 'exit'), true, 'salir');
eq(isAnswer('Sí, por favor', 'yes'), true, 'yes');
eq(isAnswer('not sure', 'yes'), false, 'a negated yes is not yes');
eq(isAnswer('no gracias', 'no'), true, 'no');
eq(isAnswer('por texto', 'text'), true, 'text');
for (const said of ['Text.', 'texto', 'SMS', 'mensaje de texto', 'by text please', 'text me', 'escríbeme']) { eq(isAnswer(said, 'text'), true, `"${said}" asks for text`); }
// prod 2026-10-20: callers looking for the code we had texted were switched to SMS and the call ended
for (const said of ['A ver, ahorita me acaban de mandar un código espérenme dónde me llegó en este mensaje', 'sí, Dónde está el texto que te mandaron', 'I never got the text message', 'me llegó por texto pero no lo veo']) {
   eq(isAnswer(said, 'text'), false, `"${said}" names the message, it does not ask to switch`);
}
for (const said of ['please text', 'por favor texto', 'sí, por texto', 'I want to continue by text', 'quiero seguir por texto']) {
   eq(isAnswer(said, 'text'), true, `a complete polite channel request: ${said}`);
}
for (const said of ['Can you text me the code again?', 'escríbeme el código', 'You told me text me but where is the code?', '"text me"']) {
   eq(isAnswer(said, 'text'), false, `code contents and reported commands never switch: ${said}`);
}
eq(isAnswer('thanks', 'yes'), false, 'thanks is not a standard yes');
eq(isAnswer('thanks', 'yes', ['thanks']), true, 'a caller extra');
eq(isAnswer('', 'yes'), false, 'empty');

// pickChoice: standard words on yes/no keys, negation by clause, deferral, agent/exit
const YN = [{ key: 'yes', words: [] }, { key: 'no', words: [] }];
eq(pickChoice('claro', YN), 'yes', 'standard yes word with no caller list');
eq(pickChoice('ahora no', YN), 'no', 'standard no word');
eq(pickChoice('maybe later', YN), 'no', 'a deferral answers no');
eq(pickChoice('no, yes', YN), 'no', 'a leading bare no turns yes into no');
eq(pickChoice('agent', YN), '__agent', 'agent');
eq(pickChoice('cancel', YN), '__exit', 'cancel exits a closed question');
eq(pickChoice('cancel', [{ key: 'a', words: ['card'] }], true), '', 'cancel is an answer on a free-text question');
eq(pickChoice('I want to talk to an agent', [{ key: 'a', words: ['card'] }], true), '__agent', 'whole agent request on free text');
eq(pickChoice('my agent said to call', [{ key: 'a', words: ['card'] }], true), '', 'agent inside a sentence is not a request on free text');
const PAY = [{ key: 'link', words: ['link', 'enlace'] }, { key: 'pay', words: ['pay', 'pagar'] }, { key: 'no', words: [] }];
eq(pickChoice("I don't want to pay", PAY), 'no', 'a negated choice is blocked and NO answers');
eq(pickChoice('the link please', PAY), 'link', 'a plain pick');
eq(pickChoice('no problem, the link', PAY), 'link', '"no problem" agrees');

// isOtherRequest: a change of direction at a number / email / contact question, never an attempt at it
eq(isOtherRequest("what's my balance on the account", 'number'), true, 'a question instead of an amount');
eq(isOtherRequest('I want to pay with a different card', 'number'), true, 'a new direction');
eq(isOtherRequest('fifty dollars please', 'number'), false, 'number words are an attempt');
eq(isOtherRequest('veinticinco dólares', 'number'), false, 'Spanish number words');
eq(isOtherRequest('pay 25 now please', 'number'), false, 'a digit is an attempt');
eq(isOtherRequest('what?', 'number'), false, 'a short miss is re-asked, not dispatched');
eq(isOtherRequest('john at gmail dot com', 'email'), false, 'a spoken email');
eq(isOtherRequest('I do not have an email address', 'email'), true, 'no email shape');
eq(isOtherRequest('my phone is 3105551212', 'contact'), false, 'a phone number is a contact');
eq(isOtherRequest('where is the nearest store', 'contact'), true, 'contact: neither shape');
eq(isOtherRequest('anything at all here', 'free'), false, 'an unknown kind never dispatches');
// isAmountAnswer: an amount is never a keypad key (2026-10-14: "$1" picked "press 1 for FULL")
for (const a of ['$1', '$1.', '1 dollar', '1 dólar', 'un dólar', '$1.00', '1.00', '12.50', '50 cents', '50 centavos', 'pay 5 bucks']) {
   eq(isAmountAnswer(a), true, `"${a}" is an amount`);
}
for (const a of ['1', '1.', 'one', 'option 2', 'press 1', 'full', '2500']) {
   eq(isAmountAnswer(a), false, `"${a}" is not (a key, a word, or digits the flow judges)`);
}
// Legacy amountInAnswer preserves its published unsupported-cardinal and identifier behavior.
for (const [s, want] of [['pagar cuenta 50, Ciento Treinta y Cuatro Dólares', NaN], ['hacer el pago de $10 con 18 centavos', 10.18],
   ['10 dollars and 5 cents', 10.05], ['con su tarjeta Visa terminada en 2 4 8 6', NaN], ['pagar 168.38', 168.38], ['$62.20', 62.2],
   ['Pagar 61.50 ahora con tarjeta nueva', 61.5], ['50 cents', 0.5], ['$1', 1], ['2500', 2500], ['pagar 100 a la subcuenta 51', 100],
   ['pay $40 on sub account 50', 40], ['1.234,56', 1234.56], ['12,50', 12.5], ['1,234.56', 1234.56], ['pagar 40 o 50', NaN], ['quiero pagar', NaN],
   // dollars joined to two cent digits without a word for cents (prod 2026-10-15: "82 con 50 82 con 50" was refused)
   ['82 con 50 82 con 50', 82.5], ['82 con 50', 82.5], ['pagar 1,234 con 05', 1234.05], ['subcuenta 70 con 82', 82], ['82 con 5', NaN], ['100 50', NaN], ['82 y 50', NaN], ['82 and 50', 82.5],
   // a joiner after a marked dollar amount is cents in any language
   ['82 dollars and 50', 82.5], ['$82 and 50', 82.5], ['82 dólares y 50', 82.5], ['$82 y 50', 82.5], ['82 dollars and 5', 82.05],
   // speech-to-text joins the words (prod 2026-10-15: "76 con50 centavos" was offered as $0.50); cents are never taken alone beside another number
   ['76 con50 centavos', 76.5], ['76con50 centavos', 76.5], ['76 con50', 76.5], ['76 y50 centavos', 76.5], ['82 dollars and50', 82.5], ['76 o 50 centavos', NaN], ['subcuenta 62, 50 centavos', 0.5], ['50 centavos', 0.5],
   // an "un" before the cents (owner 2026-10-18; prod CAe900b39 21:41 went to the guru)
   ['171 con un 6 centavos', 171.06], ['10 y un 5 centavos', 10.05], ['171 con un 06', 171.06], ['171 con 06', 171.06], ['171 con 6', NaN],
   // 'and' plus two digits is cents (owner 2026-10-18)
   ['87 and 21', 87.21], ['102 con 21', 102.21], ['87 and 2', NaN]]) {
   const got = amountInAnswer(s);
   eq(Number.isNaN(want) ? Number.isNaN(got) : got === want, true, `amountInAnswer("${s}") = ${got}`);
}
// an exact option may carry please / por favor, but please alone is not the option
const EXACT_FULL = [{ key: 'full', exact: true, words: ['pagar el saldo completo'] }];
eq(pickChoice('Quiero pagar el saldo completo, por favor', [{ key: 'full', exact: true, words: ['quiero pagar el saldo completo'] }], false), 'full', 'option + por favor');
eq(pickChoice('please', EXACT_FULL, false), '', 'please alone is not the option');
eq(pickChoice('please', [{ key: 'yes', words: ['1'] }], false), 'yes', 'please alone is still YES');
const FULL = [{ key: 'full', words: ['1', 'full', 'all'] }];
eq(pickChoice('$1', FULL, true), '', '"$1" never picks the key 1');
eq(pickChoice('1 dollar', FULL, true), '', '"1 dollar" never picks the key 1');
eq(pickChoice('1', FULL, true), 'full', 'a bare 1 is the key');
eq(pickChoice('full', FULL, true), 'full', 'the word still picks');
eq(pickChoice('$0', [{ key: 'x', words: ['y'] }], false), '', '"$0" is not the AGENT key 0');
const YES_NO = [{ key: 'yes', words: ['1'] }, { key: 'no', words: ['2'] }];
eq(pickChoice('$2', YES_NO, true), '', '"$2" is not the key 2 (NO)');
// A keypad key is the WHOLE answer or nothing (owner rule): never a digit inside a sentence.
const EXPRESS = [{ key: 'no', words: ['no'] }, { key: 'yes', words: ['1', 'yes', 'pay'] }, { key: 'options', words: ['2', 'options'] }];
eq(pickChoice('I made payments by 1,', EXPRESS, true), '', 'the dev call: "...by 1," is not the key 1 (YES), so nothing is charged');
const RECEIPT = [{ key: 'receipt', words: ['1', 'receipt'] }, { key: 'no', words: ['2'] }];
eq(pickChoice('No, I want to make a payment for 1.', RECEIPT, false), 'no', 'a reply led by no is not the key 1 inside it');
eq(pickChoice('1', RECEIPT, false), 'receipt', 'a bare 1 is the key');
eq(pickChoice('2.', RECEIPT, false), 'no', 'a bare 2 with ASR punctuation is the key');
eq(pickChoice('I want option 1', [{ key: 'a', words: ['1'] }], false), '', 'a key inside a sentence picks nothing');
eq(pickChoice('call me at 0', [{ key: 'x', words: ['y'] }], false), '', '0 inside a sentence is not AGENT');
eq(pickChoice('0', [{ key: 'x', words: ['y'] }], false), '__agent', 'a bare 0 is AGENT');
// A YES that acts is the whole answer, courtesy aside (owner rule 2026-10-14); a key is the only input; an `exact` choice
// (one that charges or cancels) holds every one of its words to that. Since 2026-10-25 a firm key carries only
// please/thanks or CONFIRM words beside it.
const CHARGE = [{ key: 'yes', words: ['1', 'pay', 'pay it', 'confirm'], exact: true }, { key: 'no', words: ['2', 'cancel'] }];
for (const a of ['Yes.', 'yes please', 'Yeah, sure, thank you', 'Sí, claro, por favor', "yes ma'am",
   'I agree', 'estoy de acuerdo', 'yes, go ahead', 'Yesss', '1', '1.', 'pay it', 'approved', 'de acuerdo, gracias',
   // a key with please/thanks or a CONFIRM word beside it is that key (owner 2026-10-15: "Yes 1" was missed; 2026-10-25)
   'yes 1', '1 please', 'sí, 1', 'sí, 1, gracias']) {
   eq(pickChoice(a, CHARGE, false), 'yes', `YES: "${a}"`);
}
for (const a of ['um, 1, gracias', 'ok 1', 'sí, está bien, 1', 'yes I want to pay 1', 'I made payments by 1,', 'yes but only $50', 'pay 1 please', '$1', 'thanks', '1 or 2', '1 1',
   // a bare "I want" / "quiero" is never a confirmation (owner decision 2026-10-15)
   'Quiero pagar', 'quiero', 'I want to pay', 'I want', 'I would like to pay',
   'I want to pay', 'ok so how much is it']) {
   eq(pickChoice(a, CHARGE, false), '', `not YES: "${a}"`);
}
eq(pickChoice('no, cancel it', CHARGE, false), 'no', 'NO stays lenient');
// at a choice that charges or cancels, only a clear confirmation (CONFIRM_WORDS) is YES (owner decision 2026-10-15; since
// 2026-10-26 "please" / "por favor" alone are one)
for (const a of ['continue', 'continuar', 'Sí, quiero continuar', 'go on', 'seguir', 'ok', 'um, okay', 'okay thank you', 'está bien',
   "That's fine.", 'fine', 'sounds good', 'perfect', 'perfecto', 'bueno', 'right', 'seguro', 'exactly',
   'así es', 'eso es', 'alright']) {
   eq(pickChoice(a, CHARGE, false), '', `not YES at a charge: "${a}"`);
}
for (const a of ['proceed', 'proceder', 'procede', 'sí, proceda', 'confirmo', 'dale', 'de acuerdo', 'correct', 'go ahead please']) {
   eq(pickChoice(a, CHARGE, false), 'yes', `YES at a charge: "${a}"`);
}
for (const a of ['ok', 'está bien', 'bueno', 'sounds good']) {
   eq(pickChoice(a, [{ key: 'yes', words: ['1'] }, { key: 'no', words: ['2'] }], false), 'yes', `still YES where nothing is charged: "${a}"`);
}
eq(pickChoice('Sí, quiero continuar', [{ key: 'yes', words: ['1'] }, { key: 'no', words: ['2'] }], false), 'yes', 'CONTINUE still confirms where nothing is charged');
eq(pickChoice('yes 2', CHARGE, false), '', 'YES with the NO key contradicts itself: nothing');
eq(pickChoice('2 please', CHARGE, false), 'no', 'the NO key with courtesy is NO');
const RECEIPT2 = [{ key: 'receipt', words: ['1', 'receipt', 'text', 'yes', 'sure'] }, { key: 'no', words: ['2'] }];
eq(pickChoice('text me the receipt', RECEIPT2, false), 'receipt', 'a named action matches inside the answer');
eq(pickChoice('sure, I want to pay 1', RECEIPT2, false), '', 'a YES word inside a longer answer is not YES');
eq(isAnswer('Yes, please.', 'yes'), true, 'isAnswer yes: courtesy around a YES');
eq(isAnswer('yes I want the code', 'yes'), false, 'isAnswer yes: a YES inside a sentence is not YES');
eq(isAnswer('si gracias', 'yes'), true, 'isAnswer yes: sí + gracias');
eq(isAnswer('thanks', 'yes', ['thanks']), true, 'isAnswer yes: a caller-supplied word counts');

for (const a of ['Sí, quiero continuar.', 'Sí, quiero', 'Quiero continuar', 'continue', 'yes, I want to continue', 'yes I do', 'Sí, proceda.', 'proceda por favor']) {
   eq(pickChoice(a, [{ key: 'yes', words: ['1'] }, { key: 'no', words: ['2'] }], false), 'yes', `agreeing to continue: "${a}"`);
}
eq(pickChoice('quiero pagar 1', CHARGE, false), '', 'agreeing words never make a charge out of other content');
eq(pickChoice('no quiero', [{ key: 'yes', words: ['1'] }, { key: 'no', words: ['2'] }], false), 'no', '"no quiero" is NO');
eq(pickChoice('Sí, proceder.', [{ key: 'yes', words: ['1'] }, { key: 'no', words: ['2'] }], false), 'yes', '"Sí, proceder." is YES');
// beside a CONFIRM word, an acknowledgement changes nothing; alone it never confirms (review 2026-10-15)
for (const a of ['Yes, okay.', 'Okay, yes.', 'Sí, está bien', 'Sí, bueno', 'sí, perfecto', 'yes, sounds good']) {
   eq(pickChoice(a, CHARGE, false), 'yes', `YES beside an acknowledgement at a charge: "${a}"`);
}
for (const a of ['okay, fine', 'bueno, está bien', 'perfect, great']) {
   eq(pickChoice(a, CHARGE, false), '', `acknowledgements alone never charge: "${a}"`);
}
// an exact choice's own words with a CONFIRM word beside them are that choice
const OFFER_FULL = [{ key: 'yes', exact: true, words: ['1'] }, { key: 'full', exact: true, words: ['full balance', 'saldo completo', 'pagar el saldo completo'] }, { key: 'no', words: ['2'] }];
for (const a of ['Yes, the full balance', 'Sí, el saldo completo', 'sí, mi saldo completo', 'Sí, pagar el saldo completo', 'sí, saldo completo', 'ok, full balance']) {
   eq(pickChoice(a, OFFER_FULL, false), 'full', `a CONFIRM word beside an exact choice's words: "${a}"`);
}
// an AGENT word with another meaning asks for a person only as the whole answer (review 2026-10-15)
for (const a of ['quiero pagar mi servicio', 'someone else will pay', 'I need support with the payment']) {
   eq(pickChoice(a, [{ key: 'yes', words: ['1'] }, { key: 'no', words: ['2'] }], false), '', `not AGENT: "${a}"`);
}
for (const a of ['agent', 'I want to talk to a representative', 'servicio al cliente', 'customer service please', 'a person']) {
   eq(pickChoice(a, [{ key: 'yes', words: ['1'] }, { key: 'no', words: ['2'] }], false), '__agent', `AGENT: "${a}"`);
}
eq(pickChoice('the', OFFER_FULL, false), '', 'an article alone picks nothing');
eq(pickChoice('yes the', OFFER_FULL, false), '', 'YES + article is not the exact choice');
// a question is not a confirmation at a choice that charges or cancels (review 2026-10-15)
for (const a of ['sure?', 'Yes?', '¿sí?', '1?', 'claro?', 'full balance?']) {
   eq(pickChoice(a, OFFER_FULL, false), '', `a question never confirms: "${a}"`);
}
eq(pickChoice('yes?', [{ key: 'yes', words: ['1'] }, { key: 'no', words: ['2'] }], false), 'yes', 'elsewhere a "yes?" is still YES');
// a key said as a word is that key, under the same rules as the digit (prod 2026-10-16 7:07 AM: "dos" was re-asked)
const CM = [{ key: 'yes', words: ['1'] }, { key: 'no', words: ['2'] }];
for (const [a, k] of [['dos', 'no'], ['Dos.', 'no'], ['two', 'no'], ['uno', 'yes'], ['one please', 'yes'], ['dos por favor', 'no'], ['sí, uno', 'yes']]) {
   eq(pickChoice(a, CM, false), k, `a spoken key: "${a}"`);
}
for (const a of ['quiero pagar dos', 'dos o tres', 'uno dos']) {
   eq(pickChoice(a, CM, false), '', `a number word inside a sentence is no key: "${a}"`);
}
eq(pickChoice('uno', CHARGE, false), 'yes', 'at a charge, "uno" is key 1 like the digit');
eq(pickChoice('sí, dos', CHARGE, false), '', 'YES with the NO key, spoken: nothing');
// a bare thanks at a yes/no question is a graceful acceptance (owner decision 2026-10-16; prod 08:55 web: "Gracias" at the
// Credit Monitor offer was re-asked) — never at a choice that charges or cancels, never at a menu without a YES choice
for (const a of ['Gracias', 'gracias.', 'thanks', 'Thank you!', 'muchas gracias', 'thanks a lot', 'thank you so much', 'Gracias, señora']) {
   eq(pickChoice(a, CM, false), 'yes', `a bare thanks accepts: "${a}"`);
   eq(pickChoice(a, CHARGE, false), '', `a bare thanks never charges: "${a}"`);
   eq(pickChoice(a, [{ key: 'receipt', words: ['1', 'receipt'] }, { key: 'no', words: ['2'] }], false), '', `no YES choice, no pick: "${a}"`);
}
for (const a of ['No, gracias', 'no gracias', 'no thanks', 'No, thank you.', 'gracias, no', 'thanks but no']) {
   eq(pickChoice(a, CM, false), 'no', `still NO: "${a}"`);
}
for (const [a, k] of [['1 gracias', 'yes'], ['2, gracias', 'no'], ['dos, gracias', 'no']]) {
   eq(pickChoice(a, CM, false), k, `courtesy around a key is unchanged: "${a}"`);
}
eq(pickChoice('gracias, quiero pagar', CM, false), '', 'thanks inside a longer answer is not YES');
eq(pickChoice('gracias', OFFER_FULL, false), '', 'a bare thanks at an exact YES with another exact choice: nothing');
// accents are not meaning (owner 2026-10-16; prod 16:03 WhatsApp "Direccion" was re-asked at "DIRECCIÓN para cambiar su dirección")
const SV = [{ key: 'address', words: ['dirección', 'cambio de dirección', 'me mudé'] }, { key: 'card', words: ['tarjeta'] }, { key: 'refund', words: ['reembolso'] }];
for (const [a, k] of [['Direccion', 'address'], ['DIRECCION', 'address'], ['dirección', 'address'], ['cambio de direccion', 'address'], ['me mude', 'address'], ['Tarjeta', 'card']]) {
   eq(pickChoice(a, SV), k, `accents either way: "${a}" → ${k}`);
}
eq(pickChoice('si', YN), 'yes', '"si" without the accent is YES');
eq(pickChoice('despues', YN), 'no', 'a deferral without its accent');
// A spelled address is an attempt at an email / contact question, never a change of direction (prod 2026-10-18
// a prod call: "S o n. N y underscore." left the email question and the guru took over the spelling).
for (const t of ['S o n. N y underscore.', 'L e, o s', 'Sunny underscore.']) {
   eq(isOtherRequest(t, 'email'), false, `spelled, at an email question: "${t}"`);
   eq(isOtherRequest(t, 'contact'), false, `spelled, at a contact question: "${t}"`);
   eq(isSpelledFragment(t), true, `a spelled fragment: "${t}"`);
}
for (const t of ['voy a pagar y ya ahora mismo', 'quiero ver mi saldo y a la vez pagar o algo', "what's my balance on the account"]) {
   eq(isOtherRequest(t, 'contact'), true, `single-letter words are not a spelling: "${t}"`);
   eq(isSpelledFragment(t), false, `not spelled: "${t}"`);
}
eq(isSpelledFragment('s o n n y at gmail dot com'), false, 'a whole address is not a fragment');
// A word naming the key, right before it, picks the key (prod 2026-10-25 18:25: "Número 4" at a numbered product list).
const LIST = ['1', '2', '3', '4', '5'].map((k) => ({ key: k, words: [k] }));
for (const said of ['Número 4', 'El número 4', 'el 4', 'number 4', 'the number 4', 'option 4', 'opción cuatro', 'el número cuatro por favor'])
   eq(pickChoice(said, LIST), '4', `a key named before it: "${said}"`);
for (const said of ['4 o 5', 'número 4 y 5', 'quiero el número 4 de la otra lista', 'mi número es 4'])
   eq(pickChoice(said, LIST) === '4', false, `not a bare key: "${said}"`);
eq(pickChoice('opción 1', [{ key: 'yes', words: ['1'], exact: true }, { key: 'no', words: ['2'] }]), '', 'a firm YES keyed 1: "opción 1" does not confirm (owner rule 2026-10-25)');
// At a soft question, a word pointing at the offered thing may lead the YES (prod 2026-10-25 17:46: "Ese está bien.").
const SOFT = [{ key: 'yes', words: ['1'] }, { key: 'no', words: ['2'] }];
for (const said of ['Ese está bien.', 'esa sí', 'ese mismo', 'eso es', 'that one is fine', "that's the one", 'this one is fine', 'ese está bien, gracias'])
   eq(pickChoice(said, SOFT), 'yes', `soft: pointing at the offer is a yes: "${said}"`);
for (const said of ['ese', 'ese no', 'esa no está bien', 'ese es otro', 'that one is wrong', 'this'])
   eq(pickChoice(said, SOFT) === 'yes', false, `soft: not a yes: "${said}"`);
const FIRM = [{ key: 'yes', words: ['1'], exact: true }, { key: 'no', words: ['2'] }];
for (const said of ['Ese está bien.', 'that is the one', 'ese mismo', 'esa sí está bien'])
   eq(pickChoice(said, FIRM) === 'yes', false, `firm stays strict: "${said}"`);
// A firm YES takes its key or a CONFIRM word, with please/thanks and nothing else (owner rule 2026-10-25).
const FIRM_ONLY = [{ key: 'yes', words: ['1'], exact: true }, { key: 'no', words: ['2'] }];
for (const said of ['1', 'uno', 'one', '1 por favor', '1, gracias', 'sí 1', 'yes, 1', 'sí, uno, gracias', 'sí', 'sí, por favor', 'yes please', 'sí gracias', 'sí claro', 'sí, sí', 'sí, está bien', 'okay yes', 'pues sí', 'um yes', 'sí señor'])
   eq(pickChoice(said, FIRM_ONLY), 'yes', `firm: "${said}" confirms`);
for (const said of ['1 está bien', 'ok 1', 'sí, ok, 1', 'bueno 1', 'opción 1', 'sí, opción 1', 'el número 1', 'that one is fine', 'um 1', '1 señor', 'ok', 'está bien', 'perfecto', 'quiero 1 cosa'])
   eq(pickChoice(said, FIRM_ONLY) === 'yes', false, `firm: "${said}" does not confirm`);
// "please" / "por favor" alone confirm a firm question (owner rule 2026-10-26; prod 21:47 at a payment offer)
for (const said of ['por favor', 'Por favor.', 'please', 'sí, por favor', '1 por favor'])
   eq(pickChoice(said, FIRM_ONLY), 'yes', `firm: "${said}" confirms`);
for (const said of ['no, por favor', 'por favor no', 'espere por favor', 'repita por favor', 'un enlace por favor'])
   eq(pickChoice(said, FIRM_ONLY) === 'yes', false, `firm: "${said}" does not confirm`);
console.log(`answer: ${checks} checks passed`);
