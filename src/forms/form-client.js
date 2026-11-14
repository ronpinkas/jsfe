/** Optional host adapter. Projection is read-only; submitted values use the installed FORM workers. */
import {formInputApplies, formInitialReadings, enrichFormMatches} from '../helpers/form-state.js';
import {readFormAnswer, readInputProfile} from '../helpers/match-inputs.js';
import {restoreStoredSession} from '../helpers/stored-session.js';

export const FORM_SUBMISSION_PREFIX = 'JSFE_FORM_V1:';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const safe = name => /^[A-Za-z_$][\w$]*$/.test(name) && !['__proto__','constructor','prototype'].includes(name);
const sensitive = input => input.pii === true || /^(?:card_number|card_cvv|card_cvc)$/.test(input.field || input.name);
const label = (input, language) => String(language === 'es' ? input.label_es || input.label || input.name : input.label || input.name);
const pendingForm = session => {
  if (session?.continuationSafetyHold) return null;
  const frame = (session?.flowStacks || []).flat().at(-1);
  const context = frame?.pendingVariable && frame.variables?.form_context;
  if (!context?.form || frame.variables?.form_context?.current === '__confirm') return null;
  let state = session.cargo?.forms?.[context.form];
  if (!state || state.proposalPrompt || state.afterRunning) return null;
  const seen = new Set();
  while (state.parent && state.result_input && !state.context_only && !seen.has(state.id)) {
    seen.add(state.id);
    const parent = session.cargo.forms[state.parent];
    if (!parent) return null;
    state = parent;
  }
  return {state, context};
};

/** Today in an IANA time zone, moved by whole days, as YYYY-MM-DD (UTC arithmetic: no DST shift). */
function daysFromToday(days, timeZone) {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {timeZone, year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date()).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** A public rendering projection, never a serialized flow, executable expression, or session. */
export function projectForm(session, flows) {
  if (flows && Object.values(session?.cargo?.forms || {}).some(state => state?.derived)) {
    // A host can project a saved session without starting an engine turn or changing that session.
    const forms = Object.fromEntries(Object.entries(session.cargo.forms).map(([id, state]) => [id, state && {...state}]));
    session = restoreStoredSession({...session, cargo: {...session.cargo, forms}}, flows);
  }
  const pending = pendingForm(session);
  if (!pending) return null;
  const {state: root, context} = pending, cargo = session.cargo, language = session.language || 'en';
  // Both the code field and its free-text fallback can contain the one-time code.
  const collectingOtp = session.flowStacks.flat().some(frame => frame.flowId === 'get-and-validate-otp-code');
  let askedShown = false;
  const fields = (specs, state, prefix = '', depth = 0) => {
    if (depth > 16) return [];
    const out = [];
    for (const input of specs || []) {
      if (!safe(input.name) || input.form_client === false || input.bind || input.confirmation || !formInputApplies(input, state.values, cargo, state)) continue;
      const path = prefix + input.name;
      const required = input.required_when === undefined || formInputApplies({when: input.required_when}, state.values, cargo, state);
      const isCurrent = state.id === context.form && (input.name === context.current || context.names?.includes(input.name));
      // Optional corrections that require explicit wording belong to their own prompt or chat.
      if (!isCurrent && !required && input.confirm_out_of_order) continue;
      if (input.any_of) {
        // An alternative is a group constraint, not several individually required fields.
        const members = fields(input.any_of, state, prefix, depth + 1).map(field => ({...field, required: false}));
        const groupLabel = language === 'es' ? input.label_es || input.label : input.label;
        if (members.length && isCurrent) askedShown = true;
        if (members.length) out.push({name: input.name, path, kind: 'alternatives', label: groupLabel || '', required, exclusive: input.exclusive === true, ...(isCurrent ? {current: true} : {}), fields: members});
      } else if (input.form && input.schema) {
        if (input.prepare && !state.prepared?.[input.name]) continue;
        const child = cargo.forms[state.children?.[input.name]];
        const snapshot = state.childResults?.[input.name];
        const virtual = child || {values: state.values?.[input.name] || {}, data: snapshot?.data || {}, prepared: snapshot?.prepared || {}, errors: {}};
        const nested = fields(child?.specs || input.schema.inputs, virtual, path + '.', depth + 1);
        if (nested.length && isCurrent) askedShown = true;
        if (nested.length) out.push({name: input.name, path, kind: 'group', label: label(input, language), required, ...(isCurrent ? {current: true} : {}), fields: nested});
      } else if (input.profile) {
        const profile = input.profile;
        if (!['choice','email','phone','amount','digits','identifier','pattern','text'].includes(profile.kind)) continue;
        const field = {name: input.name, path, kind: profile.kind, label: label(input, language), required, sensitive: collectingOtp || sensitive(input), filled: state.values?.[input.name] !== undefined && state.values[input.name] !== '' && !state.errors?.[input.name] && !state.pending?.[input.name]};
        if (profile.kind === 'choice') {
          const choices = input.choices_from ? state.data?.[input.choices_from] : profile.choices;
          if (!Array.isArray(choices)) continue;
          const allowedChoices = new Map();
          for (const choice of choices) {
            if (choice.current_only && !isCurrent) continue;
            const key = String(choice.key);
            if (allowedChoices.has(key)) continue;
            const choiceLabel = language === 'es' ? choice.label_es || choice.label : choice.label;
            allowedChoices.set(key, {key, label: choiceLabel || key});
          }
          const acceptedKey = String(state.values?.[input.name]);
          // A settled choice restricted to its own prompt cannot be represented by this picker.
          if (!isCurrent && field.filled && !allowedChoices.has(acceptedKey) &&
              choices.some(choice => choice.current_only && String(choice.key) === acceptedKey)) continue;
          field.choices = [...allowedChoices.values()];
          // A choice that also takes other text is drawn only as a combobox (a text box offering its choices, which may
          // be none yet); a select could not hold the other text.
          if (profile.accept_other ? input.form_client?.control !== 'combobox' : !field.choices.length) continue;
        }
        field.constraints = Object.fromEntries(['min','max'].filter(key => typeof profile[key] === 'number').map(key => [key, profile[key]]));
        // The control the input declares (validated at definition time). Its bounds replace the profile's, which for
        // some kinds are lengths: a number's are values, a date's are days from today turned into YYYY-MM-DD dates.
        const control = input.form_client?.control;
        if (control === 'number' || control === 'date') {
          field.control = control;
          field.constraints = Object.fromEntries(['min','max'].filter(key => Number.isInteger(input.form_client[key]))
            .map(key => [key, control === 'date' ? daysFromToday(input.form_client[key], input.form_client.timezone) : input.form_client[key]]));
          if (control === 'date' && input.form_client.range_from) field.range_from = prefix + input.form_client.range_from;
        } else if (control === 'place' || control === 'postal') {
          // Suggestions and lookups come from the host's place service; the profile's bounds still apply to the typed text.
          // fills names the card's fields (by path) that a pick or a looked-up code fills, with the part each takes.
          const {types, regions, fills} = input.form_client;
          field.control = control;
          field[control] = {...(types ? {types} : {}), ...(regions ? {regions: regions.map(region => region.toLowerCase())} : {}),
            ...(fills ? {fills: Object.fromEntries(Object.entries(fills).map(([name, part]) => [prefix + name, part]))} : {})};
        } else if (control === 'combobox') {
          field.control = control;
        } else if (control === 'options') {
          // Ready replies beside the box: a pick is submitted as its key, read by the profile like typed text.
          field.control = control;
          const offered = state.data?.[input.form_client.options_from];
          const options = new Map();
          for (const option of Array.isArray(offered) ? offered : []) {
            const key = option && (typeof option.key === 'string' || typeof option.key === 'number') ? String(option.key) : '';
            const optionLabel = option ? (language === 'es' ? option.label_es || option.label : option.label) : '';
            if (key && !options.has(key)) options.set(key, {key, label: typeof optionLabel === 'string' && optionLabel ? optionLabel : key});
            else { /* no key, or a key already offered */ }
          }
          field.options = [...options.values()];
        } else { /* the profile's own box */ }
        // The browser may fill the box from its saved data (an address, a name).
        if (input.form_client?.autofill && !field.sensitive) field.autofill = input.form_client.autofill;
        // A declinable field may be left blank: the submission names it in `declined` (answered, no value).
        if (input.declinable === true) {
          field.declinable = true;
          if (field.filled && state.values[input.name] === null) field.declined = true;
        }
        if (!field.sensitive && ['string','number','boolean'].includes(typeof state.values?.[input.name])) field.value = state.values[input.name];
        // A worded refusal is shown with its field; the bare 'invalid' flag (a refusal with no message, or a whole-form
        // validator asking for this field) is not caller text: the reply above says what is needed and `current` points here.
        const error = state.errors?.[input.name];
        if (error && error !== 'invalid') field.error = String(error);
        // The field the conversation is asking for now, so a client can point at it on a redrawn form.
        if (isCurrent) {field.current = true; askedShown = true;}
        out.push(field);
      }
    }
    return out;
  };
  const projected = fields(root.specs, root);
  // A card that cannot take the answer being asked for (a chat-only or not yet prepared field) is not drawn: the
  // question is answered in chat, never beside a form that has no place for it.
  const asked = context.names?.length || context.current;
  if (asked && !askedShown) return null;
  if (!projected.length) return null;
  // A card holding one plain box adds nothing to the client's own message box, so the question is asked in chat. One field
  // keeps its card when it has a control (a list, a stepper, a date, a place, ready replies) or is sensitive (masked).
  const leaves = [];
  const gather = list => { for (const field of list) field.fields ? gather(field.fields) : leaves.push(field); };
  gather(projected);
  const plain = field => field.kind !== 'choice' && !field.control && !field.sensitive;
  if (leaves.length === 1 && plain(leaves[0])) return null;
  return {version: 1, form: root.id, language, fields: projected};
}

const STANDARD_LABELS = {yes: {en: 'Yes', es: 'Sí'}, no: {en: 'No', es: 'No'}};
const MAX_CHOICE_OPTIONS = 12;
const said = text => String(text ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * The options of the question asked now, when it has a closed, labelled set, for a client that draws them as buttons or a list:
 * {version: 1, language, options: [{key, label, say}]}, else null. Only a question asked by ask-choice qualifies (a
 * confirmation, a menu, a choice asked in chat), and only when every option it offers has a label in the session's
 * language (yes and no have standard ones). An option keyed 'event:' is an interrupt word, never offered. A tap sends `say`
 * as the caller's own message: the label when the option reads it, else the option's first word or key that is not a
 * number, else its first key; so the answer is read by the question's own reader. A host offers this only when no form
 * card is drawn (projectForm is null).
 */
export function projectChoices(session) {
  if (!session || session.continuationSafetyHold) return null;
  const frame = (session.flowStacks || []).flat().at(-1);
  if (!frame?.pendingVariable || frame.flowId !== 'ask-choice') return null;
  const language = session.language === 'es' ? 'es' : 'en';
  const choices = Array.isArray(frame.variables?.choices) ? frame.variables.choices.filter(choice => !String(choice?.key ?? '').startsWith('event:')) : [];
  if (choices.length < 2 || choices.length > MAX_CHOICE_OPTIONS) return null;
  const options = [], seen = new Set();
  for (const choice of choices) {
    const key = String(choice.key ?? '');
    const label = String((language === 'es' ? choice.label_es || choice.label : choice.label) || STANDARD_LABELS[key]?.[language] || '').trim();
    if (!key || !label || seen.has(key)) return null;
    seen.add(key);
    const words = [].concat(choice.phrases ?? choice.words ?? []).map(String);
    const reads = words.some(word => said(word) === said(label)) || (STANDARD_LABELS[key] && label === STANDARD_LABELS[key][language]);
    const say = reads ? label : words.find(word => !/^\d+$/.test(word.trim())) || words[0] || '';
    if (!say) return null;
    options.push({key, label, say});
  }
  return {version: 1, language, options};
}

/** The words the question asked now offers as its answers (each choice's phrases and labels), or [] when none is
 * pending. Read-only. A host that answers some messages itself before the engine (a request to hear the last reply
 * again, "again" / "otra vez") checks a message against these first, so an offered answer always reaches the flow:
 * prod 2026-11-11, a payment-link failure menu offered AGAIN and the host replayed the menu instead. Covers an
 * ask-choice question and a form's current choice input (its runtime choices, choices_from included). */
export function offeredReplies(session) {
  if (!session || session.continuationSafetyHold) return [];
  const frame = (session.flowStacks || []).flat().at(-1);
  if (!frame?.pendingVariable) return [];
  const out = new Set();
  const take = choices => {
    for (const choice of Array.isArray(choices) ? choices : []) {
      if (!choice || String(choice.key ?? '').startsWith('event:')) continue;
      for (const word of [].concat(choice.phrases ?? choice.words ?? [], choice.label ?? [], choice.label_es ?? [])) {
        if (typeof word === 'string' && word.trim()) out.add(word.trim());
      }
    }
  };
  if (frame.flowId === 'ask-choice') {
    take(frame.variables?.choices);
  } else {
    const context = frame.variables?.form_context;
    const state = context?.form && context.current !== '__confirm' ? session.cargo?.forms?.[context.form] : null;
    const names = new Set([].concat(context?.names || [], context?.current || []));
    for (const input of state?.specs || []) {
      if (!names.has(input.name) || input.profile?.kind !== 'choice') continue;
      take(input.choices_from ? state.data?.[input.choices_from] : input.profile.choices);
    }
  }
  return [...out];
}
/** Host preflight: call before updateActivity. Unknown paths and malformed envelopes never enter execution. */
/** The place a view's field suggests, or null: the host's suggestion endpoint answers only for a place field of the
 * form that is open now (`form` is the view's instance, `path` the field's), so it is never a general place service. */
export function formPlaceField(view, form, path) {
  if (!view || view.form !== form || typeof path !== 'string') return null;
  const walk = fields => {
    for (const field of fields || []) {
      if (field.fields) { const found = walk(field.fields); if (found) return found; }
      else if (field.path === path && field.control === 'place') return field.place;
      else { /* another field */ }
    }
    return null;
  };
  return walk(view.fields);
}

export function parseFormSubmission(prompt, view) {
  if (typeof prompt !== 'string' || !prompt.trim().startsWith('JSFE_FORM_')) return null;
  prompt = prompt.trim();
  if (!prompt.startsWith(FORM_SUBMISSION_PREFIX)) throw new Error('Unsupported form submission version.');
  if ([...prompt].length > 8096) throw new Error('Form submission is too long.');
  let envelope;
  try { envelope = JSON.parse(prompt.slice(FORM_SUBMISSION_PREFIX.length)); }
  catch { throw new Error('Invalid form submission JSON.'); }
  if (!object(envelope) || Object.keys(envelope).some(key => !['form','values','declined'].includes(key)) || !object(envelope.values)) throw new Error('Expected form and values.');
  if (envelope.declined !== undefined && (!Array.isArray(envelope.declined) || envelope.declined.some(path => typeof path !== 'string') || new Set(envelope.declined).size !== envelope.declined.length)) throw new Error('Declined must list field paths.');
  if (!view || view.version !== 1 || envelope.form !== view.form) throw new Error('This form is no longer the current input request.');
  const allowed = new Set(), declinable = new Set();
  const collect = fields => { for (const field of fields) field.fields ? collect(field.fields) : (allowed.add(field.path), field.declinable && declinable.add(field.path)); };
  collect(view.fields);
  let count = 0;
  const walk = (values, prefix = '', depth = 0) => {
    if (depth > 16) throw new Error('Form nesting is too deep.');
    for (const [name, value] of Object.entries(values)) {
      if (!safe(name)) throw new Error('Unsafe field name.');
      const path = prefix + name;
      if (object(value)) {
        if (![...allowed].some(field => field.startsWith(path + '.'))) throw new Error('Unknown form field.');
        walk(value, path + '.', depth + 1);
      } else {
        if (!allowed.has(path)) throw new Error('Unknown form field.');
        if (typeof value !== 'string') throw new Error('Form values must be strings.');
        if (value.trim()) count++;
      }
    }
  };
  walk(envelope.values);
  // A declined field is answered with no value: a null at its path (a declinable field left blank, never one with text).
  const values = structuredClone(envelope.values);
  for (const path of envelope.declined || []) {
    if (!declinable.has(path)) throw new Error('This field cannot be left without a value.');
    const names = path.split('.'), leaf = names.pop();
    let node = values;
    for (const name of names) node = object(node[name]) ? node[name] : (node[name] = {});
    if (typeof node[leaf] === 'string' && node[leaf].trim()) throw new Error('A declined field has a value.');
    node[leaf] = null;
    count++;
  }
  if (!count) throw new Error('Enter at least one field value.');
  return {prompt, form: envelope.form, values};
}

/** Install these two overrides for one preflighted submission turn only; restore the host's functions afterwards.
 * No parser, new state, or changed behavior is installed on ordinary clients/turns.
 */
export function formSubmissionReaders(submission, getSession) {
  return {
    readFormAnswer(answer, candidates, current, choiceKey, questions = []) {
      if (String(answer).trim() !== submission.prompt) return readFormAnswer(answer, candidates, current, choiceKey, questions);
      const cargo = getSession().cargo, state = cargo.forms[submission.form];
      if (!state) throw new Error('Submitted form no longer exists.');
      const hits = formInitialReadings(state, submission.values, cargo).map(hit => {
        if (hit.declined === true) return {...hit, origin: 'form_submission', current: false, utterance: ''};
        // Prepared enums carry their current choices in the existing candidate chain.
        const profile = candidates.find(candidate => candidate.form === hit.form && candidate.name === hit.name)?.profile || hit.profile;
        const raw = hit.raw;
        const read = profile.kind === 'choice'
          ? (profile.choices || []).some(choice => String(choice.key) === raw && (!choice.current_only || hit.form === current.form && (hit.name === current.name || current.names?.includes(hit.name)))) ? {value: raw}
            // A combobox's own text: a choice that takes other text keeps it (with a letter when the profile asks for one).
            : profile.accept_other === true && raw.trim() && (!profile.other_needs_letter || /\p{L}/u.test(raw)) ? {value: raw.trim()} : null
          : readInputProfile({...profile, marked: false}, raw, true);
        const valid = read && Object.hasOwn(read, 'value') && read.value !== '' && read.refused !== true && !read.incompleteMoney;
        return {...hit, value: valid ? read.value : raw, invalid: !valid, origin: 'form_submission', current: false, utterance: ''};
      });
      // A card re-sends every field it shows. A field sent back with the value the form already holds is not an answer:
      // it is neither acknowledged nor checked again (prod 2026-11-12: "Thank you, I already have your product number"
      // on every store-card submission). A changed value is a correction, as before. When nothing at all changed, the
      // readings stand, so the turn is never read as empty.
      const unchanged = hit => {
        const held = cargo.forms[hit.form]?.values;
        if (!held || !Object.hasOwn(held, hit.name)) return false;
        return hit.declined === true ? held[hit.name] === null : !hit.invalid && held[hit.name] !== null && held[hit.name] !== undefined
          && typeof held[hit.name] !== 'object' && String(held[hit.name]) === String(hit.value);
      };
      const changed = hits.filter(hit => !unchanged(hit));
      const read = changed.length ? changed : hits;
      return {hits: read, ambiguous: [], remaining: [], questions: [], refused: [], decisions: read.map(hit => ({form: hit.form, name: hit.name, rule: 'form_submission'}))};
    },
    enrichFormMatches(matches, chain, form, names = [], asked = '') {
      const result = enrichFormMatches(matches, chain, form, names, asked);
      result.hits = result.hits.map(hit => {
        if (hit.origin !== 'form_submission') return hit;
        // Use the original prompt match for acknowledgment before bypassing conversational extraction.
        return {...hit, silent: hit.silent || hit.current, current: false, out_of_order_number: false};
      });
      return result;
    }
  };
}
