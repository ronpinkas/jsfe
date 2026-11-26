/**
 * Sendables: what a caller may ask to be sent ("send me that by text", "email me my statement").
 *
 * A flow that produces a document registers it on the session with registerSendable(cargo, entry); a generic sender
 * (the SendCopy flow) offers sendables(cargo) to the ranker and sends the pick without knowing what it is:
 *   - an entry with `content` is sent as is (text or email);
 *   - an entry with `sender` runs that flow with {medium, destination, ...args}; every sender flow takes those three.
 * The host's replies are offered too, from cargo.chatTurns (the host's masked conversation, a list of
 * {n, role, text, source?}); nothing registers them. chatTranscript(turns) formats that list as "role: text" lines.
 * Once the assistant has replied, the whole conversation is offered too (key CONVERSATION_KEY, email only): it carries no
 * content, because its text is the caller's language's copy, conversationCopy(cargo.chatTurns, language), made at send time.
 * Off the web chat (a call, SMS, WhatsApp, email) a link that continues this conversation on the web is offered too (key
 * WEB_LINK_KEY, owner 2026-11-26): no content either, since the host's get-web-chat-link tool makes the link at send time.
 */

const REPLY_COUNT = 6;
const REPLY_LABEL_CHARS = 120;
/** The whole conversation's key in sendables(cargo); like "reply-<n>", no flow may register or declare it. */
export const CONVERSATION_KEY = 'conversation';
/** The web chat link's key in sendables(cargo); reserved like CONVERSATION_KEY. */
export const WEB_LINK_KEY = 'web-link';
const RESERVED_KEYS = `a key starting with "reply-", "${CONVERSATION_KEY}" or "${WEB_LINK_KEY}"`;
const reservedKey = (key) => key.startsWith('reply-') || key === CONVERSATION_KEY || key === WEB_LINK_KEY;
/** The channels a caller is not on the web chat in, where a link to continue on the web is offered. */
const OFF_WEB_CHANNELS = ['voice', 'sms', 'whatsapp', 'email'];
const SPEAKERS = {en: {user: 'You', assistant: 'Assistant'}, es: {user: 'Usted', assistant: 'Asistente'}};

const isText = (value) => typeof value === 'string' && value.trim() !== '';
const MEDIA = ['text', 'email'];
/** media, when given: a nonempty list of distinct 'text' / 'email' (what the sender can send by). */
const mediaError = (media) => (media === undefined || (Array.isArray(media) && media.length && media.every((m) => MEDIA.includes(m)) && new Set(media).size === media.length)
   ? '' : `media must be a nonempty list of distinct ${MEDIA.join(' / ')}`);

/**
 * Register (or replace, by key) a document the caller may ask to be sent. Throws on a malformed entry: a flow that
 * registers something unsendable is a flow bug and must fail where it is written, not when a caller asks for it.
 * disclaimer / disclaimer_es (a content entry only): said before the document is sent to a number or email that is not the
 * caller's own, with the read-back SendCopy asks then (owner 2026-11-26).
 * → true, so it can stand in a SET expression.
 */
export function registerSendable(cargo, entry) {
   if (!cargo || typeof cargo !== 'object') {
      throw new Error('registerSendable: cargo is required');
   } else if (!entry || typeof entry !== 'object') {
      throw new Error('registerSendable: entry must be an object');
   } else if (!isText(entry.key) || reservedKey(entry.key)) {
      throw new Error(`registerSendable: key must be a nonempty string, not ${RESERVED_KEYS} (got ${JSON.stringify(entry.key)})`);
   } else if (!isText(entry.label)) {
      throw new Error(`registerSendable(${entry.key}): label must be a nonempty string`);
   } else if (entry.label_es !== undefined && !isText(entry.label_es)) {
      throw new Error(`registerSendable(${entry.key}): label_es, when given, must be a nonempty string`);
   } else if (isText(entry.content) === isText(entry.sender)) {
      throw new Error(`registerSendable(${entry.key}): exactly one of content (the text to send) or sender (a flow id) is required`);
   } else if (entry.args !== undefined && (entry.args === null || typeof entry.args !== 'object' || Array.isArray(entry.args))) {
      throw new Error(`registerSendable(${entry.key}): args, when given, must be an object`);
   } else if (entry.args !== undefined && !isText(entry.sender)) {
      throw new Error(`registerSendable(${entry.key}): args belong to a sender entry`);
   } else if ((entry.disclaimer !== undefined && !isText(entry.disclaimer)) || (entry.disclaimer_es !== undefined && !isText(entry.disclaimer_es))) {
      throw new Error(`registerSendable(${entry.key}): disclaimer and disclaimer_es, when given, must be nonempty strings`);
   } else if (entry.disclaimer !== undefined && isText(entry.sender)) {
      throw new Error(`registerSendable(${entry.key}): a disclaimer belongs to a content entry (a sender flow gates its own destination)`);
   } else if (mediaError(entry.media)) {
      throw new Error(`registerSendable(${entry.key}): ${mediaError(entry.media)}`);
   } else {
      const stored = {key: entry.key, label: entry.label, kind: 'document', ...(entry.media ? {media: [...entry.media]} : {})};
      if (entry.label_es !== undefined) {
         stored.label_es = entry.label_es;
      } else {
         // English label only: the ranker reads the label in either language.
      }
      for (const field of ['disclaimer', 'disclaimer_es']) {
         if (isText(entry[field])) {
            stored[field] = entry[field];
         } else {
            // not declared: no warning before a send to someone else
         }
      }
      if (isText(entry.content)) {
         stored.content = entry.content;
      } else {
         stored.sender = entry.sender;
         stored.args = {...(entry.args || {})};
      }
      const list = Array.isArray(cargo.sendables) ? cargo.sendables.filter((item) => item?.key !== entry.key) : [];
      list.push(stored);
      cargo.sendables = list;
      return true;
   }
}

/**
 * Everything the caller may ask to be sent now: the registered documents, the whole conversation (once the assistant has
 * replied), the web chat link (off the web chat: cargo.voice, or channel voice / sms / whatsapp / email), then the last
 * REPLY_COUNT non-empty assistant turns of cargo.chatTurns, newest last. Each item is {key, label, label_es?, kind, media?,
 * content | sender+args}; the conversation is {key: CONVERSATION_KEY, kind: 'conversation'} with no content
 * (conversationCopy makes it; SendCopy texts it when it fits one message, else emails it), and the link {key: WEB_LINK_KEY,
 * kind: 'web_link'} with none (SendCopy asks the host's get-web-chat-link tool for it). A reply's key is "reply-<n>" (its
 * turn number) and its label "Reply <n>: <first 120 characters>".
 */
export function sendables(cargo) {
   const documents = Array.isArray(cargo?.sendables) ? cargo.sendables.filter((item) => isText(item?.key)).map((item) => (item.args ? {...item, args: {...item.args}} : {...item})) : [];
   const turns = Array.isArray(cargo?.chatTurns) ? cargo.chatTurns : [];
   const replies = turns.filter((turn) => turn?.role === 'assistant' && isText(turn.text)).slice(-REPLY_COUNT).map((turn) => {
      const text = turn.text.trim();
      const head = text.length > REPLY_LABEL_CHARS ? text.slice(0, REPLY_LABEL_CHARS) + '…' : text;
      return {key: `reply-${turn.n}`, label: `Reply ${turn.n}: ${head}`, kind: 'reply', content: text};
   });
   const conversation = replies.length
      ? [{key: CONVERSATION_KEY, label: 'The whole conversation', label_es: 'Toda nuestra conversación', kind: 'conversation'}]
      : [];
   const webLink = cargo?.voice === true || OFF_WEB_CHANNELS.includes(cargo?.channel)
      ? [{key: WEB_LINK_KEY, label: 'A link to continue this conversation on the web', label_es: 'Un enlace para continuar esta conversación en la web', kind: 'web_link'}]
      : [];
   return [...documents, ...conversation, ...webLink, ...replies];
}

/**
 * The conversation as the caller receives a copy of it: "You: …" / "Assistant: …" ("Usted" / "Asistente" in Spanish),
 * one paragraph per non-empty turn, in order. The turns are the host's masked text (cargo.chatTurns). → '' for none.
 */
export function conversationCopy(turns, language = 'en') {
   const speakers = SPEAKERS[language] || SPEAKERS.en;
   if (Array.isArray(turns)) {
      return turns.filter((turn) => turn && speakers[turn.role] && isText(turn.text)).map((turn) => `${speakers[turn.role]}: ${turn.text.trim()}`).join('\n\n');
   } else {
      return '';
   }
}

const OMITTED = '[earlier turns omitted]';
/**
 * The conversation as "role: text" lines, one per turn, in order: the same text the host's flat chat history has
 * always carried (ChatContextManager.messagesWithRole), so a note built from it reads as before.
 * `maxLength` (optional, for a field with a length limit: a CRM description takes 2,000 characters, prod 2026-11-20): the
 * latest whole turns that fit, after a line saying earlier turns were left out; a last turn longer than the room keeps its
 * end. Without it the whole conversation, as before.
 */
export function chatTranscript(turns, maxLength) {
   if (Array.isArray(turns)) {
      const lines = turns.filter((turn) => turn && typeof turn.role === 'string').map((turn) => `${turn.role}: ${turn.text ?? ''}`);
      const whole = lines.join('\n');
      const max = Number(maxLength);
      if (maxLength === undefined || maxLength === null || !Number.isFinite(max) || whole.length <= max) {
         return whole;
      } else if (max <= OMITTED.length + 1) {
         return whole.slice(whole.length - Math.max(0, Math.floor(max)));
      } else {
         const room = Math.floor(max) - OMITTED.length - 1;
         const kept = [];
         let used = 0;
         for (let i = lines.length - 1; i >= 0; i--) {
            const cost = lines[i].length + (kept.length ? 1 : 0);
            if (used + cost > room) break;
            kept.unshift(lines[i]);
            used += cost;
         }
         return `${OMITTED}\n${kept.length ? kept.join('\n') : lines[lines.length - 1].slice(lines[lines.length - 1].length - room)}`;
      }
   } else {
      return '';
   }
}

/**
 * A flow's declared sendable: `sendable: {key, label, label_es?, media?}` on its definition means the caller may ask for it at
 * any time (a statement nobody has produced yet), and that flow is its sender. → the problem with it, or '' when valid.
 */
export function sendableDeclarationError(sendable) {
   if (!sendable || typeof sendable !== 'object' || Array.isArray(sendable)) {
      return 'sendable must be an object {key, label, label_es?}';
   } else if (!isText(sendable.key) || reservedKey(sendable.key)) {
      return `sendable.key must be a nonempty string, not ${RESERVED_KEYS}`;
   } else if (!isText(sendable.label)) {
      return 'sendable.label must be a nonempty string';
   } else if (sendable.label_es !== undefined && !isText(sendable.label_es)) {
      return 'sendable.label_es, when given, must be a nonempty string';
   } else if (mediaError(sendable.media)) {
      return `sendable.${mediaError(sendable.media)}`;
   } else {
      const extra = Object.keys(sendable).filter((k) => !['key', 'label', 'label_es', 'media'].includes(k));
      return extra.length ? `sendable takes only key, label, label_es and media (not ${extra.join(', ')})` : '';
   }
}

/**
 * Bring cargo.sendables in line with the flows' declarations (the engine calls it each turn): declared entries are
 * replaced by the current ones ({kind:'document', sender:<flow id>, args:{}, declared:true}); an entry a flow
 * registered at run time (registerSendable) keeps its key. An invalid declaration is skipped (validation reports it).
 */
export function syncDeclaredSendables(cargo, flows) {
   if (!cargo || typeof cargo !== 'object') {
      return;
   } else {
      const registered = (Array.isArray(cargo.sendables) ? cargo.sendables : []).filter((item) => item && item.declared !== true);
      const keys = new Set(registered.map((item) => item.key));
      const declared = [];
      for (const flow of Array.isArray(flows) ? flows : []) {
         const s = flow?.sendable;
         if (s === undefined || sendableDeclarationError(s) || keys.has(s.key)) {
            continue; // none, invalid, or a run-time entry already holds the key
         } else {
            keys.add(s.key);
            declared.push({key: s.key, label: s.label, ...(s.label_es ? {label_es: s.label_es} : {}), kind: 'document', sender: flow.id, args: {}, ...(s.media ? {media: [...s.media]} : {}), declared: true});
         }
      }
      if (declared.length || registered.length !== (cargo.sendables || []).length) {
         cargo.sendables = [...declared, ...registered];
      } else {
         // nothing declared and nothing to remove: cargo is left as it was
      }
   }
}
