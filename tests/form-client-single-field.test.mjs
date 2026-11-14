// A card holding one plain box adds nothing to the client's own message box: projectForm returns null and the question
// is asked in chat. One field keeps its card when it has a control or is sensitive (masked).
import assert from 'node:assert/strict';
import {projectForm} from '../dist/forms/index.js';

const view = (specs, current = specs[0].name, data = {}) => projectForm({language: 'en', cargo: {forms: {root: {id: 'root', values: {}, specs, data}}},
  flowStacks: [[{pendingVariable: 'answer', variables: {form_context: {form: 'root', current}}}]]});
let checks = 0;
const none = (name, specs, current) => { assert.equal(view(specs, current), null, name); checks++; };
const card = (name, specs, current, data) => { assert.ok(view(specs, current, data), name); checks++; };

for (const kind of ['text', 'email', 'phone', 'amount', 'digits', 'identifier']) none(`a lone ${kind} box`, [{name: 'answer', profile: {kind}}]);
none('a lone pattern box', [{name: 'answer', profile: {kind: 'pattern', regex: '\\d+'}}]);
none('alternatives with one drawable member', [{name: 'answer', any_of: [{name: 'email_address', profile: {kind: 'email'}}, {name: 'raw', form_client: false, profile: {kind: 'text'}}]}]);
none('one plain box beside a field kept off the card', [{name: 'answer', profile: {kind: 'text'}}, {name: 'chatOnly', form_client: false, profile: {kind: 'text'}}]);

card('a lone choice (list)', [{name: 'pick', profile: {kind: 'choice', choices: [{key: 'a', label: 'A'}, {key: 'b', label: 'B'}]}}]);
card('a lone combobox', [{name: 'city', profile: {kind: 'choice', choices: [], accept_other: true}, form_client: {control: 'combobox'}}]);
card('a lone number stepper', [{name: 'count', profile: {kind: 'digits'}, form_client: {control: 'number', min: 1, max: 9}}]);
card('a lone date', [{name: 'day', profile: {kind: 'text'}, form_client: {control: 'date'}}]);
card('a lone place', [{name: 'street', profile: {kind: 'text'}, form_client: {control: 'place'}}]);
card('a lone postal lookup', [{name: 'zip', profile: {kind: 'digits'}, form_client: {control: 'postal'}}]);
card('lone ready replies', [{name: 'product', profile: {kind: 'text'}, form_client: {control: 'options', options_from: 'offered'}}], 'product', {offered: [{key: 'DONE', label: 'Done'}]});
card('a lone sensitive box (masked)', [{name: 'card_number', profile: {kind: 'digits'}}]);
card('two plain boxes', [{name: 'first', profile: {kind: 'text'}}, {name: 'last', profile: {kind: 'text'}}]);
card('one plain box in a group with another', [{name: 'who', any_of: [{name: 'phone', profile: {kind: 'phone'}}, {name: 'email_address', profile: {kind: 'email'}}]}]);
console.log(`form-client-single-field: ${checks} checks passed`);
