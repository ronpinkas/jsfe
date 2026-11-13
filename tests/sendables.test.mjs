// Sendables (owner design 2026-11-12): a flow registers a document it produced, and a generic sender offers the
// registered documents plus the host's recent replies (cargo.chatTurns) and sends the pick without knowing what it is.
// chatTranscript formats cargo.chatTurns exactly as the host's flat chat history (messagesWithRole) always read.
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS, registerSendable, sendables, chatTranscript} from '../dist/helpers/index.js';

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('PASS', name); };

check('the helpers are flow functions', () => {
   for (const name of ['registerSendable', 'sendables', 'chatTranscript']) assert.equal(typeof STANDARD_FUNCTIONS[name], 'function', name);
});

check('a content document and a sender document register, newest replacing by key', () => {
   const cargo = {};
   assert.equal(registerSendable(cargo, {key: 'receipt-1', label: 'Payment receipt $10.00', label_es: 'Recibo de pago $10.00', content: 'Paid $10.00'}), true);
   registerSendable(cargo, {key: 'statement', label: 'Latest statement', sender: 'send-statement', args: {account: '123'}});
   registerSendable(cargo, {key: 'receipt-1', label: 'Payment receipt $12.00', content: 'Paid $12.00'});
   assert.deepEqual(cargo.sendables, [
      {key: 'statement', label: 'Latest statement', kind: 'document', sender: 'send-statement', args: {account: '123'}},
      {key: 'receipt-1', label: 'Payment receipt $12.00', kind: 'document', content: 'Paid $12.00'},
   ]);
});

check('a malformed entry fails where it is registered', () => {
   const bad = [
      [{label: 'x', content: 'y'}, /key/],
      [{key: 'reply-3', label: 'x', content: 'y'}, /reply-/],
      [{key: 'k', content: 'y'}, /label/],
      [{key: 'k', label: 'x'}, /exactly one/],
      [{key: 'k', label: 'x', content: 'y', sender: 'f'}, /exactly one/],
      [{key: 'k', label: 'x', content: 'y', args: {a: 1}}, /args belong/],
      [{key: 'k', label: 'x', sender: 'f', args: []}, /args/],
      [{key: 'k', label: 'x', label_es: '', content: 'y'}, /label_es/],
   ];
   for (const [entry, why] of bad) assert.throws(() => registerSendable({}, entry), why, JSON.stringify(entry));
   assert.throws(() => registerSendable(null, {key: 'k', label: 'x', content: 'y'}), /cargo/);
});

const turns = [
   {n: 1, role: 'user', text: '¿Cuál es mi saldo?'},
   {n: 2, role: 'assistant', text: 'Su saldo es $1.92.', source: 'jsfe'},
   {n: 3, role: 'user', text: 'Mándamelo por texto'},
   {n: 4, role: 'assistant', text: ''},
];

check('replies come from cargo.chatTurns after the documents; empty replies are not offered', () => {
   const cargo = {chatTurns: turns};
   registerSendable(cargo, {key: 'statement', label: 'Latest statement', sender: 'send-statement'});
   const list = sendables(cargo);
   assert.deepEqual(list.map((item) => item.key), ['statement', 'reply-2']);
   assert.deepEqual(list[1], {key: 'reply-2', label: 'Reply 2: Su saldo es $1.92.', kind: 'reply', content: 'Su saldo es $1.92.'});
});

check('only the last six replies are offered, and a long reply has a short label and its whole text', () => {
   const long = 'x'.repeat(200);
   const many = Array.from({length: 8}, (_, i) => ({n: 2 * i + 2, role: 'assistant', text: i === 7 ? long : `reply ${i}`}));
   const list = sendables({chatTurns: many});
   assert.deepEqual(list.map((item) => item.key), ['reply-6', 'reply-8', 'reply-10', 'reply-12', 'reply-14', 'reply-16']);
   assert.equal(list[5].label, `Reply 16: ${'x'.repeat(120)}…`);
   assert.equal(list[5].content, long);
});

check('nothing registered and no history: nothing to send', () => {
   assert.deepEqual(sendables({}), []);
   assert.deepEqual(sendables(undefined), []);
});

check('sendables returns copies: changing one does not change the session', () => {
   const cargo = {};
   registerSendable(cargo, {key: 'statement', label: 'Latest statement', sender: 'send-statement', args: {account: '1'}});
   sendables(cargo)[0].label = 'changed';
   assert.equal(cargo.sendables[0].label, 'Latest statement');
});

check('chatTranscript reads as the host\'s flat history: "role: text" lines, empty turns kept', () => {
   assert.equal(chatTranscript(turns), 'user: ¿Cuál es mi saldo?\nassistant: Su saldo es $1.92.\nuser: Mándamelo por texto\nassistant: ');
   assert.equal(chatTranscript(undefined), '');
   assert.equal(chatTranscript([]), '');
});

// On the real engine: a flow step registers a document, and a later step reads the list from cargo.
const quiet = {info(){}, warn(){}, debug(){}, error(){}};
const producer = {declarationVersion: 2, id: 'make-receipt', primary: true, description: 'Demo receipt', steps: [
   {id: 'register', type: 'SET', variable: 'noop', value: "registerSendable(cargo,{key:'receipt-9',label:'Payment receipt $5.00',content:'Paid $5.00'})"},
   {id: 'count', type: 'SET', variable: 'offered', value: "sendables(cargo).map(s=>s.key).join(',')"},
   {id: 'say', type: 'SAY', value: 'Offered: {{offered}}'},
]};
const engine = new WorkflowEngine(quiet, async () => '{"option":"new_request","flowName":"None"}', [...FLOWS, producer], [], STANDARD_FUNCTIONS, {}, false, 'en');
engine.disableCommands();
let session = engine.initSession('test', 'sendables', 'en');
session.cargo.chatTurns = turns;
session = await engine.updateActivity({role: 'user', content: 'receipt', start: {flow: 'make-receipt', arguments: {}}}, session);
check('a flow step registers a document and the next step offers it with the replies', () => {
   assert.deepEqual(session.cargo.sendables.map((item) => item.key), ['receipt-9']);
   assert.match(String(session.response), /Offered: receipt-9,reply-2/);
});

console.log(`sendables: ${checks} checks passed`);
