// form_client controls (date, date range, number): definition-time checks, the projected view, $data-shared bounds,
// and a card's submission read by the unchanged profiles.
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS, projectForm, parseFormSubmission, formSubmissionReaders, formPlaceField} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';

const quiet = {info(){}, warn(){}, debug(){}, error(){}};
const today = (timeZone, days = 0) => {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', {timeZone, year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date()).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
const DATE = {kind: 'pattern', regex: '\\d{4}-\\d{2}-\\d{2}'};
const COUNT = {kind: 'pattern', regex: '^\\s*(\\d{1,2})\\s*$', group: 1};
const data = {id: 'trip-data', library: 'data', declarationVersion: 2, data: {trip: {timezone: 'America/New_York', max_days_ahead: 366}}};
const tripInputs = () => [
  {name: 'start', label: 'start date', question: 'When do you leave?', profile: DATE, form_client: {control: 'date', min: 0, max: {$data: 'trip.max_days_ahead'}, timezone: {$data: 'trip.timezone'}}},
  {name: 'end', label: 'return or nights', question: 'When do you come back, or how many nights?', any_of: [
    {name: 'return_date', label: 'return date', question: 'When do you come back?', profile: DATE, depends_on: ['start'], form_client: {control: 'date', range_from: 'start', max: {$data: 'trip.max_days_ahead'}, timezone: {$data: 'trip.timezone'}}},
    {name: 'nights', label: 'nights', question: 'How many nights?', profile: COUNT, form_client: {control: 'number', min: 1, max: 30}},
  ]},
  {name: 'adults', label: 'adults', question: 'How many adults?', profile: {kind: 'digits', min: 1, max: 1}, form_client: {control: 'number', min: 1, max: 9}},
];
const trip = (inputs = tripInputs()) => ({declarationVersion: 2, id: 'trip', primary: true, description: 'Plan a trip', form: {inputs, after: [{id: 'keep', type: 'SET', variable: 'noop', value: '(cargo.trip=structuredClone(cargo.forms[form_instance].values),true)'}]}});
const load = flow => new WorkflowEngine(quiet, async () => '{"option":"new_request","flowName":"None"}', [...FLOWS, data, flow], [], STANDARD_FUNCTIONS, {}, false, 'en');

// Definition-time checks: a malformed control never loads.
const broken = (change, pattern) => {
  const inputs = tripInputs(); change(inputs);
  assert.throws(() => load(trip(inputs)), pattern, `rejects: ${pattern}`);
};
broken(inputs => { inputs[2].form_client = {control: 'slider'}; }, /control must be "date", "number" or "place"/);
broken(inputs => { inputs[2].form_client = true; }, /must be false or \{control/);
broken(inputs => { inputs[2].form_client = {control: 'number', step: 2}; }, /number cannot declare step/);
broken(inputs => { inputs[2].form_client = {control: 'number', min: 1.5}; }, /min must be a whole number/);
broken(inputs => { inputs[2].form_client = {control: 'number', min: 9, max: 1}; }, /min is above max/);
broken(inputs => { inputs[0].form_client = {control: 'date', max: 30}; }, /declare the timezone/);
broken(inputs => { inputs[0].form_client = {control: 'date', timezone: 'Mars/Olympus'}; }, /not an IANA time zone/);
broken(inputs => { inputs[1].any_of[0].form_client = {control: 'date', range_from: 'nowhere'}; }, /range_from must name another input/);
broken(inputs => { inputs[1].any_of[0].form_client = {control: 'date', range_from: 'nights'}; }, /range_from nights must be a date control/);
broken(inputs => { inputs[0].form_client = {control: 'date', range_from: 'return_date'}; }, /range_from return_date must be a date control that is not itself a range end/);
broken(inputs => { inputs[2].profile = {kind: 'choice', choices: [{key: 'a', label: 'A'}]}; }, /control needs a profile of kind/);
broken(inputs => { inputs[2].pii = true; }, /cannot draw a sensitive input/);
console.log('form-client-controls: malformed controls fail at definition time');

// The view: controls, the range's start path, date bounds from $data in the declared zone, number bounds replacing the
// profile's lengths, and inputs without a control unchanged.
const engine = load(trip());
engine.disableCommands();
let session = engine.initSession('test', 'trip', 'en'); session.cargo.voice = false;
session = await engine.updateActivity({role: 'user', content: 'plan a trip', start: {flow: 'trip'}}, session);
const view = projectForm(session);
const leaf = name => view.fields.flatMap(field => field.fields || [field]).find(field => field.name === name);
assert.equal(leaf('start').control, 'date');
assert.deepEqual(leaf('start').constraints, {min: today('America/New_York'), max: today('America/New_York', 366)}, 'date bounds are days from today in the declared zone, shared through $data');
assert.equal(leaf('start').range_from, undefined, 'a range start names no start');
assert.equal(leaf('return_date').range_from, 'start', 'the end names its start by path');
assert.deepEqual(leaf('return_date').constraints, {max: today('America/New_York', 366)});
assert.deepEqual(leaf('adults').constraints, {min: 1, max: 9}, 'a number control replaces the digits profile length bounds');
assert.equal(leaf('nights').control, 'number');
assert(!JSON.stringify(view).includes('timezone') && !JSON.stringify(view).includes('form_client'), 'the declaration itself is not projected');
const stored = JSON.parse(JSON.stringify(engine.storedSession(session)));
assert.deepEqual(projectForm(stored, engine.flowsMenu), view, 'a compact stored session projects the same controls');
console.log('form-client-controls: projection of date, range and number controls passed');

// A card's values are read by the unchanged profiles and validators.
const start = today('America/New_York', 10), back = today('America/New_York', 17);
const request = parseFormSubmission('JSFE_FORM_V1:' + JSON.stringify({form: view.form, values: {start, return_date: back, adults: '2'}}), view);
const old = {readFormAnswer: engine.APPROVED_FUNCTIONS.readFormAnswer, enrichFormMatches: engine.APPROVED_FUNCTIONS.enrichFormMatches};
Object.assign(engine.APPROVED_FUNCTIONS, formSubmissionReaders(request, () => engine.getSessionContext()));
try { session = await engine.updateActivity({role: 'user', content: request.prompt}, session); }
finally { Object.assign(engine.APPROVED_FUNCTIONS, old); }
const values = session.cargo.forms[view.form]?.values || session.cargo.trip;
assert.equal(values.start, start);
assert.equal(values.return_date, back);
assert.equal(String(values.adults), '2');
console.log('form-client-controls: a submitted range and number are read by the profiles passed');

// Without form_client, nothing changes in the view.
{
  const inputs = tripInputs(); for (const input of [inputs[0], inputs[1].any_of[0], inputs[1].any_of[1], inputs[2]]) delete input.form_client;
  const plain = load(trip(inputs)); plain.disableCommands();
  let s = plain.initSession('test', 'trip', 'en'); s.cargo.voice = false;
  s = await plain.updateActivity({role: 'user', content: 'plan a trip', start: {flow: 'trip'}}, s);
  const fields = projectForm(s).fields.flatMap(field => field.fields || [field]);
  assert(fields.every(field => field.control === undefined && field.range_from === undefined), 'no control without a declaration');
  assert.deepEqual(fields.find(field => field.name === 'adults').constraints, {min: 1, max: 1}, 'the profile bounds stay without a control');
}
console.log('form-client-controls: inputs without a control are unchanged');

// A place control: definition-time checks, the projected place, and formPlaceField answering only for the open form's
// place field.
{
  const PLACE = {kind: 'text'};
  const placeInputs = () => [
    {name: 'city', label: 'city', question: 'Which city?', profile: PLACE, form_client: {control: 'place', types: 'cities', regions: ['US', 'mx']}},
    {name: 'street', label: 'street address', question: 'What is the street address?', profile: PLACE, form_client: {control: 'place', types: 'address'}},
    {name: 'adults', label: 'adults', question: 'How many adults?', profile: {kind: 'digits', min: 1, max: 1}, form_client: {control: 'number', min: 1, max: 9}},
  ];
  const placeFlow = (inputs = placeInputs()) => ({declarationVersion: 2, id: 'where', primary: true, description: 'Ask where', form: {inputs, after: [{id: 'keep', type: 'SET', variable: 'noop', value: 'true'}]}});
  const refuses = (change, pattern) => { const inputs = placeInputs(); change(inputs); assert.throws(() => load(placeFlow(inputs)), pattern, `rejects: ${pattern}`); };
  refuses(inputs => { inputs[0].form_client = {control: 'place'}; }, /types must be "cities" or "address"/);
  refuses(inputs => { inputs[0].form_client = {control: 'place', types: 'airports'}; }, /types must be "cities" or "address"/);
  refuses(inputs => { inputs[0].form_client = {control: 'place', types: 'cities', regions: []}; }, /regions must be 1 to 15 two-letter country codes/);
  refuses(inputs => { inputs[0].form_client = {control: 'place', types: 'cities', regions: ['USA']}; }, /regions must be 1 to 15/);
  refuses(inputs => { inputs[0].form_client = {control: 'place', types: 'cities', regions: Array(16).fill('us')}; }, /regions must be 1 to 15/);
  refuses(inputs => { inputs[0].form_client = {control: 'place', types: 'cities', min: 1}; }, /place cannot declare min/);
  refuses(inputs => { inputs[0].profile = {kind: 'digits'}; }, /place control needs a profile of kind pattern, text/);
  refuses(inputs => { inputs[1].pii = true; }, /cannot draw a sensitive input/);
  console.log('form-client-controls: malformed place controls fail at definition time');

  const placeEngine = load(placeFlow()); placeEngine.disableCommands();
  let s = placeEngine.initSession('test', 'where', 'en'); s.cargo.voice = false;
  s = await placeEngine.updateActivity({role: 'user', content: 'ask where', start: {flow: 'where'}}, s);
  const placeView = projectForm(s);
  const field = name => placeView.fields.find(f => f.name === name);
  assert.equal(field('city').control, 'place');
  assert.deepEqual(field('city').place, {types: 'cities', regions: ['us', 'mx']}, 'regions are projected lower case');
  assert.deepEqual(field('street').place, {types: 'address'}, 'no regions: none projected');
  assert.deepEqual(formPlaceField(placeView, placeView.form, field('city').path), {types: 'cities', regions: ['us', 'mx']});
  assert.equal(formPlaceField(placeView, 'another-form', field('city').path), null, 'another form instance');
  assert.equal(formPlaceField(placeView, placeView.form, field('adults').path), null, 'a field that is not a place');
  assert.equal(formPlaceField(placeView, placeView.form, 'nowhere'), null, 'an unknown path');
  assert.equal(formPlaceField(null, placeView.form, field('city').path), null, 'no open form');
  const sent = parseFormSubmission('JSFE_FORM_V1:' + JSON.stringify({form: placeView.form, values: {city: 'Orlando, FL, USA'}}), placeView);
  assert(sent && !sent.error, 'a picked place submits as text');
  console.log('form-client-controls: place projection and formPlaceField passed');
}

// The system address form's street suggests US addresses.
{
  const addressInputs = FLOWS.find(flow => flow.id === 'collect-geocoded-address');
  const street = JSON.stringify(addressInputs || {}).includes('"form_client":{"control":"place","types":"address","regions":["us"]}');
  assert(street, 'collect-geocoded-address declares a place control');
  console.log('form-client-controls: the system address form street is a place control');
}
