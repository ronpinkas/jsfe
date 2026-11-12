// A card's fields that fill each other (form_client fills: a picked place, a looked-up postal code), a choice that also
// takes other text drawn as a combobox, browser autofill tokens, and the options of a question asked in chat
// (projectChoices) for a client that draws them as buttons. The system address form uses all of them.
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS, linkFormSchemas, projectForm, projectChoices, parseFormSubmission, formSubmissionReaders} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';

const quiet = {info(){}, warn(){}, debug(){}, error(){}};
let checks = 0;
const check = (ok, label) => { assert.ok(ok, label); checks++; };

// Definition time.
{
  const inputs = () => [
    {name: 'zip', label: 'ZIP code', question: 'ZIP?', profile: {kind: 'digits', min: 5, max: 5}, form_client: {control: 'postal', fills: {city: 'locality'}}},
    {name: 'city', label: 'city', question: 'City?', profile: {kind: 'choice', choices: [], accept_other: true}, form_client: {control: 'combobox'}},
    {name: 'street', label: 'street', question: 'Street?', profile: {kind: 'text'}, form_client: {control: 'place', types: 'address', fills: {zip: 'postal_code', city: 'locality'}, autofill: 'address-line1'}},
    {name: 'name', label: 'name', question: 'Name?', profile: {kind: 'text'}, form_client: {autofill: 'name'}},
  ];
  const flow = list => ({declarationVersion: 2, id: 'where', primary: true, description: 'Ask where', form: {inputs: list, after: [{id: 'keep', type: 'SET', variable: 'noop', value: 'true'}]}});
  const load = list => new WorkflowEngine(quiet, async () => '{"flowName":"None"}', [...FLOWS, flow(list)], [], STANDARD_FUNCTIONS, {}, false, 'en');
  load(inputs()); checks++;
  for (const [change, pattern] of [
    [list => { list[0].form_client = {control: 'postal'}; }, /postal needs fills/],
    [list => { list[0].form_client.fills = {city: 'postal_code'}; }, /fills city: part must be locality, admin_area/],
    [list => { list[0].form_client.fills = {nowhere: 'locality'}; }, /fills nowhere must name another input/],
    [list => { list[0].form_client.fills = {zip: 'locality'}; }, /fills zip must name another input/],
    [list => { list[0].form_client.fills = {}; }, /fills must map 1 to 8 inputs/],
    [list => { list[2].form_client.fills = {zip: 'street_number'}; }, /part must be postal_code, locality, admin_area, country/],
    [list => { list[3].pii = true; list[2].form_client.fills = {name: 'locality'}; }, /fills name must be an input a card can draw/],
    [list => { list[1].profile = {kind: 'choice', choices: [{key: 'a', label: 'A'}]}; }, /combobox needs a choice that accepts other text/],
    [list => { list[1].profile = {kind: 'text'}; }, /combobox control needs a profile of kind choice/],
    [list => { list[3].form_client = {autofill: 'cc-number'}; }, /autofill "cc-number" is not one of/],
    [list => { list[3].form_client = {fills: {zip: 'locality'}}; }, /without a control declares only autofill, not fills/],
    [list => { list[1].form_client = {control: 'combobox', fills: {zip: 'locality'}}; }, /combobox cannot declare fills/],
  ]) {
    const list = inputs(); change(list);
    assert.throws(() => load(list), pattern, `rejects ${pattern}`); checks++;
  }
}

// The system address form on a card.
const comp = city => [{long_name: city, short_name: city, types: ['locality']}, {long_name: 'California', short_name: 'CA', types: ['administrative_area_level_1']}];
const ZIP = {'90023': {status: 'OK', components: comp('Commerce'), localities: ['Commerce', 'East Los Angeles', 'Los Angeles', 'Vernon']}, '91352': {status: 'OK', components: comp('Los Angeles'), localities: []}};
const tools = ['geocode-zip', 'geocode-street'].map(id => ({id, name: id, description: 'Synthetic geocoder', parameters: {type: 'object', properties: {components: {type: 'string'}, address: {type: 'string'}}}, implementation: {type: 'local', function: id, retries: 0}}));
const engine = new WorkflowEngine(quiet, async () => '{"flowName":"None"}', linkFormSchemas(FLOWS), tools,
  {...STANDARD_FUNCTIONS, 'geocode-zip': async a => ZIP[(String((a && a.components) || a).match(/\d{5}/) || [])[0]] || null, 'geocode-street': async () => null}, {}, false, 'en');
engine.disableCommands();
let session;
const say = async (content, start) => { session = await engine.updateActivity({role: 'user', content, ...(start ? {start: {flow: 'collect-geocoded-address'}} : {})}, session); return String(session.response || '').replace(/\s+/g, ' '); };
const begin = async language => { session = engine.initSession('test', crypto.randomUUID(), language); session.cargo.voice = false; await say('start', true); };
const field = (view, name) => view?.fields.find(f => f.name === name);
const submit = async (values, declined) => {
  const view = projectForm(session);
  const request = parseFormSubmission('JSFE_FORM_V1:' + JSON.stringify({form: view.form, values, ...(declined ? {declined} : {})}), view);
  const old = {readFormAnswer: engine.APPROVED_FUNCTIONS.readFormAnswer, enrichFormMatches: engine.APPROVED_FUNCTIONS.enrichFormMatches};
  Object.assign(engine.APPROVED_FUNCTIONS, formSubmissionReaders(request, () => engine.getSessionContext()));
  try { session = await engine.updateActivity({role: 'user', content: request.prompt}, session); }
  finally { Object.assign(engine.APPROVED_FUNCTIONS, old); }
  return String(session.response || '').replace(/\s+/g, ' ');
};

{
  await begin('en');
  const view = projectForm(session);
  const zip = field(view, 'zip'), street = field(view, 'street'), unit = field(view, 'unit');
  check(zip.control === 'postal' && JSON.stringify(zip.postal) === JSON.stringify({regions: ['us'], fills: {city: 'locality'}}) && zip.autofill === 'postal-code', `the ZIP code is a postal lookup that fills the city [${JSON.stringify(zip)}]`);
  check(street.control === 'place' && JSON.stringify(street.place.fills) === JSON.stringify({zip: 'postal_code', city: 'locality'}) && street.autofill === 'address-line1', `a picked street fills the ZIP code and city [${JSON.stringify(street)}]`);
  check(unit.autofill === 'address-line2', 'the unit takes the second address line');
  check(!field(view, 'city'), 'no city before the ZIP code is known (voice and text keep it derived)');
}
{
  await begin('en');
  await say('91352');
  const city = field(projectForm(session), 'city');
  check(city && city.control === 'combobox' && city.value === 'Los Angeles' && city.filled && city.choices.length === 0 && city.autofill === 'address-level2', `one name: the city is drawn filled and editable [${JSON.stringify(city)}]`);
}
{
  await begin('en');
  await say('90023');
  const city = field(projectForm(session), 'city');
  check(city && city.control === 'combobox' && city.current && !city.filled && city.choices.map(c => c.label).join('|') === 'Commerce|East Los Angeles|Los Angeles|Vernon', `several names: offered as the combobox's options [${JSON.stringify(city)}]`);
  let r = await submit({city: 'Vernon', street: '10 Main Street', unit: ''}, ['unit']);
  check(/10 Main Street, Vernon, CA 90023\. Is that correct\?$/.test(r), `an offered city is taken from the card [${r}]`);
}
{
  // A revised ZIP code and the city the card filled from it, submitted together.
  await begin('en');
  await say('91352');
  check(field(projectForm(session), 'city')?.value === 'Los Angeles', 'the first ZIP code\'s city');
  const r = await submit({zip: '90023', city: 'Vernon', street: '10 Main Street', unit: ''}, ['unit']);
  check(/10 Main Street, Vernon, CA 90023\. Is that correct\?$/.test(r), `the revised ZIP code and its city are both kept [${r}]`);
}
{
  // Typed text that is no offered option is still a city.
  await begin('en');
  await say('90023');
  const r = await submit({city: 'Boyle Heights', street: '10 Main Street', unit: ''}, ['unit']);
  check(/10 Main Street, Boyle Heights, CA 90023\./.test(r), `other text in the combobox is the city [${r}]`);
}

// Buttons: the read-back's YES / NO, then the part menu, each tapped by sending its `say`.
for (const [language, yes, no, street] of [['en', 'Yes', 'No', 'Street'], ['es', 'Sí', 'No', 'Calle']]) {
  await begin(language);
  await say('91352'); await say('10 Main Street'); await say(language === 'es' ? 'ninguno' : 'none');
  check(projectForm(session) === null, `${language}: the read-back draws no card`);
  let choices = projectChoices(session);
  check(choices && choices.options.map(o => o.label).join('|') === `${yes}|${no}`, `${language}: the read-back offers ${yes} and ${no} [${JSON.stringify(choices)}]`);
  let r = await say(choices.options[1].say);
  choices = projectChoices(session);
  check(choices && choices.options.length === 5 && choices.options[2].label === street, `${language}: NO offers the parts [${r}] [${JSON.stringify(choices)}]`);
  r = await say(choices.options[2].say);
  check(language === 'es' ? /¿Cuál es la dirección\?$/.test(r) : /What is the street address\?$/.test(r), `${language}: the tapped part is asked again [${r}]`);
  await say('20 Oak Street');
  r = await say(language === 'es' ? 'ninguno' : 'none');
  choices = projectChoices(session);
  r = await say(choices.options[0].say);
  check(session.cargo.address?.street === '20 Oak Street' || /20 Oak Street/.test(JSON.stringify(session.cargo)), `${language}: ${yes} confirms [${r}]`);
}
{
  // A question with an unlabelled option, or a text question, offers no buttons.
  await begin('en');
  check(projectChoices(session) === null, 'the ZIP code question (a form card) offers no buttons');
  check(projectChoices(null) === null && projectChoices({flowStacks: [[{flowId: 'ask-choice', pendingVariable: 'x', variables: {choices: [{key: 'a', phrases: ['1']}, {key: 'b', label: 'B', phrases: ['2']}]}}]]}) === null, 'an unlabelled option: no buttons');
  const one = projectChoices({language: 'en', flowStacks: [[{flowId: 'ask-choice', pendingVariable: 'x', variables: {choices: [{key: 'a', label: 'Alpha', phrases: ['1', 'first']}, {key: 'b', label: 'Beta', phrases: ['2', 'beta']}, {key: 'event:stop', phrases: ['stop']}]}}]]});
  check(JSON.stringify(one?.options) === JSON.stringify([{key: 'a', label: 'Alpha', say: 'first'}, {key: 'b', label: 'Beta', say: 'Beta'}]), `say is the label when the option reads it, else its first word; interrupts are not offered [${JSON.stringify(one)}]`);
}

console.log(`form-client-fills: all ${checks} checks passed`);
