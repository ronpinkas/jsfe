/**
 * SendCopy (owner 2026-11-12): the caller asks to be sent something the assistant already said, or a document a flow
 * registered, by text or email. Tenant-agnostic; built into the system set by AIDevelopment forms/system-forms.mjs.
 *
 * Intent detection picks the item, the medium and any destination in one stage-2 request: `item` is enum_from
 * 'sendables' (jsfe 1.60.0), so its values are this session's sendables(cargo) keys with their labels.
 * - A content item (a reply, a text document) is sent as is: text through text-destination's number (or the one the
 *   caller gave) and send-text; email to the address given, else ask-email, and send-email-message.
 * - A sender item runs its declared flow with {medium, destination, args}; the sender sends, tells the caller and sets
 *   cargo.copySent = true. Without it (a failed or missing sender) SendCopy says it could not send.
 * No authentication gate here (owner rule: an authenticated caller's chat and documents are theirs to send anywhere;
 * before authentication no reply holds account data). A sender flow gates its own document.
 */
import {defineWorker} from './contracts.js';

const vars = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { type: Array.isArray(v) ? 'array' : v === null || typeof v === 'object' ? 'object' : typeof v, value: v }]));
const set = (id, variable, value) => ({ id, type: 'SET', variable, value });
const effect = (id, value) => set(id, 'assignment_side_effect', value);
const noop = (id) => set(id, 'noop', 'true');
const when = (id, condition, step) => ({ id, type: 'CASE', branches: { [`condition: ${condition}`]: step, default: noop(`${id}_skip`) } });
const say = (id, value, value_es) => ({ id, type: 'SAY', value, value_es });
const end = (id, extra = {}) => ({ id, type: 'END', ...extra });
const call = (id, value, parameters) => ({ id, type: 'FLOW', value, callType: 'call', ...(parameters ? { parameters } : {}) });

const ANYTHING_ELSE = ' Is there anything else I can help you with?';
const ANYTHING_ELSE_ES = ' ¿Hay algo más en lo que le pueda ayudar?';
const TEXT_WORDS = ['1', 'text', 'texto', 'sms', 'message', 'text message', 'mensaje', 'mensaje de texto'];
const EMAIL_WORDS = ['2', 'email', 'e-mail', 'mail', 'correo', 'correo electrónico', 'correo electronico', 'email address'];

const sendCopy = defineWorker({
   contract: { role: 'router', summary: 'Sends a reply or registered document the caller picks, by text or email, through the system send workers or the document\'s sender flow' },
   id: 'send-copy',
   name: 'SendCopy',
   version: '1.0.0',
   primary: true,
   prompt: 'Send a copy',
   prompt_es: 'Enviar una copia',
   description: "Asks to be sent, by text or email, something the assistant said in this conversation ('text me that', 'send me that by email', 'mándame eso por mensaje', 'envíeme esa información al correo'). Not: continuing the whole conversation by text (SwitchToText); a person (LiveAgentRequested).",
   parameters: [
      { name: 'item', type: 'string', enum_from: 'sendables', description: "What the user asks to have sent: the reply or document they name or point to. 'That', 'it', 'this', 'eso' or 'lo que me dijo' is the latest reply." },
      { name: 'medium', type: 'string', enum: ['text', 'email'], description: "How the user asks to have it sent: text for a text message or SMS ('mensaje', 'texto'), email for an email ('correo')." },
      { name: 'destination', type: 'string', description: 'The phone number or email address the user gave to send it to, as given.' },
   ],
   variables: vars({
      noop: false, sc_items: [], sc_key: '', sc_item: null, sc_last: null, sc_last_head: '', sc_email: '', sc_phone: '',
      sc_medium: '', sc_medium_q: '', sc_medium_q_es: '', sc_destination: '', sc_asked_text: false, sc_to: '', sc_subject: '', sc_sent: false,
   }),
   steps: [
      set('sc_items', 'sc_items', 'sendables(cargo)'),
      when('sc_nothing', '!sc_items.length', say('sc_nothing_say', "I don't have anything to send yet." + ANYTHING_ELSE, 'Todavía no tengo nada que enviarle.' + ANYTHING_ELSE_ES)),
      when('sc_nothing_end', '!sc_items.length', end('sc_nothing_done', { outcome: 'unresolved', reason: 'nothing_to_send' })),

      // the item: the one detection picked, else the latest, offered
      set('sc_key', 'sc_key', "typeof item === 'string' ? item : ''"),
      set('sc_item', 'sc_item', 'sc_items.find(function (i) { return i.key === sc_key; }) || null'),
      set('sc_last', 'sc_last', 'sc_items[sc_items.length - 1]'),
      set('sc_last_head', 'sc_last_head', "sc_last.kind === 'reply' ? (sc_last.content.length > 120 ? sc_last.content.slice(0, 120) + '…' : sc_last.content) : ((language === 'es' && sc_last.label_es) || sc_last.label)"),
      when('sc_offer', '!sc_item', call('sc_offer_ask', 'ask-choice', {
         question: 'Should I send you my last answer: "{{sc_last_head}}"? Please say yes or no.',
         question_es: '¿Le envío mi última respuesta: "{{sc_last_head}}"? Por favor diga sí o no.',
         choices: [{ key: 'yes', phrases: ['1'] }, { key: 'no', phrases: ['2'] }],
         digits: { min: 1, max: 1 },
      })),
      when('sc_offer_read', '!sc_item', set('sc_offer_pick', 'sc_item', "cargo.choice === 'yes' ? sc_last : null")),
      when('sc_offer_no', '!sc_item', say('sc_offer_no_say', "Okay. Tell me what you'd like me to send, for example: text me my balance.", 'De acuerdo. Dígame qué quiere que le envíe, por ejemplo: envíeme mi saldo por mensaje.')),
      when('sc_offer_no_end', '!sc_item', end('sc_offer_no_done')),

      // the medium: the one asked for, else the destination's shape, else asked; text needs the tenant's sender
      set('sc_email', 'sc_email', "(String(typeof destination === 'string' ? destination : '').match(/[^\\s@]+@[^\\s@]+\\.[^\\s@]+/) || [''])[0].replace(/[.,;:]+$/, '')"),
      set('sc_phone', 'sc_phone', "readPhone(typeof destination === 'string' ? destination : '')"),
      set('sc_medium', 'sc_medium', "typeof medium === 'string' && (medium === 'text' || medium === 'email') ? medium : sc_email ? 'email' : sc_phone ? 'text' : ''"),
      set('sc_asked_text', 'sc_asked_text', "sc_medium === 'text'"),
      when('sc_no_sender', "!cargo.twilioNumber", set('sc_email_only', 'sc_medium', "'email'")),
      when('sc_no_sender_say', '!cargo.twilioNumber && sc_asked_text', say('sc_no_sender_note', "I can't send text messages here, so I'll email it.", 'No puedo enviar mensajes de texto desde aquí, así que se lo enviaré por correo.')),
      // FLOW parameters are paths only: the wording is chosen here
      set('sc_medium_q', 'sc_medium_q', 'cargo.voice ? "Should I send it by text or by email? Press 1 or say TEXT, press 2 or say EMAIL." : "Should I send it by text or by email?"'),
      set('sc_medium_q_es', 'sc_medium_q_es', 'cargo.voice ? "¿Se lo envío por mensaje de texto o por correo? Presione 1 o diga TEXTO, presione 2 o diga CORREO." : "¿Se lo envío por mensaje de texto o por correo?"'),
      when('sc_ask_medium', '!sc_medium', call('sc_ask_medium_call', 'ask-choice', {
         question: '{{sc_medium_q}}',
         question_es: '{{sc_medium_q_es}}',
         choices: [{ key: 'text', phrases: TEXT_WORDS }, { key: 'email', phrases: EMAIL_WORDS }],
         digits: { min: 1, max: 1 },
      })),
      when('sc_ask_medium_read', '!sc_medium', set('sc_medium_pick', 'sc_medium', "cargo.choice === 'text' || cargo.choice === 'email' ? cargo.choice : ''")),
      when('sc_no_medium_end', '!sc_medium', end('sc_no_medium_done')),

      // text: the number given, else the verified cell or the caller's phone, else asked
      when('sc_text_to', "sc_medium === 'text'", effect('sc_text_to_set', 'cargo.textTo = sc_phone || textDestination(cargo)')),
      when('sc_ask_number', "sc_medium === 'text' && !cargo.textTo", call('sc_ask_number_call', 'ask-choice', {
         question: 'What phone number should I text it to?',
         question_es: '¿A qué número de teléfono se lo envío?',
         choices: [],
         accept_other: true,
         expect: 'number',
         digits: { min: 10, max: 11 },
      })),
      when('sc_number_read', "sc_medium === 'text' && !cargo.textTo", effect('sc_number_set', "cargo.textTo = readPhone(cargo.choiceText || '')")),
      when('sc_number_bad', "sc_medium === 'text' && !cargo.textTo", say('sc_number_bad_say', "Sorry, I couldn't read that phone number." + ANYTHING_ELSE, 'Lo siento, no pude entender ese número de teléfono.' + ANYTHING_ELSE_ES)),
      when('sc_number_bad_end', "sc_medium === 'text' && !cargo.textTo", end('sc_number_bad_done', { outcome: 'unresolved', reason: 'no_phone_number' })),
      when('sc_text_four', "sc_medium === 'text'", effect('sc_text_four_set', 'cargo.textTo4 = last4(cargo.textTo, cargo.voice)')),

      // email: the address given, else asked (the verified email offered)
      set('sc_to', 'sc_to', "sc_medium === 'email' && sc_email && validateEmail(sc_email) ? sc_email : ''"),
      when('sc_email_clear', "sc_medium === 'email' && !sc_to", effect('sc_email_clear_set', "cargo.email = ''")),
      when('sc_ask_email', "sc_medium === 'email' && !sc_to", call('sc_ask_email_call', 'ask-email', {
         question: 'What email address should I send it to?',
         question_es: '¿A qué correo electrónico se lo envío?',
         on_file: '{{cargo.otp_email}}',
      })),
      when('sc_email_read', "sc_medium === 'email' && !sc_to", set('sc_email_pick', 'sc_to', "cargo.email && validateEmail(String(cargo.email)) ? String(cargo.email) : ''")),
      when('sc_email_none_end', "sc_medium === 'email' && !sc_to", end('sc_email_none_done')),

      // send: a sender item runs its flow (it tells the caller); content goes as is
      set('sc_destination', 'sc_destination', "sc_medium === 'text' ? cargo.textTo : sc_to"),
      when('sc_sender_reset', '!!sc_item.sender', effect('sc_sender_reset_set', 'cargo.copySent = false')),
      when('sc_sender', '!!sc_item.sender', call('sc_sender_call', '{{sc_item.sender}}', { medium: '{{sc_medium}}', destination: '{{sc_destination}}', args: '{{sc_item.args}}' })),
      // a sender sets cargo.copySent once it has sent and told the caller; a missing or failed sender is said here
      when('sc_sender_failed', '!!sc_item.sender && cargo.copySent !== true', say('sc_sender_failed_say', "Sorry, I couldn't send it." + ANYTHING_ELSE, 'Lo siento, no pude enviarlo.' + ANYTHING_ELSE_ES)),
      when('sc_sender_failed_end', '!!sc_item.sender && cargo.copySent !== true', end('sc_sender_failed_done', { outcome: 'unresolved', reason: 'send_failed' })),
      when('sc_sender_end', '!!sc_item.sender', end('sc_sender_done')),
      set('sc_subject', 'sc_subject', "language === 'es' ? 'Su copia de nuestra conversación' : 'Your copy from our conversation'"),
      when('sc_send_text', "sc_medium === 'text'", call('sc_send_text_call', 'send-text', { message: '{{sc_item.content}}' })),
      when('sc_send_email', "sc_medium === 'email'", call('sc_send_email_call', 'send-email-message', { to: '{{sc_to}}', subject: '{{sc_subject}}', message: '{{sc_item.content}}', cc: '' })),
      set('sc_sent', 'sc_sent', "sc_medium === 'text' ? cargo.textSent === true : cargo.emailSent === true"),
      when('sc_done_text', "sc_sent && sc_medium === 'text'", say('sc_done_text_say', 'Done. I texted it to the number ending in {{cargo.textTo4}}.' + ANYTHING_ELSE, 'Listo. Se lo envié por mensaje de texto al número que termina en {{cargo.textTo4}}.' + ANYTHING_ELSE_ES)),
      when('sc_done_email', "sc_sent && sc_medium === 'email'", say('sc_done_email_say', 'Done. I emailed it to {{sc_to}}.' + ANYTHING_ELSE, 'Listo. Se lo envié por correo a {{sc_to}}.' + ANYTHING_ELSE_ES)),
      when('sc_failed', '!sc_sent', say('sc_failed_say', "Sorry, I couldn't send it." + ANYTHING_ELSE, 'Lo siento, no pude enviarlo.' + ANYTHING_ELSE_ES)),
      when('sc_failed_end', '!sc_sent', end('sc_failed_done', { outcome: 'unresolved', reason: 'send_failed' })),
   ],
});

export const FLOWS = [sendCopy];
