/**
 * Sendables: what a caller may ask to be sent ("send me that by text", "email me my statement").
 *
 * A flow that produces a document registers it on the session with registerSendable(cargo, entry); a generic sender
 * (the SendCopy flow) offers sendables(cargo) to the ranker and sends the pick without knowing what it is:
 *   - an entry with `content` is sent as is (text or email);
 *   - an entry with `sender` runs that flow with {medium, destination, ...args}; every sender flow takes those three.
 * The host's replies are offered too, from cargo.chatTurns (the host's masked conversation, a list of
 * {n, role, text, source?}); nothing registers them. chatTranscript(turns) formats that list as "role: text" lines.
 */

const REPLY_COUNT = 6;
const REPLY_LABEL_CHARS = 120;

const isText = (value) => typeof value === 'string' && value.trim() !== '';

/**
 * Register (or replace, by key) a document the caller may ask to be sent. Throws on a malformed entry: a flow that
 * registers something unsendable is a flow bug and must fail where it is written, not when a caller asks for it.
 * → true, so it can stand in a SET expression.
 */
export function registerSendable(cargo, entry) {
   if (!cargo || typeof cargo !== 'object') {
      throw new Error('registerSendable: cargo is required');
   } else if (!entry || typeof entry !== 'object') {
      throw new Error('registerSendable: entry must be an object');
   } else if (!isText(entry.key) || entry.key.startsWith('reply-')) {
      throw new Error(`registerSendable: key must be a nonempty string not starting with "reply-" (got ${JSON.stringify(entry.key)})`);
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
   } else {
      const stored = {key: entry.key, label: entry.label, kind: 'document'};
      if (entry.label_es !== undefined) {
         stored.label_es = entry.label_es;
      } else {
         // English label only: the ranker reads the label in either language.
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
 * Everything the caller may ask to be sent now: the registered documents, then the last REPLY_COUNT non-empty
 * assistant turns of cargo.chatTurns, newest last. Each item is {key, label, label_es?, kind, content | sender+args}.
 * A reply's key is "reply-<n>" (its turn number) and its label "Reply <n>: <first 120 characters>".
 */
export function sendables(cargo) {
   const documents = Array.isArray(cargo?.sendables) ? cargo.sendables.filter((item) => isText(item?.key)).map((item) => (item.args ? {...item, args: {...item.args}} : {...item})) : [];
   const turns = Array.isArray(cargo?.chatTurns) ? cargo.chatTurns : [];
   const replies = turns.filter((turn) => turn?.role === 'assistant' && isText(turn.text)).slice(-REPLY_COUNT).map((turn) => {
      const text = turn.text.trim();
      const head = text.length > REPLY_LABEL_CHARS ? text.slice(0, REPLY_LABEL_CHARS) + '…' : text;
      return {key: `reply-${turn.n}`, label: `Reply ${turn.n}: ${head}`, kind: 'reply', content: text};
   });
   return [...documents, ...replies];
}

/**
 * The conversation as "role: text" lines, one per turn, in order: the same text the host's flat chat history has
 * always carried (ChatContextManager.messagesWithRole), so a note built from it reads as before.
 */
export function chatTranscript(turns) {
   if (Array.isArray(turns)) {
      return turns.filter((turn) => turn && typeof turn.role === 'string').map((turn) => `${turn.role}: ${turn.text ?? ''}`).join('\n');
   } else {
      return '';
   }
}
