// yesNoKeys (src/helpers/phrases.js): a yes/no question names 1 for YES and 2 for NO on a call, with the channel's verb.
import assert from 'node:assert/strict';
import { yesNoKeys, channelVerb, STANDARD_FUNCTIONS } from '../dist/helpers/index.js';

const voice = { voice: true, verb: 'say', verb_es: 'diga' };
const text = { voice: false, verb: 'type', verb_es: 'escriba' };
assert.equal(yesNoKeys('en', voice), 'Press 1 or say YES, or press 2 or say NO.');
assert.equal(yesNoKeys('es', voice), 'Presione 1 o diga SÍ, o presione 2 o diga NO.');
assert.equal(yesNoKeys('en', text), 'Type YES, or type NO.');
assert.equal(yesNoKeys('es', text), 'Escriba SÍ, o escriba NO.');
assert.equal(yesNoKeys('en', voice, 'to submit it'), 'Press 1 or say YES to submit it, or press 2 or say NO.');
assert.equal(yesNoKeys('es', voice, 'para enviarla', 'para no enviarla'), 'Presione 1 o diga SÍ para enviarla, o presione 2 o diga NO para no enviarla.');
// no host verb: the channel's own
assert.equal(yesNoKeys('en', { voice: true }), 'Press 1 or say YES, or press 2 or say NO.');
assert.equal(yesNoKeys('es', {}), 'Escriba SÍ, o escriba NO.');
assert.equal(yesNoKeys('en', null), 'Type YES, or type NO.');
// flows call it by name
assert.equal(STANDARD_FUNCTIONS.yesNoKeys, yesNoKeys);
assert.equal(STANDARD_FUNCTIONS.channelVerb, channelVerb);
assert.equal(channelVerb('en', voice, true), 'Say');
assert.equal(channelVerb('es', text, true), 'Escriba');
assert.equal(channelVerb('es', { voice: true }), 'diga');
console.log('helpers-yes-no-keys: 15 checks passed');
