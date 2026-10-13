// An HTTP tool's acceptStatus: a listed non-2xx reply is the tool's RESULT (body parsed and mapped, the step
// continues), so a flow can read why a lookup failed. An unlisted one still fails the step into onFail.
//
//   npm run build && node tests/http-accept-status.test.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import { WorkflowEngine } from '../dist/index.js';

const server = http.createServer((req, res) => {
   const status = Number(new URL(req.url, 'http://x').searchParams.get('status'));
   res.writeHead(status, { 'content-type': 'application/json' });
   res.end(JSON.stringify({ success: false, error_code: status === 404 ? 'not_found' : 'internal', extra: 'unmapped' }));
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const tool = (id, status, acceptStatus) => ({
   id, name: id, description: 'lookup',
   parameters: { type: 'object', properties: {}, required: [] },
   implementation: { type: 'http', url: `${base}/?status=${status}`, method: 'GET', timeout: 3000, retries: 0, ...(acceptStatus ? { acceptStatus } : {}),
      responseMapping: { type: 'object', mappings: { success: { path: 'success', fallback: false }, error_code: { path: 'error_code', fallback: '' } } } },
});
const flow = (id, toolId) => ({
   id, name: id, version: '1.0.0', description: `probe ${id}`,
   steps: [
      { id: `${id}_call`, type: 'CALL-TOOL', tool: toolId, variable: 'r', onFail: { id: `${id}_failed`, type: 'SAY', value: 'ONFAIL' } },
      { id: `${id}_say`, type: 'SAY', value: 'CODE {{r.error_code}} KEYS {{Object.keys(r).join(",")}}' },
   ],
});
const quiet = { debug() {}, info() {}, warn() {}, error() {} };
let next = '';
const engine = new WorkflowEngine(quiet, async (s, u, schema) => (schema ? JSON.stringify({ flowName: next, parameters: {} }) : u),
   [flow('accepted', 'accepts-404'), flow('unlisted', 'accepts-400-only')],
   [tool('accepts-404', 404, [400, 404]), tool('accepts-400-only', 404, [400])], {}, {});
async function run(flowName) {
   next = flowName;
   const s = engine.initSession('u', 's', 'en');
   const out = await engine.updateActivity({ role: 'user', content: 'go' }, s);
   return String(out.response || '');
}
let checks = 0;
const r1 = await run('accepted');
assert.match(r1, /CODE not_found KEYS success,error_code$/, r1); checks++;
const r2 = await run('unlisted');
assert.match(r2, /ONFAIL/, r2); checks++;
server.close();
console.log(`http-accept-status: ${checks} checks passed`);
