// SendCopy sends a link that continues the conversation on the web (owner 2026-11-26; prod CA4401413b 11-26 13:36: "Can you
// send me a link so I can continue this on my computer?" reached no flow). The link is a sendable off the web chat, made at
// send time by the host's get-web-chat-link tool; with nothing named it is texted to the caller, else emailed to the email
// on file; a named number or email is used as given.
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS, linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS, sendables, registerSendable, WEB_LINK_KEY} from '../dist/helpers/index.js';

let checks = 0;
const check = async (name, fn) => { await fn(); checks++; console.log('PASS', name); };
const quiet = {debug(){}, info(){}, warn(){}, error(){}};
const LINK = 'https://shop.example/#iAIg-widget=tok';

await check('the link is offered off the web chat only, and its key is reserved', () => {
   const keys = (cargo) => sendables(cargo).map((item) => item.key);
   for (const cargo of [{voice: true}, {channel: 'voice'}, {channel: 'sms'}, {channel: 'whatsapp'}, {channel: 'email'}]) {
      assert.ok(keys(cargo).includes(WEB_LINK_KEY), JSON.stringify(cargo));
   }
   for (const cargo of [{channel: 'web'}, {}, {voice: false, channel: 'web'}]) {
      assert.ok(!keys(cargo).includes(WEB_LINK_KEY), JSON.stringify(cargo));
   }
   const item = sendables({voice: true}).find((i) => i.key === WEB_LINK_KEY);
   assert.equal(item.kind, 'web_link');
   assert.equal(item.content, undefined, 'made at send time, never stored');
   assert.throws(() => registerSendable({}, {key: WEB_LINK_KEY, label: 'x', content: 'y'}), /web-link/);
});

// Stand-ins for the system set's send workers, recording what was sent.
const sent = [];
const workers = [
   {id: 'send-text', name: 'SendText', steps: [{id: 'st', type: 'SET', variable: 'noop', value: "(cargo.textSent = true, true)"}, {id: 'st_rec', type: 'SET', variable: 'noop', value: "recordSent('text', cargo.textTo, message)"}]},
   {id: 'send-email-message', name: 'SendEmailMessage', steps: [{id: 'se', type: 'SET', variable: 'noop', value: "(cargo.emailSent = true, true)"}, {id: 'se_rec', type: 'SET', variable: 'noop', value: "recordSent('email', to, message)"}]},
].map((f) => ({version: '1', description: f.name, scope: 'isolated', ...f}));
const tools = [{id: 'get-web-chat-link', name: 'Get Web Chat Link', description: 'test link', parameters: {type: 'object', properties: {}}, implementation: {type: 'local', function: 'getWebChatLink', retries: 0}}];

async function run(cargo, args, link = LINK) {
   sent.length = 0;
   const functions = {...STANDARD_FUNCTIONS, getWebChatLink: async () => link, recordSent: (medium, to, message) => { sent.push({medium, to, message}); return true; }};
   const engine = new WorkflowEngine(quiet, async () => '{"flowName":"None"}', linkFormSchemas([...FLOWS, ...workers]), tools, functions, {}, false, 'en');
   engine.disableCommands();
   let session = engine.initSession('test', 'web-link', 'en');
   Object.assign(session.cargo, {chatTurns: [{n: 1, role: 'user', text: 'hi'}, {n: 2, role: 'assistant', text: 'Hello! How can I help?'}]}, cargo);
   session = await engine.updateActivity({role: 'user', content: 'can I continue this on my computer?', start: {flow: 'SendCopy', arguments: {item: WEB_LINK_KEY, ...args}}}, session);
   return String(session.response);
}

await check('nothing named, on a call with a line that texts: the link is texted to the caller', async () => {
   const r = await run({voice: true, twilioNumber: '+12135551000', callerId: '+13105551234'}, {});
   assert.deepEqual(sent, [{medium: 'text', to: '3105551234', message: `Continue our conversation on the web: ${LINK}`}], JSON.stringify(sent));
   assert.match(r, /^Done\. I texted it to the number ending in/);
});

await check('nothing named, no line to text from: the link is emailed to the email on file', async () => {
   const r = await run({voice: true, otp_email: 'ana@example.com'}, {});
   assert.deepEqual(sent, [{medium: 'email', to: 'ana@example.com', message: `Continue our conversation on the web: ${LINK}`}], JSON.stringify(sent));
   assert.match(r, /^Done\. I emailed it to ana@example\.com\./);
});

await check('a named email is used as given, over the number on file', async () => {
   await run({voice: true, twilioNumber: '+12135551000', callerId: '+13105551234'}, {medium: 'email', destination: 'bob@example.com'});
   assert.deepEqual(sent.map((s) => [s.medium, s.to]), [['email', 'bob@example.com']]);
});

await check('in Spanish the line is Spanish', async () => {
   sent.length = 0;
   const functions = {...STANDARD_FUNCTIONS, getWebChatLink: async () => LINK, recordSent: (medium, to, message) => { sent.push({medium, to, message}); return true; }};
   const engine = new WorkflowEngine(quiet, async () => '{"flowName":"None"}', linkFormSchemas([...FLOWS, ...workers]), tools, functions, {}, false, 'es');
   engine.disableCommands();
   let session = engine.initSession('test', 'web-link-es', 'es');
   Object.assign(session.cargo, {voice: true, twilioNumber: '+12135551000', callerId: '+13105551234', chatTurns: [{n: 1, role: 'assistant', text: 'Hola'}]});
   session = await engine.updateActivity({role: 'user', content: '¿puedo seguir esto en mi computadora?', start: {flow: 'SendCopy', arguments: {item: WEB_LINK_KEY}}}, session);
   assert.equal(sent[0]?.message, `Continúe nuestra conversación en la web: ${LINK}`, JSON.stringify(sent));
});

await check('no link from the host: nothing is sent and the caller is told', async () => {
   const r = await run({voice: true, twilioNumber: '+12135551000', callerId: '+13105551234'}, {}, '');
   assert.deepEqual(sent, []);
   assert.match(r, /^Sorry, I couldn't make a link to continue on the web\./);
});

console.log(`send-copy web link: ${checks} checks passed`);
