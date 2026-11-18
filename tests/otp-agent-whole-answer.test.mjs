// At the code question an agent word asks for a person only as an agent request (owner 2026-11-18; prod 11-17 11:47
// "Ahorita te mando de la gente de la línea 3." started a transfer and dropped the payment): isAgentRequest, never isAnswer.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isAgentRequest} from '../dist/helpers/index.js';
let checks = 0;
assert.equal(isAgentRequest('Ahorita te mando de la gente de la línea 3.'), false); checks++;
for (const said of ['agente', 'Operator.', 'quiero hablar con un agente', 'representante', '0']) assert.equal(isAgentRequest(said), true, said), checks++;
const src = readFileSync(new URL('../src/forms/identity-flows.js', import.meta.url), 'utf8');
assert.match(src, /"condition: isAgentRequest\(user_choice\)":call\('otp_agent'/); checks++;
assert.doesNotMatch(src, /isAnswer\(user_choice,'agent'\)/); checks++;
console.log(`otp-agent-whole-answer: ${checks} checks passed`);
