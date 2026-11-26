/**
 * SendCopy (owner 2026-11-12): the caller asks to be sent something the assistant already said, or a document a flow
 * registered, by text or email. Tenant-agnostic; built into the system set by AIDevelopment forms/system-forms.mjs.
 *
 * Intent detection picks the item, the medium and any destination in one stage-2 request: `item` is enum_from
 * 'sendables' (jsfe 1.60.0), so its values are this session's sendables(cargo) keys with their labels.
 * - The whole conversation (once the assistant has replied) is conversationCopy(cargo.chatTurns, language): the turns
 *   before this request, in the caller's language.
 * - A content item (a reply, a text document, the conversation) is sent as is: text through text-destination's number
 *   (or the one the caller gave) and send-text when it fits one text message (TEXT_MAX), else by email; email to the
 *   address given, else ask-email, and send-email-message.
 * - A sender item runs its flow with {medium, destination, args} (destination: only what the caller gave): the sender
 *   collects the rest, sets cargo.copyHandled = true as it takes over and tells the caller every outcome. Without it (a
 *   missing sender) SendCopy says it could not send. A sender's declared media limit the medium (statement: email).
 * - The web chat link (WEB_LINK_KEY, owner 2026-11-26: "can I continue this on my computer?") is made at send time by the
 *   host's get-web-chat-link tool. With no medium or destination named it is texted to the caller's number, else emailed to
 *   the email on file, else the medium is asked; any number or email the caller names is used, as for any item.
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
// A text message is one message: Twilio rejects a body over 1,600 characters (error 21617), so longer content goes by email.
const TEXT_MAX = 1600;
const EMAIL_WORDS = ['2', 'email', 'e-mail', 'mail', 'correo', 'correo electrónico', 'correo electronico', 'email address'];

const sendCopy = defineWorker({
   contract: { role: 'router', summary: 'Sends a reply, registered document, the whole conversation or a link to continue it on the web, as the caller picks, by text or email, through the system send workers or the document\'s sender flow' },
   id: 'send-copy',
   name: 'SendCopy',
   version: '1.2.0',
   primary: true,
   prompt: 'Send a copy',
   prompt_es: 'Enviar una copia',
   description: "Asks to be sent something by text or email, whatever it is ('email me that', 'text me the case number', 'send me the receipt', 'can I have that emailed to me', 'send me a copy of this chat', 'mándame eso por mensaje', 'me lo puede mandar por correo'), or asks to continue this conversation on the web or another device ('can I continue this on my computer?', 'send me a link to continue on the web', '¿puedo seguir esto en mi computadora?'). Not: continuing the conversation by text (SwitchToText).",
   parameters: [
      { name: 'item', type: 'string', enum_from: 'sendables', description: "What the user asks to have sent: the reply or document they name or point to. 'That', 'it', 'this', 'eso' or 'lo que me dijo' is the latest reply; the whole chat, conversation or transcript ('toda la conversación') is the whole conversation; continuing on the web, a computer or another device is the link to continue on the web." },
      { name: 'medium', type: 'string', enum: ['text', 'email'], description: "How the user asks to have it sent: text for a text message or SMS ('mensaje', 'texto'), email for an email ('correo')." },
      { name: 'destination', type: 'string', description: 'The phone number or email address the user gave to send it to, as given.' },
      { name: 'other_destination', type: 'boolean', description: "true when the user asks to send it to a different, new or other phone number or email than their own, without saying what it is ('another number', 'a different email', 'otro número', 'a mi otro correo'); false when they give the number or email, or name none." },
   ],
   variables: vars({
      noop: false, sc_items: [], sc_key: '', sc_item: null, sc_last: null, sc_last_head: '', sc_offer_q: '', sc_offer_q_es: '', sc_doc_list: '', sc_email: '', sc_phone: '',
      sc_medium: '', sc_medium_q: '', sc_medium_q_es: '', sc_given: '', sc_other: false, sc_too_long: false, sc_media: [], sc_forced: '', sc_to: '', sc_subject: '', sc_content: '', sc_sent: false, sc_link: '',
   }),
   steps: [
      set('sc_items', 'sc_items', 'sendables(cargo)'),
      when('sc_nothing', '!sc_items.length', say('sc_nothing_say', "I don't have anything to send yet." + ANYTHING_ELSE, 'Todavía no tengo nada que enviarle.' + ANYTHING_ELSE_ES)),
      when('sc_nothing_end', '!sc_items.length', end('sc_nothing_done', { outcome: 'unresolved', reason: 'nothing_to_send' })),

      // the item: the one detection picked, else the latest, offered
      set('sc_key', 'sc_key', "typeof item === 'string' ? item : ''"),
      set('sc_item', 'sc_item', 'sc_items.find(function (i) { return i.key === sc_key; }) || null'),
      // the latest reply is what "that" offers; with none, the documents are named and the caller says which
      set('sc_last', 'sc_last', "sc_items.filter(function (i) { return i.kind === 'reply'; }).pop() || null"),
      set('sc_last_head', 'sc_last_head', "sc_last ? (sc_last.content.length > 120 ? sc_last.content.slice(0, 120) + '…' : sc_last.content) : ''"),
      set('sc_doc_list', 'sc_doc_list', "sc_items.map(function (i) { return (language === 'es' && i.label_es) || i.label; }).join(language === 'es' ? '; ' : '; ')"),
      when('sc_documents', '!sc_item && !sc_last', say('sc_documents_say', 'I can send you: {{sc_doc_list}}. Tell me which one, and whether by text or email.', 'Puedo enviarle: {{sc_doc_list}}. Dígame cuál, y si por mensaje de texto o por correo.')),
      when('sc_documents_end', '!sc_item && !sc_last', end('sc_documents_done')),
      // the question is built here: a FLOW call's parameters interpolate values, never expressions
      when('sc_offer_q', '!sc_item', set('sc_offer_q_set', 'sc_offer_q', "'Should I send you my last answer: \"' + sc_last_head + '\"? ' + yesNoKeys('en', cargo)")),
      when('sc_offer_q_es', '!sc_item', set('sc_offer_q_es_set', 'sc_offer_q_es', "'¿Le envío mi última respuesta: \"' + sc_last_head + '\"? ' + yesNoKeys('es', cargo)")),
      when('sc_offer', '!sc_item', call('sc_offer_ask', 'ask-choice', {
         question: '{{sc_offer_q}}',
         question_es: '{{sc_offer_q_es}}',
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
      // the web chat link: texted to the caller's number when nothing was named, else emailed to the email on file
      when('sc_link_text', "sc_item.kind === 'web_link' && !sc_medium && !!cargo.twilioNumber && !!textDestination(cargo)", set('sc_link_text_set', 'sc_medium', "'text'")),
      when('sc_link_email', "sc_item.kind === 'web_link' && !sc_medium && validateEmail(String(cargo.otp_email || ''))", set('sc_link_email_set', 'sc_email', 'String(cargo.otp_email)')),
      when('sc_link_email_medium', "sc_item.kind === 'web_link' && !sc_medium && !!sc_email", set('sc_link_email_medium_set', 'sc_medium', "'email'")),
      when('sc_link', "sc_item.kind === 'web_link'", { id: 'sc_link_call', type: 'CALL-TOOL', tool: 'get-web-chat-link', variable: 'sc_link', args: {}, onFail: set('sc_link_failed', 'sc_link', "''") }),
      when('sc_link_none', "sc_item.kind === 'web_link' && !sc_link", say('sc_link_none_say', "Sorry, I couldn't make a link to continue on the web." + ANYTHING_ELSE, 'Lo siento, no pude crear un enlace para continuar en la web.' + ANYTHING_ELSE_ES)),
      when('sc_link_none_end', "sc_item.kind === 'web_link' && !sc_link", end('sc_link_none_done', { outcome: 'unresolved', reason: 'no_web_link' })),
      // the media this item can go by: a sender's declared media; content by text only where the line has a sender and it
      // fits one text message (TEXT_MAX), else by email
      set('sc_content', 'sc_content', "sc_item.kind === 'conversation' ? conversationCopy(cargo.chatTurns, language) : sc_item.kind === 'web_link' ? (language === 'es' ? 'Continúe nuestra conversación en la web: ' : 'Continue our conversation on the web: ') + sc_link : String(sc_item.content || '')"),
      set('sc_too_long', 'sc_too_long', `!sc_item.sender && sc_content.length > ${TEXT_MAX}`),
      set('sc_media', 'sc_media', "Array.isArray(sc_item.media) && sc_item.media.length ? sc_item.media : ((sc_item.sender || cargo.twilioNumber) && !sc_too_long ? ['text', 'email'] : ['email'])"),
      set('sc_forced', 'sc_forced', "sc_media.length === 1 && !!sc_medium && sc_medium !== sc_media[0] ? sc_media[0] : ''"),
      when('sc_forced_long', "sc_forced === 'email' && sc_too_long", say('sc_forced_long_say', "That's too long for a text message, so I'll email it.", 'Es demasiado largo para un mensaje de texto, así que se lo enviaré por correo.')),
      when('sc_forced_email', "sc_forced === 'email' && !sc_too_long", say('sc_forced_email_say', "I can only send that by email, so I'll email it.", 'Solo puedo enviarlo por correo, así que se lo enviaré por correo.')),
      when('sc_forced_text', "sc_forced === 'text'", say('sc_forced_text_say', "I can only send that by text, so I'll text it.", 'Solo puedo enviarlo por mensaje de texto, así que se lo enviaré por mensaje.')),
      set('sc_medium_one', 'sc_medium', "sc_media.length === 1 ? sc_media[0] : sc_medium"),
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

      // another number or email, not given (prod 2026-11-19 14:57: "Can you text it to another number?" was texted to the
      // number on file again): asked here, before any sender or the number on file is used
      set('sc_other', 'sc_other', "typeof other_destination !== 'undefined' && other_destination === true && !(sc_medium === 'email' ? sc_email : sc_phone)"),
      when('sc_other_number', "sc_other && sc_medium === 'text'", call('sc_other_number_call', 'ask-choice', {
         question: 'What phone number should I text it to?', question_es: '¿A qué número de teléfono se lo envío?',
         choices: [], accept_other: true, expect: 'number', digits: { min: 10, max: 11 },
      })),
      when('sc_other_number_read', "sc_other && sc_medium === 'text'", set('sc_other_number_set', 'sc_phone', "readPhone(cargo.choiceText || '')")),
      when('sc_other_number_bad', "sc_other && sc_medium === 'text' && !sc_phone", say('sc_other_number_bad_say', "Sorry, I couldn't read that phone number." + ANYTHING_ELSE, 'Lo siento, no pude entender ese número de teléfono.' + ANYTHING_ELSE_ES)),
      when('sc_other_number_end', "sc_other && sc_medium === 'text' && !sc_phone", end('sc_other_number_done', { outcome: 'unresolved', reason: 'no_phone_number' })),
      when('sc_other_email_clear', "sc_other && sc_medium === 'email'", effect('sc_other_email_clear_set', "cargo.email = ''")),
      when('sc_other_email', "sc_other && sc_medium === 'email'", call('sc_other_email_call', 'ask-email', {
         question: 'What email address should I send it to?', question_es: '¿A qué correo electrónico se lo envío?', on_file: '',
      })),
      when('sc_other_email_read', "sc_other && sc_medium === 'email'", set('sc_other_email_set', 'sc_email', "cargo.email && validateEmail(String(cargo.email)) ? String(cargo.email) : ''")),
      when('sc_other_email_end', "sc_other && sc_medium === 'email' && !sc_email", end('sc_other_email_done')),

      // a sender item: its flow collects what it needs (destination, identity) and tells the caller every outcome
      set('sc_given', 'sc_given', "sc_medium === 'email' ? sc_email : sc_phone"),
      when('sc_sender_reset', '!!sc_item.sender', effect('sc_sender_reset_set', 'cargo.copyHandled = false')),
      when('sc_sender', '!!sc_item.sender', call('sc_sender_call', '{{sc_item.sender}}', { medium: '{{sc_medium}}', destination: '{{sc_given}}', args: '{{sc_item.args}}' })),
      when('sc_sender_failed', '!!sc_item.sender && cargo.copyHandled !== true', say('sc_sender_failed_say', "Sorry, I couldn't send it." + ANYTHING_ELSE, 'Lo siento, no pude enviarlo.' + ANYTHING_ELSE_ES)),
      when('sc_sender_failed_end', '!!sc_item.sender && cargo.copyHandled !== true', end('sc_sender_failed_done', { outcome: 'unresolved', reason: 'send_failed' })),
      when('sc_sender_end', '!!sc_item.sender', end('sc_sender_done')),

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
      set('sc_subject', 'sc_subject', "sc_item.kind === 'web_link' ? (language === 'es' ? 'Continúe nuestra conversación en la web' : 'Continue our conversation on the web') : language === 'es' ? 'Su copia de nuestra conversación' : sc_item.kind === 'conversation' ? 'Your copy of our conversation' : 'Your copy from our conversation'"),
      when('sc_send_text', "sc_medium === 'text'", call('sc_send_text_call', 'send-text', { message: '{{sc_content}}' })),
      when('sc_send_email', "sc_medium === 'email'", call('sc_send_email_call', 'send-email-message', { to: '{{sc_to}}', subject: '{{sc_subject}}', message: '{{sc_content}}', cc: '' })),
      set('sc_sent', 'sc_sent', "sc_medium === 'text' ? cargo.textSent === true : cargo.emailSent === true"),
      when('sc_done_text', "sc_sent && sc_medium === 'text'", say('sc_done_text_say', 'Done. I texted it to the number ending in {{cargo.textTo4}}.' + ANYTHING_ELSE, 'Listo. Se lo envié por mensaje de texto al número que termina en {{cargo.textTo4}}.' + ANYTHING_ELSE_ES)),
      when('sc_done_email', "sc_sent && sc_medium === 'email'", say('sc_done_email_say', 'Done. I emailed it to {{sc_to}}.' + ANYTHING_ELSE, 'Listo. Se lo envié por correo a {{sc_to}}.' + ANYTHING_ELSE_ES)),
      when('sc_failed', '!sc_sent', say('sc_failed_say', "Sorry, I couldn't send it." + ANYTHING_ELSE, 'Lo siento, no pude enviarlo.' + ANYTHING_ELSE_ES)),
      when('sc_failed_end', '!sc_sent', end('sc_failed_done', { outcome: 'unresolved', reason: 'send_failed' })),
   ],
});

export const FLOWS = [sendCopy];
