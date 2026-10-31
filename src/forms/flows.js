import {ANSWER_WORDS} from '../helpers/answer.js';
import {CONTEXTUAL_RESPONSES_REQUIREMENT,hasFormResponse,contextualResponseRuntimeSteps} from '../helpers/contextual-response.js';
/**
 * The FORM convention's system workers (owner direction and decisions 2026-10-19; spec: the jsfe-flow-designer skill,
 * references/collect-input-pattern.md and references/manifests.md). This file is their SOURCE: the flows below are
 * written into system.flows.dev.json by id, and --check fails when the file differs. Never edit them in the JSON.
 *
 *   node forms/system-forms.mjs --write    # replace / append these flows in system.flows.dev.json
 *   node forms/system-forms.mjs --check    # exit 1 when system.flows.dev.json differs from this source
 *
 * Collection:  run-form (the reentrant loop, shared scope), collect-input (ask one input, read the answer against the
 *              form chain), collect-input-accept (validate + store, one reading at a time), disambiguate-input,
 *              form-done (hand the result to the parent, clear the form), the field collectors (collect-phone…) and
 *              the sub-forms collect-address and collect-credit-card, validate-card-number / validate-card-expiration.
 * Retrieval:   provide-data (gate → load → answer), load-source, answer-facts.
 *
 * State lives in cargo.forms[<form id>] = { values, attempts, replays, parent, result_input, specs }: cargo is the only
 * state that survives DISPATCH and reboot, so a caller who leaves a form resumes it. Results of finished forms:
 * cargo.formResults[<form id>].
 */
import {INPUT_PROPOSALS_REQUIREMENT,hasInputProposals,proposalRuntimeSteps} from './proposal-runtime.js';
import { resolveFormInputs, validateFormIncompleteOutcome, validateFormExhaustion } from '../helpers/form-state.js';

// ── step helpers ────────────────────────────────────────────────────────────────────────────────────────────────
const SET = (id, variable, value) => ({ id, type: 'SET', variable, value });
const SIDE = (id, value) => SET(id, 'assignment_side_effect', value);
const NOOP = (id) => SET(id, 'noop', 'true');
const SAY = (id, value, value_es) => ({ id, type: 'SAY', value, value_es });
const END = (id, extra = {}) => ({ id, type: 'END', ...extra });
const FLOW = (id, value, callType = 'call', parameters) => ({ id, type: 'FLOW', value, callType, ...(callType === 'replace' ? { initializeDefaults: true } : {}), ...(parameters ? { parameters } : {}) });
/** One conditional step: a CASE with one branch and a no-op default (the engine has no step-level guard). */
const WHEN = (id, condition, step) => ({ id, type: 'CASE', branches: { [`condition: ${condition}`]: step, default: NOOP(`${id}_skip`) } });
const vars = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { type: Array.isArray(v) ? 'array' : v === null || typeof v === 'object' ? 'object' : typeof v, value: v }]));
const incompleteAttrs=(form,reason)=>({outcome:`{{formIncompleteOutcome(cargo,${form},{outcome:'unresolved',reason:${reason}}).outcome}}`,reason:`{{formIncompleteOutcome(cargo,${form},{outcome:'unresolved',reason:${reason}}).reason}}`});
const recoveryAttrs=(form,reason,failure=false,mode='resume')=>{const call=`formConversationOutcome(cargo,${form},${reason},${failure},${JSON.stringify(mode)})`;return {outcome:`{{${call}.outcome}}`,reason:`{{${call}.reason}}`,recovery:{version:1,mode:`{{${call}.recovery.mode}}`,reason:`{{${call}.recovery.reason}}`,form:`{{${call}.recovery.form || ''}}`,flow:`{{${call}.recovery.flow || ''}}`}};};
const incompleteDispatch=(id,form,reason)=>({id,type:'DISPATCH',...recoveryAttrs(form,reason,true,'none')});
const yieldDispatch=(id,form,reason)=>({id,type:'DISPATCH',...recoveryAttrs(form,reason)});
const recoveryStamp=(id,form,reason,mode='resume')=>({...SET(id,'noop','true'),recovery:recoveryAttrs(form,reason,true,mode).recovery});
const optionalIncomplete=(id,condition,form,reason)=>WHEN(id,`(${condition}) && !!formIncompleteOutcome(cargo,${form},{outcome:'unresolved',reason:${reason}}).owner`,incompleteDispatch(id+'_dispatch',form,reason));


/** A SET value that yields this text: with {{ }} it is a template (as is); without, a JS string literal. */
export const textValue = (text) => (String(text).includes('{{') ? String(text) : JSON.stringify(String(text)));
// Keys for a numbered menu: 1..9 without 8, the language key (owner rule 2026-10-19).
const KEYS_JS = "(function (n) { var k = []; for (var i = 1; k.length < n && i <= 9; i++) { if (i !== 8) { k.push(String(i)); } } return k; })";
// Month names a card expiration may be said with (English, Spanish), longest first so 'sept' is not read as 'sep'.
const MONTH_NAMES = [['september',9],['septiembre',9],['setiembre',9],['february',2],['febrero',2],['november',11],['noviembre',11],
   ['december',12],['diciembre',12],['january',1],['octubre',10],['october',10],['august',8],['agosto',8],['enero',1],['marzo',3],
   ['march',3],['abril',4],['april',4],['junio',6],['julio',7],['mayo',5],['june',6],['july',7],['sept',9],['jan',1],['ene',1],
   ['feb',2],['mar',3],['apr',4],['abr',4],['may',5],['jun',6],['jul',7],['aug',8],['ago',8],['sep',9],['oct',10],['nov',11],
   ['dec',12],['dic',12]];
const MONTH_RE = MONTH_NAMES.map(([n]) => n).join('|');

// ── field presets (decision 2A): ONE library, read only by collect-input ─────────────────────────────────────────
// A form uses a preset by name ({ name, field }); keys it gives override the preset's (e.g. a tenant's account pattern).
export const FIELD_PRESETS = {
   phone: { label: 'phone number', label_es: 'número de teléfono', profile: { kind: 'phone' }, digits: { min: 10, max: 11 },
      question: 'What is your phone number?', question_es: '¿Cuál es su número de teléfono?',
      retry: 'Please say or enter your 10-digit phone number.', retry_es: 'Por favor diga o ingrese su número de teléfono de 10 dígitos.',
      retry_text: 'Please type your 10-digit phone number.', retry_text_es: 'Por favor escriba su número de teléfono de 10 dígitos.' },
   email: { label: 'email address', label_es: 'correo electrónico', profile: { kind: 'email' },
      question: 'What is your email address?', question_es: '¿Cuál es su correo electrónico?',
      retry: 'Please say your email address, for example juan at gmail dot com.', retry_es: 'Por favor diga su correo electrónico, por ejemplo juan arroba gmail punto com.' },
   zip: { label: 'ZIP code', label_es: 'código postal', profile: { kind: 'digits', min: 5, max: 5 }, digits: { min: 5, max: 5 },
      question: 'What is your ZIP code?', question_es: '¿Cuál es su código postal?',
      retry: 'Please say or enter your 5-digit ZIP code.', retry_es: 'Por favor diga o ingrese su código postal de 5 dígitos.',
      retry_text: 'Please type your 5-digit ZIP code.', retry_text_es: 'Por favor escriba su código postal de 5 dígitos.' },
   account_number: { label: 'account number', label_es: 'número de cuenta', profile: { kind: 'identifier', pattern: '^\\d{6,12}$' }, digits: { min: 6, max: 12 },
      question: 'What is your account number?', question_es: '¿Cuál es su número de cuenta?',
      retry: 'Please say or enter your account number.', retry_es: 'Por favor diga o ingrese su número de cuenta.',
      retry_text: 'Please type your account number.', retry_text_es: 'Por favor escriba su número de cuenta.' },
   ssn_last4: { label: 'last four digits of your Social Security number', label_es: 'últimos cuatro dígitos de su Seguro Social',
      profile: { kind: 'digits', min: 4, max: 4 }, digits: { min: 4, max: 4 }, pii: true,
      question: 'What are the last four digits of your Social Security number?', question_es: '¿Cuáles son los últimos cuatro dígitos de su Seguro Social?' },
   amount: { label: 'amount', label_es: 'monto', profile: { kind: 'amount', min: 0.01 }, amount: true,
      question: 'How much?', question_es: '¿Cuánto?' },
   street_address: { label: 'street address', label_es: 'dirección', profile: { kind: 'text' },
      question: 'What is your street address?', question_es: '¿Cuál es su dirección?' },
   city: { label: 'city', label_es: 'ciudad', profile: { kind: 'text' }, question: 'What city?', question_es: '¿En qué ciudad?' },
   state: { label: 'state', label_es: 'estado', profile: { kind: 'pattern', regex: '^\\s*(?:Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|District of Columbia|Puerto Rico|AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC|PR)\\s*$' },
      question: 'What state?', question_es: '¿En qué estado?' },
   card_number: { label: 'card number', label_es: 'número de tarjeta', accumulate: true, accumulate_first: '^[2-6]', profile: { kind: 'digits', min: 13, max: 19 }, digits: { min: 13, max: 19, complete:[{first:'4',lengths:[16,19]},{first:'25',lengths:[16]},{first:'3',lengths:[15]},{first:'6',lengths:[16,19]}] },
      pii: true, validator: 'validate-card-number',
      question: 'Please say or enter your card number.', question_es: 'Por favor diga o ingrese el número de su tarjeta.',
      question_text: 'Please type your card number.', question_text_es: 'Por favor escriba el número de su tarjeta.',
      retry: 'Please say or enter the full card number.', retry_es: 'Por favor diga o ingrese el número completo de su tarjeta.',
      retry_text: 'Please type the full card number.', retry_text_es: 'Por favor escriba el número completo de su tarjeta.' },
   card_expiration: { label: 'expiration date', label_es: 'fecha de vencimiento',
      // MM0YY: a zero said between month and year ("020 28", prod 2026-10-25 14:10, was taken for the billing ZIP).
      // Up to two words between month and year ("el mes 06 año 31", prod 2026-10-28 21:54, was asked again); a month by name.
      profile: { kind: 'pattern', regex: `\\b(0?[1-9]|1[0-2]|${MONTH_RE})\\.?(?:\\s*(?:/|-|del?|año|ano|year|of)(?=[\\s\\d])){0,2}\\s*(?:20)?(\\d{2})\\b|\\b0[1-9]0\\s+(?:20)?\\d{2}\\b` }, digits: { min: 3, max: 6 },
      validator: 'validate-card-expiration',
      question: 'What is the expiration date, month and year?', question_es: '¿Cuál es la fecha de vencimiento, mes y año?',
      retry: 'Please say or enter the expiration as four digits, month then year, like 0 9 2 8.', retry_es: 'Por favor diga o ingrese el vencimiento en cuatro dígitos, mes y año, por ejemplo 0 9 2 8.',
      retry_text: 'Please type the expiration as four digits, month then year, like 0928.', retry_text_es: 'Por favor escriba el vencimiento en cuatro dígitos, mes y año, por ejemplo 0928.' },
   card_cvv: { label: 'security code', label_es: 'código de seguridad', profile: { kind: 'digits', min: 3, max: 4 }, digits: { min: 3, max: 4 }, pii: true,
      validator: 'validate-card-cvv',
      question: 'What is the security code on the back of the card?', question_es: '¿Cuál es el código de seguridad al reverso de la tarjeta?' },
   card_zip: { label: 'billing ZIP code', label_es: 'código postal de facturación', profile: { kind: 'digits', min: 5, max: 5 }, digits: { min: 5, max: 5 },
      question: 'What is the billing ZIP code for the card?', question_es: '¿Cuál es el código postal de facturación de la tarjeta?' },
};

// Field collectors: one-input forms over a preset, callable directly (result in cargo.formResults[<id>]).
const FIELD_COLLECTORS = { 'collect-phone': 'phone', 'collect-email': 'email', 'collect-zip': 'zip', 'collect-street-address': 'street_address',
   'collect-city': 'city', 'collect-card-number': 'card_number', 'collect-card-expiration': 'card_expiration', 'collect-card-cvv': 'card_cvv',
   'collect-card-zip': 'card_zip' };

// ── a form flow (the shape every form follows; tenant forms are written the same way) ──────────────────────────────
/**
 * The form shell: declare inputs, run the loop, hand the result on. `after` = the form's own steps once complete.
 * `confirm` ({ question, question_es } — SAY-style templates that may read cargo.forms[<id>].values; build them in
 * `before_confirm` SET steps when they need computing): the exact confirmation, asked every time after the loop and
 * never an input. YES runs `after`; NO runs `declined`; a correction given there goes through the form's own matching
 * and the form runs again (so whatever the correction made missing is asked).
 */
/**
 * Context-aware acceptance (docs/copilot-reference.md §5) is standard for every form; its declarations are checked here,
 * at definition time: a confirmation is a firm or soft choice keyed yes and no; invites list input names (of this form
 * or an enclosing one, resolved at run time by scope).
 */
function validateAcceptanceDeclarations(id, inputs) {
   for (const input of (inputs || []).flatMap((i) => i.any_of || [i])) {
      if (input.confirmation !== undefined) {
         const keys = (input.profile?.choices || []).map((choice) => choice.key);
         if (!['firm', 'soft'].includes(input.confirmation) || input.profile?.kind !== 'choice' || !keys.includes('yes') || !keys.includes('no')) throw new Error(`FORM ${id}: ${input.name} confirmation must be "firm" or "soft" on a choice keyed yes and no`);
      } else {
         // not a confirmation
      }
      if (input.invites !== undefined && (!Array.isArray(input.invites) || !input.invites.every((name) => typeof name === 'string' && name))) throw new Error(`FORM ${id}: ${input.name} invites must list input names`);
      else { /* no invites, or a list of names */ }
   }
}

export function formFlow({ id, name, version, description, inputs, after = [], extraVars = {}, parameters = [], confirm = null, before_confirm = [], declined = [], stop = '', close_on_stop = false, on_no = '', resume_on_parent_change = false, before = [], done = true, primary = false, scope = 'isolated', validator = '', confirmation_condition = 'true', prompt = undefined, prompt_es = undefined, incomplete_outcome = null, on_exhausted = null, must_complete = false }) {
   validateFormExhaustion(on_exhausted);
   if (on_no !== '' && (typeof on_no !== 'string' || !/^[\w-]+$/.test(on_no))) throw new Error(`FORM ${id}: on_no must be a flow id`);
   if (typeof must_complete !== 'boolean') throw new Error(`FORM ${id}: must_complete must be true or false`);
   validateAcceptanceDeclarations(id, inputs);
   const incompleteFrom=incomplete_outcome && Object.hasOwn(incomplete_outcome,'from');
   if(incompleteFrom) {
      if(Object.keys(incomplete_outcome).length!==1||typeof incomplete_outcome.from!=='string'||!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(incomplete_outcome.from)||!parameters.some(p=>p.name===incomplete_outcome.from.split('.')[0]&&p.type==='object'))throw new Error('FORM incomplete_outcome.from must reference a declared object parameter');
   } else validateFormIncompleteOutcome(incomplete_outcome);
   const incompleteExpression=incompleteFrom?`formPath(currentContext, ${JSON.stringify(incomplete_outcome.from)})`:'form_incomplete_outcome';
   const confirmSteps = confirm ? [
      // FLOW parameters are paths only: the question is built here, as a SAY-style template, then passed by name
      SET(`${id}_confirm_q`, 'form_confirm_q', textValue(confirm.question)),
      SET(`${id}_confirm_q_es`, 'form_confirm_q_es', textValue(confirm.question_es || confirm.question)),
      FLOW(`${id}_confirm`, 'confirm-form', 'call', { form: '{{form_instance}}', question: '{{form_confirm_q}}', question_es: '{{form_confirm_q_es}}', phrases:'{{form_confirmation.phrases}}', words:'{{form_confirmation.words}}', clarifications:'{{form_confirmation.clarifications}}', no_keys:'{{form_confirmation.no_keys}}', interrupts:'{{form_confirmation.interrupts}}', invites:'{{form_confirmation.invites}}', named_fields:'{{form_confirmation.named_fields}}', exit_context: '{{exit_context}}', exit_context_es: '{{exit_context_es}}' }),
      { id: `${id}_confirmed`, type: 'CASE', branches: {
         [`condition: (cargo.formConfirm || {})[form_instance] === 'changed'`]: FLOW(`${id}_again`, id, 'replace', { parent_form: '{{parent_form}}', result_input: '{{result_input}}', form_instance: '{{form_instance}}' }),
         // NO: the declined flow takes the form's place, so the action below never runs
         [`condition: (cargo.formConfirm || {})[form_instance] === 'no'`]: declined.length ? FLOW(`${id}_declined`, `${id}-declined`, 'replace', { form_instance: '{{form_instance}}' }) : END(`${id}_declined_end`, { outcome: 'resolved', reason: 'declined' }),
         default: NOOP(`${id}_confirmed_yes`) } },
   ] : [];
   return {
      id, name, version, description, scope, metadata:{formProtocol:2}, parameters: [...parameters, { name: 'form_instance', type: 'string', internal: true, description: 'Internal instance to resume' }], ...(primary ? { primary: true } : {}), ...(prompt ? { prompt, prompt_es } : {}),
      variables: vars({ form_on_exhausted:on_exhausted, form_on_no:on_no, form_must_complete:must_complete, form_incomplete_outcome:incompleteFrom?null:incomplete_outcome, form_instance: '', form_internal_resume: false, form_resume_owner:'', form_arguments:{}, form_exhaustion:null, form_values: {}, form_validation: '', initial_readings: [], inputs: resolveFormInputs(inputs, FIELD_PRESETS), parent_form: '', result_input: '', questions: [], provides: null, exit_context: '', exit_context_es: '', form_confirm_q: '', form_confirm_q_es: '', form_confirmation:confirm || {}, form_should_confirm:false, ...extraVars }),
      steps: [
         ...contextualResponseRuntimeSteps(id,[],hasFormResponse(inputs)?[CONTEXTUAL_RESPONSES_REQUIREMENT]:[]),
         ...(hasFormResponse(inputs)?[{...SET(`${id}_response_reader_required`,'noop',"typeof validateFormResponse === 'function'"),requireTrue:true}]:[]),
         ...proposalRuntimeSteps(id,[],hasInputProposals(inputs)?[INPUT_PROPOSALS_REQUIREMENT]:[]),
         SET(`${id}_resume_kind`, 'form_internal_resume', '!!form_instance'),
         SET(`${id}_open`, 'form_instance', `openFormInstance(cargo, ${JSON.stringify(id)}, inputs, { parent: parent_form || null, input: result_input || '', context:!!parent_form && !result_input, resume_on_parent_change: ${resume_on_parent_change===true}, resume: form_instance || (!parent_form ? (cargo.formTasks || {})[${JSON.stringify(id)}] || '' : ''), providers: provides, questions: questions, incomplete_outcome: ${incompleteExpression}, on_exhausted: form_on_exhausted, on_no: form_on_no, must_complete: form_must_complete })`),
         SIDE(`${id}_task`, `(!parent_form ? (cargo.formTasks = cargo.formTasks || {}, cargo.formTasks[${JSON.stringify(id)}] = form_instance) : true, true)`),
         SIDE(`${id}_provider_reset`, '(delete cargo.forms[form_instance].providerRequests, delete cargo.forms[form_instance].activeGates, delete cargo.forms[form_instance].providerGateActive, true)'),
         SIDE(`${id}_pass_reset`, '(cargo.forms[form_instance].replays = 0, form_internal_resume ? true : (cargo.forms[form_instance].attempts = {},cargo.forms[form_instance].misses={},cargo.forms[form_instance].feedback={}), true)'),
         SET(`${id}_arguments`,'form_arguments',`rememberFormArguments(cargo.forms[form_instance], currentContext, ${JSON.stringify(parameters.filter(p=>!p.internal&&!/^internal\b/i.test(p.description || '')).map(p=>p.name))}, form_internal_resume)`),
         ...parameters.filter(p=>!p.internal&&!/^internal\b/i.test(p.description || '')).map(p=>SET(`${id}_restore_${p.name}`,p.name,`form_internal_resume ? form_arguments[${JSON.stringify(p.name)}] : currentContext[${JSON.stringify(p.name)}]`)),
         ...before,
         SET(`${id}_initial`, 'initial_readings', 'form_internal_resume ? [] : formInitialReadings(cargo.forms[form_instance], currentContext, cargo)'),
         WHEN(`${id}_accept_initial`, 'initial_readings.length > 0', FLOW(`${id}_initial_accept`, 'collect-input-accept', 'call', { hits: '{{initial_readings}}' })),
         FLOW(`${id}_run`, 'run-form', 'call', { rf_form: '{{form_instance}}', ...(resume_on_parent_change ? {rf_resume_parent:true} : {}), ...(stop ? { rf_stop: stop } : {}) }),
         ...(close_on_stop ? [WHEN(`${id}_close_stopped`, "rf_status === 'stopped'", SIDE(`${id}_stop_close`, '(closeFormInstance(cargo, form_instance, false), true)'))] : []),
         WHEN(`${id}_left`, "rf_status !== 'complete' || !cargo.forms[form_instance]", END(`${id}_left_end`)),
         ...(validator ? [
            SET(`${id}_values`, 'form_values', 'cargo.forms[form_instance].values'),
            SIDE(`${id}_validation_reset`, '(cargo.formCheck = null, true)'),
            FLOW(`${id}_validate`, validator, 'call', { form: '{{form_instance}}', values: '{{form_values}}' }),
            SET(`${id}_validation`, 'form_validation', 'applyFormValidation(cargo, form_instance, cargo.formCheck)'),
            WHEN(`${id}_resolve_validation_exhausted`,"form_validation === 'failed'",SET(`${id}_validation_exhaustion`,'form_exhaustion',"exhaustFormInput(cargo,form_instance,((cargo.formCheck || {}).invalid || [])[0] ? cargo.formCheck.invalid[0].name : '')")),
            WHEN(`${id}_recover_validation_exhausted`,'form_exhaustion',FLOW(`${id}_validation_recovery`,'{{form_exhaustion.flow}}','reboot',{form:'{{form_exhaustion.form}}',failed_form:'{{form_exhaustion.failed_form}}',input:'{{form_exhaustion.input}}',failed_input:'{{form_exhaustion.failed_input}}',reason:'{{form_exhaustion.reason}}'})),
            optionalIncomplete(`${id}_optional_validation_failed`,"form_validation === 'failed'",'form_instance',"form_instance+'_incomplete'"),
            WHEN(`${id}_validation_failed_recovery`,"form_validation === 'failed'",recoveryStamp(`${id}_validation_stamp`,'form_instance',"'validation_exhausted'",'none')),
            WHEN(`${id}_validation_failed`, "form_validation === 'failed'", FLOW(`${id}_validation_give_up`, 'give-up', 'reboot', { context: '{{exit_context}}', context_es: '{{exit_context_es}}' })),
            WHEN(`${id}_validation_message`, "form_validation === 'retry' && cargo.formCheck.message", SAY(`${id}_validation_say`, '{{cargo.formCheck.message}}', '{{cargo.formCheck.message_es}}')),
            WHEN(`${id}_validation_retry`, "form_validation === 'retry'", FLOW(`${id}_validate_again`, id, 'replace', { parent_form: '{{parent_form}}', result_input: '{{result_input}}', form_instance: '{{form_instance}}' })),
         ] : []),
         ...before_confirm,
         ...(confirm ? [SET(`${id}_confirmation_applicable`,'form_should_confirm', `!!(${confirmation_condition}) && formInputApplies(form_confirmation, cargo.forms[form_instance].values, cargo, cargo.forms[form_instance])`)] : []),
         ...confirmSteps.map((step,index)=>WHEN(`${id}_confirmation_guard_${index}`, 'form_should_confirm === true', step)),
         ...after,
         ...(done ? [FLOW(`${id}_done`, 'form-done', 'call', { form: '{{form_instance}}' })] : []),
      ],
   };
}
/**
 * A form's NO branch as its own flow, `${id}-declined`: it replaces the form, says and does `steps`, then clears the
 * form's sensitive values (a card number, a security code). The rest is kept, so a caller who asks again resumes.
 */
export function declinedFlow(id, steps) {
   return { id: `${id}-declined`, name: `${id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('')}Declined`, version: '1.0.0', description: `Worker: what ${id} says and does when its confirmation is declined; its sensitive values are cleared.`,
      steps: [...steps, FLOW(`${id}_declined_forget`, 'form-done', 'call', { form: '{{form_instance}}', pii_only: 'true' })] };
}

// ── run-form: the reentrant loop (decision 1B) ───────────────────────────────────────────────────────────────────
const runForm = {
   id: 'run-form', name: 'RunForm', version: '1.0.0',
   description: "Worker (shared scope, called by a form flow): the FORM loop. Merges the form's activation parameters into cargo.forms[rf_form] once, then each pass finds the first missing input whose `when` holds, collects it (collect-input) or runs its sub-form, and replaces itself until nothing is missing. Sets rf_status: 'complete' | 'stopped' (a path in rf_stop was set) | 'unwound'. Reads the form's `inputs`, `parent_form`, `result_input`, `questions`, `provides`, `exit_context(_es)`.",
   parameters: [{name:'rf_resume_parent',type:'boolean',description:'Yield a context collector when its owning form accepts a change'}, { name: 'rf_form', type: 'string', description: 'The form id (the calling form flow id)' }, { name: 'rf_resume', type: 'string', description: "'true' on the loop's own replays" }, { name: 'rf_stop', type: 'string', description: 'A cargo path (or list) that ends the form when set' }],
   variables: vars({ rf_stop: '', rf_resume: '', rf_resume_parent:false, rf_parent_resume:null, rf_status: '', rf_next: '', rf_next_form: '', rf_questions: [], rf_provides: null, rf_max: 0, rf_pending: [], rf_deferred:[],rf_proposal:null,rf_proposal_readings:[] }),
   steps: [
      SIDE('rf_resume_policy', '(rf_resume_parent === true && cargo.forms[rf_form] && cargo.forms[rf_form].context_only ? (cargo.forms[rf_form].resume_on_parent_change=true) : true, true)'),
      SET('rf_ancestor_resume','rf_parent_resume','formParentResume(cargo,rf_form,rf_resume_parent,nextFormProposal)'),
      WHEN('rf_ancestor_close','rf_parent_resume',SIDE('rf_ancestor_release','(closeFormInstance(cargo,rf_parent_resume.child,false),true)')),
      WHEN('rf_ancestor_reboot','rf_parent_resume',FLOW('rf_ancestor_owner','resume-form','reboot',{form:'{{rf_parent_resume.owner}}'})),
      SIDE('rf_pass_count', '(cargo.forms[rf_form] ? (cargo.forms[rf_form].replays = Number(cargo.forms[rf_form].replays || 0) + 1) : true, true)'),
      SET('rf_pass', 'rf_status', "formInstanceApplies(cargo, rf_form) ? '' : (closeFormInstance(cargo, rf_form, false), 'unwound')"),
      WHEN('rf_unwound', "rf_status === 'unwound'", END('rf_unwound_end')),
      SET('rf_cap', 'rf_max', 'formWorkLimit(cargo, rf_form)'),
      WHEN('rf_runaway', 'cargo.forms[rf_form].replays > rf_max', incompleteDispatch('rf_runaway_out','rf_form',"rf_form+'_incomplete'")),
      WHEN('rf_stopped_early', '[].concat(rf_stop || []).some(function(p) { return !!formPath({cargo:cargo}, p); })', SET('rf_stopped_status','rf_status',"'stopped'")),
      WHEN('rf_stop_before_pending',"rf_status === 'stopped'",END('rf_stopped_end')),
      SET('rf_deferred','rf_deferred',`(${takeReadyProviderRequests.toString()})(cargo,rf_form)`),
      WHEN('rf_deferred_answer','rf_deferred.length > 0',FLOW('rf_answer_deferred','provide-queued-data','call',{form:'{{rf_form}}',requests:'{{rf_deferred}}'})),
      SET('rf_pending','rf_pending','pendingFormReadings(cargo, rf_form)'),
      WHEN('rf_pending_accept','rf_pending.length > 0',FLOW('rf_pending_batch','collect-input-accept','call',{hits:'{{rf_pending}}'})),
      WHEN('rf_pending_repeat','rf_pending.length > 0',FLOW('rf_pending_again','run-form','replace',{rf_form:'{{rf_form}}',rf_resume:'true',rf_stop:'{{rf_stop}}'})),
      SET('rf_proposal_readings','rf_proposal_readings','formProposalReadings(cargo,rf_form)'),
      WHEN('rf_proposal_revalidate','rf_proposal_readings.length > 0',FLOW('rf_proposal_batch','collect-input-accept','call',{hits:'{{rf_proposal_readings}}'})),
      WHEN('rf_proposal_owner_closed','!cargo.forms[rf_form]',END('rf_proposal_closed_end')),
      SET('rf_proposal','rf_proposal','nextFormProposal(cargo,rf_form)'),
      WHEN('rf_proposal_ask','rf_proposal',FLOW('rf_proposal_confirm','confirm-input-proposal','call',{parent_form:'{{rf_form}}',input:'{{rf_proposal.input}}'})),
      WHEN('rf_proposal_repeat','rf_proposal || rf_proposal_readings.length > 0',FLOW('rf_proposal_again','run-form','replace',{rf_form:'{{rf_form}}',rf_resume:'true',rf_stop:'{{rf_stop}}',rf_resume_parent:'{{rf_resume_parent}}'})),
      SET('rf_find', 'rf_next', 'nextFormInput(cargo.forms[rf_form], cargo)'),
      WHEN('rf_blocked', "rf_next === '__blocked__'", incompleteDispatch('rf_blocked_end','rf_form',"'form_dependencies_blocked'")),
      SET('rf_find_form', 'rf_next_form', "rf_next ? ((cargo.forms[rf_form].specs || []).filter(function (i) { return i.name === rf_next; })[0] || {}).form || '' : ''"),
      SET('rf_done', 'rf_status', "(function () { var stops = [].concat(typeof rf_stop !== 'undefined' && rf_stop ? rf_stop : []); return stops.some(function (p) { return !!formPath({cargo:cargo},p); }) ? 'stopped' : (rf_next ? '' : 'complete'); })()"),
      WHEN('rf_complete', "rf_status === 'complete' || rf_status === 'stopped'", END('rf_complete_end')),
      SET('rf_questions', 'rf_questions', 'cargo.forms[rf_form].questions'),
      SET('rf_provides', 'rf_provides', 'cargo.forms[rf_form].providers'),
      { id: 'rf_collect', type: 'CASE', branches: {
         'condition: rf_next_form': FLOW('rf_subform', '{{rf_next_form}}', 'call', { parent_form: '{{rf_form}}', result_input: '{{rf_next}}' }),
         default: FLOW('rf_field', 'collect-input', 'call', { form: '{{rf_form}}', current: '{{rf_next}}', questions: '{{rf_questions}}', provides: '{{rf_provides}}', exit_context: '{{exit_context}}', exit_context_es: '{{exit_context_es}}' }) } },
      FLOW('rf_replay', 'run-form', 'replace', { rf_form: '{{rf_form}}', rf_resume: 'true', rf_stop: '{{rf_stop}}',rf_resume_parent:'{{rf_resume_parent}}' }),
   ],
};

// ── collect-input: ask the current input, read the answer against the form chain ────────────────────────────────────
const CHAIN_JS = 'formInputChain(cargo.forms, form, cargo)';
const collectInput = {
   id: 'collect-input', name: 'CollectInput', version: '1.0.0', scope: 'isolated',
   description: "Worker: ask the form's current input once and file the answer wherever it belongs in the form chain (matchInputs, decided by scope; a declared confirm_against pair is asked). One reading → collect-input-accept; ambiguous → disambiguate-input; a question about the form's data → provide-data; a short miss → counted, the loop re-asks; 3+ words that fit nothing → DISPATCH. Params: form, current, questions, provides, exit_context(_es).",
   parameters: ['form', 'current', 'questions', 'provides', 'exit_context', 'exit_context_es'].map((n) => ({ name: n, type: ['questions'].includes(n) ? 'array' : n === 'provides' ? 'object' : 'string', description: n })),
   variables: vars({ ci_partial:'', ci_no_owner:'', ci_no_flow:'', ci_no_up:false, ci_reply_reader:'', ci_exhaustion:null, ci_d: {}, ci_pre: '', ci_val: '', ci_routed: '', ci_names: [], ci_chain: [], ci_spec: null, ci_choices: [], ci_q: '', ci_q_es: '', ci_missed: 0, ci_max: 3, ci_misses:0,ci_miss_limit:2,ci_must:false, ci_m: null, ci_qkey: '', ci_skip_gate:'', ci_words: 0, ci_digits: null, ci_amount: false, ci_as_spoken:false, ci_reader:{}, ci_pii: false, ci_ctx: '', ci_ctx_es: '' }),
   steps: [
      SET('ci_find_spec', 'ci_spec', "(function () { var s = ((cargo.forms[form] || {}).specs || []).filter(function (s) { return s.name === current; })[0]; return s ? (Array.isArray(s.any_of) ? Object.assign({}, s, { profile: { kind: 'group' } }) : s) : null; })()"),
      SET('ci_current_names', 'ci_names', "Array.isArray(ci_spec && ci_spec.any_of) ? ci_spec.any_of.map(function (m) { return m.name; }) : [current]"),
      WHEN('ci_no_spec', '!ci_spec', END('ci_no_spec_end', recoveryAttrs('form',"'collect_input_spec'",true,'none'))),
      SET('ci_count_missed', 'ci_missed', "Number(((cargo.forms[form] || {}).attempts || {})[current] || 0)"),
      SET('ci_max_attempts', 'ci_max', 'Number(ci_spec.max_attempts || 3)'),
      SET('ci_context_misses','ci_misses','Number(((cargo.forms[form] || {}).misses || {})[current] || 0)'),
      SET('ci_context_limit','ci_miss_limit','Number(ci_spec.max_misses || 2)'),
      // must_complete (the field's, else the nearest form's): an unreadable answer is never handed away; it is asked again
      SET('ci_must_complete','ci_must','formMustComplete(cargo,form,current)'),
      WHEN('ci_context_yield','ci_misses >= ci_miss_limit && !ci_must',yieldDispatch('ci_misses_dispatch','form',"'input_misses_exhausted'")),
      SET('ci_context', 'ci_ctx', "typeof exit_context !== 'undefined' && exit_context ? exit_context : 'your request'"),
      SET('ci_context_es', 'ci_ctx_es', "typeof exit_context_es !== 'undefined' && exit_context_es ? exit_context_es : 'su solicitud'"),
      WHEN('ci_resolve_exhausted','ci_missed >= ci_max',SET('ci_exhausted_policy','ci_exhaustion','exhaustFormInput(cargo,form,current)')),
      WHEN('ci_declared_exhausted','ci_exhaustion',FLOW('ci_exhausted_recovery','{{ci_exhaustion.flow}}','reboot',{form:'{{ci_exhaustion.form}}',failed_form:'{{ci_exhaustion.failed_form}}',input:'{{ci_exhaustion.input}}',failed_input:'{{ci_exhaustion.failed_input}}',reason:'{{ci_exhaustion.reason}}'})),
      optionalIncomplete('ci_optional_exhausted','ci_missed >= ci_max','form',"form+'_incomplete'"),
      WHEN('ci_failure_recovery','ci_missed >= ci_max',recoveryStamp('ci_failure_stamp','form',"'validation_exhausted'")),
      WHEN('ci_give_up', 'ci_missed >= ci_max', FLOW('ci_give_up_flow', 'give-up', 'reboot', { context: '{{ci_ctx}}', context_es: '{{ci_ctx_es}}' })),
      FLOW('ci_prepare','prepare-input','call',{form:'{{form}}',input:'{{current}}'}),
      // `refresh`: a flow run before EVERY ask, which computes what the question shows into cargo.forms[form].data
      WHEN('ci_refresh', 'ci_spec.refresh', FLOW('ci_refresh_flow', '{{ci_spec.refresh}}', 'call', { form: '{{form}}', input: '{{current}}' })),
      SET('ci_refetch_spec','ci_spec',"(function(){var spec=cargo.forms[form].specs.filter(function(s){return s.name===current;})[0];return spec&&spec.any_of?Object.assign({},spec,{profile:{kind:'group'}}):spec;})()"),
      SET('ci_data', 'ci_d', '(cargo.forms[form] || {}).data || {}'),
      SET('ci_question','ci_q',"formInputPrompt(cargo,form,current,ci_spec,ci_d,'en')"),
      SET('ci_question_es','ci_q_es',"formInputPrompt(cargo,form,current,ci_spec,ci_d,'es')"),
      SIDE('ci_feedback_consumed','consumeFormFeedback(cargo,form,current)'),
      // A grouped input (any_of: a plan option, an amount...) offers the ranker every choice its members declare (prod 2026-10-28:
      // the pay offer offered none, so a caller's own words for a listed option were not understood).
      SET('ci_own_choices', 'ci_choices', "ci_spec.choices_from && Array.isArray(ci_d[ci_spec.choices_from]) ? ci_d[ci_spec.choices_from] : (ci_spec.profile.kind === 'choice' && Array.isArray(ci_spec.profile.choices) ? ci_spec.profile.choices : (Array.isArray(ci_spec.any_of) ? ci_spec.any_of.reduce(function(all,m){return all.concat(m && m.profile && m.profile.kind === 'choice' && Array.isArray(m.profile.choices) ? m.profile.choices.filter(function(c,i,own){return !all.some(function(a){return String(a.key)===String(c.key);}) && own.findIndex(function(o){return String(o.key)===String(c.key);})===i;}) : []);},[]) : []))"),
      SET('ci_keypad', 'ci_digits', 'ci_spec.digits || null'),
      SET('ci_is_amount', 'ci_amount', "ci_spec.amount === 'marked' ? 'marked' : (ci_spec.amount === true || ci_spec.profile.kind === 'amount')"),
      // FORM profile readers own normalization and compound matching. Never discard other
      // fields through question-specific voice cleanup before they see the original answer.
      SET('ci_as_spoken','ci_as_spoken','ci_spec.as_spoken !== false'),
      SET('ci_is_pii', 'ci_pii', 'ci_spec.pii === true'),
      SET('ci_precheck', 'ci_pre', "ci_spec.answer_precheck || ''"),
      SET('ci_validator', 'ci_val', "ci_spec.answer_validator || ''"),
      SET('ci_reader_context','ci_reader','({form:form,current:current,names:ci_names,questions:provides && Array.isArray(questions)?questions:[]})'),
      FLOW('ci_ask', 'ask-choice', 'call', { question: '{{ci_q}}', question_es: '{{ci_q_es}}', choices: '{{ci_choices}}', accept_other: true, digits: '{{ci_digits}}', amount: '{{ci_amount}}', as_spoken:'{{ci_as_spoken}}', pii: '{{ci_pii}}', exit_context: '{{ci_ctx}}', exit_context_es: '{{ci_ctx_es}}', form_context: '{{ci_reader}}', answer_precheck: '{{ci_pre}}', answer_validator: '{{ci_val}}' }),
      SIDE('ci_answered','answerResetsFormReplays(cargo,form)'),
      // a key the input routes to a handler of its own (route_keys: [{ prefix, flow }]): that flow takes the answer
      SET('ci_route_to', 'ci_routed', "(ci_spec.route_keys || []).filter(function (r) { return String(cargo.choice || '').indexOf(r.prefix) === 0; }).map(function (r) { return r.flow; })[0] || ''"),
      WHEN('ci_route_key', 'ci_routed', FLOW('ci_route_key_flow', '{{ci_routed}}', 'call', { form: '{{form}}', input: '{{current}}' })),
      WHEN('ci_routed_end', 'ci_routed', END('ci_routed_done')),
      // `accumulate` (opt-in, digit inputs): a number said in groups across turns ("4347", "6971 2210"…) is kept and joined;
      // short of the input's minimum the next question is "Go on." Anything that is not digits drops the partial.
      SET('ci_partial_join', 'ci_partial', "(function () { var state = cargo.forms[form]; if (!ci_spec || ci_spec.accumulate !== true || !ci_spec.digits) return ''; var said = String(cargo.choiceText || '').trim(); var data = state.data = state.data || {}; var key = '__partial_' + current; if (!/^[0-9][0-9\\s.,-]*$/.test(said)) { delete data[key]; return ''; } var joined = String(data[key] || '') + said.replace(/[^0-9]/g, ''); var starts = ci_spec.accumulate_first ? new RegExp(ci_spec.accumulate_first) : null; if (!data[key] && starts && !starts.test(joined)) return ''; if (joined.length < Number(ci_spec.digits.min || 0)) { data[key] = joined; var fb = state.feedback || {}; fb[current] = 'partial'; state.feedback = fb; return 'hold'; } delete data[key]; cargo.choiceText = joined; cargo.choice = joined; return 'joined'; })()"),
      WHEN('ci_partial_hold', "ci_partial === 'hold'", END('ci_partial_wait')),
      // A whole NO at a question that does not read it, in a form (or a sub-form of one) that declares `on_no`: that
      // form's worker answers it (a payment starts its selection again), instead of any field or the reply ranker; the
      // owning form then continues, a sub-form's owner included.
      SET('ci_no_owner', 'ci_no_owner', "formNoOwner(cargo, form, ci_spec, cargo.choiceText)"),
      SET('ci_no_flow', 'ci_no_flow', "ci_no_owner ? cargo.forms[ci_no_owner].on_no : ''"),
      SET('ci_no_up', 'ci_no_up', "!!ci_no_owner && ci_no_owner !== form"),   // before the call: a shared-scope worker may set `form`
      WHEN('ci_no_run', 'ci_no_flow', FLOW('ci_no_answer', '{{ci_no_flow}}', 'call', { form: '{{ci_no_owner}}' })),
      WHEN('ci_no_owner_resume', 'ci_no_flow && ci_no_up', FLOW('ci_no_resume_owner', 'resume-form', 'reboot', { form: '{{ci_no_owner}}' })),
      WHEN('ci_no_end', 'ci_no_flow', END('ci_no_done')),
      SET('ci_build_chain', 'ci_chain', CHAIN_JS),
      SET('ci_match', 'ci_m', "readFormAnswer(cargo.choiceText, ci_chain, Array.isArray(ci_spec.any_of) ? { form: form, names: ci_names } : { form: form, name: current }, cargo.choice, provides && Array.isArray(questions) ? questions : [])"),
      SIDE('ci_acceptance_trace', "(cargo.formAcceptance = formAcceptanceTrace(cargo.formAcceptance, ci_m), true)"),
      // The labels and validators ride on each reading, so the presets stay in this one flow.
      SET('ci_enrich','ci_m','enrichFormMatches(ci_m, ci_chain, form, ci_names, current)'),
      SET('ci_question_key', 'ci_qkey', "ci_m.questions.length ? ci_m.questions[0] : !ci_m.hits.length && !ci_m.ambiguous.length && Array.isArray(questions) && questions.length && provides ? pickChoice(cargo.choiceText, questions.map(function(question){return Object.assign({},question,{exact:true});}), false) : ''"),
      WHEN('ci_understood','ci_m.hits.length || ci_m.ambiguous.length || ci_m.questions.length || ci_qkey && ci_qkey.indexOf("__") !== 0',SIDE('ci_clear_misses','clearFormMisses(cargo,form,current)')),
      SET('ci_count_words', 'ci_words', "String(cargo.choiceText || '').split(/\\s+/).filter(function (w) { return /[a-záéíóúüñ]/i.test(w); }).length"),
      // Independent field clauses are committed before a provider can suspend on its gate.
      WHEN('ci_question_ambiguity','ci_m.questions.length > 0 && ci_m.ambiguous.length > 0',FLOW('ci_question_clarify','disambiguate-input','call',{readings:'{{ci_m.ambiguous}}',hits:'{{ci_m.hits}}',remaining:'{{ci_m.remaining}}'})),
      WHEN('ci_question_fields','ci_m.questions.length > 0 && !ci_m.ambiguous.length && ci_m.hits.length > 0',FLOW('ci_question_accept_fields','collect-input-accept','call',{hits:'{{ci_m.hits}}'})),
      SET('ci_skip_gate','ci_skip_gate',"!provides || !provides.gate || [].concat(provides.gate.verified || []).every(function(p){return !!formPath({cargo:cargo},p);}) ? 'true' : ''"),
      WHEN('ci_explicit_question','ci_m.questions.length > 0',FLOW('ci_explicit_provide','provide-data','call',{form:'{{form}}',provides:'{{provides}}',asked:'{{ci_qkey}}',asked_keys:'{{ci_m.questions}}',no_menu:'true',no_gate:'{{ci_skip_gate}}'})),
      WHEN('ci_explicit_question_done','ci_m.questions.length > 0',END('ci_explicit_question_end')),
      SET('ci_reply_reader','ci_reply_reader',"ci_choices.length ? 'read-form-choice' : 'read-form-reply'"),
      { id: 'ci_route', type: 'CASE', branches: {
         'condition: ci_m.ambiguous.length > 0': FLOW('ci_ambiguous', 'disambiguate-input', 'call', { readings: '{{ci_m.ambiguous}}', hits: '{{ci_m.hits}}', remaining:'{{ci_m.remaining}}' }),
         'condition: ci_m.hits.length > 0': FLOW('ci_accept', 'collect-input-accept', 'call', { hits: '{{ci_m.hits}}' }),
         "condition: ci_m.questions.length > 0": END('ci_question_handled'),
         "condition: ci_qkey && ci_qkey.indexOf('__') !== 0": FLOW('ci_question_asked', 'provide-data', 'call', { form:'{{form}}', provides: '{{provides}}', asked: '{{ci_qkey}}', no_menu: 'true',no_gate:'{{ci_skip_gate}}' }),
         "condition: !ci_must && ci_words > 0": FLOW('ci_elsewhere', '{{ci_reply_reader}}', 'call', { form: '{{form}}', input: '{{current}}', question: '{{ci_q}}', question_es: '{{ci_q_es}}', choices: '{{ci_choices}}', firm: '{{ci_spec.confirmation}}' }),
         default: SIDE('ci_miss', "(missFormInput(cargo,form,current),true)") } },
   ],
};

// ── collect-input-accept: validate and store ONE reading, then the rest (self-replace) ────────────────────────────
const prepareInput={
   id:'prepare-input',name:'PrepareInput',version:'2.0.0',scope:'isolated',
   description:'Worker: run a field or group preparation once before prompting or validation, against committed prerequisites.',
   parameters:[{name:'form',type:'string'},{name:'input',type:'string'}],variables:vars({pi_spec:null}),
   steps:[SET('pi_find','pi_spec','formPreparation(cargo, form, input)'),
      WHEN('pi_run','pi_spec && pi_spec.flow',FLOW('pi_invoke','{{pi_spec.flow}}','call',{form:'{{form}}',input:'{{pi_spec.input}}'})),
      WHEN('pi_mark','pi_spec && pi_spec.flow',SIDE('pi_prepared','(cargo.forms[form].prepared[pi_spec.input] = true, true)'))],
};
const validateBatch = {
   id: 'validate-input-batch', name: 'ValidateInputBatch', version: '2.0.0', scope: 'isolated',
   description: 'Worker: validate dependency-ordered candidates; return accepted, rejected and pending readings before a single commit.',
   parameters: ['hits','accepted','rejected','pending','ignored'].map(name=>({name,type:'array'})),
   variables: vars({ accepted: [], rejected: [], pending:[], ignored:[], vb_h: null, vb_rest: [], vb_values: {}, vb_known: false, vb_ready: false, vb_relevant:false, vb_outcome: '',vb_candidate:null,vb_response:null,vb_proposal_values:{},vb_proposal:null,vb_proposal_ok:true }),
   steps: [
      SET('vb_init_accepted','accepted','Array.isArray(accepted) ? accepted : []'),
      SET('vb_init_rejected','rejected','Array.isArray(rejected) ? rejected : []'),
      SET('vb_init_pending','pending','Array.isArray(pending) ? pending : []'),
      SET('vb_init_ignored','ignored','Array.isArray(ignored) ? ignored : []'),
      SET('vb_first','vb_h','hits.length ? hits[0] : null'),
      WHEN('vb_done','!vb_h',SIDE('vb_result','(cargo.inputBatch = { accepted: accepted, rejected: rejected, pending: pending, ignored: ignored }, true)')),
      WHEN('vb_end','!vb_h',END('vb_end_done')),
      SET('vb_rest','vb_rest','hits.slice(1)'),
      SET('vb_relevant','vb_relevant','formReadingRelevant(cargo, vb_h, accepted)'),
      SET('vb_ready','vb_ready','formReadingReady(cargo, vb_h, accepted, rejected)'),
      WHEN('vb_prepare','vb_ready === true',FLOW('vb_prepare_field','prepare-input','call',{form:'{{vb_h.form}}',input:'{{vb_h.name}}'})),
      SET('vb_values','vb_values','proposedFormValues(cargo, vb_h.form, accepted)'),
      SET('vb_known','vb_known',"!!(!vb_h.revalidate && !vb_h.validate_always && cargo.forms[vb_h.form] && !cargo.forms[vb_h.form].errors[vb_h.name] && cargo.forms[vb_h.form].accepted[vb_h.name] && formValuesEqual(vb_values[vb_h.name], vb_h.value))"),
      SET('vb_outcome','vb_outcome',"vb_known ? 'known' : (hasFormValue(vb_values[vb_h.name]) && !formValuesEqual(vb_values[vb_h.name],vb_h.value) ? 'changed' : (vb_h.current ? 'stored' : 'taken'))"),
      SIDE('vb_reset',"(cargo.inputCheck = vb_h.invalid ? { ok: false } : (vb_h.validator && !vb_known ? null : { ok: true, value: vb_h.value }), true)"),
      SET('vb_response','vb_response',"(function(){var state=cargo.forms[vb_h.form],spec=state && state.specs.flatMap(function(s){return s.any_of || [s];}).find(function(s){return s.name===vb_h.name;});return spec && spec.response || null;})()"),
      WHEN('vb_contextual_needed',"vb_ready === true && vb_h.current && vb_response && !vb_known && !vb_h.invalid && vb_h.origin !== 'activation' && !vb_h.fromPending",FLOW('vb_read_response','read-form-response','call',{form:'{{vb_h.form}}',input:'{{vb_h.name}}'})),
      WHEN('vb_validator','vb_ready === true && vb_h.validator && !vb_known && !vb_h.invalid && !(cargo.inputCheck && cargo.inputCheck.ok === false)',FLOW('vb_validate','{{vb_h.validator}}','call',{form:'{{vb_h.form}}',input:'{{vb_h.name}}',value:'{{vb_h.value}}',values:'{{vb_values}}',reading:'{{vb_h}}'})),
      WHEN('vb_refused','vb_h.refused === true || vb_h.incompleteMoney === true',SIDE('vb_withhold_refusal',"(cargo.inputCheck=Object.assign({},cargo.inputCheck || {},{ok:false}),true)")),
      SET('vb_candidate','vb_candidate',"Object.assign({},vb_h,{ok:!!(cargo.inputCheck && cargo.inputCheck.ok === true),value:cargo.inputCheck && cargo.inputCheck.value !== undefined && cargo.inputCheck.value !== null ? cargo.inputCheck.value : vb_h.value,message:cargo.inputCheck && cargo.inputCheck.message,message_es:cargo.inputCheck && cargo.inputCheck.message_es,quiet:!!(cargo.inputCheck && cargo.inputCheck.quiet)})"),
      SET('vb_proposal_policy','vb_proposal','vb_relevant === true && vb_ready === true && vb_candidate.ok && !vb_known ? formProposalPolicy(cargo,vb_candidate,cargo.inputCheck,accepted) : null'),
      SET('vb_proposal_values','vb_proposal_values','proposedFormValues(cargo,vb_h.form,accepted.concat([vb_candidate]))'),
      SIDE('vb_proposal_reset','(cargo.proposalCheck=undefined,true)'),
      WHEN('vb_proposal_prepare','vb_proposal && vb_proposal.prepare',FLOW('vb_proposal_formatter','{{vb_proposal.prepare}}','call',{form:'{{vb_candidate.form}}',input:'{{vb_candidate.name}}',value:'{{vb_candidate.value}}',values:'{{vb_proposal_values}}',reading:'{{vb_candidate}}'})),
      SET('vb_proposal_gate','vb_proposal_ok','vb_relevant !== true || vb_ready !== true || !vb_candidate.ok || vb_known ? true : stageFormProposal(cargo,vb_candidate,formProposalDescriptor(vb_proposal,vb_proposal && vb_proposal.prepare ? cargo.proposalCheck : undefined))'),

      {...SET('vb_proposal_gate_valid','noop',"typeof vb_proposal_ok === 'boolean'"),requireTrue:true},
      SIDE('vb_take',"(vb_relevant !== true ? ignored.push(vb_h) : vb_ready !== true ? pending.push(Object.assign({}, vb_h, {outcome:'pending'})) : vb_candidate.ok === true ? (vb_proposal_ok === true ? accepted.push(Object.assign({}, vb_candidate, { outcome: vb_outcome })) : null) : rejected.push(Object.assign({}, vb_candidate, { outcome: 'rejected' })), true)"),
      FLOW('vb_next','validate-input-batch','replace',{hits:'{{vb_rest}}',accepted:'{{accepted}}',rejected:'{{rejected}}',pending:'{{pending}}',ignored:'{{ignored}}'}),
   ],
};
const requestCancelled={
 id:'request-cancelled',name:'RequestCancelled',version:'1.0.0',scope:'isolated',description:'Retire an explicitly withdrawn owning request and acknowledge it; preserve unknown actions for reconciliation.',
 parameters:[{name:'form',type:'string'}],variables:vars({form:'',cancelled:null}),
 steps:[SET('cancel_request_owner','cancelled','cancelFormTask(cargo,form)'),
 {id:'cancel_request_notice',type:'SAY',value:"{{cancelled.recovery.mode === 'hold' ? 'The result of your earlier request is still unknown. Our team needs to check it before another attempt.' : 'Okay, I stopped this request. Is there anything else I can help you with?'}}",value_es:"{{cancelled.recovery.mode === 'hold' ? 'El resultado de su solicitud anterior sigue sin confirmarse. Nuestro equipo debe revisarlo antes de otro intento.' : 'De acuerdo, detuve esta solicitud. ¿Hay algo más en lo que le pueda ayudar?'}}",outcome:'{{cancelled.outcome}}',reason:'{{cancelled.reason}}',recovery:{version:1,mode:'{{cancelled.recovery.mode}}',reason:'{{cancelled.recovery.reason}}',form:"{{cancelled.recovery.form || ''}}",flow:"{{cancelled.recovery.flow || ''}}"}}]
};
// Open-ended answers use the same contextual intent/extraction path as other DISPATCH replies.
const readFormResponse={
 id:'read-form-response',name:'ReadFormResponse',version:'1.0.0',scope:'isolated',description:'Read the requested field with contextual DISPATCH: an answer continues, an answer with nothing usable is asked again, a withdrawal or a new request leaves with saved form progress.',
 parameters:[{name:'form',type:'string'},{name:'input',type:'string'}],
 variables:vars({group:null,spec:null,question:'',reason_for:'',reply:null}),
 steps:[SET('response_group','group',"cargo.forms[form].specs.find(function(s){return s.name===input || s.any_of && s.any_of.some(function(member){return member.name===input;});})"),
  SET('response_spec','spec',"group && (group.any_of ? group.any_of.find(function(s){return s.name===input;}) : group)"),
  {...SET('response_declared','noop','!!spec && !!validateFormResponse(spec.response)'),requireTrue:true},
  SET('response_question','question',"formInputPrompt(cargo,form,input,Object.assign({},group,spec,{question:spec.question || group.question,question_es:spec.question_es || group.question_es,question_from:spec.question_from || group.question_from}),cargo.forms[form].data || {},language)"),
  // a reason question: what the caller does not want, so the ranker reads "I don't use it" as the reason, not a withdrawal
  SET('response_reason_for','reason_for',"spec.response.reason_for_from ? String((cargo.forms[form].data || {})[spec.response.reason_for_from] || '') : String(spec.response.reason_for || '')"),
  SET('response_clear','reply','null'),
  { ...yieldDispatch('response_dispatch','form',"'input_not_matched'"),onResponse:'continue',responseContext:'Current question: {{question}}. Requested answer: {{spec.response.description}}.',responseReasonFor:'{{reason_for}}',responseParameters:[{name:'answer',type:'string',description:'{{spec.response.description}}',verbatim:true}],responseVariable:'reply'},
  // Nothing usable (only after a default `answers`: a confident one carries the reply as said): the reading is
  // rejected, so the form asks the question again (the question alone: it was not a wrong answer). The answer never
  // goes to the host.
  WHEN('response_missing',"!reply || typeof reply.answer !== 'string' || !reply.answer.trim()",SIDE('response_rejected','(cargo.inputCheck={ok:false,quiet:true},true)'))]
};
// An answer the field's reader could not read goes to the reply ranker, never straight to the host (owner 2026-10-26: a form
// gives up only for a real new intent). The ranker is offered the question's declared choices and the two escapes every
// question supports (owner 2026-10-28): a person, and on a call with a textable number, text. Every declared choice is
// offered, `exact` ones too (exact is how WORDS match a choice, not a confirmation); only the YES of a firm (hard)
// confirmation never is. A choice without a label is described by its key and its worded phrases (keys are digits).
// `answers` (picks none): asked again ("Sorry, I didn't catch that."), counted as an attempt so max_attempts still bounds
// it; `abort` ends every flow; `new_request` goes to intent detection.
const rankedMiss=(id)=>SIDE(id,"(cargo.forms[form].attempts=cargo.forms[form].attempts || {},cargo.forms[form].attempts[input]=Number(cargo.forms[form].attempts[input] || 0)+1,cargo.forms[form].feedback=cargo.forms[form].feedback || {},cargo.forms[form].feedback[input]='miss',true)");
// The ranker is offered only a person. Text is never offered: its label matched "continuar", "texto" and "enlace", and a
// call moved to text hangs up (prod 2026-10-28: 7 of 7 such picks were wrong). TEXTO and keypad 9 are read before it.
const ESCAPES_JS="[{key:'__agent',label:'speak with a person (a live agent)'}]";
const rankedChoices=(id,from)=>SET(id,'ranked',`(${from}).concat(${ESCAPES_JS})`);
// A choice as the ranker is offered it: its key, and its label or its worded phrases.
const RANK_LABEL_JS="function(c){var said=(Array.isArray(c.phrases) ? c.phrases : []).map(String).filter(function(p){return /[a-zà-ÿ]/i.test(p) && p!==String(c.key);}).slice(0,6);return String(c.label || (said.length ? c.key+' ('+said.join(', ')+')' : c.key));}";
// The choices of this form's OTHER inputs that the answer could also set (the word reader reads them all: 'LO VENCIDO' at
// the pay confirmation): the ranker is offered every choice the reader would accept (owner 2026-10-28). A confirmation
// input is answered only when asked, a current_only choice only at its own question (as the reader reads it), and a key
// already offered is not offered twice. Each carries its input, so a pick is read as that input's answer.
const otherChoicesJS=(asked,taken)=>`(function(){var seen=(${taken}).map(function(c){return String(c.key);}).concat(['yes','no']);return (chain || []).filter(function(i){return i.form===form && i.name!==${asked} && !i.confirmation && i.profile && i.profile.kind==='choice' && Array.isArray(i.profile.choices);}).reduce(function(all,i){return all.concat(i.profile.choices.filter(function(c){var k=String(c.key);if(c.current_only===true||seen.indexOf(k)>=0)return false;seen.push(k);return true;}).map(function(c){return {key:String(c.key),label:(${RANK_LABEL_JS})(c),owner:{form:i.form,name:i.name}};}));},[]);})()`;
const escapeRoutes=(id)=>[WHEN(`${id}_agent`,"reply && reply.key === '__agent'",FLOW(`${id}_agent_flow`,'live-agent-requested','reboot'))];
const rankedDispatch=(id,reason)=>({...yieldDispatch(id,'form',`'${reason}'`),onResponse:'continue',responseContext:'Current question: {{asked}}',responseChoices:'ranked',responseVariable:'reply'});
const readFormReply={
 id:'read-form-reply',name:'ReadFormReply',version:'1.1.0',scope:'isolated',description:'Rank an unreadable answer against its question: a request for a person or for text is taken; an answer is asked again; a withdrawal or a new request leaves with saved form progress.',
 parameters:[{name:'form',type:'string'},{name:'input',type:'string'},{name:'question',type:'string'},{name:'question_es',type:'string'}],
 variables:vars({question:'',question_es:'',asked:'',ranked:[],reply:null}),
 steps:[SET('reply_asked','asked',"language === 'es' && question_es ? question_es : question"),
  rankedChoices('reply_ranked','[]'),
  rankedDispatch('reply_dispatch','input_not_matched'),
  ...escapeRoutes('reply_escape'),
  rankedMiss('reply_miss')]
};
const readFormChoice={
 id:'read-form-choice',name:'ReadFormChoice',version:'1.3.0',scope:'isolated',description:'Rank an unreadable answer to a choice question and take the offered option it picks, or a request for a person or for text; otherwise ask again. A withdrawal or a new request leaves with saved form progress.',
 parameters:[{name:'form',type:'string'},{name:'input',type:'string'},{name:'question',type:'string'},{name:'question_es',type:'string'},{name:'choices',type:'array'},{name:'firm',type:'string'}],
 variables:vars({question:'',question_es:'',choices:[],firm:'',asked:'',ranked:[],reply:null,picked:'',chain:null,reading:null,others:[],owner:null}),
 steps:[SET('choice_asked','asked',"language === 'es' && question_es ? question_es : question"),
  SET('choice_chain','chain','formInputChain(cargo.forms, form, cargo)'),
  SET('choice_others','others',otherChoicesJS('input','choices || []')),
  rankedChoices('choice_ranked',`(choices || []).filter(function(c,i,all){return !(firm==='firm' && String(c.key)==='yes') && all.findIndex(function(o){return String(o.key)===String(c.key);})===i;}).map(function(c){return {key:String(c.key),label:(${RANK_LABEL_JS})(c)};}).concat(others.map(function(c){return {key:c.key,label:c.label};}))`),
  rankedDispatch('choice_dispatch','input_not_matched'),
  ...escapeRoutes('choice_escape'),
  SET('choice_picked','picked',"(function(){var k=String(reply && reply.key || '');var c=(choices || []).filter(function(c){return String(c.key)===k;})[0] || others.filter(function(c){return c.key===k;})[0];return c ? String(c.key) : '';})()"),
  SET('choice_owner','owner',"(others.filter(function(c){return c.key===picked && !(choices || []).some(function(own){return String(own.key)===picked;});})[0] || {}).owner || null"),
  WHEN('choice_none','!picked',rankedMiss('choice_miss')),
  WHEN('choice_none_end','!picked',END('choice_none_done')),
  SIDE('choice_take',"(cargo.choice=picked,cargo.choiceText=picked,true)"),
  SET('choice_read','reading',"owner ? enrichFormMatches(readFormAnswer(picked, chain, owner, picked, []), chain, form, [owner.name], owner.name) : enrichFormMatches(readFormAnswer(picked, chain, { form: form, name: input }, picked, []), chain, form, [input], input)"),
  WHEN('choice_unread','!reading.hits.length',rankedMiss('choice_unread_miss')),
  WHEN('choice_unread_end','!reading.hits.length',END('choice_unread_done')),
  SIDE('choice_clear','clearFormMisses(cargo,form,input)'),
  FLOW('choice_accept','collect-input-accept','call',{hits:'{{reading.hits}}'})]
};
// A confirmation's unread answer goes to the reply ranker with the confirmation question (owner 2026-10-27), never
// straight to the host. A form's confirmation is exact (it authorizes the form's action), so the ranker is offered NO, the
// form's other choices (a correction) and a person, never YES. Result: cargo.confirmRanked = 'no' | 'changed' | 'none'
// (ConfirmForm reads it); `abort` ends every flow; `new_request` goes to intent detection.
const readConfirmReply={
 id:'read-confirm-reply',name:'ReadConfirmReply',version:'1.3.0',scope:'isolated',description:'Rank an unreadable answer to a confirmation: it declines (NO), picks another of the form\'s choices (a correction, read as that input\'s answer), says a named field read back is wrong (confirm.named_fields: that input is asked again), asks for a person, or is asked again; a withdrawal or a new request leaves with saved form progress. Never confirms.',
 parameters:[{name:'form',type:'string'},{name:'question',type:'string'},{name:'question_es',type:'string'},{name:'named_fields',type:'boolean'}],
 variables:vars({question:'',question_es:'',asked:'',ranked:[],reply:null,chain:null,others:[],fields:[],field:null,picked:null,reading:null,named_fields:false}),
 steps:[SET('confirm_asked','asked',"language === 'es' && question_es ? question_es : question"),
  SET('confirm_chain','chain','formInputChain(cargo.forms, form, cargo)'),
  SET('confirm_others','others',otherChoicesJS("''",'[]')),
  // confirm.named_fields: a field read back may be corrected in the caller's own words ('es Long Beach' at an address
  // read back with the ZIP code's city): each named input of this form that holds a value is offered, and a pick asks
  // that input again, so the caller's value replaces the one read back
  SET('confirm_fields','fields',"named_fields === true || named_fields === 'true' ? (chain || []).filter(function(i){var v=cargo.forms[form] && cargo.forms[form].values;return i.form===form && !i.confirmation && Array.isArray(i.names) && i.names.length && v && v[i.name]!==undefined && v[i.name]!==null && v[i.name]!=='';}).map(function(i){var l=String(i.label || i.names[0]);return {key:'field:'+i.name,label:'says the '+l+' read back is wrong, or gives a different '+l,owner:{form:i.form,name:i.name}};}) : []"),
  rankedChoices('confirm_ranked_choices',"[{key:'no',label:'no: declines or refuses what the question asks to confirm'}].concat(others.map(function(c){return {key:c.key,label:c.label};})).concat(fields.map(function(c){return {key:c.key,label:c.label};}))"),
  rankedDispatch('confirm_dispatch','confirmation_not_matched'),
  ...escapeRoutes('confirm_escape'),
  // a correction picked by the ranker is read as its input's answer: the form changes and is confirmed again, never confirmed
  SET('confirm_picked','picked',"others.filter(function(c){return reply && c.key===reply.key;})[0] || null"),
  SET('confirm_read','reading',"picked ? enrichFormMatches(readFormAnswer(picked.key, chain, picked.owner, picked.key, []), chain, form, [picked.owner.name], picked.owner.name) : null"),
  WHEN('confirm_change','reading && reading.hits.length',FLOW('confirm_change_accept','collect-input-accept','call',{hits:'{{reading.hits}}'})),
  SET('confirm_field','field',"fields.filter(function(c){return reply && c.key===reply.key;})[0] || null"),
  WHEN('confirm_field_reset','field',SIDE('confirm_field_ask','(resetFormInputs(cargo, field.owner.form, [field.owner.name]), true)')),
  SIDE('confirm_ranked',"(cargo.confirmRanked=reading && reading.hits.length || field ? 'changed' : reply && reply.key==='no' ? 'no' : 'none',true)")]
};
const collectContextualAnswer=formFlow({id:'collect-contextual-answer',name:'CollectContextualAnswer',description:'Collect one open-ended answer using contextual DISPATCH and preserve the caller wording.',
 parameters:[...['question','question_es','description','context','context_es'].map(name=>({name,type:'string'})),{name:'choices',type:'array'},{name:'digits',type:'object'}],
 extraVars:{question:'',question_es:'',description:'',context:'your request',context_es:'su solicitud',choices:[],digits:null},
 inputs:[{name:'answer',profile:{kind:'text',narrative:true},response:{description:'The answer to the current question, in the caller’s words.'},question_from:'question'}],
 before:[{...SET('response_policy_required','noop',"typeof description==='string' && !!description.trim()"),requireTrue:true},
 SIDE('response_declaration',"(function(){var state=cargo.forms[form_instance];state.data={question:question,question_es:question_es};state.specs[0].response={description:description};state.specs[0].profile=choices.length ? {kind:'choice',choices:choices,accept_other:true,narrative:true} : {kind:'text',narrative:true};state.specs[0].digits=digits;return true;})()"),SET('response_context','exit_context','context'),SET('response_context_es','exit_context_es','context_es')],
 after:[SIDE('response_return',"(cargo.choice=cargo.forms[form_instance].values.answer,true)")]});
const accept = {
   id: 'collect-input-accept', name: 'CollectInputAccept', version: '2.0.0', scope: 'isolated',
   description: 'Worker: validate all readings, commit accepted changes once with transitive invalidation, then acknowledge and run declared callbacks.',
   parameters: [{name:'hits',type:'array'}],
   variables: vars({ca_ordered:[],ca_results:[],ca_partition:null}),
   steps: [
      SET('ca_expand','hits','expandFormActivations(cargo, hits)'),
      SET('ca_partition','ca_partition','exclusiveFormReadings(cargo, hits)'),
      WHEN('ca_ambiguous','ca_partition.ambiguous.length > 0',FLOW('ca_clarify','disambiguate-input','call',{readings:'{{ca_partition.ambiguous}}',hits:'{{ca_partition.hits}}'})),
      WHEN('ca_ambiguity_return','ca_partition.ambiguous.length > 0',END('ca_clarified_end')),
      SET('ca_order','ca_ordered','orderFormReadings(cargo, hits)'),
      FLOW('ca_validate','validate-input-batch','call',{hits:'{{ca_ordered}}'}),
      SIDE('ca_settle','(cargo.inputBatch = settleFormActivations(cargo.inputBatch, cargo), true)'),
      {...SIDE('ca_proposal_validation','(settleFormProposalValidation(cargo,cargo.inputBatch),true)'),requireTrue:true},
      SIDE('ca_rejections','rejectFormReadings(cargo, cargo.inputBatch.rejected)'),
      {...SIDE('ca_proposal_commit','commitFormProposals(cargo,cargo.inputBatch.accepted)'),requireTrue:true},
      SIDE('ca_commit','acceptFormReadings(cargo, cargo.inputBatch.accepted, cargo.inputBatch.pending)'),
      SIDE('ca_pending','queueFormReadings(cargo, cargo.inputBatch.pending)'),
      SET('ca_results','ca_results','cargo.inputBatch.accepted.concat(cargo.inputBatch.rejected, cargo.inputBatch.pending)'),
      FLOW('ca_after','input-accepted-effects','call',{readings:'{{ca_results}}'}),
   ],
};
const acceptedEffects = {
   id:'input-accepted-effects',name:'InputAcceptedEffects',version:'2.0.0',scope:'isolated',
   description:'Worker: acknowledge accepted or rejected candidates and run their callbacks after the batch commit.',
   parameters:[{name:'readings',type:'array'}],
   variables:vars({ca_h:null,ca_rest:[],ca_ack:'',ca_ack_es:''}),
   steps:[
      SET('ie_first','ca_h','readings.length ? readings[0] : null'),
      WHEN('ie_none','!ca_h',END('ie_end')),
      SET('ie_rest','ca_rest','readings.slice(1)'),
      WHEN('ie_reject',"ca_h.outcome === 'rejected'",SIDE('ie_attempt',"(cargo.forms[ca_h.form].attempts[ca_h.asked || ca_h.name] = Number(cargo.forms[ca_h.form].attempts[ca_h.asked || ca_h.name] || 0) + 1, cargo.forms[ca_h.form].feedback=cargo.forms[ca_h.form].feedback || {}, cargo.forms[ca_h.form].feedback[ca_h.asked || ca_h.name]='invalid', true)")),
      SET('ie_say_en','ca_ack',"ca_h.outcome === 'rejected' && ca_h.quiet ? '' : ca_h.outcome === 'rejected' ? (ca_h.message || ('That ' + (ca_h.label || ca_h.name) + \" doesn't look right.\")) : ca_h.silent === true || ca_h.fromPending ? '' : ca_h.outcome === 'known' && !ca_h.current ? ('Thank you, I already have your ' + ca_h.label + '.') : ca_h.outcome === 'changed' && ca_h.origin !== 'activation' ? ('Okay, I noted your ' + ca_h.label + '.') : (ca_h.outcome === 'taken' || ca_h.outcome === 'pending') && ca_h.origin !== 'activation' ? ('Got it, your ' + ca_h.label + '.') : ''"),
      SET('ie_say_es','ca_ack_es',"ca_h.outcome === 'rejected' && ca_h.quiet ? '' : ca_h.outcome === 'rejected' ? (ca_h.message_es || ca_h.message || ('Ese ' + (ca_h.label_es || ca_h.label || ca_h.name) + ' no parece correcto.')) : ca_h.silent === true || ca_h.fromPending ? '' : ca_h.outcome === 'known' && !ca_h.current ? ('Gracias, ya tengo su ' + ca_h.label_es + '.') : ca_h.outcome === 'changed' && ca_h.origin !== 'activation' ? ('Listo, anoté su ' + ca_h.label_es + '.') : (ca_h.outcome === 'taken' || ca_h.outcome === 'pending') && ca_h.origin !== 'activation' ? ('Entendido, su ' + ca_h.label_es + '.') : ''"),
      WHEN('ie_say','ca_ack',SAY('ie_ack','{{ca_ack}}','{{ca_ack_es}}')),
      WHEN('ie_callback',"ca_h.after && ca_h.outcome !== 'known' && ca_h.outcome !== 'rejected' && ca_h.outcome !== 'pending'",FLOW('ie_after','{{ca_h.after}}','call',{form:'{{ca_h.form}}',input:'{{ca_h.name}}',value:'{{ca_h.value}}'})),
      WHEN('ie_more','ca_rest.length > 0',FLOW('ie_next','input-accepted-effects','replace',{readings:'{{ca_rest}}'})),
   ],
};

// ── disambiguate-input: two or more readings claim the same words — ask, never rank ─────────────────────────────────
const disambiguate = {
   id: 'disambiguate-input', name: 'DisambiguateInput', version: '1.0.0', scope: 'isolated',
   description: "Worker: the answer fits two or more inputs at the same scope (or a declared confirm_against pair). Stores the unambiguous readings, asks which input the rest was for (keys 1..n, never 8), stores the pick. No pick: nothing stored, not a miss. Params: readings, hits.",
   parameters: [{ name: 'readings', type: 'array', description: 'The ambiguous readings' }, { name: 'hits', type: 'array', description: 'Readings to store as they are' }, {name:'remaining',type:'array'}],
   variables: vars({ di_must:false,di_form:'',di_input:'',di_prompt:'',di_prompt_es:'',di_words:0,di_misses:0, di_keys: [], di_choices: [], di_q: '', di_q_es: '', di_pick: null, di_value: '', remaining:[], di_next:[], di_rest:[] }),
   steps: [
      WHEN('di_store_clear', 'Array.isArray(hits) && hits.length > 0', FLOW('di_store_hits', 'collect-input-accept', 'call', { hits: '{{hits}}' })),
      SET('di_number', 'di_keys', `${KEYS_JS}(readings.length)`),
      SET('di_build', 'di_choices', "readings.map(function (r, i) { var own = String(r.label + ' ' + r.label_es).toLowerCase().split(/\\s+/).filter(function (w) { return w.length > 3 && !readings.some(function (o, j) { return j !== i && String(o.label + ' ' + o.label_es).toLowerCase().split(/\\s+/).indexOf(w) > -1; }); }); return { key: 'r' + i, phrases: [di_keys[i], r.label, r.label_es].concat(own) }; })"),
      SET('di_said', 'di_value', "readings[0].pii ? '' : String(readings[0].value)"),
      // Options of ONE input (a phrase two choices share) are asked by name: "Do you mean A or B?". The value is a choice key, never words to say.
      SET('di_question', 'di_q', "(readings.every(function (r) { return r.option === true; }) ? 'Do you mean ' + readings.map(function (r) { return r.label; }).join(' or ') : (di_value ? 'Is ' + di_value + ' your ' : 'Is that your ') + readings.map(function (r) { return r.label; }).join(' or your ')) + '? ' + readings.map(function (r, i) { return (cargo.voice ? 'Press ' + di_keys[i] + ' or say ' : (i ? String(cargo.verb || 'type') : String(cargo.verb || 'type').charAt(0).toUpperCase() + String(cargo.verb || 'type').slice(1)) + ' ') + r.label.toUpperCase(); }).join(', ') + '.'"),
      SET('di_question_es', 'di_q_es', "(readings.every(function (r) { return r.option === true; }) ? '¿Se refiere a ' + readings.map(function (r) { return r.label_es; }).join(' o a ') : (di_value ? '¿' + di_value + ' es su ' : '¿Eso es su ') + readings.map(function (r) { return r.label_es; }).join(' o su ')) + '? ' + readings.map(function (r, i) { return (cargo.voice ? 'Presione ' + di_keys[i] + ' o diga ' : (i ? String(cargo.verb_es || 'escriba') : String(cargo.verb_es || 'escriba').charAt(0).toUpperCase() + String(cargo.verb_es || 'escriba').slice(1)) + ' ') + r.label_es.toUpperCase(); }).join(', ') + '.'"),
      SET('di_owner','di_form','readings[0].form'),
      SET('di_must_complete','di_must','readings.some(function(r){return formMustComplete(cargo,r.form,r.name);})'),
      SET('di_counter','di_input',"'__ambiguity:'+readings.map(function(r){return r.form+':'+r.name;}).sort().join('|')"),
      SET('di_prompt','di_prompt',"formInputPrompt(cargo,di_form,di_input,{question:di_q,question_es:di_q_es},{},'en')"),
      SET('di_prompt_es','di_prompt_es',"formInputPrompt(cargo,di_form,di_input,{question:di_q,question_es:di_q_es},{},'es')"),
      SIDE('di_feedback_consumed','consumeFormFeedback(cargo,di_form,di_input)'),
      FLOW('di_ask', 'ask-choice', 'call', { question: '{{di_prompt}}', question_es: '{{di_prompt_es}}', choices: '{{di_choices}}', accept_other: true, digits: { min: 1, max: 1 } }),
      SIDE('di_answered','answerResetsFormReplays(cargo,di_form)'),
      SET('di_picked', 'di_pick', "/^r\\d+$/.test(String(cargo.choice || '')) ? [readings[Number(String(cargo.choice).slice(1))]] : null"),
      WHEN('di_understood','di_pick',SIDE('di_clear_misses','clearFormMisses(cargo,di_form,di_input)')),
      SET('di_word_count','di_words',"String(cargo.choiceText || '').split(/\\s+/).filter(function(w){return /[a-záéíóúüñ]/i.test(w);}).length"),
      WHEN('di_context','!di_pick && di_words >= 3 && !di_must',yieldDispatch('di_context_yield','di_form',"'ambiguity_not_resolved'")),
      WHEN('di_miss','!di_pick',SET('di_miss_count','di_misses','missFormInput(cargo,di_form,di_input)')),
      WHEN('di_exhausted','!di_pick && di_misses >= 2 && !di_must',yieldDispatch('di_misses_yield','di_form',"'ambiguity_misses_exhausted'")),
      WHEN('di_retry','!di_pick',FLOW('di_retry_question','disambiguate-input','replace',{readings:'{{readings}}',hits:[],remaining:'{{remaining}}'})),
      WHEN('di_store_pick', 'di_pick', FLOW('di_store_pick_flow', 'collect-input-accept', 'call', { hits: '{{di_pick}}' })),
      SET('di_remaining_first','di_next','Array.isArray(remaining) && remaining.length ? remaining[0] : []'),
      SET('di_remaining_rest','di_rest','Array.isArray(remaining) ? remaining.slice(1) : []'),
      WHEN('di_remaining','di_next.length > 0',FLOW('di_next_group','disambiguate-input','replace',{readings:'{{di_next}}',remaining:'{{di_rest}}'})),
   ],
};

// ── confirm-form: the exact confirmation of a finished form; a correction is matched against the form chain ───────
const confirmForm = {
   id: 'confirm-form', name: 'ConfirmForm', version: '1.0.0', scope: 'isolated',
   description: "Worker: ask a form's confirmation (exact YES / NO; keys 1 and 2). A correction instead ('no, make it $40') is read against the form chain and stored, and the result is 'changed' so the form runs again; an answer with words it cannot read goes to the reply ranker (read-confirm-reply); an unclear one is asked again, and after two the give-up worker takes over. Result: cargo.formConfirm[form] = 'yes' | 'no' | 'changed'. Params: form, question(_es), exit_context(_es).",
   parameters: ['form', 'question', 'question_es', 'exit_context', 'exit_context_es','phrases','words','interrupts','no_keys','clarifications','invites'].map((n) => ({ name: n, type: ['phrases','words','interrupts','no_keys','clarifications','invites'].includes(n)?'array':'string', description: n })).concat([{ name: 'named_fields', type: 'boolean', description: "true: an answer that names one of the form's inputs (its names) without a value re-asks only that input" }]),
   variables: vars({ named_fields: false, cf_must: false, cf_named: null, cf_presets: FIELD_PRESETS, cf_chain: [], cf_m: null, cf_current:null, cf_result: '',cf_prompt:'',cf_prompt_es:'', cf_words: 0, cf_tries: 0, phrases:null, words:[], clarifications:[], no_keys:['2'], interrupts:[], invites:[], cf_choices:[], cf_event:'', cf_amount:false, cf_questions:[],cf_provides:null,cf_skip_gate:'' }),
   steps: [
      SIDE('cf_reset', "(cargo.formConfirm = cargo.formConfirm || {}, cargo.formConfirm[form] = '', cargo.confirmRanked = '', true)"),
      SET('cf_choices','cf_choices',`[{key:'yes',phrases:['1'].concat(Array.isArray(phrases)?phrases:Array.isArray(words)?words:[]),exact:true},{key:'no',phrases:(Array.isArray(no_keys)?no_keys:['2']).concat(${JSON.stringify(ANSWER_WORDS.no)}),exact:true}].concat((Array.isArray(interrupts)?interrupts:[]).map(function(event){return {key:'event:'+event.key,phrases:event.phrases ?? event.words,exact:event.exact!==false};}))`),
      SET('cf_initial_chain','cf_chain',CHAIN_JS),
      SET('cf_amount_context','cf_amount',"cf_chain.some(function(input){return input.profile && input.profile.kind==='amount';})"),
      SET('cf_prompt','cf_prompt',"formInputPrompt(cargo,form,'__confirm',{question:question,question_es:question_es},{},'en')"),
      SET('cf_prompt_es','cf_prompt_es',"formInputPrompt(cargo,form,'__confirm',{question:question,question_es:question_es},{},'es')"),
      SIDE('cf_feedback_consumed',"consumeFormFeedback(cargo,form,'__confirm')"),
      FLOW('cf_ask', 'ask-choice', 'call', { form_context:{form:'{{form}}',current:'__confirm'}, amount:'{{cf_amount}}', question: '{{cf_prompt}}', question_es: '{{cf_prompt_es}}', choices: '{{cf_choices}}', accept_other: true, reask_long: true, digits: { min: 1, max: 1 }, exit_context: '{{exit_context}}', exit_context_es: '{{exit_context_es}}' }),
      SIDE('cf_answered','answerResetsFormReplays(cargo,form)'),
      SET('cf_event','cf_event',"(Array.isArray(interrupts)?interrupts:[]).filter(function(event){return cargo.choice==='event:'+event.key;}).map(function(event){return event.flow;})[0] || ''"),
      WHEN('cf_interrupt','cf_event',FLOW('cf_event_flow','{{cf_event}}','reboot',{form:'{{form}}',event:'{{cargo.choice}}',text:'{{cargo.choiceText}}'})),
      SET('cf_build_chain', 'cf_chain', CHAIN_JS),
      // a correction wins over a NO said with it ('no, make it $40'); a YES is never a correction
      SET('cf_question_catalog','cf_questions','cargo.forms[form].questions || []'),
      SET('cf_provider_catalog','cf_provides','cargo.forms[form].providers'),
      SET('cf_gate_policy','cf_skip_gate',"!cf_provides || !cf_provides.gate || [].concat(cf_provides.gate.verified || []).every(function(p){return !!formPath({cargo:cargo},p);}) ? 'true' : ''"),
      SET('cf_current','cf_current',"cargo.forms[form].proposalPrompt ? {form:cargo.forms[form].parent,name:cargo.forms[form].proposalPrompt.input} : {form:form,name:'',invites:Array.isArray(invites)?invites:[]}"),
      SET('cf_match', 'cf_m', "cargo.choice === 'yes' || cargo.choice === 'no' && pickChoice(cargo.choiceText, [{key:'no',phrases:Array.isArray(no_keys)?no_keys:['2'],exact:true}], false) === 'no' ? { hits: [], ambiguous: [], questions:[] } : readFormAnswer(cargo.choiceText, cf_chain, cf_current, '',cf_questions)"),
      SIDE('cf_acceptance_trace', "(cargo.formAcceptance = formAcceptanceTrace(cargo.formAcceptance, cf_m), true)"),
      SET('cf_enrich','cf_m',"(function(m){m.hits=m.hits.map(function(h){return Object.assign({},h,{silent:true});});return m;})(enrichFormMatches(cf_m, cf_chain, form))"),
      SET('cf_count_words', 'cf_words', "String(cargo.choiceText || '').split(/\\s+/).filter(function (w) { return /[a-záéíóúüñ]/i.test(w); }).length"),
      // opt-in (confirm.named_fields): 'the city is wrong' / 'la ciudad no' names exactly one input and gives no value; that
      // input alone is asked again instead of the answer being DISPATCHed
      SET('cf_named_field','cf_named',"(named_fields === true || named_fields === 'true') && cargo.choice !== 'yes' && !cf_m.hits.length && !cf_m.ambiguous.length && !cf_m.questions.length ? (function (text, chain) { var plain = function (v) { return ' ' + String(v || '').toLowerCase().replace(/[^a-z0-9áéíóúüñ]+/g, ' ').trim() + ' '; }; var said = plain(text); var named = chain.filter(function (input) { return (input.names || []).some(function (name) { return said.indexOf(plain(name)) >= 0; }); }); return named.length === 1 ? { form: named[0].form, name: named[0].name } : null; })(cargo.choiceText, cf_chain) : null"),
      WHEN('cf_question_fields','cf_m.questions.length > 0 && cf_m.hits.length > 0',FLOW('cf_question_accept','collect-input-accept','call',{hits:'{{cf_m.hits}}'})),
      WHEN('cf_question_provide','cf_m.questions.length > 0',FLOW('cf_question_answer','provide-data','call',{form:'{{form}}',provides:'{{cf_provides}}',asked_keys:'{{cf_m.questions}}',no_menu:'true',no_gate:'{{cf_skip_gate}}'})),
      SET('cf_must_complete','cf_must',"formMustComplete(cargo,form,'__confirm')"),
      { id: 'cf_route', type: 'CASE', branches: {
         'condition: cf_m.questions.length > 0': SET('cf_question_repeat','cf_result',"'changed'"),
         "condition: cargo.choice === 'yes'": SET('cf_answered', 'cf_result', "'yes'"),
         'condition: cf_m.ambiguous.length > 0': FLOW('cf_ambiguous', 'disambiguate-input', 'call', { readings: '{{cf_m.ambiguous}}', hits: '{{cf_m.hits}}', remaining:'{{cf_m.remaining}}' }),
         'condition: cf_m.hits.length > 0': FLOW('cf_accept', 'collect-input-accept', 'call', { hits: '{{cf_m.hits}}' }),
         'condition: cf_named': SET('cf_named_reset', 'cf_result', "(resetFormInputs(cargo, cf_named.form, [cf_named.name]), 'changed')"),
         "condition: cargo.choice === 'no'": SET('cf_declined', 'cf_result', "'no'"),
         "condition: Array.isArray(clarifications) && pickChoice(String(cargo.choiceText || '').replace(/[?¿]/g,''),[{key:'clarify',phrases:clarifications,exact:true}],false)==='clarify'": SET('cf_clarification','cf_result',"'clarification'"),
         'condition: !cf_must && cf_words > 0': FLOW('cf_elsewhere', 'read-confirm-reply', 'call', { form: '{{form}}', question: '{{cf_prompt}}', question_es: '{{cf_prompt_es}}', named_fields: '{{named_fields}}' }),
         default: SET('cf_unclear', 'cf_result', "'unclear'") } },
      // the ranker's reading of an unread answer: a decline is the NO; an answer that declines nothing is asked again
      SET('cf_ranked', 'cf_result', "cf_result ? cf_result : cargo.confirmRanked === 'no' ? 'no' : cargo.confirmRanked === 'none' ? 'unclear' : ''"),
      SET('cf_changed', 'cf_result', "cf_result ? cf_result : 'changed'"),
      // an unclear answer is asked again (the form runs again and reaches this question), at most twice
      SET('cf_tries_count', 'cf_tries', "cf_result === 'unclear' ? missFormInput(cargo,form,'__confirm') : (clearFormMisses(cargo,form,'__confirm'),0)"),
      // out of attempts: the give-up worker (a person), never a silent DISPATCH that ends the request unanswered
      optionalIncomplete('cf_optional_exhausted','cf_tries >= 2 && !cf_must','form',"'confirmation_misses_exhausted'"),
      WHEN('cf_misses_stamp','cf_tries >= 2 && !cf_must',recoveryStamp('cf_failure_stamp','form',"'confirmation_misses_exhausted'")),
      WHEN('cf_misses_exhausted','cf_tries >= 2 && !cf_must',FLOW('cf_give_up','give-up','reboot',{ context: '{{exit_context}}', context_es: '{{exit_context_es}}' })),
      WHEN('cf_bind_revision', "cf_result === 'yes'", SIDE('cf_bind', 'confirmFormRevision(cargo, form)')),
      SIDE('cf_store', "(cargo.formConfirm[form] = cf_result === 'unclear' || cf_result === 'clarification' ? 'changed' : cf_result, true)"),
   ],
};

// ── proposed input: owned confirmation before canonical acceptance or callbacks ────────────────────────────
const confirmInputProposal=formFlow({id:'confirm-input-proposal',name:'ConfirmInputProposal',version:'1.0.0',description:'Confirm an owned validated input candidate; retain it on yield and authorize only normal input acceptance.',
   parameters:[{name:'input',type:'string',description:'Owning input awaiting proposal confirmation'}],extraVars:{input:'',proposal:null,proposal_readings:[]},inputs:[],
   before:[
      SET('proposal_refresh_readings','proposal_readings','formProposalReadings(cargo,parent_form,input,false)'),
      WHEN('proposal_refresh','proposal_readings.length > 0',FLOW('proposal_refresh_batch','collect-input-accept','call',{hits:'{{proposal_readings}}'})),
      SET('proposal_current','proposal','cargo.forms[parent_form] && cargo.forms[parent_form].inputProposals && cargo.forms[parent_form].inputProposals[input] || null'),
      WHEN('proposal_missing',"!proposal || !['pending','confirmed'].includes(proposal.status) || proposal.committed",FLOW('proposal_missing_close','form-done','replace',{form:'{{form_instance}}'})),
      {...SIDE('proposal_bind','(bindFormProposal(cargo,parent_form,input,form_instance),true)'),requireTrue:true},
      SET('proposal_confirmation','form_confirmation','Object.assign({},proposal.descriptor)'),
   ],
   confirm:{question:'{{proposal.descriptor.question}}',question_es:'{{proposal.descriptor.question_es || proposal.descriptor.question}}'},
   after:[{...SIDE('proposal_confirmed',"decideFormProposal(cargo,parent_form,input,form_instance,'confirmed')"),requireTrue:true}],
   declined:[NOOP('proposal_declined_marker')],
});
const proposalDeclined={id:'confirm-input-proposal-declined',name:'ConfirmInputProposalDeclined',version:'1.0.0',scope:'isolated',description:'Reject an owned input proposal without accepting its candidate or handing incomplete data to its parent.',parameters:[{name:'form_instance',type:'string'}],variables:vars({owner:'',input:'',proposal:null}),steps:[
   SET('proposal_decline_owner','owner','cargo.forms[form_instance].parent'),
   SET('proposal_decline_input','input','cargo.forms[form_instance].proposalPrompt.input'),
   SET('proposal_decline_record','proposal','cargo.forms[owner].inputProposals[input]'),
   {...SIDE('proposal_decline_decision',"decideFormProposal(cargo,owner,input,form_instance,'declined')"),requireTrue:true},
   SIDE('proposal_decline_close','(closeFormInstance(cargo,form_instance,false),true)'),
   WHEN('proposal_decline_callback','proposal.descriptor.on_declined',FLOW('proposal_decline_invoke','{{proposal.descriptor.on_declined}}','call',{form:'{{owner}}',input:'{{input}}',value:'{{proposal.value}}',reading:'{{proposal.reading}}'})),
]};

// ── form-done: the result goes to the parent (or cargo.formResults); the form is cleared ─────────────────────────────
const formDone = {
   id: 'form-done', name: 'FormDone', version: '1.0.0', scope: 'isolated',
   description: "Worker: a finished form hands its values to its parent's result input (a sub-form) and to cargo.formResults[form], without pii values unless keep_pii, then clears cargo.forms[form]. With pii_only, only the form's pii values are cleared. Params: form, keep_pii, pii_only.",
   parameters: [{ name: 'form', type: 'string', description: 'The form id' }, { name: 'keep_pii', type: 'boolean', description: 'Keep pii values in the result (the next step uses them)' }, { name: 'pii_only', type: 'string', description: "'true': only clear the form's pii values (a declined confirmation); the form stays" }],
   steps: [
      SIDE('fd_pii_only', "(function (F) { var f = cargo.forms && cargo.forms[F]; if (f && typeof pii_only !== 'undefined' && pii_only === 'true') { (f.specs || []).forEach(function (i) { if (i.pii) { delete f.values[i.name]; } else { /* kept for a return */ } }); } else { /* the whole hand-on below */ } return true; })(form)"),
      WHEN('fd_only_pii', "typeof pii_only !== 'undefined' && pii_only === 'true'", END('fd_only_pii_end')),
      SIDE('fd_hand_on', '(closeFormInstance(cargo, form), true)'),
   ],
};

// ── validators (contract: { input, value } → cargo.inputCheck = { ok, value, message, message_es }) ────────────────
const validators = [
   { id: 'validate-card-number', name: 'ValidateCardNumber', version: '1.0.0', scope: 'isolated',
      description: 'Validator: a card number passes the Luhn check (validateCardNumber). Params: input, value.',
      parameters: [{ name: 'input', type: 'string', description: 'input name' }, { name: 'value', type: 'string', description: 'the reading' }],
      steps: [SIDE('vcn_check', "(cargo.inputCheck = validateCardNumber(value) ? { ok: true, value: String(value).replace(/\\D/g, '') } : { ok: false, message: \"That card number doesn't look right.\", message_es: 'Ese número de tarjeta no parece correcto.' }, true)")] },
   { id: 'validate-card-expiration', name: 'ValidateCardExpiration', version: '1.0.0', scope: 'isolated',
      description: 'Validator: month (a number or its English or Spanish name) and year, a real month, not expired (validateExpiration). Normalizes to MMYY. Params: input, value.',
      parameters: [{ name: 'input', type: 'string', description: 'input name' }, { name: 'value', type: 'string', description: 'the reading' }],
      steps: [SIDE('vce_check', "(function (v) { var names = " + JSON.stringify(MONTH_NAMES.map(([n]) => n)) + "; var nums = " + JSON.stringify(MONTH_NAMES.map(([, k]) => k)) + "; var w = new RegExp('\\\\b(' + names.join('|') + ')\\\\b', 'i').exec(String(v)); if (w) { v = String(v).replace(w[0], ' ' + nums[names.indexOf(w[1].toLowerCase())] + ' '); } var m = /^(0?[1-9]|1[0-2])\\D*(?:20)?(\\d{2})$/.exec(String(v).replace(/\\s+/g, '').replace(/de/gi, '')) || /^(\\d{2})(\\d{2})$/.exec(String(v).replace(/\\D/g, '')) || /^(0[1-9])0(\\d{2})$/.exec(String(v).replace(/\\D/g, '')); var mm = m ? ('0' + m[1]).slice(-2) : ''; var yy = m ? m[2] : ''; cargo.inputCheck = m && validateExpiration(mm, yy) ? { ok: true, value: mm + yy } : { ok: false, message: \"That expiration date doesn't look right.\", message_es: 'Esa fecha de vencimiento no parece correcta.' }; return true; })(value)")] },
   { id: 'validate-card-cvv', name: 'ValidateCardCvv', version: '1.0.0', scope: 'isolated',
      description: 'Validator: the security code has the length of its card brand, 4 digits for American Express (34, 37) and 3 for every other brand; with no card number yet, 3 or 4. Params: input, value, values.',
      parameters: [{ name: 'input', type: 'string', description: 'input name' }, { name: 'value', type: 'string', description: 'the reading' }, { name: 'values', type: 'object', description: "the form's values, for the card number" }],
      steps: [SIDE('vcc_check', "(function (v, n) { var d = String(v).replace(/\\D/g, ''); var pan = String(n || '').replace(/\\D/g, ''); var want = pan ? (/^3[47]/.test(pan) ? 4 : 3) : 0; var ok = want ? d.length === want : d.length === 3 || d.length === 4; cargo.inputCheck = ok ? { ok: true, value: d } : want === 4 ? { ok: false, message: \"That security code doesn't look right. It is the 4 digits on the front of the card.\", message_es: 'Ese código de seguridad no parece correcto. Son los 4 dígitos al frente de la tarjeta.' } : { ok: false, message: \"That security code doesn't look right. It is the 3 digits on the back of the card.\", message_es: 'Ese código de seguridad no parece correcto. Son los 3 dígitos al reverso de la tarjeta.' }; return true; })(value, typeof values !== 'undefined' && values ? values.card_number : '')")] },
];

// ── field collectors and sub-forms ──────────────────────────────────────────────────────────────────────────────────
const fieldCollectors = Object.entries(FIELD_COLLECTORS).map(([id, field]) => formFlow({
   id, name: id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(''), version: '1.0.0',
   description: `Field collector: the ${FIELD_PRESETS[field].label} (preset '${field}'). Result: cargo.formResults['${id}'].${field}.`,
   inputs: [{ name: field, field }],
}));
const subForms = [
   formFlow({ id: 'collect-address', name: 'CollectAddress', version: '1.0.0',
      description: "Sub-form: street address, city, state, ZIP, in any order. Result: the parent's result input (or cargo.formResults['collect-address']).",
      inputs: [{ name: 'street_address', field: 'street_address' }, { name: 'city', field: 'city', confirm_against:['state'] }, { name: 'state', field: 'state' }, { name: 'zip', field: 'zip' }],
      extraVars: { exit_context: 'your address', exit_context_es: 'su dirección' } }),
   formFlow({ id: 'collect-credit-card', name: 'CollectCreditCard', version: '1.0.0',
      description: "Sub-form: card number, expiration, security code, billing ZIP, in any order. Result (with keep_pii for the charge step): the parent's result input.",
      inputs: [{ name: 'card_number', field: 'card_number' }, { name: 'card_expiration', field: 'card_expiration' }, { name: 'card_cvv', field: 'card_cvv' }, { name: 'card_zip', field: 'card_zip' }],
      extraVars: { exit_context: 'your payment', exit_context_es: 'su pago' } }),
];
// collect-credit-card hands the card on WITH its pii (the charge needs it); the parent clears it after use.
subForms[1].steps[subForms[1].steps.length - 1].parameters.keep_pii = true;

// ── retrieval: provide-data, load-source, answer-facts (manifests.md §8) ───────────────────────────────────────────
const PATH_JS = "(function (p) { var o = { cargo: cargo }; String(p || '').split('.').forEach(function (k) { o = o === undefined || o === null ? undefined : o[k]; }); return o; })";
// Sentence templates (provider catalogs): {field} is a value of the fact (or {value} for a single one) formatted by the
// fact's `format` (one name, or one per field); {name} is the caller's name; {count} / {items} for a list. [optional part]
// is said only when every {placeholder} in it has a value; [first|second] says the first alternative whose placeholders
// all have values (the last one is the fallback). Formats: money, money_nonzero (a zero amount counts as no value), date,
// date_no_year, last4, digits (one by one on a call), text. A `say` may be an object keyed by the value's `state` field
// ({ all: …, some: …, none: … }) when the sentence itself changes with the data.
const RENDER_JS = "function fmt1(v, f, lang) { if (v === undefined || v === null || v === '') { return ''; } else if (f === 'money') { return amountToSpeech(v, lang, !!cargo.voice); } else if (f === 'money_nonzero') { return Number(v) === 0 ? '' : amountToSpeech(v, lang, !!cargo.voice); } else if (f === 'date') { return dateToWords(v, lang, true); } else if (f === 'date_no_year') { return dateToWords(v, lang, false); } else if (f === 'last4') { return last4(v, !!cargo.voice); } else if (f === 'digits') { return cargo.voice ? String(v).split('').join(', ') : String(v); } else { return String(v); } } function fill(t, obj, fmts, lang, extra) { var one = function (seg) { var gone = false; var out = String(seg).replace(/\\{(\\w+)\\}/g, function (m, k) { var v = Object.prototype.hasOwnProperty.call(extra, k) ? String(extra[k] || '') : fmt1(obj !== null && typeof obj === 'object' ? obj[k] : (k === 'value' ? obj : undefined), fmts && typeof fmts === 'object' ? fmts[k] : fmts, lang); if (v === '') { gone = true; } else { /* filled */ } return v; }); return { out: out, gone: gone }; }; var t2 = String(t).replace(/\\[([^\\]]*)\\]/g, function (m, seg) { var alts = seg.split('|'); for (var i = 0; i < alts.length; i++) { var r = one(alts[i]); if (!r.gone || i === alts.length - 1) { return r.gone && alts.length === 1 ? '' : r.out; } else { /* try the next alternative */ } } return ''; }); return one(t2).out.replace(/[ \\t]+([.,;:])/g, '$1').replace(/[ \\t]{2,}/g, ' ').trim(); } function empty(v) { return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0) || (v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every(function (k) { return v[k] === undefined || v[k] === null || v[k] === ''; })); } function render(f, src, lang, name) { var es = lang === 'es'; var o = src; String(f.path).split('.').forEach(function (k) { o = o === undefined || o === null ? undefined : o[k]; }); var label = es ? (f.label_es || f.label) : f.label; var extra = { name: name, label: label }; if (empty(o)) { var miss = es ? (f.missing_es || f.missing) : f.missing; return miss ? fill(miss, {}, null, lang, extra) : (es ? 'No veo ' + label + ' en su ' + (provides.subject_es || provides.subject || 'cuenta') + '.' : (\"I don't see a \" + label + ' on your ' + (provides.subject || 'account') + '.')); } else if (f.format && typeof f.format === 'object' && f.format.type === 'list' && Array.isArray(o)) { var it = es ? (f.format.item_es || f.format.item) : f.format.item; extra.count = String(o.length); extra.items = o.map(function (x) { return fill(it, x, f.format.fields, lang, { name: name }); }).join(es ? (f.format.join_es || f.format.join || '; ') : (f.format.join || '; ')); var lt = o.length === 1 ? (es ? (f.say_one_es || f.say_one || f.say_es || f.say) : (f.say_one || f.say)) : (es ? (f.say_es || f.say) : f.say); return fill(lt || '{items}', o, null, lang, extra); } else { var t = es ? (f.say_es || f.say) : f.say; if (t && typeof t === 'object') { t = t[o && o.state] || t.default || ''; } else { /* one sentence */ } return fill(t || (es ? 'Su {label} es {value}.' : 'Your {label} is {value}.'), o, f.format, lang, extra); } }";
const NAME_JS = "(function (p) { var o = { cargo: cargo }; String(p || 'cargo.displayName').split('.').forEach(function (k) { o = o === undefined || o === null ? undefined : o[k]; }); var n = String(o || '').trim(); return n && n === n.toUpperCase() ? n.toLowerCase().replace(/(^|[\\s'-])([a-záéíóúñ])/g, function (m, a, c) { return a + c.toUpperCase(); }) : n; })(provides.name_path)";
/** Schedule deferred catalogs once authorized or once the existing task gate ends; each still enforces its own gate. */
export function takeReadyProviderRequests(cargo,form) {
   const current=cargo.forms && cargo.forms[form];
   const owner=current && cargo.forms[current.task];
   if(!owner || !owner.providerRequests || owner.providerGateActive)return [];
   const read=path=>String(path || '').split('.').reduce((value,key)=>value==null?undefined:value[key],{cargo});
   const ready=[],waiting=[];
   const gateActive=Object.keys(owner.activeGates || {}).length > 0;
   for(const request of owner.providerRequests){
      const paths=[].concat(request.provides.gate && request.provides.gate.verified || []);
      (!gateActive || paths.length && paths.every(path=>!!read(path))?ready:waiting).push(request);
   }
   if(waiting.length)owner.providerRequests=waiting;else delete owner.providerRequests;
   return ready;
}
/** Register private questions on their owning task while one provider gate is suspended. */
export function beginProviderRequest(cargo,form,provides,keys,gateParams) {
   const current=cargo.forms && cargo.forms[form];
   const owner=current && cargo.forms[current.task];
   if(!owner)return {owner:'',queued:false};
   const waiting=!!owner.providerRequests || Object.keys(owner.activeGates || {}).length > 0;
   const queue=owner.providerRequests || (owner.providerRequests=[]);
   if(!waiting)owner.providerGateActive=true;
   const catalog=JSON.stringify(provides);
   let request=queue.find(entry=>entry.catalog===catalog);
   if(!request){request={catalog,provides,keys:[],gate_params:gateParams};queue.push(request);}
   for(const key of keys)if(!request.keys.includes(key))request.keys.push(key);
   return {owner:owner.id,queued:waiting};
}
/** Consume once after the active gate returns; every deferred catalog still enforces its own gate. */
export function finishProviderRequest(cargo,owner,provides,keys) {
   const state=cargo.forms && cargo.forms[owner];
   const queue=state && state.providerRequests || [];
   if(state){delete state.providerRequests;delete state.providerGateActive;}
   const catalog=JSON.stringify(provides);
   const own=queue.find(entry=>entry.catalog===catalog);
   return {keys:own?own.keys:keys,remaining:queue.filter(entry=>entry.catalog!==catalog)};
}
const provideData = {
   id: 'provide-data', name: 'ProvideData', version: '1.0.0', scope: 'isolated',
   description: "Worker: answer a question about a provider catalog. Resolves `asked` (a fact or set key; empty = ask which), passes the catalog's gate for non-public facts (gate.flow, called with gate_params; then every path in gate.verified must be truthy), loads the source (load-source), says the facts (answer-facts). Params: provides, asked.",
   parameters: [{name:'form',type:'string',description:'Originating FORM instance for task-owned deferred questions'}, { name: 'provides', type: 'object', description: 'The provider catalog' }, { name: 'asked', type: 'string', description: 'Fact or set key' }, {name:'asked_keys',type:'array',description:'Independent requested facts or sets'}, { name: 'no_menu', type: 'string', description: "'true': answer only (a question asked inside a form)" }, { name: 'gate_params', type: 'object', description: 'Identifiers the caller already gave, passed to the gate flow as gate_params' }, { name: 'no_gate', type: 'string', description: "'true': the caller is inside a task on the verified account; the gate flow is not run (the verified paths are still checked)" }],
   variables: vars({form:'',pd_request:null,pd_deferred:null,pd_ready:[],asked_keys:[], no_gate: '', pd_close: false, pd_who: '', no_menu: '', gate_params: null, pd_keys: [], pd_menu: [], pd_mkeys: [], pd_q: '', pd_q_es: '', pd_gated: false, pd_ok: false }),
   steps: [
      WHEN('pd_no_catalog', "!provides || typeof provides !== 'object' || !Array.isArray(provides.facts)", END('pd_no_catalog_end', { outcome: 'unresolved', reason: 'provide_data_catalog',recovery:{version:1,mode:'none',reason:'provide_data_catalog'} })),
      SET('pd_resolve', 'pd_keys', "(function () { var requested=Array.isArray(asked_keys)&&asked_keys.length?asked_keys:[typeof asked!=='undefined'?String(asked||''):''];return requested.reduce(function(keys,a){var set=(provides.sets||[]).filter(function(x){return x.key===a;})[0];var facts=set?set.facts:provides.facts.some(function(f){return f.key===a;})?[a]:[];return keys.concat(facts.filter(function(key){return keys.indexOf(key)<0;}));},[]); })()"),
      // Nothing specific asked: offer the sets and facts as a menu (keys 1..n, never 8; at most 7 options shown).
      SET('pd_menu_items', 'pd_menu', "(provides.sets || []).concat(provides.facts).slice(0, 7)"),
      SET('pd_menu_keys', 'pd_mkeys', `${KEYS_JS}(pd_menu.length)`),
      SET('pd_menu_q', 'pd_q', "'What would you like to know? ' + pd_menu.map(function (m, i) { return (cargo.voice ? 'Press ' + pd_mkeys[i] + ' or say ' : 'Say ') + String(m.label || m.key).toUpperCase(); }).join(', ') + '.'"),
      SET('pd_menu_q_es', 'pd_q_es', "'¿Qué le gustaría saber? ' + pd_menu.map(function (m, i) { return (cargo.voice ? 'Presione ' + pd_mkeys[i] + ' o diga ' : 'Diga ') + String(m.label_es || m.label || m.key).toUpperCase(); }).join(', ') + '.'"),
      WHEN('pd_ask_which', '!pd_keys.length', FLOW('pd_ask', 'ask-choice', 'call', { question: '{{pd_q}}', question_es: '{{pd_q_es}}', choices: '{{pd_menu_choices}}', digits: { min: 1, max: 1 } })),
      SET('pd_from_menu', 'pd_keys', "pd_keys.length ? pd_keys : (function (k) { var s = (provides.sets || []).filter(function (x) { return x.key === k; })[0]; return s ? s.facts.slice() : provides.facts.some(function (f) { return f.key === k; }) ? [k] : []; })(String(cargo.choice || ''))"),
      WHEN('pd_nothing', '!pd_keys.length', END('pd_nothing_end')),
      SET('pd_needs_gate', 'pd_gated', "!!provides.gate && pd_keys.some(function (k) { var f = provides.facts.filter(function (x) { return x.key === k; })[0]; return !f || f.public !== true; })"),
      // Suspend one private request per owning task. Further questions merge into its queue rather than nesting gates.
      SET('pd_request','pd_request',`pd_gated && no_gate !== 'true' ? (${beginProviderRequest.toString()})(cargo,form,provides,pd_keys,gate_params) : {owner:'',queued:false}`),
      WHEN('pd_queued','pd_request.queued',END('pd_deferred_end')),
      WHEN('pd_gate', "pd_gated && no_gate !== 'true'", FLOW('pd_gate_flow', '{{provides.gate.flow}}', 'call', { gate_params: '{{gate_params}}',parent_form:'{{pd_request.owner}}' })),
      SET('pd_deferred','pd_deferred',`(${finishProviderRequest.toString()})(cargo,pd_request.owner,provides,pd_keys)`),
      SET('pd_merged_keys','pd_keys','pd_deferred.keys'),
      SET('pd_gate_check', 'pd_ok', `!pd_gated || [].concat(provides.gate.verified).every(function (p) { return !!${PATH_JS}(p); })`),
      WHEN('pd_not_verified', '!pd_ok', END('pd_not_verified_end', { outcome: 'unresolved', reason: 'provide_data_not_verified',recovery:{version:1,mode:'none',reason:'provide_data_not_verified'} })),
      WHEN('pd_load', 'provides.source && provides.source.flow', FLOW('pd_load_flow', 'load-source', 'call', { source: '{{provides.source}}' })),
      FLOW('pd_answer', 'answer-facts', 'call', { provides: '{{provides}}', keys: '{{pd_keys}}' }),
      WHEN('pd_deferred_more','pd_deferred.remaining.length > 0',FLOW('pd_answer_deferred','provide-queued-data','call',{form:'{{form}}',requests:'{{pd_deferred.remaining}}'})),
      SET('pd_ready','pd_ready',`(${takeReadyProviderRequests.toString()})(cargo,form)`),
      WHEN('pd_ready_more','pd_ready.length > 0',FLOW('pd_answer_ready','provide-queued-data','call',{form:'{{form}}',requests:'{{pd_ready}}'})),
      // a fact may close the exchange (`close: true`): 'Is there anything else…?' instead of the menu
      SET('pd_closing', 'pd_close', "no_menu !== 'true' && pd_keys.length > 0 && pd_keys.every(function (k) { var f = provides.facts.filter(function (x) { return x.key === k; })[0]; return !!f && f.close === true; })"),
      SET('pd_name', 'pd_who', NAME_JS),
      WHEN('pd_close_say', 'pd_close', { id: 'pd_anything_else', type: 'SAY', value: "{{anythingElse('en', pd_who)}}", value_es: "{{anythingElse('es', pd_who)}}" }),
      WHEN('pd_menu_after', "provides.menu && no_menu !== 'true' && !pd_close", FLOW('pd_menu_flow', 'provider-menu', 'call', { provides: '{{provides}}' })),
   ],
};
const provideQueuedData={
   id:'provide-queued-data',name:'ProvideQueuedData',version:'1.0.0',scope:'isolated',
   description:'Worker: answer the deduplicated private questions deferred during one owning task gate, checking each catalog before retrieval.',
   parameters:[{name:'form',type:'string'},{name:'requests',type:'array'}],
   variables:vars({requests:[],pqd_first:null,pqd_rest:[],pqd_verified:''}),
   steps:[SET('pqd_first','pqd_first','requests[0] || null'),WHEN('pqd_done','!pqd_first',END('pqd_end')),
      SET('pqd_rest','pqd_rest','requests.slice(1)'),
      SET('pqd_verified','pqd_verified',"!pqd_first.provides.gate || [].concat(pqd_first.provides.gate.verified || []).every(function(p){return !!formPath({cargo:cargo},p);}) ? 'true' : ''"),
      FLOW('pqd_answer','provide-data','call',{form:'{{form}}',provides:'{{pqd_first.provides}}',asked_keys:'{{pqd_first.keys}}',gate_params:'{{pqd_first.gate_params}}',no_menu:'true',no_gate:'{{pqd_verified}}'}),
      WHEN('pqd_more','pqd_rest.length > 0',FLOW('pqd_next','provide-queued-data','replace',{form:'{{form}}',requests:'{{pqd_rest}}'}))]
};
// the menu's choices, built where the expression can see pd_menu (FLOW parameters are paths only)
provideData.variables.pd_menu_choices = { type: 'array', value: [] };
provideData.steps.splice(provideData.steps.findIndex((s) => s.id === 'pd_menu_q'), 0,
   SET('pd_menu_build', 'pd_menu_choices', "pd_menu.map(function (m, i) { return { key: m.key, phrases: [pd_mkeys[i], m.label || m.key, m.label_es || ''].filter(Boolean) }; })"));

// provider-menu: what next, after an answer — the catalog's actions, another fact, or done (owner MENU-1016 shape)
const providerMenu = {
   id: 'provider-menu', name: 'ProviderMenu', version: '1.0.0', scope: 'isolated',
   description: "Worker: after a provider answered, offer its menu (provides.menu: question(_voice)(_es) with {verb} / {name}; choices [{ key, phrases, flow, exact, set }]; done { phrases, say(_es) }). A fact or set named by its words is answered and the menu comes back; an action runs its flow (replace) after setting its `set` cargo fields; done says goodbye. Other phrases: DISPATCH. No phrases: asked once more, then 'anything else?'. Params: provides, retry.",
   parameters: [{ name: 'provides', type: 'object', description: 'The provider catalog' }, { name: 'retry', type: 'string', description: "'1' on the re-ask" }],
   variables: vars({ retry: '', pm_q: '', pm_q_es: '', pm_choices: [], pm_key: '', pm_keys: [], pm_close:false, pm_flow: '', pm_bye: '', pm_bye_es: '', pm_who: '', pm_sorry: '', pm_sorry_es: '' }),
   steps: [
      SET('pm_name', 'pm_who', NAME_JS),
      SET('pm_question', 'pm_q', `(function () { ${RENDER_JS} var m = provides.menu; var t = cargo.voice && m.question_voice ? m.question_voice : m.question; return (retry === '1' ? sorryNotCaught('en', cargo) : '') + fill(t, {}, null, 'en', { name: pm_who, verb: cargo.verb || (cargo.voice ? 'say' : 'type') }); })()`),
      SET('pm_question_es', 'pm_q_es', `(function () { ${RENDER_JS} var m = provides.menu; var t = cargo.voice && (m.question_voice_es || m.question_voice) ? (m.question_voice_es || m.question_voice) : (m.question_es || m.question); return (retry === '1' ? sorryNotCaught('es', cargo) : '') + fill(t, {}, null, 'es', { name: pm_who, verb: cargo.verb_es || (cargo.voice ? 'diga' : 'escriba') }); })()`),
      SET('pm_build', 'pm_choices', "provides.facts.concat(provides.sets || []).filter(function (f) { return Array.isArray(f.phrases ?? f.words) && (f.phrases ?? f.words).length; }).map(function (f) { return { key: 'fact:' + f.key, phrases: f.phrases ?? f.words }; }).concat((provides.menu.choices || []).map(function (c) { return { key: 'act:' + c.key, phrases: c.phrases ?? c.words, exact: c.exact === true }; })).concat(provides.menu.done ? [{ key: 'done', phrases: provides.menu.done.phrases ?? provides.menu.done.words, exact: true }] : [])"),
      FLOW('pm_ask', 'ask-choice', 'call', { question: '{{pm_q}}', question_es: '{{pm_q_es}}', choices: '{{pm_choices}}', accept_other: true, digits: { min: 1, max: 1 }, exit_context: '{{provides.subject}}', exit_context_es: '{{provides.subject_es}}' }),
      // A declared terminal phrase (for example "no thanks") may also fit a shorter action
      // after courtesy stripping ("no"). Resolve only that overlap; fact ownership and the
      // existing reserved done fallback retain their normal behavior.
      SET('pm_take', 'pm_key', "(function(){var key=String(cargo.choice || '');if(key.indexOf('fact:')===0)return pickProviderQuestion(cargo.choiceText,pm_choices.filter(function(c){return c.key.indexOf('fact:')===0;}));if(key.indexOf('act:')===0 && provides.menu.done && pickChoice(cargo.choiceText,[{key:'terminal:done',phrases:provides.menu.done.phrases ?? provides.menu.done.words,exact:true}],true)==='terminal:done')return 'done';return key;})()"),
      SET('pm_fact_keys', 'pm_keys', "pm_key.indexOf('fact:') === 0 ? (function (k) { var s = (provides.sets || []).filter(function (x) { return x.key === k; })[0]; return s ? s.facts.slice() : [k]; })(pm_key.slice(5)) : []"),
      SET('pm_closing', 'pm_close', "pm_keys.length > 0 && pm_keys.every(function (key) { var fact = provides.facts.find(function (f) { return f.key === key; }); return !!fact && fact.close === true; })"),
      SET('pm_action_flow', 'pm_flow', "pm_key.indexOf('act:') === 0 ? (function (c) { if (c && c.set) { Object.keys(c.set).forEach(function (k) { cargo[k] = c.set[k]; }); } else { /* nothing to set */ } return c ? c.flow : ''; })((provides.menu.choices || []).filter(function (x) { return 'act:' + x.key === pm_key; })[0]) : ''"),
      SET('pm_goodbye', 'pm_bye', `(function () { ${RENDER_JS} var d = provides.menu.done || {}; return fill(d.say || 'Glad I could help. Have a great day[, {name}]!', {}, null, 'en', { name: pm_who }); })()`),
      SET('pm_goodbye_es', 'pm_bye_es', `(function () { ${RENDER_JS} var d = provides.menu.done || {}; return fill(d.say_es || d.say || 'Me alegra haber ayudado. ¡Que tenga un buen día[, {name}]!', {}, null, 'es', { name: pm_who }); })()`),
      SET('pm_sorry_en', 'pm_sorry', "\"Sorry, I didn't catch that. \" + anythingElse('en', pm_who)"),
      SET('pm_sorry_es_text', 'pm_sorry_es', "'Disculpe, no le entendí. ' + anythingElse('es', pm_who)"),
      { id: 'pm_route', type: 'CASE', branches: {
         'condition: pm_keys.length > 0': FLOW('pm_answer', 'answer-facts', 'call', { provides: '{{provides}}', keys: '{{pm_keys}}' }),
         'condition: pm_flow': FLOW('pm_act', '{{pm_flow}}', 'replace'),
         "condition: pm_key === 'done'": { id: 'pm_done', type: 'SAY', value: '{{pm_bye}}', value_es: '{{pm_bye_es}}', outcome: 'resolved' },
         "condition: /[a-záéíóúüñ]/i.test(String(cargo.choiceText || ''))": { id: 'pm_elsewhere', type: 'DISPATCH' },
         "condition: retry !== '1'": FLOW('pm_reask', 'provider-menu', 'replace', { provides: '{{provides}}', retry: '1' }),
         default: { id: 'pm_give_back', type: 'SAY', value: '{{pm_sorry}}', value_es: '{{pm_sorry_es}}' } } },
      WHEN('pm_close_say', 'pm_close', {id:'pm_anything_else',type:'SAY',value:"{{anythingElse('en', pm_who)}}",value_es:"{{anythingElse('es', pm_who)}}"}),
      WHEN('pm_again', 'pm_keys.length > 0 && !pm_close', FLOW('pm_menu_again', 'provider-menu', 'replace', { provides: '{{provides}}' })),
   ],
};

const loadSource = {
   id: 'load-source', name: 'LoadSource', version: '1.0.0', scope: 'isolated',
   description: "Worker: load a provider's data when missing or stale (refresh: per_session | per_turn | max_age_ms) through the tenant's loader flow (source.flow), which writes source.result. Still missing after the loader: give-up (a service the caller needs failed). Param: source.",
   parameters: [{ name: 'source', type: 'object', description: '{ flow, result, refresh, max_age_ms }' }],
   variables: vars({ ls_stale: false, ls_have: false }),
   steps: [
      SET('ls_is_stale', 'ls_stale', 'sourceNeedsLoad(cargo, source)'),
      WHEN('ls_begin', 'ls_stale', SIDE('ls_clear_old', 'beginSourceRefresh(cargo, source)')),
      WHEN('ls_load', 'ls_stale', FLOW('ls_loader', '{{source.flow}}', 'call')),
      SET('ls_loaded', 'ls_have', 'ls_stale ? completeSourceRefresh(cargo, source) : true'),
      WHEN('ls_failed', '!ls_have', {...FLOW('ls_give_up', 'give-up', 'reboot', { context: 'your request', context_es: 'su solicitud' }),recovery:{version:1,mode:'none',reason:'source_unavailable'}}),
   ],
};

const answerFacts = {
   id: 'answer-facts', name: 'AnswerFacts', version: '1.0.0', scope: 'isolated',
   description: "Worker: say the facts `keys` of a provider catalog in one message, each from its path in the source result through its sentence template (say / say_es: {field} formatted by `format`, {name}, [optional part], [first|second]; a list: format { type: 'list', item, join }, {count}, {items}), per language and channel. A missing value says `missing` (never invented). A fact with its own `flow` is answered by that flow. Params: provides, keys.",
   parameters: [{ name: 'provides', type: 'object', description: 'The provider catalog' }, { name: 'keys', type: 'array', description: 'Fact keys to say' }],
   variables: vars({ af_inline: [], af_flows: [], af_text: '', af_text_es: '', af_first: null, af_rest: [], af_who: '' }),
   steps: [
      SET('af_split_inline', 'af_inline', "provides.facts.filter(function (f) { return keys.indexOf(f.key) > -1 && !f.flow; })"),
      SET('af_split_flows', 'af_flows', "provides.facts.filter(function (f) { return keys.indexOf(f.key) > -1 && !!f.flow; })"),
      SET('af_name', 'af_who', NAME_JS),
      SET('af_say_en', 'af_text', `(function () { ${RENDER_JS} var src = ${PATH_JS}((provides.source || {}).result) || {}; return af_inline.map(function (f) { return render(f, src, 'en', af_who); }).join(' '); })()`),
      SET('af_say_es', 'af_text_es', `(function () { ${RENDER_JS} var src = ${PATH_JS}((provides.source || {}).result) || {}; return af_inline.map(function (f) { return render(f, src, 'es', af_who); }).join(' '); })()`),
      WHEN('af_say', 'af_text', SAY('af_say_text', '{{af_text}}', '{{af_text_es}}')),
      SET('af_take_first', 'af_first', 'af_flows.length ? af_flows[0] : null'),
      SET('af_take_rest', 'af_rest', 'af_flows.slice(1).map(function (f) { return f.key; })'),
      WHEN('af_own_flow', 'af_first', FLOW('af_own_flow_call', '{{af_first.flow}}', 'call')),
      WHEN('af_more', 'af_rest.length > 0', FLOW('af_more_call', 'answer-facts', 'replace', { provides: '{{provides}}', keys: '{{af_rest}}' })),
   ],
};
const performAction = {
   id:'perform-action',name:'PerformAction',version:'1.0.0',scope:'isolated',
   description:'Worker: enforce form, gate and confirmation invariants; invoke a declared action once per prepared request and retain its explicit outcome.',
   parameters:[{name:'form',type:'string'},{name:'action',type:'object'},{name:'request',type:'object'},{name:'defer_receipt',type:'boolean'}],
   variables:vars({defer_receipt:false,pa_record:null,pa_run:false,pa_execute:false,pa_consult:false,pa_result:null,pa_claim:null,pa_completion:null}),
   steps:[
      WHEN('pa_gate','action.gate && action.gate.flow',FLOW('pa_gate_call','{{action.gate.flow}}','call',{gate_params:'{{request.gate_params}}'})),
      SET('pa_prepare','pa_record','prepareFormAction(cargo, form, action, request)'),
      SET('pa_begin','pa_run','beginFormAction(cargo, form, action, pa_record)'),
      SET('pa_consult','pa_consult',"pa_run === true || ['attempted','unknown'].indexOf(pa_record.status) >= 0"),
      WHEN('pa_claim_needed','pa_consult === true',{id:'pa_claim_tool',type:'CALL-TOOL',tool:'jsfe:action-claim',variable:'pa_claim',args:{record:'{{pa_record}}',action:'{{action}}'},onFail:SET('pa_claim_failed','pa_claim',"({status:'hold',outcome:{status:'unknown',reason:'journal_claim_failed'}})")}),
      WHEN('pa_receipt','pa_claim && pa_claim.receipt && pa_claim.receipt.key',SIDE('pa_durable_key','(cargo.forms[form].actions[action.action].durableKey = pa_claim.receipt.key, true)')),
      SET('pa_execute','pa_execute',"pa_run === true && pa_claim && pa_claim.status === 'execute'"),
      WHEN('pa_reset','pa_execute === true',SIDE('pa_clear_result','(cargo.actionOutcome = null, true)')),
      WHEN('pa_invoke','pa_execute === true',FLOW('pa_execute_flow','{{action.flow}}','call',{request:'{{pa_record.request}}',key:'{{pa_record.key}}'})),
      WHEN('pa_complete_needed','pa_execute === true',{id:'pa_complete_tool',type:'CALL-TOOL',tool:'jsfe:action-complete',variable:'pa_completion',args:{record:'{{pa_record}}',action:'{{action}}',outcome:'{{cargo.actionOutcome}}'},onFail:SET('pa_complete_failed','pa_completion',"({status:'unknown',outcome:{status:'unknown',reason:'journal_completion_failed'}})")}),
      SET('pa_finish','pa_result',"pa_run === true || pa_claim && pa_claim.status === 'replay' ? finishFormAction(cargo, form, action, pa_execute === true ? pa_completion && pa_completion.outcome : pa_claim && pa_claim.outcome) : (pa_record.result || { status: pa_record.status === 'attempted' || pa_record.status === 'unknown' ? 'unknown' : 'unconfirmed' })"),
      SIDE('pa_receipt_result', '(cargo.actionReceipt = (pa_execute === true ? pa_completion : pa_claim) && (pa_execute === true ? pa_completion : pa_claim).receipt || null, true)'),
      {id:'pa_applied',type:'SET',variable:'noop',requireTrue:true,value:'defer_receipt === true || consumeActionReceipt(cargo, cargo.actionReceipt)'},
      SIDE('pa_return','(cargo.actionResult = pa_result, true)'),
   ],
};
const sendTextAction={
   id:'send-text-action',name:'SendTextAction',version:'1.0.0',scope:'isolated',
   description:'Worker: send the explicitly prepared text through the platform transport; sent or unknown result, with no automatic resend.',
   parameters:[{name:'request',type:'object'},{name:'key',type:'string'}],
   steps:[
      WHEN('sta_invalid', '!readPhone(request.to)', SIDE('sta_rejected', "(cargo.actionOutcome = {status:'failed',reason:'invalid_destination'}, true)")),
      WHEN('sta_stop', '!readPhone(request.to)', END('sta_invalid_end')),
      SIDE('sta_destination',"(cargo.textTo = readPhone(request.to), cargo.textTo4 = last4(cargo.textTo, !!cargo.voice), true)"),
      FLOW('sta_send','send-text','call',{message:'{{request.message}}'}),
      SIDE('sta_outcome',"(cargo.actionOutcome = {status:cargo.textSent ? 'sent' : 'unknown'}, true)"),
   ],
};

const resumeForm={id:'resume-form',name:'ResumeForm',version:'1.0.0',scope:'isolated',description:'Resume an owned form instance with its validated progress and saved arguments.',
   parameters:[{name:'form',type:'string'}],variables:vars({target:'',parent:'',slot:''}),steps:[
      SET('resume_definition','target','cargo.forms[form].definition'),SET('resume_parent','parent',"cargo.forms[form].parent || ''"),SET('resume_slot','slot',"cargo.forms[form].result_input || ''"),
      FLOW('resume_owned_form','{{target}}','replace',{form_instance:'{{form}}',parent_form:'{{parent}}',result_input:'{{slot}}'})
   ]};
const LIBRARY_FLOWS = [readFormReply, readFormChoice, readConfirmReply, confirmInputProposal,proposalDeclined,resumeForm,performAction, sendTextAction, prepareInput, runForm, collectInput, validateBatch, requestCancelled, readFormResponse, collectContextualAnswer, accept, acceptedEffects, disambiguate, confirmForm, formDone, providerMenu, ...validators, ...fieldCollectors, ...subForms, provideData, provideQueuedData, loadSource, answerFacts];
const LIBRARY_CONTRACTS={
   'confirm-input-proposal':{role:'collector',requires:[INPUT_PROPOSALS_REQUIREMENT]},'confirm-input-proposal-declined':{role:'worker',requires:[INPUT_PROPOSALS_REQUIREMENT]},
   'resume-form':{role:'worker'},
   'perform-action':{role:'worker',tools:['jsfe:action-claim','jsfe:action-complete'],result:{path:'cargo.actionResult',type:'object'}},
   'send-text-action':{role:'worker',result:{path:'cargo.actionOutcome',type:'object'}},
   'prepare-input':{role:'worker'},'run-form':{role:'worker'},'collect-input':{role:'worker'},
   'request-cancelled':{role:'worker'},
   'read-form-response':{role:'worker',requires:[CONTEXTUAL_RESPONSES_REQUIREMENT]},
   'read-form-reply':{role:'worker'},'read-form-choice':{role:'worker',requires:[CONTEXTUAL_RESPONSES_REQUIREMENT]},'read-confirm-reply':{role:'worker',requires:[CONTEXTUAL_RESPONSES_REQUIREMENT]},
   'collect-contextual-answer':{role:'collector',requires:[CONTEXTUAL_RESPONSES_REQUIREMENT]},
   'validate-input-batch':{role:'worker',result:{path:'cargo.inputBatch',type:'object'}},
   'collect-input-accept':{role:'worker'},'input-accepted-effects':{role:'worker'},
   'disambiguate-input':{role:'worker'},'confirm-form':{role:'worker'},'form-done':{role:'worker'},
   'provider-menu':{role:'worker'},'provide-data':{role:'worker'},'provide-queued-data':{role:'worker'},
   'load-source':{role:'worker'},'answer-facts':{role:'worker'},
   'validate-card-number':{role:'worker',result:{path:'cargo.inputCheck',type:'object'}},
   'validate-card-expiration':{role:'worker',result:{path:'cargo.inputCheck',type:'object'}},
   'validate-card-cvv':{role:'worker',result:{path:'cargo.inputCheck',type:'object'}},
   'collect-phone':{role:'collector'},'collect-email':{role:'collector'},'collect-zip':{role:'collector'},
   'collect-street-address':{role:'collector'},'collect-city':{role:'collector'},'collect-card-number':{role:'collector'},
   'collect-card-expiration':{role:'collector'},'collect-card-cvv':{role:'collector'},'collect-card-zip':{role:'collector'},
   'collect-address':{role:'collector'},'collect-credit-card':{role:'collector'}
};
export const FLOWS=LIBRARY_FLOWS.map(flow=>{
   if(flow.variables?.contract)return flow;
   const declaration=LIBRARY_CONTRACTS[flow.id];
   if(!declaration)throw new Error('Shared worker needs an explicit contract: '+flow.id);
   if((declaration.role==='collector')!==(flow.metadata?.formProtocol===2))throw new Error('Shared collector contract mismatch: '+flow.id);
   return {...flow,steps:contextualResponseRuntimeSteps(flow.id,proposalRuntimeSteps(flow.id,flow.steps,declaration.requires),declaration.requires),variables:{...flow.variables,contract:{type:'object',value:{version:1,summary:flow.description,
      parametersFrom:'parameters',...declaration,...(declaration.role==='collector'?{form:{inputs:'inputs'}}:{})}}}};
});
