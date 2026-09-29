// jsfe/host — aiCallback request shaping (buildAiRequest, parseSchemaArg, schemaName). Hermetic.
//
//   npm run build && node tests/host-request.test.mjs
//
// Pins the two behaviours that came from evidence: a plain-text schema description (the tool-
// argument path) must send NO response_format — never `response_format: null` — and detect_flow
// must send none either, because its dynamic per-flow parameters are rejected by json mode.
import assert from 'node:assert/strict';
import { buildAiRequest, schemaName, parseSchemaArg } from '../dist/host/index.js';

let passed = 0;
const ok = (label) => { passed++; console.log(`PASS  ${label}`); };

// Model descriptions — only the fields buildAiRequest reads.
const CLASSIC = { name: 'gpt-4o-mini', reservedReplySize: 1024, supportsSchema: true };
const NO_SCHEMA = { name: 'some-model-without-schema', reservedReplySize: 1024, supportsSchema: false };
const REASONING = { name: 'gpt-5-nano', reservedReplySize: 1024, supportsSchema: true, fixedSampling: true, tokenParam: 'max_completion_tokens' };
const EXTRA = { name: 'deepseek-v4-flash', reservedReplySize: 1024, supportsSchema: false, extraParams: { thinking: { type: 'disabled' } } };

// The three shapes jsfe puts in the jsonSchema slot.
const DETECT_FLOW = JSON.stringify({ type: 'json_schema', json_schema: { name: 'detect_flow', strict: false, schema: { type: 'object', properties: { flowName: { type: 'string' } } } } });
const INTENT_ANALYSIS = JSON.stringify({ type: 'json_schema', json_schema: { name: 'intent_analysis', strict: true, schema: { type: 'object', properties: { isStrongIntent: { type: 'boolean' } } } } });
const TEXT_SCHEMA = 'city: string (required) - the city to look up\nunits: string (optional) - metric or imperial\n';

{
   const req = buildAiRequest(CLASSIC, 'sys', 'user', TEXT_SCHEMA);
   assert.ok(!('response_format' in req), `text schema must send NO response_format, got ${JSON.stringify(req.response_format)}`);
   assert.equal(parseSchemaArg(TEXT_SCHEMA), null);
   assert.equal(schemaName(TEXT_SCHEMA), null);
   ok('plain-text schema description → no response_format at all');
}

{
   const detect = buildAiRequest(CLASSIC, 'sys', 'user', DETECT_FLOW);
   assert.ok(!('response_format' in detect), 'detect_flow carries dynamic parameters — json mode would reject it');
   ok('detect_flow → no response_format');

   const intent = buildAiRequest(CLASSIC, 'sys', 'user', INTENT_ANALYSIS);
   assert.deepEqual(intent.response_format, JSON.parse(INTENT_ANALYSIS));
   ok('intent_analysis + schema-capable model → the parsed response_format wrapper');

   const noSchemaModel = buildAiRequest(NO_SCHEMA, 'sys', 'user', INTENT_ANALYSIS);
   assert.deepEqual(noSchemaModel.response_format, { type: 'json_object' });
   ok('intent_analysis + model without schema support → {type: json_object}');

   const bare = buildAiRequest(CLASSIC, 'sys', 'user', undefined);
   assert.ok(!('response_format' in bare), 'no schema → free-text answer expected');
   ok('no schema at all (voice cleanup, language detection) → no response_format');

   const notAWrapper = buildAiRequest(CLASSIC, 'sys', 'user', JSON.stringify({ type: 'object', properties: {} }));
   assert.deepEqual(notAWrapper.response_format, { type: 'json_object' });
   ok('valid JSON that is NOT a response_format wrapper → {type: json_object}, never sent raw');
}

{
   const classic = buildAiRequest(CLASSIC, 'sys', 'hello', undefined);
   assert.equal(classic.model, 'gpt-4o-mini');
   assert.equal(classic.max_tokens, 1024);
   assert.equal(classic.stream, false);
   assert.deepEqual(classic.messages, [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hello' }]);
   assert.equal(classic.temperature, 0);
   assert.equal(classic.seed, 1024);
   ok('classic model: max_tokens + deterministic sampling + message shape');

   const reasoning = buildAiRequest(REASONING, 'sys', 'hello', undefined);
   assert.equal(reasoning.max_completion_tokens, 1024);
   assert.ok(!('max_tokens' in reasoning), 'GPT-5 family rejects max_tokens');
   for (const k of ['temperature', 'top_p', 'seed', 'n', 'presence_penalty', 'frequency_penalty', 'logit_bias']) {
      assert.ok(!(k in reasoning), `fixedSampling model must not receive ${k}`);
   }
   ok('reasoning model: max_completion_tokens, and no sampling knobs (fixedSampling)');

   const extra = buildAiRequest(EXTRA, 'sys', 'hello', undefined);
   assert.deepEqual(extra.thinking, { type: 'disabled' });
   ok('extraParams pass through the request body');
}

{
   assert.equal(schemaName(DETECT_FLOW), 'detect_flow');
   assert.equal(schemaName(INTENT_ANALYSIS), 'intent_analysis');
   assert.equal(schemaName(undefined), null);
   ok('schemaName() reports the discriminator a host keys on');
}

console.log(`\n${passed} checks passed`);
